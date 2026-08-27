import type {
  AuditFinding,
  AuditSummaryComparison,
  AuditSummarySnapshot,
  DailyAuditVerdict,
  DailyPrintAudit,
  FulfillmentExposure,
  NormalizedDepartment,
  NormalizedEvidence,
  NormalizedEvidenceItemLine,
  OrderEvidenceTimeline,
  PrintAuditModel,
  PrintCoverageGap
} from '../types/audit';

type ProductAccumulator = {
  normalizedProduct: string;
  department: NormalizedDepartment;
  baseQuantity: number;
  additionQuantity: number;
  sourceEvidenceIds: string[];
  voidEvidenceIds: string[];
};

function compareCapturedAt(a: { capturedAt: string }, b: { capturedAt: string }): number {
  const timeDiff = new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime();
  if (timeDiff !== 0) return timeDiff;

  return a.capturedAt.localeCompare(b.capturedAt);
}

function getSummaryQuantity(summary: NormalizedEvidence | undefined, product: string): number {
  const line = summary?.itemLines.find(item => item.normalizedProduct === product);
  return line?.quantity ?? 0;
}

function getSummaryRevenue(summary: NormalizedEvidence | undefined): number {
  return summary?.itemLines.reduce((total, item) => total + (item.totalPrice ?? 0), 0) ?? 0;
}

function compareSummaryCandidates(a: NormalizedEvidence, b: NormalizedEvidence): number {
  const capturedAtDiff = compareCapturedAt(a, b);
  if (capturedAtDiff !== 0) return capturedAtDiff;

  return a.sourceCaptureId.localeCompare(b.sourceCaptureId)
    || a.rawFileName.localeCompare(b.rawFileName);
}

function getCanonicalSummarySnapshots(summaries: NormalizedEvidence[]): NormalizedEvidence[] {
  const byPayload = new Map<string, NormalizedEvidence>();

  for (const summary of summaries) {
    const existing = byPayload.get(summary.sha256);
    if (!existing || compareSummaryCandidates(summary, existing) < 0) {
      byPayload.set(summary.sha256, summary);
    }
  }

  return Array.from(byPayload.values()).sort(compareSummaryCandidates);
}

function countsTowardPostSummaryCutoff(event: NormalizedEvidence): boolean {
  return event.eventKind !== 'DAILY_SALES_SUMMARY_SNAPSHOT';
}

function summarizeLatestSummary(summary: NormalizedEvidence, allSummaries: NormalizedEvidence[]): AuditSummarySnapshot {
  const deliveries = allSummaries
    .map(item => ({
      sourceCaptureId: item.sourceCaptureId,
      capturedAt: item.capturedAt,
      rawFileName: item.rawFileName,
      sha256: item.sha256,
      isDuplicateDelivery: item.isDuplicateDelivery,
      duplicateOfId: item.duplicateOfId
    }))
    .sort(compareCapturedAt);

  return {
    sourceCaptureId: summary.sourceCaptureId,
    capturedAt: summary.capturedAt,
    totalItemsSold: summary.itemLines.reduce((total, item) => total + item.quantity, 0),
    totalSalesRevenue: getSummaryRevenue(summary),
    deliveryCount: allSummaries.length,
    uniquePayloadCount: new Set(allSummaries.map(item => item.sha256)).size,
    deliveries
  };
}

function accumulateProduction(
  accumulator: Map<string, ProductAccumulator>,
  event: NormalizedEvidence,
  item: NormalizedEvidenceItemLine
): void {
  const existing = accumulator.get(item.normalizedProduct) ?? {
    normalizedProduct: item.normalizedProduct,
    department: event.normalizedDepartment,
    baseQuantity: 0,
    additionQuantity: 0,
    sourceEvidenceIds: [],
    voidEvidenceIds: []
  };

  if (item.quantityRole === 'VOID') {
    existing.voidEvidenceIds.push(event.sourceCaptureId);
  } else if (item.quantityRole === 'ADDITION') {
    existing.additionQuantity += item.quantity;
    existing.sourceEvidenceIds.push(event.sourceCaptureId);
  } else {
    existing.baseQuantity = Math.max(existing.baseQuantity, item.quantity);
    existing.sourceEvidenceIds = existing.sourceEvidenceIds.length > 0
      ? existing.sourceEvidenceIds
      : [event.sourceCaptureId];
  }

  accumulator.set(item.normalizedProduct, existing);
}

