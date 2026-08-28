export interface PrintJobCapture {
  id: string;
  captured_at: string;
  source_address: string;
  printer_ip: string;
  printer_port: number;
  bytes: number;
  sha256: string;
  raw_filename: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  event_type: 'SERVICE_STARTED' | 'SERVICE_STOPPED' | 'PIN_SUCCESS' | 'PIN_FAILED' | 'AUTOSTART_CHANGED' | 'CONFIG_SAVED' | 'S3_BACKUP_SUCCESS' | 'S3_BACKUP_FAILED' | 'DUPLICATE_PRINT_CAPTURED' | string;
  details: string;
  pin_authorized: boolean;
}

export type ReceiptCategory = 'CUSTOMER_BILL' | 'KITCHEN_TICKET' | 'DAILY_SUMMARY' | 'TEST_PRINT' | 'UNKNOWN';

export type NormalizedDepartment =
  | 'BAR'
  | 'HOT_KITCHEN'
  | 'COLD_KITCHEN'
  | 'CAPTAIN_ORDER'
  | 'UNKNOWN';

export type NormalizedEventKind =
  | 'PRODUCTION_TICKET'
  | 'ADD_ITEM'
  | 'VOID_ITEM'
  | 'CAPTAIN_ORDER'
  | 'PRELIMINARY_BILL'
  | 'FINAL_PAID_BILL'
  | 'BILL_REPRINT'
  | 'DAILY_SALES_SUMMARY_SNAPSHOT'
  | 'COMPLIMENTARY_ACTIVITY'
  | 'NON_AUDIT_EVIDENCE';

export interface ESCPOSParsedReceipt {
  rawBytes: Uint8Array;
  asciiText: string;
  lines: string[];
  department?: string; // e.g. "BAR", "HOT KITCHEN", "COLD KITCHEN", "CAPTAIN ORDER"
  tableNumber?: string;
  orderNumber?: string;
  isTestPrint: boolean;
}

export interface SynthesizedCapture extends PrintJobCapture {
  parsedReceipt: ESCPOSParsedReceipt;
  category: ReceiptCategory;
  isDuplicateRetry: boolean;
  duplicateOfId?: string;
  retryTimeDiffSeconds?: number;
  isSynthesizedValid: boolean;
}

export interface NormalizedEvidence {
  id: string;
  sourceCaptureId: string;
  rawFileName: string;
  sha256: string;
  capturedAt: string;
  category: ReceiptCategory;
  eventKind: NormalizedEventKind;
  operationalDate?: string;
  posOrderNumber?: string;
  normalizedDepartment: NormalizedDepartment;
  itemLines: NormalizedEvidenceItemLine[];
  isDuplicateDelivery: boolean;
  duplicateOfId?: string;
  rawEvidence: {
    captureId: string;
    rawFileName: string;
    sha256: string;
    bytes: number;
  };
  metadata: {
    sourceAddress: string;
    printerIp: string;
    tableNumber?: string;
    customer?: string;
    salesType?: string;
    posUser?: string;
    cashier?: string;
    paymentMethod?: string;
  };
}

export interface NormalizedEvidenceItemLine {
  normalizedProduct: string;
  quantity: number;
  quantityRole: 'BASE' | 'ADDITION' | 'VOID';
  variant?: string;
  unitPrice?: number;
  totalPrice?: number;
  sourceLine?: string;
  supportingLines?: string[];
  isModifier?: boolean;
}

// === Transaction Grouping & Item Parsing Types ===

export interface ParsedOrderItem {
  itemName: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isModifier: boolean;
}

export interface ParsedOrderHeader {
  orderNumber: string; // e.g. "POS-250826-69"
  date: string;       // e.g. "25/08/2026 15:07"
  table: string;      // e.g. "Table - 11"
  customer: string;   // e.g. "AQILA"
  salesType: string;  // e.g. "Normal"
  user: string;       // e.g. "Komang Vemy Rakya Dewi"
  cashier: string;    // e.g. "Komang Vemy Rakya Dewi"
  paymentMethod: string; // e.g. "Qris Sinarmas", "Cash"
  totalItemCount: number;
  totalAmount: number;
  items: ParsedOrderItem[];
}

export interface TransactionGroup {
  orderNumber: string; // e.g. "POS-250826-69"
  canonicalBill: SynthesizedCapture | null; // Selected Customer Bill for Item Counts
  canonicalHeader: ParsedOrderHeader | null;
  associatedTickets: SynthesizedCapture[]; // Bar, Kitchen, Add-item ticket copies
  totalPrintCount: number; // e.g. 2 copies (1 Bar ticket + 1 Customer bill)
  isDuplicateNetworkRetry: boolean;
  hasCustomerBill: boolean;
}

export interface ItemSalesSummary {
  productKey: string;     // e.g. "Kunci Bagel - Bagel Original"
  itemName: string;       // e.g. "Kunci Bagel"
  variant: string;        // e.g. "Bagel Original"
  totalQtySold: number;   // Sum of quantities from canonical customer bills
  totalRevenue: number;   // Total IDR revenue
  orderCount: number;     // Number of distinct orders containing this item
  isModifier: boolean;
}

// === Reconciliation & Threat Detection Types ===

export interface ItemDiscrepancy {
  productKey: string;
  itemName: string;
  variant: string;
  summaryQty: number;      // Quantity printed on Daily Sales Summary Report
  canonicalQty: number;    // Quantity extracted from canonical customer bills
  discrepancyQty: number;  // summaryQty - canonicalQty (Missing receipts)
  status: 'MATCH' | 'GAP_MISSING_RECEIPTS' | 'EXCESS_BILLS';
}

