import type {
  SynthesizedCapture,
  TransactionGroup,
  ParsedOrderHeader,
  ParsedOrderItem,
  ItemSalesSummary,
  ReconciliationReport,
  ItemDiscrepancy
} from '../types/audit';

const RECEIPT_HEADER_KEYWORDS = [
  'date', 'order number', 'table', 'customer', 'sales type', 'user', 'cashier',
  'phone:', 'kunci kuppi', '================', '----------------', 'bukti pembayaran',
  'ini bukan bukti pembayaran', 'total item', 'total', 'tender', 'cash', 'change', 'email:', 'password', 'j@vb@',
  'ringkasan', 'akhir shift', 'penjualan', 'reprint', 'cetak ulang', 'complimentary', 'compliment'
];

export function isReceiptHeaderLine(line: string): boolean {
  const lineLower = line.toLowerCase();
  return RECEIPT_HEADER_KEYWORDS.some(keyword => lineLower.startsWith(keyword) || lineLower === keyword);
}

export function parseOrderHeaderAndItems(asciiText: string): ParsedOrderHeader | null {
  if (!asciiText || asciiText.trim().length === 0) return null;

  // STRICT EXCLUSION: Never parse daily sales summaries or shift reports as individual customer bills!
  const isSummaryReport = asciiText.includes('RINGKASAN') || asciiText.includes('AKHIR SHIFT') || asciiText.includes('PENJUALAN');
  if (isSummaryReport) {
    return null;
  }

  const lines = asciiText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let orderNumber = '';
  let date = '';
  let table = '';
  let customer = '';
  let salesType = '';
  let user = '';
  let cashier = '';
  let paymentMethod = '';
  let totalAmount = 0;
  let totalItemCount = 0;

  for (const line of lines) {
    const orderMatch = line.match(/(?:Order\s*Number|Order\s*No\.?|No\.?\s*Order|Invoice)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
    if (orderMatch && !orderNumber) {
      const raw = orderMatch[1].trim();
      orderNumber = raw.startsWith('POS-') ? raw : `POS-${raw}`;
    }

    const dateMatch = line.match(/Date\s*:\s*([0-9/: ]+)/i);
    if (dateMatch) date = dateMatch[1];

    const tableMatch = line.match(/Table\s*:\s*(.+)/i);
    if (tableMatch) table = tableMatch[1];

    const custMatch = line.match(/Customer\s*:\s*(.+)/i);
    if (custMatch) customer = custMatch[1];

    const salesMatch = line.match(/Sales\s*Type\s*:\s*(.+)/i);
    if (salesMatch) salesType = salesMatch[1];

    const userMatch = line.match(/User\s*:\s*(.+)/i);
    if (userMatch && !user) user = userMatch[1];

    const cashierMatch = line.match(/Cashier\s*:\s*(.+)/i);
    if (cashierMatch) cashier = cashierMatch[1];

    const tenderMatch = line.match(/^Tender\s*\n?\s*([A-Za-z0-9 ]+)/i);
    if (tenderMatch && !paymentMethod) paymentMethod = tenderMatch[1];

    const totalMatch = line.match(/^Total\s+([0-9.,]+)$/i);
    if (totalMatch) {
      const parsedVal = parseInt(totalMatch[1].replace(/[.,]/g, ''), 10);
      if (!isNaN(parsedVal)) totalAmount = parsedVal;
    }

    const totalItemMatch = line.match(/^Total\s+Item\s+([0-9]+)$/i);
    if (totalItemMatch) {
      totalItemCount = parseInt(totalItemMatch[1], 10);
    }
  }

  const items: ParsedOrderItem[] = [];
  const variantKeywords = [
    '/', 'iced', 'ice', 'hot', 'freshmilk', 'oatmilk', 'large', 'slice', 'takeaway',
    'sauce', 'bagase', 'sourdough', 'shokupan', 'flat-bread', 'chili', 'egg', 'cheese',
    'botol', 'original'
  ];

  let pendingLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const qtyMatch = line.match(/^([0-9]+)x\s*([0-9.,]+)?(?:\s+([0-9.,]+))?$/i) || line.match(/^([0-9]+)x$/i);
    const altQtyMatch = line.match(/^x([0-9]+)\s+(.+)$/i);

    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10);
      let price = 0;
      let total = 0;

      if (qtyMatch[3]) {
        price = parseInt(qtyMatch[2].replace(/[.,]/g, ''), 10);
        total = parseInt(qtyMatch[3].replace(/[.,]/g, ''), 10);
      } else if (qtyMatch[2]) {
        total = parseInt(qtyMatch[2].replace(/[.,]/g, ''), 10);
        price = total / (qty || 1);
      }

      if (pendingLines.length > 0) {
        let name = pendingLines[0];
        let variant = '';

        if (pendingLines.length > 1) {
          const secondLineLower = pendingLines[1].toLowerCase();
          const isVariant = variantKeywords.some(kw => secondLineLower.includes(kw));
          
          if (isVariant) {
            variant = pendingLines.slice(1).join(' ');
          } else {
            name += ' ' + pendingLines[1];
            if (pendingLines.length > 2) {
              variant = pendingLines.slice(2).join(' ');
            }
          }
        }

        let normVariant = variant.trim();
        const vLower = normVariant.toLowerCase();
        if ((vLower.includes('iced') || vLower.includes('ice')) && vLower.includes('freshmilk')) {
          normVariant = 'Iced / Freshmilk';
        } else if (vLower.includes('hot') && vLower.includes('freshmilk')) {
          normVariant = 'Hot / Freshmilk';
        }

        items.push({
          itemName: name.trim(),
          variant: normVariant,
          quantity: qty,
          unitPrice: isNaN(price) ? 0 : price,
          totalPrice: isNaN(total) ? 0 : total,
          isModifier: name.startsWith('+')
        });

        pendingLines = [];
      }
    } else if (altQtyMatch) {
      const qty = parseInt(altQtyMatch[1], 10);
      const name = altQtyMatch[2].trim();
      items.push({
        itemName: name,
        variant: '',
        quantity: qty,
        unitPrice: 0,
        totalPrice: 0,
        isModifier: name.startsWith('+')
      });
      pendingLines = [];
    } else {
      if (i > 0 && /^Tender$/i.test(lines[i - 1])) {
        continue;
      }

      if (!isReceiptHeaderLine(line) && line.length > 1) {
        pendingLines.push(line);
      }
    }
  }

  if (!orderNumber && items.length === 0) {
    return null;
  }

  return {
    orderNumber: orderNumber || 'UNTRACKED-ORDER',
    date,
    table,
    customer,
    salesType,
    user,
    cashier,
    paymentMethod,
    totalItemCount: totalItemCount || items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount,
    items
  };
}