function buildProductionMap(events: NormalizedEvidence[]): Map<string, ProductAccumulator> {
  const stationSpecific = new Map<string, ProductAccumulator>();
  const captainFallback = new Map<string, ProductAccumulator>();

  for (const event of events) {
    if (event.isDuplicateDelivery) continue;
    if (event.eventKind !== 'PRODUCTION_TICKET' && event.eventKind !== 'ADD_ITEM' && event.eventKind !== 'VOID_ITEM' && event.eventKind !== 'CAPTAIN_ORDER') continue;

    const target = event.eventKind === 'CAPTAIN_ORDER' ? captainFallback : stationSpecific;
    for (const item of event.itemLines) {
      accumulateProduction(target, event, item);
    }
  }

  for (const [product, accumulator] of captainFallback.entries()) {
    if (!stationSpecific.has(product)) {
      stationSpecific.set(product, accumulator);
    }
  }

  return stationSpecific;
}

function buildPaidQuantities(events: NormalizedEvidence[]): {
  quantities: Map<string, number>;
  latestPaid?: NormalizedEvidence;
} {
  const paidEvents = events
    .filter(event => event.eventKind === 'FINAL_PAID_BILL' || event.eventKind === 'BILL_REPRINT')
    .filter(event => !event.isDuplicateDelivery)
    .sort(compareCapturedAt);

  const latestPaid = paidEvents.at(-1);
  const quantities = new Map<string, number>();

  for (const item of latestPaid?.itemLines ?? []) {
    quantities.set(item.normalizedProduct, (quantities.get(item.normalizedProduct) ?? 0) + item.quantity);
  }

  return { quantities, latestPaid };
}

