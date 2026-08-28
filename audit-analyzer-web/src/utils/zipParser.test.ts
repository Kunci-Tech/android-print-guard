import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseAuditZipArchive } from './zipParser';
import type { PrintJobCapture } from '../types/audit';

const textEncoder = new TextEncoder();

function makeCapture(id: string, capturedAt: string, rawFilename: string, text: string): {
  meta: PrintJobCapture;
  bytes: Uint8Array;
} {
  const bytes = textEncoder.encode(text);
  return {
    bytes,
    meta: {
      id,
      captured_at: capturedAt,
      source_address: '10.0.0.12',
      printer_ip: '10.0.0.42',
      printer_port: 9100,
      bytes: bytes.byteLength,
      sha256: `sha-${text}`,
      raw_filename: rawFilename
    }
  };
}

function makeDailySummary(date: string, itemLines: string[]): string {
  return [
    'RINGKASAN PENJUALAN',
    `${date} - ${date}`,
    ...itemLines
  ].join('\n');
}

async function buildZip(captures: ReturnType<typeof makeCapture>[]): Promise<ArrayBuffer> {
  const zip = new JSZip();

  for (const capture of captures) {
    zip.file(capture.meta.raw_filename, capture.bytes);
    zip.file(capture.meta.raw_filename.replace(/\.raw$/, '.json'), JSON.stringify(capture.meta));
  }

  const uint8 = await zip.generateAsync({ type: 'uint8array' });
  const buffer = new ArrayBuffer(uint8.byteLength);
  new Uint8Array(buffer).set(uint8);
  return buffer;
}

