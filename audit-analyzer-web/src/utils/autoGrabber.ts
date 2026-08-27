import { parseAuditZipArchive } from './zipParser';
import type { ParsedAuditArchive } from '../types/audit';

export interface AutoGrabConfig {
  enabled: boolean;
  proxyIp: string;
  proxyPort: number;
  intervalSeconds: number;
  lastGrabbedAt?: string;
  status: 'IDLE' | 'CONNECTING' | 'SUCCESS' | 'ERROR';
  errorMessage?: string;
}

export async function testConnection(ip: string, port: number): Promise<{ success: boolean; message: string; telemetry?: any }> {
  const url = `http://${ip}:${port}/api/status`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `Connected to Kunci Print Guard proxy (${data.total_captures || 0} captures saved)`,
        telemetry: data
      };
    } else {
      return {
        success: false,
        message: `Print Guard responded with HTTP status ${res.status}`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to connect to http://${ip}:${port}/api/status (${err.message || 'Network Timeout/CORS'})`
    };
  }
}

export async function fetchLiveBackupZip(ip: string, port: number): Promise<ParsedAuditArchive> {
  const url = `http://${ip}:${port}/api/export-zip`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to grab ZIP export from ${url}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return await parseAuditZipArchive(arrayBuffer, `live_autograb_${timestamp}.zip`);
}
