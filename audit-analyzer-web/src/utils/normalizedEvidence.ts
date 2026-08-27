import type {
  NormalizedDepartment,
  NormalizedEventKind,
  NormalizedEvidence,
  NormalizedEvidenceItemLine,
  SynthesizedCapture
} from '../types/audit';
import { parseDailySalesSummaryReport, parseOrderHeaderAndItems } from './receiptItemParser';

function normalizeDepartment(department?: string): NormalizedDepartment {
  switch (department) {
    case 'BAR':
      return 'BAR';
    case 'HOT KITCHEN':
      return 'HOT_KITCHEN';
    case 'COLD KITCHEN':
      return 'COLD_KITCHEN';
    case 'CAPTAIN ORDER':
      return 'CAPTAIN_ORDER';
    default:
      return 'UNKNOWN';
  }
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
  const explicitLines = capture.parsedReceipt.lines.slice(0, 10).map(line => line.trim().toUpperCase());

  if (capture.category === 'DAILY_SUMMARY') {
    return 'DAILY_SALES_SUMMARY_SNAPSHOT';
  }
  if (explicitLines.some(line => line === 'COMPLIMENTARY' || line === 'COMPLIMENT')) {
    return 'COMPLIMENTARY_ACTIVITY';
  }
  if (capture.category === 'CUSTOMER_BILL') {
    if (explicitLines.some(line => line.includes('INI BUKAN BUKTI PEMBAYARAN'))) {
      return 'PRELIMINARY_BILL';
    }
    if (explicitLines.some(line => line === 'REPRINT' || line === 'CETAK ULANG')) {
      return 'BILL_REPRINT';
    }
    return 'FINAL_PAID_BILL';
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

function normalizeProductName(value: string): string {
  return value
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\/\s*$/, '')
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
    totalPrice: item.totalPrice
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

function buildTicketItemLines(capture: SynthesizedCapture): NormalizedEvidenceItemLine[] {
  const itemLines: NormalizedEvidenceItemLine[] = [];

  for (const line of capture.parsedReceipt.lines) {
    const match = line.match(/^([x+-])([0-9]+)\s+(.+)$/i);
    if (!match) continue;

    const quantityPrefix = match[1];
    const quantityRole = quantityPrefix === '+'
      ? 'ADDITION'
      : quantityPrefix === '-'
        ? 'VOID'
        : 'BASE';

    itemLines.push({
      normalizedProduct: normalizeProductName(match[3]),
      quantity: parseInt(match[2], 10),
      quantityRole,
      sourceLine: line
    });
  }

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
        paymentMethod: header?.paymentMethod
      }
    };
  });
}
