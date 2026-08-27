import React, { useState, useRef } from 'react';
import { UploadCloud, FileArchive, RefreshCw, Sparkles, CloudDownload } from 'lucide-react';
import { parseAuditZipArchive } from '../utils/zipParser';
import { fetchS3BackupZip } from '../utils/s3Grabber';
import type { ParsedAuditArchive } from '../types/audit';

interface FileUploadProps {
  onArchiveParsed: (archive: ParsedAuditArchive) => void;
  onLoadSampleData: () => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onArchiveParsed,
  onLoadSampleData,
  isLoading
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [s3InputUrl, setS3InputUrl] = useState('');
  const [isFetchingS3, setIsFetchingS3] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.name.endsWith('.zip')) {
      setErrorMessage('Please select a valid Print Guard backup .zip archive.');
      return;
    }

    setErrorMessage(null);
    try {
      const parsed = await parseAuditZipArchive(file, file.name);
      onArchiveParsed(parsed);
    } catch (err: any) {
      console.error('Failed to parse ZIP archive', err);
      setErrorMessage(`Failed to extract .zip archive: ${err.message || 'Invalid format'}`);
    }
  };

  const handleS3Fetch = async () => {
    if (!s3InputUrl.trim()) return;
    setIsFetchingS3(true);
    setErrorMessage(null);
    try {
      const archive = await fetchS3BackupZip(s3InputUrl);
      setIsFetchingS3(false);
      onArchiveParsed(archive);
    } catch (err: any) {
      setIsFetchingS3(false);
      setErrorMessage(err.message || 'Failed to download backup ZIP from S3 URL');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
      
      {/* Primary Computer File Drag & Drop Upload */}
      <div className="glass-panel" style={{ padding: '36px 24px', textAlign: 'center' }}>
        
        <div 
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileChange(e.dataTransfer.files);
          }}
          style={{
            border: `2px dashed ${isDragging ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'}`,
            borderRadius: '16px',
            padding: '40px 24px',
            background: isDragging ? 'rgba(56, 189, 248, 0.05)' : 'rgba(15, 23, 42, 0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            accept=".zip"
            style={{ display: 'none' }}
            onChange={(e) => handleFileChange(e.target.files)}
          />

          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: '#38bdf8'
          }}>
            {isLoading ? <RefreshCw className="animate-spin" size={32} /> : <UploadCloud size={34} />}
          </div>

          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px', color: '#fff' }}>
            Upload Backup ZIP Archive
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Select or drag & drop any Print Guard <code style={{ color: '#38bdf8' }}>backup_*.zip</code> archive from your computer
          </p>

          <button className="btn btn-primary">
            <UploadCloud size={16} /> Choose File (.ZIP)
          </button>
        </div>

        {/* Quick S3 Paste Option */}
        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', textAlign: 'left' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', display: 'block', marginBottom: '8px' }}>
            ☁️ Or Paste S3 Cloud Backup Object URL (Way 1):
          </label>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={s3InputUrl}
              onChange={(e) => setS3InputUrl(e.target.value)}
              placeholder="https://s3.amazonaws.com/my-bucket/backups/backup_20260826_205024.zip"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#fff',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-mono)'
              }}
            />
            <button 
              onClick={handleS3Fetch}
              disabled={isFetchingS3 || !s3InputUrl.trim()}
              className="btn btn-emerald btn-sm"
            >
              {isFetchingS3 ? <RefreshCw className="animate-spin" size={14} /> : <CloudDownload size={14} />}
              Fetch from S3
            </button>
          </div>
        </div>

        {errorMessage && (
          <div style={{ marginTop: '16px', color: '#fb7185', fontSize: '0.85rem', background: 'rgba(244, 63, 94, 0.1)', padding: '10px', borderRadius: '8px' }}>
            {errorMessage}
          </div>
        )}

      </div>

      {/* Preset Sample Trigger Card */}
      <div style={{
        padding: '16px 20px',
        background: 'rgba(16, 185, 129, 0.06)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
          <Sparkles size={20} color="#34d399" />
          <div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', display: 'block' }}>
              Want to test instantly with sample data?
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Load preset dataset: <code style={{ color: '#38bdf8' }}>backup_20260826_205024.zip</code> (100 receipts, 203 audit events)
            </span>
          </div>
        </div>

        <button 
          onClick={onLoadSampleData}
          disabled={isLoading}
          className="btn btn-emerald btn-sm"
        >
          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <FileArchive size={14} />}
          Load Preset Sample Backup
        </button>
      </div>

    </div>
  );
};