export interface ReconciliationReport {
  hasDailySummary: boolean;
  dailySummaryCapture?: SynthesizedCapture;
  summaryTotalRevenue: number;
  summaryTotalItemsSold: number;
  canonicalTotalRevenue: number;
  canonicalTotalItemsSold: number;
  revenueGap: number;        // summaryTotalRevenue - canonicalTotalRevenue
  itemCountGap: number;      // summaryTotalItemsSold - canonicalTotalItemsSold
  itemDiscrepancies: ItemDiscrepancy[];
  hasThreatAlert: boolean;   // True if Daily Summary > Canonical Bills (missing receipts or deleted orders)
  threatMessage?: string;
}

export type DailyAuditVerdict =
  | 'CLEAN'
  | 'HIGH_PRIORITY_FINDINGS'
  | 'INCOMPLETE_COVERAGE'
  | 'PROVISIONAL'
  | 'MISSING_SUMMARY';

export interface PrintAuditModel {
  availableOperationalDates: string[];
  defaultOperationalDate?: string;
  dailyAudits: DailyPrintAudit[];
}

export interface DailyItemComparison {
  productKey: string;
  normalizedProduct: string;
  routedQuantity: number;
  paidQuantity: number;
  summaryQuantity: number;
  unitPrice: number;
  discrepancyQuantity: number;
  discrepancyRevenue: number;
  status: 'MATCH' | 'MISSING_PRODUCTION' | 'EXCESS_PRODUCTION';
  evidenceIds?: string[];
}

export interface DailyPrintAudit {
  operationalDate: string;
  verdict: DailyAuditVerdict;
  verifyingSummary?: AuditSummarySnapshot;
  isProvisional: boolean;
  excludedAfterCutoffCount: number;
  orderTimelines: OrderEvidenceTimeline[];
  findings: AuditFinding[];
  printCoverageGaps: PrintCoverageGap[];
  voidEvidence: NormalizedEvidence[];
  complimentaryEvidence: NormalizedEvidence[];
  summaryComparison: AuditSummaryComparison;
  itemComparisons: DailyItemComparison[];
}

export interface AuditSummarySnapshot {
  sourceCaptureId: string;
  capturedAt: string;
  totalItemsSold: number;
  totalSalesRevenue: number;
  deliveryCount: number;
  uniquePayloadCount: number;
  deliveries: AuditSummaryDelivery[];
}

export interface AuditSummaryDelivery {
  sourceCaptureId: string;
  capturedAt: string;
  rawFileName: string;
  sha256: string;
  isDuplicateDelivery: boolean;
  duplicateOfId?: string;
}

export interface OrderEvidenceTimeline {
  orderKey: string;
  operationalDate: string;
  posOrderNumber: string;
  events: NormalizedEvidence[];
  exposures: FulfillmentExposure[];
  hasFinalPaidBill: boolean;
  latestPaidEvidenceId?: string;
}

export interface FulfillmentExposure {
  normalizedProduct: string;
  department: NormalizedDepartment;
  exposedQuantity: number;
  paidQuantity: number;
  summaryQuantity: number;
  sourceEvidenceIds: string[];
  voidEvidenceIds: string[];
}

export interface AuditFinding {
  id: string;
  kind: 'POST_ROUTING_REDUCTION';
  severity: 'HIGH';
  orderKey: string;
  posOrderNumber: string;
  normalizedProduct: string;
  department: NormalizedDepartment;
  eventTime: string;
  exposureQuantity: number;
  posQuantity: number;
  reductionQuantity: number;
  estimatedValue: number;
  evidenceIds: string[];
  paymentMethod?: string;
  cashier?: string;
  posUser?: string;
}

export interface PrintCoverageGap {
  id: string;
  orderKey?: string;
  posOrderNumber?: string;
  normalizedProduct: string;
  exposureQuantity: number;
  paidQuantity?: number;
  summaryQuantity: number;
  unitPrice?: number;
  estimatedValue?: number;
  reason: 'MISSING_FINAL_PAID_BILL' | 'SUMMARY_EXCEEDS_CAPTURED_PRODUCTION';
  sourceEvidenceIds?: string[];
}

export interface AuditSummaryComparison {
  productionExposureQuantity: number;
  summaryQuantity: number;
  paidQuantity: number;
  productionExposureRevenue: number;
  paidRevenue: number;
  summaryRevenue: number;
  revenueGap: number;
  revenueMatchStatus: 'MATCH' | 'PRODUCTION_EXCEEDS_SUMMARY' | 'SUMMARY_EXCEEDS_PRODUCTION' | 'UNTESTED';
}

export interface SynthesisMetrics {
  rawTotalCaptures: number;
  rawTotalBytes: number;
  synthesizedValidCaptures: number;
  synthesizedValidBytes: number;

  duplicateRetryCount: number;
  duplicateWastedBytes: number;

  testPrintCount: number;
  
  categoryCounts: {
    CUSTOMER_BILL: number;
    KITCHEN_TICKET: number;
    DAILY_SUMMARY: number;
    TEST_PRINT: number;
    UNKNOWN: number;
  };

  posSourceBreakdown: Record<string, { total: number; valid: number; retries: number }>;
  hourlyVolume: Record<string, { raw: number; valid: number }>;
}

export interface ParsedAuditArchive {
  fileName: string;
  extractedAt: string;
  rawCaptures: PrintJobCapture[];
  rawBytesMap: Map<string, Uint8Array>;
  auditEvents: AuditEvent[];
  synthesizedCaptures: SynthesizedCapture[];
  normalizedEvidence: NormalizedEvidence[];
  auditModel: PrintAuditModel;
  metrics: SynthesisMetrics;
  transactionGroups: TransactionGroup[];
  itemSalesSummary: ItemSalesSummary[];
  reconciliation: ReconciliationReport;
}
