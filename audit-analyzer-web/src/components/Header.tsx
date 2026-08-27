import React, { useRef } from 'react';
import { ShieldCheck, Cpu, HardDrive, RefreshCw, FileArchive, Zap, ShoppingBag, Layers, UploadCloud, ShieldAlert } from 'lucide-react';
import type { ParsedAuditArchive } from '../types/audit';

interface HeaderProps {
  activeTab: 'reconcile' | 'items' | 'orders' | 'analytics' | 'receipts' | 'audit' | 'autograb' | 'upload';
  setActiveTab: (tab: 'reconcile' | 'items' | 'orders' | 'analytics' | 'receipts' | 'audit' | 'autograb' | 'upload') => void;
  currentArchive: ParsedAuditArchive | null;
  onFileUpload: (files: FileList | null) => void;
  onLoadSampleData: () => void;
  isLoading: boolean;
  autoGrabStatus: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentArchive,
  onFileUpload,
  onLoadSampleData,
  isLoading,
  autoGrabStatus
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasThreat = currentArchive?.reconciliation?.hasThreatAlert ?? false;

  return (
    <header className="glass-panel" style={{ borderRadius: '0 0 16px 16px', padding: '16px 24px', marginBottom: '24px' }}>
      
      {/* Hidden File Input for Header Upload Button */}
      <input 
        type="file" 
        ref={fileInputRef}
        accept=".zip"
        style={{ display: 'none' }}
        onChange={(e) => onFileUpload(e.target.files)}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Logo & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
            padding: '10px',
            borderRadius: '12px',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <ShieldCheck size={26} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Print Guard Audit & Synthesizer
              </h1>
              <span className="badge badge-cyan">v1.3 POS Reconciliation Engine</span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Daily Sales Summary vs. Individual Bills Reconciliation & Threat Detection
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Main Upload File Button */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary btn-sm"
          >
            <UploadCloud size={14} />
            <span>Upload Backup (.ZIP)</span>
          </button>

          {/* Preset Sample Data Loader */}
          <button 
            onClick={onLoadSampleData}
            disabled={isLoading}
            className="btn btn-outline btn-sm"
            title="Load built-in backup_20260826_205024.zip"
          >
            {isLoading ? <RefreshCw className="animate-spin" size={14} /> : <FileArchive size={14} color="#38bdf8" />}
            <span>Load Preset Sample</span>
          </button>

          {/* Active File indicator */}
          {currentArchive && (
            <div className="badge badge-emerald" style={{ padding: '6px 12px' }}>
              <HardDrive size={13} />
              <span>{currentArchive.fileName}</span>
            </div>
          )}

          {/* Auto-Grab Status badge */}
          <div 
            onClick={() => setActiveTab('autograb')} 
            style={{ cursor: 'pointer' }}
            className={`badge ${autoGrabStatus === 'SUCCESS' ? 'badge-emerald' : autoGrabStatus === 'CONNECTING' ? 'badge-amber' : 'badge-cyan'}`}
          >
            <Zap size={13} />
            <span>Auto-Grab Sync</span>
          </div>

        </div>
      </div>

      {/* Nav Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', overflowX: 'auto' }}>
        <button
          className={`btn btn-sm ${activeTab === 'reconcile' ? 'btn-primary' : hasThreat ? 'btn-rose' : 'btn-outline'}`}
          onClick={() => setActiveTab('reconcile')}
        >
          <ShieldAlert size={14} />
          🚨 Reconciliation & Threats {hasThreat ? '(Gap Alert)' : ''}
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'items' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('items')}
        >
          <ShoppingBag size={14} />
          Itemized Product Sales ({currentArchive ? currentArchive.itemSalesSummary.length : 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'orders' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('orders')}
        >
          <Layers size={14} />
          POS Order Directory ({currentArchive ? currentArchive.transactionGroups.length : 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'analytics' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('analytics')}
        >
          <Cpu size={14} />
          Overview Insights
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'receipts' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('receipts')}
        >
          <FileArchive size={14} />
          Receipt Inspector ({currentArchive ? currentArchive.synthesizedCaptures.length : 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'audit' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('audit')}
        >
          <ShieldCheck size={14} />
          Security Audit Logs ({currentArchive ? currentArchive.auditEvents.length : 0})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'upload' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('upload')}
        >
          <UploadCloud size={14} />
          Upload / Load File
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'autograb' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('autograb')}
        >
          <Zap size={14} />
          Auto-Grab (S3 / POS)
        </button>
      </div>
    </header>
  );
};
