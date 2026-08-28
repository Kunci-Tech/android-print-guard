import type {
  AuditFinding,
  AuditSummaryComparison,
  AuditSummarySnapshot,
  DailyAuditVerdict,
  DailyItemComparison,
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

function buildProductPriceMap(evidence: NormalizedEvidence[]): Map<string, number> {
  const prices = new Map<string, number>();

  for (const event of evidence) {
    for (const item of event.itemLines) {
      if (item.unitPrice && item.unitPrice > 0 && !prices.has(item.normalizedProduct)) {
        prices.set(item.normalizedProduct, item.unitPrice);
      } else if (item.totalPrice && item.quantity > 0 && item.totalPrice > 0 && !prices.has(item.normalizedProduct)) {
        prices.set(item.normalizedProduct, Math.round(item.totalPrice / item.quantity));
      }
    }
  }

  return prices;
}

function buildOrderTimeline(
  operationalDate: string,
  posOrderNumber: string,
  events: NormalizedEvidence[],
  summary: NormalizedEvidence | undefined,
  priceMap: Map<string, number>
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
    const unitPrice = priceMap.get(accumulator.normalizedProduct) ?? 0;

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
        const reductionQuantity = exposedQuantity - summaryQuantity;
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
          reductionQuantity,
          estimatedValue: reductionQuantity * unitPrice,
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
          posOrderNumber,
          normalizedProduct: accumulator.normalizedProduct,
          exposureQuantity: exposedQuantity,
          paidQuantity: 0,
          summaryQuantity,
          unitPrice,
          estimatedValue: exposedQuantity * unitPrice,
          reason: 'MISSING_FINAL_PAID_BILL',
          sourceEvidenceIds: [...accumulator.sourceEvidenceIds]
        });
      }
    } else if (paidQuantity < exposedQuantity) {
      const reductionQuantity = exposedQuantity - paidQuantity;
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
        reductionQuantity,
        estimatedValue: reductionQuantity * unitPrice,
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

function getProductProductionQuantity(
  product: string,
  productionByProduct: Map<string, number>
): number {
  if (productionByProduct.has(product)) {
    return productionByProduct.get(product)!;
  }

  const productLower = product.toLowerCase().trim();
  const productTokens = productLower.split(/\s+/).filter(Boolean);
  if (productTokens.length === 0) return 0;

  let totalMatch = 0;

  for (const [prodKey, qty] of productionByProduct.entries()) {
    const keyLower = prodKey.toLowerCase().trim();
    const keyTokens = keyLower.split(/\s+/).filter(Boolean);

    const isWordBoundaryMatch = productTokens.every(token => keyTokens.includes(token))
      || keyTokens.every(token => productTokens.includes(token));

    if (isWordBoundaryMatch) {
      totalMatch += qty;
    }
  }

  return totalMatch;
}

function buildSummaryExcessGaps(
  operationalDate: string,
  orderTimelines: OrderEvidenceTimeline[],
  verifyingSummary: NormalizedEvidence | undefined,
  priceMap: Map<string, number>
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
    .filter(item => item.quantity > getProductProductionQuantity(item.normalizedProduct, productionByProduct))
    .map(item => {
      const exposureQty = getProductProductionQuantity(item.normalizedProduct, productionByProduct);
      const excessQty = item.quantity - exposureQty;
      const unitPrice = priceMap.get(item.normalizedProduct) ?? (item.totalPrice && item.quantity > 0 ? Math.round(item.totalPrice / item.quantity) : 0);
      return {
        id: `${operationalDate}:${item.normalizedProduct}:summary-exceeds-production`,
        normalizedProduct: item.normalizedProduct,
        exposureQuantity: exposureQty,
        summaryQuantity: item.quantity,
        unitPrice,
        estimatedValue: excessQty * unitPrice,
        reason: 'SUMMARY_EXCEEDS_CAPTURED_PRODUCTION',
        sourceEvidenceIds: [verifyingSummary.sourceCaptureId]
      };
    });
}

function buildSummaryComparison(
  orderTimelines: OrderEvidenceTimeline[],
  verifyingSummary: NormalizedEvidence | undefined,
  priceMap: Map<string, number>
): AuditSummaryComparison {
  const productionExposureQuantity = orderTimelines
    .flatMap(order => order.exposures)
    .reduce((total, item) => total + item.exposedQuantity, 0);

  const summaryQuantity = verifyingSummary?.itemLines.reduce((total, item) => total + item.quantity, 0) ?? 0;
  const paidQuantity = orderTimelines
    .flatMap(order => order.exposures)
    .reduce((total, item) => total + item.paidQuantity, 0);

  const productionExposureRevenue = orderTimelines
    .flatMap(order => order.exposures)
    .reduce((total, item) => total + (item.exposedQuantity * (priceMap.get(item.normalizedProduct) ?? 0)), 0);

  const paidRevenue = orderTimelines
    .flatMap(order => order.exposures)
    .reduce((total, item) => total + (item.paidQuantity * (priceMap.get(item.normalizedProduct) ?? 0)), 0);

  const summaryRevenue = getSummaryRevenue(verifyingSummary);
  const revenueGap = summaryRevenue - paidRevenue;

  let revenueMatchStatus: AuditSummaryComparison['revenueMatchStatus'] = 'UNTESTED';
  if (verifyingSummary) {
    if (revenueGap === 0 && productionExposureRevenue === summaryRevenue) {
      revenueMatchStatus = 'MATCH';
    } else if (productionExposureRevenue > summaryRevenue) {
      revenueMatchStatus = 'PRODUCTION_EXCEEDS_SUMMARY';
    } else {
      revenueMatchStatus = 'SUMMARY_EXCEEDS_PRODUCTION';
    }
  }

  return {
    productionExposureQuantity,
    summaryQuantity,
    paidQuantity,
    productionExposureRevenue,
    paidRevenue,
    summaryRevenue,
    revenueGap,
    revenueMatchStatus
  };
}

function buildItemComparisons(
  orderTimelines: OrderEvidenceTimeline[],
  verifyingSummary: NormalizedEvidence | undefined,
  priceMap: Map<string, number>
): DailyItemComparison[] {
  const routedMap = new Map<string, number>();
  const paidMap = new Map<string, number>();
  const evidenceIdsMap = new Map<string, Set<string>>();

  for (const order of orderTimelines) {
    for (const exposure of order.exposures) {
      routedMap.set(
        exposure.normalizedProduct,
        (routedMap.get(exposure.normalizedProduct) ?? 0) + exposure.exposedQuantity
      );
      paidMap.set(
        exposure.normalizedProduct,
        (paidMap.get(exposure.normalizedProduct) ?? 0) + exposure.paidQuantity
      );

      const set = evidenceIdsMap.get(exposure.normalizedProduct) ?? new Set<string>();
      exposure.sourceEvidenceIds.forEach(id => set.add(id));
      exposure.voidEvidenceIds.forEach(id => set.add(id));
      evidenceIdsMap.set(exposure.normalizedProduct, set);
    }
  }

  const summaryMap = new Map<string, number>();
  if (verifyingSummary) {
    for (const item of verifyingSummary.itemLines) {
      summaryMap.set(
        item.normalizedProduct,
        (summaryMap.get(item.normalizedProduct) ?? 0) + item.quantity
      );

      const set = evidenceIdsMap.get(item.normalizedProduct) ?? new Set<string>();
      set.add(verifyingSummary.sourceCaptureId);
      evidenceIdsMap.set(item.normalizedProduct, set);
    }
  }

  const allProducts = new Set([
    ...routedMap.keys(),
    ...paidMap.keys(),
    ...summaryMap.keys()
  ]);

  const result: DailyItemComparison[] = [];

  for (const product of allProducts) {
    const routedQuantity = routedMap.get(product) ?? 0;
    const paidQuantity = paidMap.get(product) ?? 0;
    const summaryQuantity = summaryMap.get(product) ?? 0;
    const unitPrice = priceMap.get(product) ?? 0;

    const discrepancyQuantity = summaryQuantity - routedQuantity;
    const discrepancyRevenue = discrepancyQuantity * unitPrice;

    let status: DailyItemComparison['status'] = 'MATCH';
    if (discrepancyQuantity > 0) {
      status = 'MISSING_PRODUCTION';
    } else if (discrepancyQuantity < 0) {
      status = 'EXCESS_PRODUCTION';
    }

    const evidenceIds = Array.from(evidenceIdsMap.get(product) ?? []);

    result.push({
      productKey: product,
      normalizedProduct: product,
      routedQuantity,
      paidQuantity,
      summaryQuantity,
      unitPrice,
      discrepancyQuantity,
      discrepancyRevenue,
      status,
      evidenceIds
    });
  }

  return result.sort((a, b) => Math.abs(b.discrepancyQuantity) - Math.abs(a.discrepancyQuantity) || a.normalizedProduct.localeCompare(b.normalizedProduct));
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

  const priceMap = buildProductPriceMap(cutoffEvidence);
  const orderTimelines: OrderEvidenceTimeline[] = [];
  const findings: AuditFinding[] = [];
  const printCoverageGaps: PrintCoverageGap[] = [];

  for (const [posOrderNumber, events] of groupedOrders.entries()) {
    const result = buildOrderTimeline(operationalDate, posOrderNumber, events, verifyingSummary, priceMap);
    orderTimelines.push(result.timeline);
    findings.push(...result.findings);
    printCoverageGaps.push(...result.gaps);
  }

  printCoverageGaps.push(...buildSummaryExcessGaps(operationalDate, orderTimelines, verifyingSummary, priceMap));

  const summaryComparison = buildSummaryComparison(orderTimelines, verifyingSummary, priceMap);
  const itemComparisons = buildItemComparisons(orderTimelines, verifyingSummary, priceMap);
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
    summaryComparison,
    itemComparisons
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
