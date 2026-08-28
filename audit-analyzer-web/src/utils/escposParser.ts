import type { ESCPOSParsedReceipt } from '../types/audit';

export function parseESCPOSBytes(rawBytes: Uint8Array): ESCPOSParsedReceipt {
  const lines: string[] = [];
  let currentLineBytes: number[] = [];

  for (let i = 0; i < rawBytes.length; i++) {
    const byte = rawBytes[i];
    if (byte === 0x0a) { // LineFeed '\n'
      const lineStr = cleanLine(currentLineBytes);
      if (lineStr.trim().length > 0) {
        lines.push(lineStr);
      }
      currentLineBytes = [];
    } else if (byte === 0x0d) {
      // Ignore carriage return
    } else {
      currentLineBytes.push(byte);
    }
  }

  // Flush remaining line
  if (currentLineBytes.length > 0) {
    const lastLineStr = cleanLine(currentLineBytes);
    if (lastLineStr.trim().length > 0) {
      lines.push(lastLineStr);
    }
  }

  const asciiText = lines.join('\n');

  const fullUpper = asciiText.toUpperCase();
  const department = detectExplicitDepartment(lines);

  // Extract Order / Table Number if available
  let tableNumber: string | undefined = undefined;
  let orderNumber: string | undefined = undefined;

  for (const line of lines) {
    const tableMatch = line.match(/(?:Meja|Table|Tbl)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
    if (tableMatch) {
      tableNumber = tableMatch[1];
    }
    const orderMatch = line.match(/^Order\s+Number\s*:\s*([A-Za-z0-9-]+)\b/i);
    if (orderMatch && !orderNumber) {
      const raw = orderMatch[1].trim();
      orderNumber = raw.startsWith('POS-') ? raw : `POS-${raw}`;
    }
  }

  // Test Print Detection
  const testKeywords = ['TEST', 'TESTING', 'PRINTER TEST', 'CEK PRINTER', 'COBA PRINT', 'PING'];
  const isTestPrint = testKeywords.some(kw => fullUpper.includes(kw)) || (lines.length <= 2 && rawBytes.length < 300);

  return {
    rawBytes,
    asciiText,
    lines,
    department,
    tableNumber,
    orderNumber,
    isTestPrint
  };
}

function detectExplicitDepartment(lines: string[]): string | undefined {
  for (const line of lines) {
    const normalized = line.trim().replace(/\s+/g, ' ').toUpperCase();

    if (/\bHOT\s+KITCHEN\b/i.test(normalized)) {
      return 'HOT KITCHEN';
    }
    if (/\bCOLD\s+KITCHEN\b/i.test(normalized)) {
      return 'COLD KITCHEN';
    }
    if (/\bKITCHEN\b/i.test(normalized)) {
      return 'KITCHEN';
    }
    if (/\bBAR\b/i.test(normalized)) {
      return 'BAR';
    }
    if (/\bCAPTAIN\s+ORDER\b/i.test(normalized)) {
      return 'CAPTAIN ORDER';
    }
    if (/\bCHECKER\b/i.test(normalized)) {
      return 'CHECKER';
    }
    if (normalized.includes('RINGKASAN PENJUALAN') || normalized.includes('DAILY SALES SUMMARY')) {
      return 'DAILY SALES SUMMARY';
    }
    if (normalized.includes('KUNCI KUPPI') || normalized.includes('BUKTI PEMBAYARAN')) {
      return 'MAIN POS BILL';
    }
  }

  return undefined;
}

function cleanLine(bytes: number[]): string {
  let result = '';
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) {
      result += String.fromCharCode(b);
    } else if (b === 0x09) {
      result += '    ';
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

export function generateHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  const chunkSize = 16;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const offset = i.toString(16).padStart(4, '0').toUpperCase();
    const chunk = bytes.slice(i, i + chunkSize);
    
    const hexParts: string[] = [];
    let asciiParts = '';

    for (let j = 0; j < chunkSize; j++) {
      if (j < chunk.length) {
        const b = chunk[j];
        hexParts.push(b.toString(16).padStart(2, '0').toUpperCase());
        asciiParts += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
      }
    }

    lines.push(`${offset}: ${hexParts.join(' ')} | ${asciiParts}`);
  }

  return lines.join('\n');
}
