import type {
  NormalizedDepartment,
  NormalizedEventKind,
  NormalizedEvidence,
  NormalizedEvidenceItemLine,
  SynthesizedCapture
} from '../types/audit';
import { isReceiptHeaderLine, parseDailySalesSummaryReport, parseOrderHeaderAndItems } from './receiptItemParser';

const DEPARTMENT_HEADERS: Record<string, NormalizedDepartment> = {
  BAR: 'BAR',
  'HOT KITCHEN': 'HOT_KITCHEN',
  'COLD KITCHEN': 'COLD_KITCHEN',
  'CAPTAIN ORDER': 'CAPTAIN_ORDER'
};

function normalizeDepartmentHeader(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function isKnownDepartmentHeader(value: string): boolean {
  return normalizeDepartmentHeader(value) in DEPARTMENT_HEADERS;
}

function startsWithKnownDepartmentHeader(value: string): boolean {
  const normalized = normalizeDepartmentHeader(value);
  return Object.keys(DEPARTMENT_HEADERS).some(header => normalized === header || normalized.startsWith(`${header} `));
}

function normalizeDepartment(department?: string): NormalizedDepartment {
  if (!department) return 'UNKNOWN';

  return DEPARTMENT_HEADERS[normalizeDepartmentHeader(department)] ?? 'UNKNOWN';
}

function toOperationalDate(dateText: string): string | undefined {
  const match = dateText.match(/([0-9]{2})\/([0-9]{2})\/([0-9]{4})/);
  if (!match) return undefined;

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getOperationalDate(capture: SynthesizedCapture): string | undefined {
  if (capture.category === 'DAILY_SUMMARY') {
    const summary = parseDailySalesSummaryReport(capture.parsedReceipt.asciiText);
    return toOperationalDate(summary.reportDate);
  }

  const header = parseOrderHeaderAndItems(capture.parsedReceipt.asciiText);
  if (header?.date) {
    return toOperationalDate(header.date);
  }

  for (const line of capture.parsedReceipt.lines) {
    const dateMatch = line.match(/^Date\s*:\s*(.+)$/i);
    if (dateMatch) {
      return toOperationalDate(dateMatch[1]);
    }
  }

  return undefined;
}

function classifyEventKind(capture: SynthesizedCapture, department: NormalizedDepartment): NormalizedEventKind {
  const explicitLines = capture.parsedReceipt.lines.map(line => line.trim().toUpperCase());

  if (capture.category === 'DAILY_SUMMARY') {
    return 'DAILY_SALES_SUMMARY_SNAPSHOT';
  }
  if (
    explicitLines.some(line => line === 'COMPLIMENTARY' || line === 'COMPLIMENT')
    || explicitLines.some(line => /^SALES TYPE\s*:\s*COMPLIMENTARY$/i.test(line))
  ) {
    return 'COMPLIMENTARY_ACTIVITY';
  }
  if (capture.category === 'CUSTOMER_BILL') {
    if (explicitLines.some(line => line.includes('INI BUKAN BUKTI PEMBAYARAN'))) {
      return 'PRELIMINARY_BILL';
    }
    if (explicitLines.some(line => line === 'REPRINT' || line === 'CETAK ULANG')) {
      return 'BILL_REPRINT';
    }
    const hasPaymentEvidence = hasCompletedPaymentEvidence(capture.parsedReceipt.lines);
    return hasPaymentEvidence ? 'FINAL_PAID_BILL' : 'NON_AUDIT_EVIDENCE';
  }
  if (department === 'CAPTAIN_ORDER') {
    return 'CAPTAIN_ORDER';
  }
  if (capture.category === 'KITCHEN_TICKET') {
    if (capture.parsedReceipt.lines.some(line => /^-[0-9]+\b/.test(line) || /\bVOID\b/i.test(line))) {
      return 'VOID_ITEM';
    }
    if (capture.parsedReceipt.lines.some(line => /^\+[0-9]+\b/.test(line))) {
      return 'ADD_ITEM';
    }
    return 'PRODUCTION_TICKET';
  }

  return 'NON_AUDIT_EVIDENCE';
}

function hasCompletedPaymentEvidence(lines: string[]): boolean {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toUpperCase();

    if (line === 'TENDER') {
      const nextLine = lines[i + 1]?.trim().toUpperCase();
      if (!nextLine || /^(NO|PENDING|UNPAID|0)$/i.test(nextLine)) {
        return false;
      }
      return true;
    }

    if (isPaymentEvidenceLine(line)) {
      return true;
    }
  }

  return false;
}

function isPaymentEvidenceLine(line: string): boolean {
  const labeledMethod = getLabeledPaymentMethod(line);
  if (labeledMethod) {
    return !/^(NO|PENDING|UNPAID|0)$/i.test(labeledMethod);
  }

  return /^(CASH|QRIS|CARD|CREDIT CARD|DEBIT CARD|EDC|TRANSFER|GOPAY|OVO|DANA)$/.test(line);
}

function getLabeledPaymentMethod(line: string): string | undefined {
  return line.match(/^(?:PAYMENT|PAYMENT METHOD|PAID)\s*:\s*(.+)$/i)?.[1]?.trim();
}

function normalizeProductName(value: string): string {
  return value
    .replace(/^\+\s*/, '')
    .replace(/[()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildBillItemLines(capture: SynthesizedCapture): NormalizedEvidenceItemLine[] {
  const header = parseOrderHeaderAndItems(capture.parsedReceipt.asciiText);
  if (!header) return [];

  return header.items.map(item => ({
    normalizedProduct: normalizeProductName(`${item.itemName}${item.variant ? ` / ${item.variant}` : ''}`),
    quantity: item.quantity,
    quantityRole: 'BASE',
    variant: item.variant || undefined,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    ...(item.isModifier ? { isModifier: true } : {})
  }));
}

function buildSummaryItemLines(capture: SynthesizedCapture): NormalizedEvidenceItemLine[] {
  const summary = parseDailySalesSummaryReport(capture.parsedReceipt.asciiText);

  return Array.from(summary.summaryItems.entries()).map(([product, item]) => ({
    normalizedProduct: normalizeProductName(product),
    quantity: item.qty,
    quantityRole: 'BASE',
    totalPrice: item.revenue
  }));
}

function isTicketHeaderLine(line: string): boolean {
  return isReceiptHeaderLine(line)
    || isKnownDepartmentHeader(line);
}

function isSupportOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  return /^\[.+\]$/.test(trimmed)
    || /^[A-Za-z][A-Za-z ]+\s*:/i.test(trimmed)
    || /^(no|without|allergy|please|less|more|extra)\b/i.test(trimmed)
    || /^void\b/i.test(trimmed);
}

function isLikelyTicketContinuationLine(line: string): boolean {
  const trimmed = line.trim();
  if (startsWithKnownDepartmentHeader(trimmed)) return false;
  return !isTicketHeaderLine(trimmed);
}

function getTicketProductContinuationLines(supportingLines: string[]): string[] {
  return supportingLines.filter(line => !isSupportOnlyLine(line));
}

function toTicketItemLine(
  match: RegExpMatchArray,
  supportingLines: string[]
): NormalizedEvidenceItemLine {
  const quantityPrefix = match[1];
  const quantityRole = quantityPrefix === '+'
    ? 'ADDITION'
    : quantityPrefix === '-'
      ? 'VOID'
      : 'BASE';
  const baseProductText = match[3];
  const productContinuationLines = getTicketProductContinuationLines(supportingLines);
  const baseProduct = normalizeProductName([baseProductText, ...productContinuationLines].join(' '));

  return {
    normalizedProduct: baseProduct,
    quantity: parseInt(match[2], 10),
    quantityRole,
    sourceLine: match[0],
    supportingLines: supportingLines.length > 0 ? supportingLines : undefined
  };
}

function buildTicketItemLines(capture: SynthesizedCapture): NormalizedEvidenceItemLine[] {
  const itemLines: NormalizedEvidenceItemLine[] = [];
  let pendingMatch: RegExpMatchArray | undefined;
  let supportingLines: string[] = [];

  const flushPending = () => {
    if (!pendingMatch) return;
    itemLines.push(toTicketItemLine(pendingMatch, supportingLines));
    pendingMatch = undefined;
    supportingLines = [];
  };

  for (const line of capture.parsedReceipt.lines) {
    const match = line.match(/^([x+-])([0-9]+)\s+(.+)$/i);
    if (match) {
      flushPending();
      pendingMatch = match;
    } else if (
      pendingMatch
      && !isTicketHeaderLine(line)
      && isLikelyTicketContinuationLine(line)
    ) {
      supportingLines.push(line.trim());
    }
  }

  flushPending();

  return itemLines;
}

function buildItemLines(capture: SynthesizedCapture): NormalizedEvidenceItemLine[] {
  if (capture.category === 'DAILY_SUMMARY') {
    return buildSummaryItemLines(capture);
  }
  if (capture.category === 'CUSTOMER_BILL') {
    return buildBillItemLines(capture);
  }
  if (capture.category === 'KITCHEN_TICKET') {
    return buildTicketItemLines(capture);
  }

  return [];
}

function getPaymentMethod(capture: SynthesizedCapture, parsedPaymentMethod?: string): string | undefined {
  if (parsedPaymentMethod) return parsedPaymentMethod;

  const tenderIndex = capture.parsedReceipt.lines.findIndex(line => /^Tender$/i.test(line.trim()));
  if (tenderIndex >= 0) {
    return capture.parsedReceipt.lines[tenderIndex + 1]?.trim() || undefined;
  }

  for (const line of capture.parsedReceipt.lines) {
    const trimmed = line.trim();
    const labeledMethod = getLabeledPaymentMethod(trimmed);
    if (labeledMethod && isPaymentEvidenceLine(trimmed.toUpperCase())) return labeledMethod;
    if (isPaymentEvidenceLine(trimmed.toUpperCase())) return trimmed;
  }

  return undefined;
}

export function buildNormalizedEvidence(synthesizedCaptures: SynthesizedCapture[]): NormalizedEvidence[] {
  return synthesizedCaptures.map(capture => {
    const department = normalizeDepartment(capture.parsedReceipt.department);
    const header = parseOrderHeaderAndItems(capture.parsedReceipt.asciiText);

    return {
      id: `${capture.id}:normalized`,
      sourceCaptureId: capture.id,
      rawFileName: capture.raw_filename,
      sha256: capture.sha256,
      capturedAt: capture.captured_at,
      category: capture.category,
      eventKind: classifyEventKind(capture, department),
      operationalDate: getOperationalDate(capture),
      posOrderNumber: capture.parsedReceipt.orderNumber,
      normalizedDepartment: department,
      itemLines: buildItemLines(capture),
      isDuplicateDelivery: capture.isDuplicateRetry,
      duplicateOfId: capture.duplicateOfId,
      rawEvidence: {
        captureId: capture.id,
        rawFileName: capture.raw_filename,
        sha256: capture.sha256,
        bytes: capture.bytes
      },
      metadata: {
        sourceAddress: capture.source_address,
        printerIp: capture.printer_ip,
        tableNumber: capture.parsedReceipt.tableNumber,
        customer: header?.customer,
        salesType: header?.salesType,
        posUser: header?.user,
        cashier: header?.cashier,
        paymentMethod: getPaymentMethod(capture, header?.paymentMethod)
      }
    };
  });
}
