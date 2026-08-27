import React, { useRef } from 'react';
import { CalendarDays, FileArchive, HardDrive, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react';
import type { ParsedAuditArchive } from '../types/audit';

interface HeaderProps {
  currentArchive: ParsedAuditArchive | null;
  onFileUpload: (files: FileList | null) => void;
  onLoadSampleData: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentArchive,
  onFileUpload,
  onLoadSampleData,
  isLoading
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="audit-header">
      <input
        type="file"
        ref={fileInputRef}
        accept=".zip"
        style={{ display: 'none' }}
        onChange={event => onFileUpload(event.target.files)}
      />

      <div className="audit-brand">
        <div className="audit-brand-mark">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1>Print Guard Daily Audit</h1>
          <p>Post-routing production evidence compared with POS paid state.</p>
        </div>
      </div>

      <div className="audit-header-actions">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-primary btn-sm"
          disabled={isLoading}
        >
          <UploadCloud size={14} />
          <span>Upload Backup</span>
        </button>
        <button
          onClick={onLoadSampleData}
          disabled={isLoading}
          className="btn btn-outline btn-sm"
        >
          {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <FileArchive size={14} />}
          <span>Load Sample</span>
        </button>
        {currentArchive && (
          <>
            <span className="badge badge-emerald">
              <HardDrive size={13} />
              {currentArchive.fileName}
            </span>
            {currentArchive.auditModel.defaultOperationalDate && (
              <span className="badge badge-cyan">
                <CalendarDays size={13} />
                {currentArchive.auditModel.defaultOperationalDate}
              </span>
            )}
          </>
        )}
      </div>
    </header>
  );
};
