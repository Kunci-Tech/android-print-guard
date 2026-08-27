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
      makeCapture('summary-1', '2026-08-27T09:00:00.000Z', 'summary-1.raw', [
        'RINGKASAN PENJUALAN',
        '27/08/2026 - 27/08/2026',
        'x2 Latte / 70.000'
      ].join('\n'))
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
      makeCapture('summary-25', '2026-08-25T10:00:00.000Z', 'summary-25.raw', [
        'RINGKASAN PENJUALAN',
        '25/08/2026 - 25/08/2026',
        'x9 Old Day / 900.000'
      ].join('\n')),
      makeCapture('summary-27-early', '2026-08-27T08:00:00.000Z', 'summary-27-early.raw', [
        'RINGKASAN PENJUALAN',
        '27/08/2026 - 27/08/2026',
        'x1 Club Sandwich / 100.000'
      ].join('\n')),
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
      makeCapture('summary-27-latest', '2026-08-27T10:00:00.000Z', 'summary-27-latest.raw', [
        'RINGKASAN PENJUALAN',
        '27/08/2026 - 27/08/2026',
        'x1 Club Sandwich / 100.000'
      ].join('\n')),
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
        capturedAt: '2026-08-27T10:00:00.000Z'
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
});
