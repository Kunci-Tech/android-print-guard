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

  // Detect Department Header
  let department: string | undefined = undefined;
  const fullUpper = asciiText.toUpperCase();
  if (fullUpper.includes('BAR')) {
    department = 'BAR';
  } else if (fullUpper.includes('HOT KITCHEN')) {
    department = 'HOT KITCHEN';
  } else if (fullUpper.includes('COLD KITCHEN')) {
    department = 'COLD KITCHEN';
  } else if (fullUpper.includes('CAPTAIN ORDER')) {
    department = 'CAPTAIN ORDER';
  } else if (fullUpper.includes('RINGKASAN PENJUALAN')) {
    department = 'DAILY SALES SUMMARY';
  } else if (fullUpper.includes('KUNCI KUPPI') || fullUpper.includes('KK')) {
    department = 'MAIN POS BILL';
  }

  // Extract Order / Table Number if available
  let tableNumber: string | undefined = undefined;
  let orderNumber: string | undefined = undefined;

  for (const line of lines) {
    const tableMatch = line.match(/(?:Meja|Table|Tbl)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
    if (tableMatch) {
      tableNumber = tableMatch[1];
    }
    const orderMatch = line.match(/(?:Order|Nota|Bill|No)\s*[:#]?\s*([A-Za-z0-9-]+)/i);
    if (orderMatch) {
      orderNumber = orderMatch[1];
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
