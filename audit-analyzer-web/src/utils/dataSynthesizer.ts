import type { PrintJobCapture, ESCPOSParsedReceipt, SynthesizedCapture, SynthesisMetrics, ReceiptCategory } from '../types/audit';

export function synthesizeCaptures(
  rawCaptures: PrintJobCapture[],
  rawBytesMap: Map<string, Uint8Array>,
  parsedMap: Map<string, ESCPOSParsedReceipt>
): { synthesizedCaptures: SynthesizedCapture[]; metrics: SynthesisMetrics } {
  // Sort captures chronologically
  const sorted = [...rawCaptures].sort((a, b) => 
    new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
  );

  const synthesizedCaptures: SynthesizedCapture[] = [];
  
  // Trackers for duplicates
  const seenShaHashes = new Map<string, { id: string; timestamp: number }>();
  const recentTextPayLoads: { id: string; timestamp: number; text: string; bytes: number }[] = [];

  let duplicateRetryCount = 0;
  let duplicateWastedBytes = 0;
  let testPrintCount = 0;

  const categoryCounts: Record<ReceiptCategory, number> = {
    CUSTOMER_BILL: 0,
    KITCHEN_TICKET: 0,
    DAILY_SUMMARY: 0,
    TEST_PRINT: 0,
    UNKNOWN: 0
  };

  const posSourceBreakdown: Record<string, { total: number; valid: number; retries: number }> = {};
  const hourlyVolume: Record<string, { raw: number; valid: number }> = {};

  for (const capture of sorted) {
    const parsed = parsedMap.get(capture.raw_filename) || {
      rawBytes: rawBytesMap.get(capture.raw_filename) || new Uint8Array(),
      asciiText: '',
      lines: [],
      isTestPrint: false
    };

    const currentTs = new Date(capture.captured_at).getTime();
    let isDuplicateRetry = false;
    let duplicateOfId: string | undefined = undefined;
    let retryTimeDiffSeconds: number | undefined = undefined;

    // 1. Exact SHA-256 duplicate check
    if (seenShaHashes.has(capture.sha256)) {
      const prev = seenShaHashes.get(capture.sha256)!;
      const diffSec = (currentTs - prev.timestamp) / 1000;
      if (diffSec <= 120) {
        isDuplicateRetry = true;
        duplicateOfId = prev.id;
        retryTimeDiffSeconds = diffSec;
      }
    } else {
      seenShaHashes.set(capture.sha256, { id: capture.id, timestamp: currentTs });
    }

    // 2. Text similarity / network retry check within 60s sliding window
    if (!isDuplicateRetry && parsed.asciiText.trim().length > 10) {
      for (const prev of recentTextPayLoads) {
        const timeDiffSec = (currentTs - prev.timestamp) / 1000;
        if (timeDiffSec <= 60 && prev.text === parsed.asciiText && prev.bytes === capture.bytes) {
          isDuplicateRetry = true;
          duplicateOfId = prev.id;
          retryTimeDiffSeconds = timeDiffSec;
          break;
        }
      }
      recentTextPayLoads.push({
        id: capture.id,
        timestamp: currentTs,
        text: parsed.asciiText,
        bytes: capture.bytes
      });
      if (recentTextPayLoads.length > 50) {
        recentTextPayLoads.shift();
      }
    }

    // 3. Category classification
    let category: ReceiptCategory = 'UNKNOWN';
    if (parsed.isTestPrint) {
      category = 'TEST_PRINT';
      testPrintCount++;
    } else if (parsed.department === 'DAILY SALES SUMMARY' || parsed.asciiText.includes('RINGKASAN PENJUALAN')) {
      category = 'DAILY_SUMMARY';
    } else if (parsed.department === 'MAIN POS BILL' || parsed.asciiText.includes('KK') || parsed.asciiText.includes('Phone:')) {
      category = 'CUSTOMER_BILL';
    } else if (parsed.department || parsed.asciiText.includes('BAR') || parsed.asciiText.includes('KITCHEN') || parsed.asciiText.includes('CAPTAIN ORDER')) {
      category = 'KITCHEN_TICKET';
    } else {
      category = 'CUSTOMER_BILL';
    }

    categoryCounts[category]++;

    if (isDuplicateRetry) {
      duplicateRetryCount++;
      duplicateWastedBytes += capture.bytes;
    }

    const isSynthesizedValid = !isDuplicateRetry && category !== 'TEST_PRINT';

    const posIp = capture.source_address || '127.0.0.1';
    if (!posSourceBreakdown[posIp]) {
      posSourceBreakdown[posIp] = { total: 0, valid: 0, retries: 0 };
    }
    posSourceBreakdown[posIp].total++;
    if (isSynthesizedValid) {
      posSourceBreakdown[posIp].valid++;
    }
    if (isDuplicateRetry) {
      posSourceBreakdown[posIp].retries++;
    }

    const hourKey = new Date(capture.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const hourGroup = hourKey.substring(0, 2) + ':00';
    if (!hourlyVolume[hourGroup]) {
      hourlyVolume[hourGroup] = { raw: 0, valid: 0 };
    }
    hourlyVolume[hourGroup].raw++;
    if (isSynthesizedValid) {
      hourlyVolume[hourGroup].valid++;
    }

    synthesizedCaptures.push({
      ...capture,
      parsedReceipt: parsed,
      category,
      isDuplicateRetry,
      duplicateOfId,
      retryTimeDiffSeconds,
      isSynthesizedValid
    });
  }

  const rawTotalCaptures = sorted.length;
  const rawTotalBytes = sorted.reduce((sum, c) => sum + c.bytes, 0);
  const synthesizedValidCaptures = synthesizedCaptures.filter(c => c.isSynthesizedValid).length;
  const synthesizedValidBytes = synthesizedCaptures.filter(c => c.isSynthesizedValid).reduce((sum, c) => sum + c.bytes, 0);

  return {
    synthesizedCaptures,
    metrics: {
      rawTotalCaptures,
      rawTotalBytes,
      synthesizedValidCaptures,
      synthesizedValidBytes,
      duplicateRetryCount,
      duplicateWastedBytes,
      testPrintCount,
      categoryCounts,
      posSourceBreakdown,
      hourlyVolume
    }
  };
}
