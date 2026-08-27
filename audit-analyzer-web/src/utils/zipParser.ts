import JSZip from 'jszip';
import type { PrintJobCapture, AuditEvent, ParsedAuditArchive } from '../types/audit';
import { parseESCPOSBytes } from './escposParser';
import { synthesizeCaptures } from './dataSynthesizer';
import { groupCapturesByTransaction } from './receiptItemParser';
import { buildNormalizedEvidence } from './normalizedEvidence';

export async function parseAuditZipArchive(fileOrBuffer: File | ArrayBuffer, fileName: string): Promise<ParsedAuditArchive> {
  const zip = await JSZip.loadAsync(fileOrBuffer);
  
  const rawCaptures: PrintJobCapture[] = [];
  const rawBytesMap = new Map<string, Uint8Array>();
  const parsedMap = new Map<string, ReturnType<typeof parseESCPOSBytes>>();
  let auditEvents: AuditEvent[] = [];

  // 1. First pass: extract json files and audit_events.json
  const jsonFileNames = Object.keys(zip.files).filter(name => name.endsWith('.json'));

  for (const name of jsonFileNames) {
    const file = zip.files[name];
    if (!file || file.dir) continue;

    const text = await file.async('string');
    
    if (name.endsWith('audit_events.json')) {
      try {
        const events = JSON.parse(text);
        if (Array.isArray(events)) {
          auditEvents = events;
        }
      } catch (e) {
        console.error('Error parsing audit_events.json', e);
      }
    } else {
      try {
        const meta = JSON.parse(text) as PrintJobCapture;
        if (meta && meta.id && meta.raw_filename) {
          rawCaptures.push(meta);
        }
      } catch (e) {
        console.error(`Error parsing metadata file ${name}`, e);
      }
    }
  }

  // 2. Second pass: extract .raw binary payloads
  const rawFileNames = Object.keys(zip.files).filter(name => name.endsWith('.raw'));
  for (const name of rawFileNames) {
    const file = zip.files[name];
    if (!file || file.dir) continue;

    const baseName = name.split('/').pop() || name;
    const bytes = await file.async('uint8array');
    rawBytesMap.set(baseName, bytes);

    const parsed = parseESCPOSBytes(bytes);
    parsedMap.set(baseName, parsed);
  }

  // 3. Synthesize & Deduplicate Data
  const { synthesizedCaptures, metrics } = synthesizeCaptures(rawCaptures, rawBytesMap, parsedMap);
  const normalizedEvidence = buildNormalizedEvidence(synthesizedCaptures);

  // 4. Group by POS Order ID, Parse Itemized Sales & Compute Reconciliation Report
  const { transactionGroups, itemSalesSummary, reconciliation } = groupCapturesByTransaction(synthesizedCaptures);

  return {
    fileName,
    extractedAt: new Date().toISOString(),
    rawCaptures,
    rawBytesMap,
    auditEvents,
    synthesizedCaptures,
    normalizedEvidence,
    metrics,
    transactionGroups,
    itemSalesSummary,
    reconciliation
  };
}