export function parseDailySalesSummaryReport(asciiText: string): {
  reportDate: string;
  totalSalesRevenue: number;
  totalItemsSold: number;
  summaryItems: Map<string, { qty: number; revenue: number }>;
} {
  const lines = asciiText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const summaryItems = new Map<string, { qty: number; revenue: number }>();

  let reportDate = 'N/A';
  let totalSalesRevenue = 0;
  let totalItemsSold = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = line.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4}\s*-\s*[0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
    if (dateMatch) reportDate = dateMatch[1];

    // Summary item line format: "x13 Matcha / Iced / 338.000"
    const itemMatch = line.match(/^x([0-9]+)\s+(.+)$/i);
    if (itemMatch) {
      const qty = parseInt(itemMatch[1], 10);
      let rest = itemMatch[2].trim();

      const priceMatch = rest.match(/([0-9.,]+)$/);
      let price = 0;
      let rawName = rest;

      if (priceMatch) {
        price = parseInt(priceMatch[1].replace(/[.,]/g, ''), 10);
        rawName = rest.substring(0, priceMatch.index).trim();
      }

      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!nextLine.startsWith('x') && !nextLine.includes('===') && !nextLine.includes('---') && nextLine.length < 30) {
          rawName += ' ' + nextLine;
        }
      }

      // Normalize name & variant
      let normName = rawName.replace(/\s+/g, ' ').trim();
      let normVariant = '';
      if (normName.toLowerCase().includes('iced') && normName.toLowerCase().includes('freshmilk')) {
        normVariant = 'Iced / Freshmilk';
        normName = normName.replace(/iced/i, '').replace(/freshmilk/i, '').replace(/\//g, '').trim();
      } else if (normName.toLowerCase().includes('hot') && normName.toLowerCase().includes('freshmilk')) {
        normVariant = 'Hot / Freshmilk';
        normName = normName.replace(/hot/i, '').replace(/freshmilk/i, '').replace(/\//g, '').trim();
      }

      const key = `${normName}${normVariant ? ` (${normVariant})` : ''}`.trim();

      if (!summaryItems.has(key)) {
        summaryItems.set(key, { qty: 0, revenue: 0 });
      }

      const existing = summaryItems.get(key)!;
      existing.qty += qty;
      existing.revenue += isNaN(price) ? 0 : price;

      totalItemsSold += qty;
      totalSalesRevenue += isNaN(price) ? 0 : price;
    }
  }

  return {
    reportDate,
    totalSalesRevenue,
    totalItemsSold,
    summaryItems
  };
}