describe('parseAuditZipArchive normalized evidence ingestion', () => {
  it('extracts exact POS order numbers without unrelated Normal text overwriting them', async () => {
    const zipBuffer = await buildZip([
      makeCapture('cold-1', '2026-08-27T07:15:00.000Z', 'cold-1.raw', [
        'COLD KITCHEN',
        'Order Number: POS-260827-42',
        'Date: 27/08/2026 15:15',
        'Sales Type: Normal',
        'Normal',
        'x1 Caesar Salad',
        'BAR garnish station is unrelated text'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'regression.zip');

    expect(archive.synthesizedCaptures[0].parsedReceipt.orderNumber).toBe('POS-260827-42');
    expect(archive.normalizedEvidence).toHaveLength(1);
    expect(archive.normalizedEvidence[0]).toMatchObject({
      posOrderNumber: 'POS-260827-42',
      normalizedDepartment: 'COLD_KITCHEN',
      eventKind: 'PRODUCTION_TICKET',
      operationalDate: '2026-08-27',
      capturedAt: '2026-08-27T07:15:00.000Z',
      sourceCaptureId: 'cold-1',
      rawFileName: 'cold-1.raw'
    });
    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Caesar Salad',
        quantity: 1,
        quantityRole: 'BASE',
        sourceLine: 'x1 Caesar Salad'
      }
    ]);
  });

  it('classifies ticket kinds from explicit headers and keeps duplicate deliveries as evidence metadata', async () => {
    const productionTicket = [
      'CAPTAIN ORDER',
      'Order Number: POS-260827-77',
      'Date: 27/08/2026 16:30',
      'x2 Latte',
      'BAR appears here as a product note, not a department header'
    ].join('\n');

    const zipBuffer = await buildZip([
      makeCapture('captain-1', '2026-08-27T08:30:00.000Z', 'captain-1.raw', productionTicket),
      makeCapture('captain-2', '2026-08-27T08:30:08.000Z', 'captain-2.raw', productionTicket),
      makeCapture('summary-1', '2026-08-27T09:00:00.000Z', 'summary-1.raw', makeDailySummary('27/08/2026', [
        'x2 Latte / 70.000'
      ]))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'regression.zip');

    expect(archive.normalizedEvidence.map(ev => ev.eventKind)).toEqual([
      'CAPTAIN_ORDER',
      'CAPTAIN_ORDER',
      'DAILY_SALES_SUMMARY_SNAPSHOT'
    ]);
    expect(archive.normalizedEvidence[0]).toMatchObject({
      normalizedDepartment: 'CAPTAIN_ORDER',
      isDuplicateDelivery: false
    });
    expect(archive.normalizedEvidence[1]).toMatchObject({
      normalizedDepartment: 'CAPTAIN_ORDER',
      isDuplicateDelivery: true,
      duplicateOfId: 'captain-1'
    });
    expect(archive.normalizedEvidence[2]).toMatchObject({
      normalizedDepartment: 'UNKNOWN',
      operationalDate: '2026-08-27',
      posOrderNumber: undefined
    });
    expect(archive.normalizedEvidence[2].itemLines).toEqual([
      {
        normalizedProduct: 'Latte',
        quantity: 2,
        quantityRole: 'BASE',
        totalPrice: 70000
      }
    ]);
  });

  it('classifies BAR, HOT KITCHEN, and customer bills from explicit markers', async () => {
    const zipBuffer = await buildZip([
      makeCapture('bar-1', '2026-08-27T09:15:00.000Z', 'bar-1.raw', [
        'BAR',
        'Order Number: POS-260827-88',
        'Date: 27/08/2026 17:15',
        '+1 Espresso'
      ].join('\n')),
      makeCapture('hot-1', '2026-08-27T09:16:00.000Z', 'hot-1.raw', [
        'HOT KITCHEN',
        'Order Number: POS-260827-88',
        'Date: 27/08/2026 17:15',
        '-1 Toast'
      ].join('\n')),
      makeCapture('bill-1', '2026-08-27T09:30:00.000Z', 'bill-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-88',
        'Date: 27/08/2026 17:30',
        'Table: Table - 4',
        'Customer: WALK IN',
        'Sales Type: Normal',
        'User: Made',
        'Cashier: Made',
        'Tender',
        'Qris Sinarmas',
        'Espresso',
        '1x 35.000',
        'Total Item 1',
        'Total 35.000'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'regression.zip');

    expect(archive.normalizedEvidence).toHaveLength(3);
    expect(archive.normalizedEvidence[0]).toMatchObject({
      category: 'KITCHEN_TICKET',
      eventKind: 'ADD_ITEM',
      normalizedDepartment: 'BAR'
    });
    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Espresso',
        quantity: 1,
        quantityRole: 'ADDITION',
        sourceLine: '+1 Espresso'
      }
    ]);
    expect(archive.normalizedEvidence[1]).toMatchObject({
      category: 'KITCHEN_TICKET',
      eventKind: 'VOID_ITEM',
      normalizedDepartment: 'HOT_KITCHEN'
    });
    expect(archive.normalizedEvidence[2]).toMatchObject({
      category: 'CUSTOMER_BILL',
      eventKind: 'FINAL_PAID_BILL',
      normalizedDepartment: 'UNKNOWN',
      posOrderNumber: 'POS-260827-88'
    });
    expect(archive.normalizedEvidence[2].itemLines).toEqual([
      {
        normalizedProduct: 'Espresso',
        quantity: 1,
        quantityRole: 'BASE',
        variant: undefined,
        unitPrice: 35000,
        totalPrice: 35000
      }
    ]);
  });

  it('joins plain wrapped ticket product names without forcing them into variants', async () => {
    const zipBuffer = await buildZip([
      makeCapture('wrapped-1', '2026-08-27T09:15:00.000Z', 'wrapped-1.raw', [
        'BAR',
        'Order Number: POS-260827-89',
        'Date: 27/08/2026 17:15',
        'x1 Kunci',
        'Bagel',
        'Note: toasted'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'wrapped-ticket.zip');

    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel',
        quantity: 1,
        quantityRole: 'BASE',
        sourceLine: 'x1 Kunci',
        supportingLines: ['Bagel', 'Note: toasted']
      }
    ]);
  });

  it('retains long and colon-delimited ticket notes with their parent product', async () => {
    const note = 'Allergy: no nuts, no sesame, and keep sauce packed separately for delivery';
    const zipBuffer = await buildZip([
      makeCapture('note-1', '2026-08-27T09:20:00.000Z', 'note-1.raw', [
        'HOT KITCHEN',
        'Order Number: POS-260827-90',
        'Date: 27/08/2026 17:20',
        'x1 Nasi Goreng',
        'Spesial',
        note
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'ticket-notes.zip');

    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Nasi Goreng Spesial',
        quantity: 1,
        quantityRole: 'BASE',
        sourceLine: 'x1 Nasi Goreng',
        supportingLines: ['Spesial', note]
      }
    ]);
  });

  it('retains unlabeled lower-case ticket notes without adding them to the normalized product', async () => {
    const zipBuffer = await buildZip([
      makeCapture('plain-note-1', '2026-08-27T09:21:00.000Z', 'plain-note-1.raw', [
        'HOT KITCHEN',
        'Order Number: POS-260827-93',
        'Date: 27/08/2026 17:21',
        'x1 Nasi Goreng',
        'no nuts'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'plain-note.zip');

    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Nasi Goreng',
        quantity: 1,
        quantityRole: 'BASE',
        sourceLine: 'x1 Nasi Goreng',
        supportingLines: ['no nuts']
      }
    ]);
  });

  it('keeps long wrapped ticket product continuations in the normalized product', async () => {
    const continuation = 'With roasted garlic mushroom ragout and crispy shallot garnish';
    const zipBuffer = await buildZip([
      makeCapture('long-product-1', '2026-08-27T09:22:00.000Z', 'long-product-1.raw', [
        'HOT KITCHEN',
        'Order Number: POS-260827-92',
        'Date: 27/08/2026 17:22',
        'x1 Truffle Scrambled Egg Plate',
        continuation
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'long-product.zip');

    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: `Truffle Scrambled Egg Plate ${continuation}`,
        quantity: 1,
        quantityRole: 'BASE',
        sourceLine: 'x1 Truffle Scrambled Egg Plate',
        supportingLines: [continuation]
      }
    ]);
  });

  it('classifies sales-type-only complimentary bills as complimentary activity', async () => {
    const zipBuffer = await buildZip([
      makeCapture('comp-sales-type-1', '2026-08-27T09:25:00.000Z', 'comp-sales-type-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-91',
        'Date: 27/08/2026 17:25',
        'Table: Table - 10',
        'Customer: Staff Meal',
        'Sales Type: Complimentary',
        'User: Wayan',
        'Cashier: Kadek',
        'Garden Salad',
        '1x 0',
        'Total Item 1',
        'Total 0'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'complimentary-sales-type.zip');

    expect(archive.normalizedEvidence[0]).toMatchObject({
      category: 'CUSTOMER_BILL',
      eventKind: 'COMPLIMENTARY_ACTIVITY',
      posOrderNumber: 'POS-260827-91',
      metadata: {
        salesType: 'Complimentary',
        posUser: 'Wayan',
        cashier: 'Kadek'
      }
    });
    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Garden Salad',
        quantity: 1,
        quantityRole: 'BASE',
        variant: undefined,
        unitPrice: 0,
        totalPrice: 0
      }
    ]);
  });

  it('keeps lowercase wrapped product continuations while retaining note-like lines as support', async () => {
    const zipBuffer = await buildZip([
      makeCapture('lowercase-product-1', '2026-08-27T09:26:00.000Z', 'lowercase-product-1.raw', [
        'HOT KITCHEN',
        'Order Number: POS-260827-94',
        'Date: 27/08/2026 17:26',
        'x1 Kunci',
        'bagel',
        'no nuts'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'lowercase-product.zip');

    expect(archive.normalizedEvidence[0].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci bagel',
        quantity: 1,
        quantityRole: 'BASE',
        sourceLine: 'x1 Kunci',
        supportingLines: ['bagel', 'no nuts']
      }
    ]);
  });

  it('does not classify a bill without payment evidence as paid', async () => {
    const zipBuffer = await buildZip([
      makeCapture('unpaid-1', '2026-08-27T09:27:00.000Z', 'unpaid-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-95',
        'Date: 27/08/2026 17:27',
        'Sales Type: Normal',
        'Kunci Bagel',
        '1x 50.000',
        'Total 50.000'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'unpaid-bill.zip');

    expect(archive.normalizedEvidence[0].eventKind).toBe('NON_AUDIT_EVIDENCE');
  });

  it('recognizes event markers after the receipt header', async () => {
    const zipBuffer = await buildZip([
      makeCapture('late-marker-1', '2026-08-27T09:28:00.000Z', 'late-marker-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-96',
        'Date: 27/08/2026 17:28',
        'Table: Table - 1',
        'Customer: Raka',
        'Sales Type: Normal',
        'User: Made',
        'Cashier: Komang',
        'Kunci Bagel',
        '1x 50.000',
        'INI BUKAN BUKTI PEMBAYARAN',
        'Total 50.000'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'late-marker.zip');

    expect(archive.normalizedEvidence[0].eventKind).toBe('PRELIMINARY_BILL');
  });

  it('recognizes direct payment labels and late department headers', async () => {
    const zipBuffer = await buildZip([
      makeCapture('direct-cash-1', '2026-08-27T09:29:00.000Z', 'direct-cash-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-97',
        'Date: 27/08/2026 17:29',
        'Sales Type: Normal',
        'Kunci Bagel',
        '1x 50.000',
        'Total 50.000',
        'Cash'
      ].join('\n')),
      makeCapture('late-department-1', '2026-08-27T09:30:00.000Z', 'late-department-1.raw', [
        'Printer Header',
        'Order Number: POS-260827-98',
        'Date: 27/08/2026 17:30',
        'Header Detail',
        'Station Detail',
        'Shift Detail',
        'Ticket Detail',
        'Operator Detail',
        'BAR',
        'x1 Espresso'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'late-parser-markers.zip');

    expect(archive.normalizedEvidence[0]).toMatchObject({
      eventKind: 'FINAL_PAID_BILL',
      metadata: { paymentMethod: 'Cash' }
    });
    expect(archive.normalizedEvidence[1]).toMatchObject({
      eventKind: 'PRODUCTION_TICKET',
      normalizedDepartment: 'BAR'
    });
  });

  it('does not treat pending payment labels as completed payment', async () => {
    const zipBuffer = await buildZip([
      makeCapture('pending-payment-1', '2026-08-27T09:31:00.000Z', 'pending-payment-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-99',
        'Date: 27/08/2026 17:31',
        'Kunci Bagel',
        '1x 50.000',
        'Payment: Pending',
        'Total 50.000'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'pending-payment.zip');

    expect(archive.normalizedEvidence[0].eventKind).toBe('NON_AUDIT_EVIDENCE');
  });
});

describe('parseAuditZipArchive date-scoped post-routing audit', () => {
  it('selects the newest operational date and flags paid-state reductions before the verifying summary', async () => {
    const coldTicket = [
      'COLD KITCHEN',
      'Order Number: POS-260827-101',
      'Date: 27/08/2026 12:10',
      'x1 Club Sandwich',
      'x1 Garden Salad'
    ].join('\n');

    const zipBuffer = await buildZip([
      makeCapture('summary-25', '2026-08-25T10:00:00.000Z', 'summary-25.raw', makeDailySummary('25/08/2026', [
        'x9 Old Day / 900.000'
      ])),
      makeCapture('summary-27-early', '2026-08-27T08:00:00.000Z', 'summary-27-early.raw', makeDailySummary('27/08/2026', [
        'x1 Club Sandwich / 100.000'
      ])),
      makeCapture('station-1', '2026-08-27T09:10:00.000Z', 'station-1.raw', coldTicket),
      makeCapture('station-1-retry', '2026-08-27T09:10:06.000Z', 'station-1-retry.raw', coldTicket),
      makeCapture('captain-1', '2026-08-27T09:10:30.000Z', 'captain-1.raw', [
        'CAPTAIN ORDER',
        'Order Number: POS-260827-101',
        'Date: 27/08/2026 12:10',
        'x1 Club Sandwich',
        'x1 Garden Salad'
      ].join('\n')),
      makeCapture('void-1', '2026-08-27T09:12:00.000Z', 'void-1.raw', [
        'COLD KITCHEN',
        'Order Number: POS-260827-101',
        'Date: 27/08/2026 12:12',
        '-1 Garden Salad'
      ].join('\n')),
      makeCapture('paid-1', '2026-08-27T09:20:00.000Z', 'paid-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-101',
        'Date: 27/08/2026 12:20',
        'Table: Table - 8',
        'Customer: WALK IN',
        'Sales Type: Normal',
        'User: Wayan',
        'Cashier: Komang',
        'Tender',
        'Cash',
        'Club Sandwich',
        '1x 100.000',
        'Total Item 1',
        'Total 100.000'
      ].join('\n')),
      makeCapture('station-2', '2026-08-27T09:30:00.000Z', 'station-2.raw', [
        'HOT KITCHEN',
        'Order Number: POS-260827-103',
        'Date: 27/08/2026 12:30',
        'x1 Hidden Cake'
      ].join('\n')),
      makeCapture('summary-27-latest', '2026-08-27T10:00:00.000Z', 'summary-27-latest.raw', makeDailySummary('27/08/2026', [
        'Snapshot: closing',
        'x1 Club Sandwich / 100.000'
      ])),
      makeCapture('after-cutoff', '2026-08-27T10:10:00.000Z', 'after-cutoff.raw', [
        'BAR',
        'Order Number: POS-260827-102',
        'Date: 27/08/2026 13:10',
        'x1 Espresso'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'daily-audit.zip');

    expect(archive.auditModel.availableOperationalDates).toEqual(['2026-08-25', '2026-08-27']);
    expect(archive.auditModel.defaultOperationalDate).toBe('2026-08-27');

    const august27 = archive.auditModel.dailyAudits.find(audit => audit.operationalDate === '2026-08-27');
    expect(august27).toBeDefined();
    expect(august27).toMatchObject({
      verifyingSummary: {
        sourceCaptureId: 'summary-27-latest',
        capturedAt: '2026-08-27T10:00:00.000Z',
        deliveryCount: 2,
        uniquePayloadCount: 2
      },
      isProvisional: true,
      excludedAfterCutoffCount: 1,
      verdict: 'HIGH_PRIORITY_FINDINGS'
    });

    expect(august27?.orderTimelines).toHaveLength(2);
    expect(august27?.orderTimelines[0]).toMatchObject({
      orderKey: '2026-08-27:POS-260827-101',
      posOrderNumber: 'POS-260827-101',
      hasFinalPaidBill: true,
      latestPaidEvidenceId: 'paid-1'
    });
    expect(august27?.orderTimelines[0].exposures).toEqual([
      {
        normalizedProduct: 'Club Sandwich',
        department: 'COLD_KITCHEN',
        exposedQuantity: 1,
        paidQuantity: 1,
        summaryQuantity: 1,
        sourceEvidenceIds: ['station-1'],
        voidEvidenceIds: []
      },
      {
        normalizedProduct: 'Garden Salad',
        department: 'COLD_KITCHEN',
        exposedQuantity: 1,
        paidQuantity: 0,
        summaryQuantity: 0,
        sourceEvidenceIds: ['station-1'],
        voidEvidenceIds: ['void-1']
      }
    ]);
    expect(august27?.findings).toEqual([
      {
        id: '2026-08-27:POS-260827-101:Garden Salad:paid-reduction',
        kind: 'POST_ROUTING_REDUCTION',
        severity: 'HIGH',
        orderKey: '2026-08-27:POS-260827-101',
        posOrderNumber: 'POS-260827-101',
        normalizedProduct: 'Garden Salad',
        department: 'COLD_KITCHEN',
        eventTime: '2026-08-27T09:10:00.000Z',
        exposureQuantity: 1,
        posQuantity: 0,
        reductionQuantity: 1,
        estimatedValue: 0,
        evidenceIds: ['station-1', 'void-1', 'paid-1'],
        paymentMethod: 'Cash',
        cashier: 'Komang',
        posUser: 'Wayan'
      },
      {
        id: '2026-08-27:POS-260827-103:Hidden Cake:summary-reduction',
        kind: 'POST_ROUTING_REDUCTION',
        severity: 'HIGH',
        orderKey: '2026-08-27:POS-260827-103',
        posOrderNumber: 'POS-260827-103',
        normalizedProduct: 'Hidden Cake',
        department: 'HOT_KITCHEN',
        eventTime: '2026-08-27T09:30:00.000Z',
        exposureQuantity: 1,
        posQuantity: 0,
        reductionQuantity: 1,
        estimatedValue: 0,
        evidenceIds: ['station-2', 'summary-27-latest'],
        paymentMethod: undefined,
        cashier: undefined,
        posUser: undefined
      }
    ]);
  });

  it('keeps order-only operational dates selectable with a missing-summary state', async () => {
    const zipBuffer = await buildZip([
      makeCapture('summary-27', '2026-08-27T10:00:00.000Z', 'summary-27.raw', makeDailySummary('27/08/2026', [
        'x1 Latte / 35.000'
      ])),
      makeCapture('ticket-28', '2026-08-28T04:00:00.000Z', 'ticket-28.raw', [
        'BAR',
        'Order Number: POS-260828-1',
        'Date: 28/08/2026 12:00',
        'x1 Espresso'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'missing-summary.zip');

    expect(archive.auditModel.availableOperationalDates).toEqual(['2026-08-27', '2026-08-28']);
    expect(archive.auditModel.defaultOperationalDate).toBe('2026-08-28');

    const august28 = archive.auditModel.dailyAudits.find(audit => audit.operationalDate === '2026-08-28');
    expect(august28).toMatchObject({
      operationalDate: '2026-08-28',
      verifyingSummary: undefined,
      isProvisional: false,
      excludedAfterCutoffCount: 0,
      verdict: 'MISSING_SUMMARY',
      summaryComparison: {
        productionExposureQuantity: 1,
        summaryQuantity: 0,
        paidQuantity: 0,
        summaryRevenue: 0
      }
    });
    expect(august28?.orderTimelines).toHaveLength(1);
    expect(august28?.printCoverageGaps).toEqual([
      {
        id: '2026-08-28:POS-260828-1:Espresso:missing-final-paid-bill',
        orderKey: '2026-08-28:POS-260828-1',
        posOrderNumber: 'POS-260828-1',
        normalizedProduct: 'Espresso',
        exposureQuantity: 1,
        paidQuantity: 0,
        summaryQuantity: 0,
        unitPrice: 0,
        estimatedValue: 0,
        reason: 'MISSING_FINAL_PAID_BILL'
      }
    ]);
  });

  it('reconciles total sales revenue and attributes estimated values to coverage gaps', async () => {
    const zipBuffer = await buildZip([
      makeCapture('bar-1', '2026-08-27T09:00:00.000Z', 'bar-1.raw', [
        'BAR',
        'Order Number: POS-260827-300',
        'Date: 27/08/2026 16:00',
        'x2 Latte'
      ].join('\n')),
      makeCapture('paid-1', '2026-08-27T09:10:00.000Z', 'paid-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-300',
        'Date: 27/08/2026 16:10',
        'Latte',
        '2x 35.000 70.000',
        'Tender',
        'Cash',
        'Total 70.000'
      ].join('\n')),
      makeCapture('bar-2', '2026-08-27T09:20:00.000Z', 'bar-2.raw', [
        'BAR',
        'Order Number: POS-260827-301',
        'Date: 27/08/2026 16:20',
        'x1 Latte'
      ].join('\n')),
      makeCapture('summary-1', '2026-08-27T10:00:00.000Z', 'summary-1.raw', makeDailySummary('27/08/2026', [
        'x2 Latte / 70.000',
        'x1 Matcha / 40.000'
      ]))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'revenue-reconciliation.zip');
    const audit = archive.auditModel.dailyAudits.find(a => a.operationalDate === '2026-08-27');

    expect(audit?.summaryComparison).toMatchObject({
      productionExposureQuantity: 3,
      paidQuantity: 2,
      summaryQuantity: 3,
      productionExposureRevenue: 105000,
      paidRevenue: 70000,
      summaryRevenue: 110000,
      revenueGap: 40000
    });

    const missingPaidGap = audit?.printCoverageGaps.find(g => g.reason === 'MISSING_FINAL_PAID_BILL');
    expect(missingPaidGap).toMatchObject({
      posOrderNumber: 'POS-260827-301',
      normalizedProduct: 'Latte',
      exposureQuantity: 1,
      paidQuantity: 0,
      unitPrice: 35000,
      estimatedValue: 35000
    });

    const summaryExceedsGap = audit?.printCoverageGaps.find(g => g.reason === 'SUMMARY_EXCEEDS_CAPTURED_PRODUCTION');
    expect(summaryExceedsGap).toMatchObject({
      normalizedProduct: 'Matcha',
      exposureQuantity: 0,
      summaryQuantity: 1,
      unitPrice: 40000,
      estimatedValue: 40000
    });
  });

  it('selects the latest summary by capture time while preserving duplicate delivery history', async () => {
    const largerOlderSummary = makeDailySummary('27/08/2026', [
      'x1 Latte / 35.000',
      'x1 Club Sandwich / 100.000',
      'x1 Garden Salad / 65.000'
    ]);
    const latestSummary = makeDailySummary('27/08/2026', [
      'x2 Espresso / 70.000'
    ]);

    const zipBuffer = await buildZip([
      makeCapture('summary-latest-retry', '2026-08-27T10:00:05.000Z', 'summary-latest-retry.raw', latestSummary),
      makeCapture('summary-latest', '2026-08-27T10:00:00.000Z', 'summary-latest.raw', latestSummary),
      makeCapture('summary-larger-older', '2026-08-27T09:00:00.000Z', 'summary-larger-older.raw', largerOlderSummary)
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'latest-summary.zip');
    const august27 = archive.auditModel.dailyAudits.find(audit => audit.operationalDate === '2026-08-27');

    expect(august27?.verifyingSummary).toMatchObject({
      sourceCaptureId: 'summary-latest',
      capturedAt: '2026-08-27T10:00:00.000Z',
      totalItemsSold: 2,
      totalSalesRevenue: 70000,
      deliveryCount: 3,
      uniquePayloadCount: 2
    });
    expect(august27?.summaryComparison).toMatchObject({
      summaryQuantity: 2,
      summaryRevenue: 70000
    });
    expect(august27).toMatchObject({
      isProvisional: false,
      excludedAfterCutoffCount: 0
    });
    expect(august27?.verifyingSummary?.deliveries).toEqual([
      {
        sourceCaptureId: 'summary-larger-older',
        capturedAt: '2026-08-27T09:00:00.000Z',
        rawFileName: 'summary-larger-older.raw',
        sha256: `sha-${largerOlderSummary}`,
        isDuplicateDelivery: false,
        duplicateOfId: undefined
      },
      {
        sourceCaptureId: 'summary-latest',
        capturedAt: '2026-08-27T10:00:00.000Z',
        rawFileName: 'summary-latest.raw',
        sha256: `sha-${latestSummary}`,
        isDuplicateDelivery: false,
        duplicateOfId: undefined
      },
      {
        sourceCaptureId: 'summary-latest-retry',
        capturedAt: '2026-08-27T10:00:05.000Z',
        rawFileName: 'summary-latest-retry.raw',
        sha256: `sha-${latestSummary}`,
        isDuplicateDelivery: true,
        duplicateOfId: 'summary-latest'
      }
    ]);
  });

  it('breaks equal summary capture-time ties without depending on archive order', async () => {
    const summaryA = makeDailySummary('27/08/2026', [
      'x1 Americano / 35.000'
    ]);
    const summaryB = makeDailySummary('27/08/2026', [
      'x2 Americano / 70.000'
    ]);

    const buildArchive = async (captures: ReturnType<typeof makeCapture>[]) =>
      parseAuditZipArchive(await buildZip(captures), 'equal-time-summary.zip');

    const firstArchive = await buildArchive([
      makeCapture('summary-b', '2026-08-27T10:00:00.000Z', 'summary-b.raw', summaryB),
      makeCapture('summary-a', '2026-08-27T10:00:00.000Z', 'summary-a.raw', summaryA)
    ]);
    const secondArchive = await buildArchive([
      makeCapture('summary-a', '2026-08-27T10:00:00.000Z', 'summary-a.raw', summaryA),
      makeCapture('summary-b', '2026-08-27T10:00:00.000Z', 'summary-b.raw', summaryB)
    ]);

    const firstAudit = firstArchive.auditModel.dailyAudits.find(audit => audit.operationalDate === '2026-08-27');
    const secondAudit = secondArchive.auditModel.dailyAudits.find(audit => audit.operationalDate === '2026-08-27');

    expect(firstAudit?.verifyingSummary?.sourceCaptureId).toBe('summary-b');
    expect(secondAudit?.verifyingSummary?.sourceCaptureId).toBe('summary-b');
    expect(firstAudit?.summaryComparison.summaryQuantity).toBe(2);
    expect(secondAudit?.summaryComparison.summaryQuantity).toBe(2);
  });
});

describe('parseAuditZipArchive order evidence timelines', () => {
  it('reconstructs chronological timelines with wrapped products, support lines, and bill states', async () => {
    const zipBuffer = await buildZip([
      makeCapture('summary-27', '2026-08-27T10:30:00.000Z', 'summary-27.raw', makeDailySummary('27/08/2026', [
        'x3 Kunci Bagel / Bagel Original / 150.000',
        'x1 Cream Cheese / 10.000'
      ])),
      makeCapture('final-1', '2026-08-27T10:00:00.000Z', 'final-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:30',
        'Table: Table - 9',
        'Customer: Raka',
        'Sales Type: Normal',
        'User: Made',
        'Cashier: Komang',
        'Tender',
        'Qris Sinarmas',
        'Kunci Bagel',
        'Bagel Original',
        '3x 50.000 150.000',
        '+ Cream Cheese',
        '1x 10.000',
        'Total Item 4',
        'Total 160.000'
      ].join('\n')),
      makeCapture('base-1', '2026-08-27T09:00:00.000Z', 'base-1.raw', [
        'BAR',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:00',
        'User: Sari',
        'x2 Kunci Bagel',
        'Bagel Original',
        '[Extra toasted]',
        'Note: cut in half'
      ].join('\n')),
      makeCapture('captain-1', '2026-08-27T09:05:00.000Z', 'captain-1.raw', [
        'CAPTAIN ORDER',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:05',
        'x2 Kunci Bagel',
        'Bagel Original'
      ].join('\n')),
      makeCapture('prelim-1', '2026-08-27T09:20:00.000Z', 'prelim-1.raw', [
        'KUNCI KUPPI',
        'INI BUKAN BUKTI PEMBAYARAN',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:20',
        'Table: Table - 9',
        'Customer: Raka',
        'Sales Type: Normal',
        'User: Made',
        'Cashier: Komang',
        'Kunci Bagel',
        'Bagel Original',
        '3x 50.000 150.000',
        '+ Cream Cheese',
        '1x 10.000',
        'Total Item 4',
        'Total 160.000'
      ].join('\n')),
      makeCapture('add-1', '2026-08-27T09:10:00.000Z', 'add-1.raw', [
        'BAR',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:10',
        '+1 Kunci Bagel',
        'Bagel Original',
        'Note: late add'
      ].join('\n')),
      makeCapture('void-1', '2026-08-27T09:15:00.000Z', 'void-1.raw', [
        'BAR',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:15',
        '-1 Kunci Bagel',
        'Bagel Original',
        'VOID reason: wrong table'
      ].join('\n')),
      makeCapture('reprint-1', '2026-08-27T10:05:00.000Z', 'reprint-1.raw', [
        'KUNCI KUPPI',
        'REPRINT',
        'Order Number: POS-260827-210',
        'Date: 27/08/2026 17:35',
        'Table: Table - 9',
        'Customer: Raka',
        'Sales Type: Normal',
        'User: Made',
        'Cashier: Komang',
        'Tender',
        'Qris Sinarmas',
        'Kunci Bagel',
        'Bagel Original',
        '3x 50.000 150.000',
        '+ Cream Cheese',
        '1x 10.000',
        'Total Item 4',
        'Total 160.000'
      ].join('\n')),
      makeCapture('comp-1', '2026-08-27T09:25:00.000Z', 'comp-1.raw', [
        'KUNCI KUPPI',
        'COMPLIMENTARY',
        'Order Number: POS-260827-211',
        'Date: 27/08/2026 17:25',
        'Table: Table - 10',
        'Customer: Staff Meal',
        'Sales Type: Complimentary',
        'User: Wayan',
        'Cashier: Kadek',
        'Garden Salad',
        '1x 0',
        'Total Item 1',
        'Total 0'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'timeline.zip');
    const audit = archive.auditModel.dailyAudits.find(item => item.operationalDate === '2026-08-27');
    const order = audit?.orderTimelines.find(item => item.posOrderNumber === 'POS-260827-210');

    expect(order?.events.map(event => event.sourceCaptureId)).toEqual([
      'base-1',
      'captain-1',
      'add-1',
      'void-1',
      'prelim-1',
      'final-1',
      'reprint-1'
    ]);
    expect(order?.events.map(event => event.eventKind)).toEqual([
      'PRODUCTION_TICKET',
      'CAPTAIN_ORDER',
      'ADD_ITEM',
      'VOID_ITEM',
      'PRELIMINARY_BILL',
      'FINAL_PAID_BILL',
      'BILL_REPRINT'
    ]);
    expect(order?.events[0]).toMatchObject({
      normalizedDepartment: 'BAR',
      metadata: {
        sourceAddress: '10.0.0.12',
        printerIp: '10.0.0.42'
      },
      rawEvidence: {
        captureId: 'base-1',
        rawFileName: 'base-1.raw'
      }
    });
    expect(order?.events[0].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel Bagel Original',
        quantity: 2,
        quantityRole: 'BASE',
        sourceLine: 'x2 Kunci Bagel',
        supportingLines: ['Bagel Original', '[Extra toasted]', 'Note: cut in half']
      }
    ]);
    expect(order?.events[1].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel Bagel Original',
        quantity: 2,
        quantityRole: 'BASE',
        sourceLine: 'x2 Kunci Bagel',
        supportingLines: ['Bagel Original']
      }
    ]);
    expect(order?.events[2].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel Bagel Original',
        quantity: 1,
        quantityRole: 'ADDITION',
        sourceLine: '+1 Kunci Bagel',
        supportingLines: ['Bagel Original', 'Note: late add']
      }
    ]);
    expect(order?.events[3].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel Bagel Original',
        quantity: 1,
        quantityRole: 'VOID',
        sourceLine: '-1 Kunci Bagel',
        supportingLines: ['Bagel Original', 'VOID reason: wrong table']
      }
    ]);
    expect(order?.events[4]).toMatchObject({
      rawEvidence: {
        captureId: 'prelim-1',
        rawFileName: 'prelim-1.raw'
      },
      metadata: {
        customer: 'Raka',
        salesType: 'Normal',
        posUser: 'Made',
        cashier: 'Komang'
      }
    });
    expect(order?.events[4].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel Bagel Original',
        quantity: 3,
        quantityRole: 'BASE',
        variant: 'Bagel Original',
        unitPrice: 50000,
        totalPrice: 150000
      },
      {
        normalizedProduct: 'Cream Cheese',
        quantity: 1,
        quantityRole: 'BASE',
        variant: undefined,
        unitPrice: 10000,
        totalPrice: 10000,
        isModifier: true
      }
    ]);
    expect(order?.events[5]).toMatchObject({
      rawEvidence: {
        captureId: 'final-1',
        rawFileName: 'final-1.raw'
      },
      metadata: {
        customer: 'Raka',
        salesType: 'Normal',
        posUser: 'Made',
        cashier: 'Komang',
        paymentMethod: 'Qris Sinarmas'
      }
    });
    expect(order?.events[5].itemLines).toEqual([
      {
        normalizedProduct: 'Kunci Bagel Bagel Original',
        quantity: 3,
        quantityRole: 'BASE',
        variant: 'Bagel Original',
        unitPrice: 50000,
        totalPrice: 150000
      },
      {
        normalizedProduct: 'Cream Cheese',
        quantity: 1,
        quantityRole: 'BASE',
        variant: undefined,
        unitPrice: 10000,
        totalPrice: 10000,
        isModifier: true
      }
    ]);
    expect(order?.events[6]).toMatchObject({
      rawEvidence: {
        captureId: 'reprint-1',
        rawFileName: 'reprint-1.raw'
      },
      metadata: {
        customer: 'Raka',
        salesType: 'Normal',
        posUser: 'Made',
        cashier: 'Komang',
        paymentMethod: 'Qris Sinarmas'
      }
    });
    expect(order?.events[6].itemLines).toEqual(order?.events[5].itemLines);

    const complimentaryOrder = audit?.orderTimelines.find(item => item.posOrderNumber === 'POS-260827-211');
    expect(complimentaryOrder?.events).toHaveLength(1);
    expect(complimentaryOrder?.events[0]).toMatchObject({
      eventKind: 'COMPLIMENTARY_ACTIVITY',
      metadata: {
        customer: 'Staff Meal',
        salesType: 'Complimentary',
        posUser: 'Wayan',
        cashier: 'Kadek'
      }
    });
    expect(complimentaryOrder?.events[0].rawEvidence).toMatchObject({
      captureId: 'comp-1',
      rawFileName: 'comp-1.raw'
    });
    expect(complimentaryOrder?.events[0].itemLines).toEqual([
      {
        normalizedProduct: 'Garden Salad',
        quantity: 1,
        quantityRole: 'BASE',
        variant: undefined,
        unitPrice: 0,
        totalPrice: 0
      }
    ]);
  });
});

describe('parseAuditZipArchive hardened checkers', () => {
  it('prevents false product matching between non-boundary subwords', async () => {
    const zipBuffer = await buildZip([
      makeCapture('ticket-1', '2026-08-27T09:00:00.000Z', 'ticket-1.raw', [
        'BAR',
        'Order Number: POS-260827-401',
        'Date: 27/08/2026 16:00',
        'x1 Teapot'
      ].join('\n')),
      makeCapture('summary-1', '2026-08-27T10:00:00.000Z', 'summary-1.raw', makeDailySummary('27/08/2026', [
        'x1 Tea / 15.000'
      ]))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'word-boundary.zip');
    const audit = archive.auditModel.dailyAudits.find(a => a.operationalDate === '2026-08-27');

    const teaGap = audit?.printCoverageGaps.find(g => g.normalizedProduct === 'Tea');
    expect(teaGap).toMatchObject({
      exposureQuantity: 0,
      summaryQuantity: 1,
      reason: 'SUMMARY_EXCEEDS_CAPTURED_PRODUCTION'
    });
  });

  it('classifies TENDER followed by Pending as NON_AUDIT_EVIDENCE', async () => {
    const zipBuffer = await buildZip([
      makeCapture('pending-1', '2026-08-27T09:00:00.000Z', 'pending-1.raw', [
        'KUNCI KUPPI',
        'Order Number: POS-260827-402',
        'Date: 27/08/2026 16:00',
        'Latte',
        '1x 35.000 35.000',
        'Tender',
        'Pending',
        'Total 35.000'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'tender-pending.zip');
    expect(archive.normalizedEvidence[0].eventKind).toBe('NON_AUDIT_EVIDENCE');
  });

  it('normalizes Order Number values without POS- prefix', async () => {
    const zipBuffer = await buildZip([
      makeCapture('bare-order-1', '2026-08-27T09:00:00.000Z', 'bare-order-1.raw', [
        'BAR',
        'Order Number: 260827-403',
        'Date: 27/08/2026 16:00',
        'x1 Espresso'
      ].join('\n'))
    ]);

    const archive = await parseAuditZipArchive(zipBuffer, 'bare-order.zip');
    expect(archive.normalizedEvidence[0].posOrderNumber).toBe('POS-260827-403');
    expect(archive.synthesizedCaptures[0].parsedReceipt.orderNumber).toBe('POS-260827-403');
  });
});
