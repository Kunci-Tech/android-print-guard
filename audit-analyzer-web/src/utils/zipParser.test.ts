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