function buildOrderTimeline(
  operationalDate: string,
  posOrderNumber: string,
  events: NormalizedEvidence[],
  summary: NormalizedEvidence | undefined
): { timeline: OrderEvidenceTimeline; findings: AuditFinding[]; gaps: PrintCoverageGap[] } {
  const orderKey = `${operationalDate}:${posOrderNumber}`;
  const sortedEvents = [...events].sort(compareCapturedAt);
  const productionMap = buildProductionMap(sortedEvents);
  const { quantities: paidQuantities, latestPaid } = buildPaidQuantities(sortedEvents);
  const exposures: FulfillmentExposure[] = [];
  const findings: AuditFinding[] = [];
  const gaps: PrintCoverageGap[] = [];

  for (const accumulator of productionMap.values()) {
    const exposedQuantity = accumulator.baseQuantity + accumulator.additionQuantity;
    const paidQuantity = paidQuantities.get(accumulator.normalizedProduct) ?? 0;
    const summaryQuantity = getSummaryQuantity(summary, accumulator.normalizedProduct);

    const exposure: FulfillmentExposure = {
      normalizedProduct: accumulator.normalizedProduct,
      department: accumulator.department,
      exposedQuantity,
      paidQuantity,
      summaryQuantity,
      sourceEvidenceIds: accumulator.sourceEvidenceIds,
      voidEvidenceIds: accumulator.voidEvidenceIds
    };
    exposures.push(exposure);

    if (!latestPaid) {
      if (summary && summaryQuantity < exposedQuantity) {
        findings.push({
          id: `${orderKey}:${accumulator.normalizedProduct}:summary-reduction`,
          kind: 'POST_ROUTING_REDUCTION',
          severity: 'HIGH',
          orderKey,
          posOrderNumber,
          normalizedProduct: accumulator.normalizedProduct,
          department: accumulator.department,
          eventTime: sortedEvents.find(event => accumulator.sourceEvidenceIds.includes(event.sourceCaptureId))?.capturedAt ?? sortedEvents[0]?.capturedAt ?? '',
          exposureQuantity: exposedQuantity,
          posQuantity: summaryQuantity,
          reductionQuantity: exposedQuantity - summaryQuantity,
          estimatedValue: 0,
          evidenceIds: [
            ...accumulator.sourceEvidenceIds,
            ...accumulator.voidEvidenceIds,
            summary.sourceCaptureId
          ],
          paymentMethod: undefined,
          cashier: undefined,
          posUser: undefined
        });
      } else {
        gaps.push({
          id: `${orderKey}:${accumulator.normalizedProduct}:missing-final-paid-bill`,
          orderKey,
          normalizedProduct: accumulator.normalizedProduct,
          exposureQuantity: exposedQuantity,
          summaryQuantity,
          reason: 'MISSING_FINAL_PAID_BILL'
        });
      }
    } else if (paidQuantity < exposedQuantity) {
      findings.push({
        id: `${orderKey}:${accumulator.normalizedProduct}:paid-reduction`,
        kind: 'POST_ROUTING_REDUCTION',
        severity: 'HIGH',
        orderKey,
        posOrderNumber,
        normalizedProduct: accumulator.normalizedProduct,
        department: accumulator.department,
        eventTime: sortedEvents.find(event => accumulator.sourceEvidenceIds.includes(event.sourceCaptureId))?.capturedAt ?? sortedEvents[0]?.capturedAt ?? '',
        exposureQuantity: exposedQuantity,
        posQuantity: paidQuantity,
        reductionQuantity: exposedQuantity - paidQuantity,
        estimatedValue: 0,
        evidenceIds: [
          ...accumulator.sourceEvidenceIds,
          ...accumulator.voidEvidenceIds,
          latestPaid.sourceCaptureId
        ],
        paymentMethod: latestPaid.metadata.paymentMethod,
        cashier: latestPaid.metadata.cashier,
        posUser: latestPaid.metadata.posUser
      });
    }
  }

  return {
    timeline: {
      orderKey,
      operationalDate,
      posOrderNumber,
      events: sortedEvents,
      exposures: exposures.sort((a, b) => a.normalizedProduct.localeCompare(b.normalizedProduct)),
      hasFinalPaidBill: Boolean(latestPaid),
      latestPaidEvidenceId: latestPaid?.sourceCaptureId
    },
    findings,
    gaps
  };
}

function buildSummaryExcessGaps(
  operationalDate: string,
  orderTimelines: OrderEvidenceTimeline[],
  verifyingSummary: NormalizedEvidence | undefined
): PrintCoverageGap[] {
  if (!verifyingSummary) return [];

  const productionByProduct = new Map<string, number>();
  for (const exposure of orderTimelines.flatMap(order => order.exposures)) {
    productionByProduct.set(
      exposure.normalizedProduct,
      (productionByProduct.get(exposure.normalizedProduct) ?? 0) + exposure.exposedQuantity
    );
  }

  return verifyingSummary.itemLines
    .filter(item => item.quantity > (productionByProduct.get(item.normalizedProduct) ?? 0))
    .map(item => ({
      id: `${operationalDate}:${item.normalizedProduct}:summary-exceeds-production`,
      normalizedProduct: item.normalizedProduct,
      exposureQuantity: productionByProduct.get(item.normalizedProduct) ?? 0,
      summaryQuantity: item.quantity,
      reason: 'SUMMARY_EXCEEDS_CAPTURED_PRODUCTION'
    }));
}

function buildSummaryComparison(
  orderTimelines: OrderEvidenceTimeline[],
  verifyingSummary: NormalizedEvidence | undefined
): AuditSummaryComparison {
  return {
    productionExposureQuantity: orderTimelines.flatMap(order => order.exposures).reduce((total, item) => total + item.exposedQuantity, 0),
    summaryQuantity: verifyingSummary?.itemLines.reduce((total, item) => total + item.quantity, 0) ?? 0,
    paidQuantity: orderTimelines.flatMap(order => order.exposures).reduce((total, item) => total + item.paidQuantity, 0),
    summaryRevenue: getSummaryRevenue(verifyingSummary)
  };
}

