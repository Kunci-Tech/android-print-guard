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
  metrics: SynthesisMetrics;
  transactionGroups: TransactionGroup[];
  itemSalesSummary: ItemSalesSummary[];
  reconciliation: ReconciliationReport;
}
