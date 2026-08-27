import { parseAuditZipArchive } from './zipParser';
import type { ParsedAuditArchive } from '../types/audit';

export interface S3Config {
  endpoint: string;          // e.g. "https://s3.amazonaws.com" or "https://<account-id>.r2.cloudflarestorage.com"
  bucketName: string;        // e.g. "kunci-print-guard"
  folderPrefix: string;      // e.g. "backups"
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
}

export async function fetchS3BackupZip(fullUrlOrObjectKey: string): Promise<ParsedAuditArchive> {
  let targetUrl = fullUrlOrObjectKey.trim();
  
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    throw new Error('Please enter a valid HTTP/HTTPS S3 object URL (e.g., https://bucket.s3.amazonaws.com/backups/backup_20260826_205024.zip)');
  }

  const res = await fetch(targetUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to download backup ZIP from S3 URL (${targetUrl})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const fileName = targetUrl.split('/').pop() || 's3_backup.zip';
  return await parseAuditZipArchive(arrayBuffer, fileName);
}