function chooseVerdict(
  hasSummary: boolean,
  isProvisional: boolean,
  findings: AuditFinding[],
  gaps: PrintCoverageGap[]
): DailyAuditVerdict {
  if (!hasSummary) return 'MISSING_SUMMARY';
  if (findings.length > 0) return 'HIGH_PRIORITY_FINDINGS';
  if (isProvisional) return 'PROVISIONAL';
  if (gaps.length > 0) return 'INCOMPLETE_COVERAGE';
  return 'CLEAN';
}

function buildDailyAudit(operationalDate: string, evidence: NormalizedEvidence[]): DailyPrintAudit {
  const summaries = evidence
    .filter(event => event.eventKind === 'DAILY_SALES_SUMMARY_SNAPSHOT')
    .sort(compareSummaryCandidates);
  const uniqueSummarySnapshots = getCanonicalSummarySnapshots(summaries);
  const verifyingSummary = uniqueSummarySnapshots.at(-1);
  const cutoffMs = verifyingSummary ? new Date(verifyingSummary.capturedAt).getTime() : Number.POSITIVE_INFINITY;
  const cutoffEvidence = evidence.filter(event => new Date(event.capturedAt).getTime() <= cutoffMs);
  const excludedAfterCutoffCount = evidence
    .filter(countsTowardPostSummaryCutoff)
    .filter(event => new Date(event.capturedAt).getTime() > cutoffMs)
    .length;
  const groupedOrders = new Map<string, NormalizedEvidence[]>();

  for (const event of cutoffEvidence) {
    if (!event.posOrderNumber) continue;
    const existing = groupedOrders.get(event.posOrderNumber) ?? [];
    existing.push(event);
    groupedOrders.set(event.posOrderNumber, existing);
  }

  const orderTimelines: OrderEvidenceTimeline[] = [];
  const findings: AuditFinding[] = [];
  const printCoverageGaps: PrintCoverageGap[] = [];

  for (const [posOrderNumber, events] of groupedOrders.entries()) {
    const result = buildOrderTimeline(operationalDate, posOrderNumber, events, verifyingSummary);
    orderTimelines.push(result.timeline);
    findings.push(...result.findings);
    printCoverageGaps.push(...result.gaps);
  }

  printCoverageGaps.push(...buildSummaryExcessGaps(operationalDate, orderTimelines, verifyingSummary));

  const summaryComparison = buildSummaryComparison(orderTimelines, verifyingSummary);
  const isProvisional = excludedAfterCutoffCount > 0;
  const voidEvidence = cutoffEvidence.filter(event => event.eventKind === 'VOID_ITEM');
  const complimentaryEvidence = cutoffEvidence.filter(event => event.eventKind === 'COMPLIMENTARY_ACTIVITY');

  return {
    operationalDate,
    verdict: chooseVerdict(Boolean(verifyingSummary), isProvisional, findings, printCoverageGaps),
    verifyingSummary: verifyingSummary ? summarizeLatestSummary(verifyingSummary, summaries) : undefined,
    isProvisional,
    excludedAfterCutoffCount,
    orderTimelines: orderTimelines.sort((a, b) => a.posOrderNumber.localeCompare(b.posOrderNumber)),
    findings: findings.sort((a, b) => b.reductionQuantity - a.reductionQuantity),
    printCoverageGaps,
    voidEvidence,
    complimentaryEvidence,
    summaryComparison
  };
}

export function buildPrintAuditModel(normalizedEvidence: NormalizedEvidence[]): PrintAuditModel {
  const byDate = new Map<string, NormalizedEvidence[]>();

  for (const evidence of normalizedEvidence) {
    if (!evidence.operationalDate) continue;
    const existing = byDate.get(evidence.operationalDate) ?? [];
    existing.push(evidence);
    byDate.set(evidence.operationalDate, existing);
  }

  const availableOperationalDates = Array.from(byDate.keys()).sort();
  const dailyAudits = availableOperationalDates.map(date => buildDailyAudit(date, byDate.get(date) ?? []));

  return {
    availableOperationalDates,
    defaultOperationalDate: availableOperationalDates.at(-1),
    dailyAudits
  };
}