export function groupCapturesByTransaction(
  synthesizedCaptures: SynthesizedCapture[]
): {
  transactionGroups: TransactionGroup[];
  itemSalesSummary: ItemSalesSummary[];
  reconciliation: ReconciliationReport;
} {
  const groupMap = new Map<string, SynthesizedCapture[]>();
  const untrackedCaptures: SynthesizedCapture[] = [];

  // 1. Group captures by POS Order Number
  for (const capture of synthesizedCaptures) {
    const orderNum = capture.parsedReceipt.orderNumber;
    if (orderNum && orderNum.startsWith('POS-')) {
      if (!groupMap.has(orderNum)) {
        groupMap.set(orderNum, []);
      }
      groupMap.get(orderNum)!.push(capture);
    } else {
      untrackedCaptures.push(capture);
    }
  }

  const transactionGroups: TransactionGroup[] = [];
  const itemSummaryMap = new Map<string, ItemSalesSummary>();

  // 2. Process Order ID groups & Elect Canonical Customer Bill
  for (const [orderNumber, copies] of groupMap.entries()) {
    copies.sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

    const customerBills = copies.filter(c => 
      (c.category === 'CUSTOMER_BILL' || c.parsedReceipt.asciiText.includes('KK')) &&
      !c.parsedReceipt.asciiText.includes('RINGKASAN') &&
      !c.parsedReceipt.asciiText.includes('AKHIR SHIFT')
    );
    
    let canonicalBill: SynthesizedCapture | null = null;
    let canonicalHeader: ParsedOrderHeader | null = null;

    if (customerBills.length > 0) {
      canonicalBill = customerBills.reduce((prev, curr) => curr.bytes > prev.bytes ? curr : prev, customerBills[0]);
      canonicalHeader = parseOrderHeaderAndItems(canonicalBill.parsedReceipt.asciiText);
    } else if (copies.length > 0) {
      canonicalBill = copies[0];
      canonicalHeader = parseOrderHeaderAndItems(canonicalBill.parsedReceipt.asciiText);
    }

    const associatedTickets = copies.filter(c => c.id !== canonicalBill?.id);
    const hasCustomerBill = customerBills.length > 0;
    const isDuplicateNetworkRetry = customerBills.length > 1;

    transactionGroups.push({
      orderNumber,
      canonicalBill,
      canonicalHeader,
      associatedTickets,
      totalPrintCount: copies.length,
      isDuplicateNetworkRetry,
      hasCustomerBill
    });

    // 3. Aggregate Item Sales ONLY FROM CANONICAL INDIVIDUAL BILLS
    if (canonicalHeader && canonicalHeader.items.length > 0) {
      for (const item of canonicalHeader.items) {
        const key = `${item.itemName}${item.variant ? ` (${item.variant})` : ''}`.trim();
        
        if (!itemSummaryMap.has(key)) {
          itemSummaryMap.set(key, {
            productKey: key,
            itemName: item.itemName,
            variant: item.variant,
            totalQtySold: 0,
            totalRevenue: 0,
            orderCount: 0,
            isModifier: item.isModifier
          });
        }

        const summary = itemSummaryMap.get(key)!;
        summary.totalQtySold += item.quantity;
        summary.totalRevenue += item.totalPrice;
        summary.orderCount += 1;
      }
    }
  }

  // 4. Process genuine untracked customer bills (EXCLUDING SUMMARIES AND SHIFT REPORTS)
  for (const capture of untrackedCaptures) {
    const text = capture.parsedReceipt.asciiText;
    const isSummaryOrShift = text.includes('RINGKASAN') || text.includes('AKHIR SHIFT') || text.includes('PENJUALAN');
    const isTestPrint = capture.category === 'TEST_PRINT' || capture.parsedReceipt.isTestPrint;

    if (!isSummaryOrShift && !isTestPrint && (capture.category === 'CUSTOMER_BILL' || text.includes('KK'))) {
      const header = parseOrderHeaderAndItems(text);
      if (header && header.items.length > 0) {
        for (const item of header.items) {
          const key = `${item.itemName}${item.variant ? ` (${item.variant})` : ''}`.trim();
          if (!itemSummaryMap.has(key)) {
            itemSummaryMap.set(key, {
              productKey: key,
              itemName: item.itemName,
              variant: item.variant,
              totalQtySold: 0,
              totalRevenue: 0,
              orderCount: 0,
              isModifier: item.isModifier
            });
          }
          const summary = itemSummaryMap.get(key)!;
          summary.totalQtySold += item.quantity;
          summary.totalRevenue += item.totalPrice;
          summary.orderCount += 1;
        }
      }
    }
  }

  const itemSalesSummary = Array.from(itemSummaryMap.values()).sort((a, b) => b.totalQtySold - a.totalQtySold);

  // 5. RECONCILIATION ENGINE: Daily Summary vs. Canonical Customer Bills
  const summaryCaptures = synthesizedCaptures.filter(c => 
    c.parsedReceipt.asciiText.includes('RINGKASAN') || c.category === 'DAILY_SUMMARY'
  );

  let reconciliation: ReconciliationReport = {
    hasDailySummary: false,
    summaryTotalRevenue: 0,
    summaryTotalItemsSold: 0,
    canonicalTotalRevenue: itemSalesSummary.reduce((sum, i) => sum + i.totalRevenue, 0),
    canonicalTotalItemsSold: itemSalesSummary.reduce((sum, i) => sum + i.totalQtySold, 0),
    revenueGap: 0,
    itemCountGap: 0,
    itemDiscrepancies: [],
    hasThreatAlert: false
  };

  if (summaryCaptures.length > 0) {
    const mainSummaryCapture = summaryCaptures.reduce((prev, curr) => curr.bytes > prev.bytes ? curr : prev, summaryCaptures[0]);
    const parsedSummary = parseDailySalesSummaryReport(mainSummaryCapture.parsedReceipt.asciiText);

    const canonicalRevenue = reconciliation.canonicalTotalRevenue;
    const canonicalItemsSold = reconciliation.canonicalTotalItemsSold;

    const summaryRev = parsedSummary.totalSalesRevenue;
    const summaryItemsSold = parsedSummary.totalItemsSold;

    const revenueGap = summaryRev - canonicalRevenue;
    const itemCountGap = summaryItemsSold - canonicalItemsSold;

    // Discrepancy Matrix
    const itemDiscrepancies: ItemDiscrepancy[] = [];
    const allKeys = new Set([...Array.from(parsedSummary.summaryItems.keys()), ...Array.from(itemSummaryMap.keys())]);

    for (const key of allKeys) {
      const sumItem = parsedSummary.summaryItems.get(key);
      const canItem = itemSummaryMap.get(key);

      const sumQty = sumItem ? sumItem.qty : 0;
      const canQty = canItem ? canItem.totalQtySold : 0;
      const discQty = sumQty - canQty;

      let status: 'MATCH' | 'GAP_MISSING_RECEIPTS' | 'EXCESS_BILLS' = 'MATCH';
      if (discQty > 0) status = 'GAP_MISSING_RECEIPTS';
      else if (discQty < 0) status = 'EXCESS_BILLS';

      itemDiscrepancies.push({
        productKey: key,
        itemName: canItem ? canItem.itemName : key,
        variant: canItem ? canItem.variant : '',
        summaryQty: sumQty,
        canonicalQty: canQty,
        discrepancyQty: discQty,
        status
      });
    }

    const hasThreatAlert = itemCountGap > 0 || revenueGap > 0;
    let threatMessage = undefined;
    if (hasThreatAlert) {
      threatMessage = `⚠️ Discrepancy Alert: Daily Sales Summary Report lists ${summaryItemsSold} items (${summaryRev.toLocaleString()} IDR) vs ${canonicalItemsSold} items (${canonicalRevenue.toLocaleString()} IDR) extracted from canonical bills. Gap of ${itemCountGap} missing items due to buffer limit or uncaptured morning shift receipts!`;
    }

    reconciliation = {
      hasDailySummary: true,
      dailySummaryCapture: mainSummaryCapture,
      summaryTotalRevenue: summaryRev,
      summaryTotalItemsSold: summaryItemsSold,
      canonicalTotalRevenue: canonicalRevenue,
      canonicalTotalItemsSold: canonicalItemsSold,
      revenueGap,
      itemCountGap,
      itemDiscrepancies: itemDiscrepancies.sort((a, b) => Math.abs(b.discrepancyQty) - Math.abs(a.discrepancyQty)),
      hasThreatAlert,
      threatMessage
    };
  }

  return {
    transactionGroups: transactionGroups.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber)),
    itemSalesSummary,
    reconciliation
  };
}
