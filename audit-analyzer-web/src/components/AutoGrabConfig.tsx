import React, { useState } from 'react';
import { Zap, Wifi, RefreshCw, CheckCircle, AlertTriangle, CloudDownload } from 'lucide-react';
import { testConnection, fetchLiveBackupZip } from '../utils/autoGrabber';
import { fetchS3BackupZip } from '../utils/s3Grabber';
import type { ParsedAuditArchive } from '../types/audit';

interface AutoGrabConfigProps {
  onArchiveGrabbed: (archive: ParsedAuditArchive) => void;
  autoGrabStatus: string;
  setAutoGrabStatus: (status: string) => void;
}

export const AutoGrabConfig: React.FC<AutoGrabConfigProps> = ({
  onArchiveGrabbed,
  setAutoGrabStatus
}) => {
  const [activeGrabMode, setActiveGrabMode] = useState<'s3' | 'proxy'>('s3');

  // Mode 1: Proxy HTTP
  const [ip, setIp] = useState('192.168.8.100');
  const [port, setPort] = useState(9101);
  const [interval, setIntervalVal] = useState(30);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; telemetry?: any } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isFetchingProxy, setIsFetchingProxy] = useState(false);

  // Mode 2: S3 Cloud
  const [s3Url, setS3Url] = useState('');
  const [isFetchingS3, setIsFetchingS3] = useState(false);

  const handleTestProxyConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testConnection(ip, port);
    setIsTesting(false);
    setTestResult(res);
    if (res.success) {
      setAutoGrabStatus('SUCCESS');
    } else {
      setAutoGrabStatus('ERROR');
    }
  };

  const handleFetchProxyNow = async () => {
    setIsFetchingProxy(true);
    try {
      const archive = await fetchLiveBackupZip(ip, port);
      setIsFetchingProxy(false);
      setAutoGrabStatus('SUCCESS');
      onArchiveGrabbed(archive);
    } catch (err: any) {
      setIsFetchingProxy(false);
      setAutoGrabStatus('ERROR');
      setTestResult({
        success: false,
        message: err.message || 'Failed to auto-grab backup ZIP archive from POS Proxy'
      });
    }
  };

  const handleFetchS3Now = async () => {
    if (!s3Url.trim()) {
      setTestResult({
        success: false,
        message: 'Please enter a valid HTTP/HTTPS S3 Backup Object URL'
      });
      return;
    }

    setIsFetchingS3(true);
    setTestResult(null);
    try {
      const archive = await fetchS3BackupZip(s3Url);
      setIsFetchingS3(false);
      setAutoGrabStatus('SUCCESS');
      onArchiveGrabbed(archive);
    } catch (err: any) {
      setIsFetchingS3(false);
      setAutoGrabStatus('ERROR');
      setTestResult({
        success: false,
        message: err.message || 'Failed to download backup ZIP from S3 URL'
      });
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '10px', borderRadius: '12px', color: '#38bdf8' }}>
          <Zap size={22} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>2-Way Auto-Grab & Cloud Synchronization</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Automatically fetch and synthesize backup archives via <strong>S3 Cloud Storage</strong> or direct <strong>POS Proxy Wi-Fi Sync</strong>
          </p>
        </div>
      </div>

      {/* Grab Mode Selection Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <button
          className={`btn btn-sm ${activeGrabMode === 's3' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveGrabMode('s3')}
        >
          <CloudDownload size={15} />
          Way 1: Cloud S3 Storage Auto-Grab
        </button>

        <button
          className={`btn btn-sm ${activeGrabMode === 'proxy' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveGrabMode('proxy')}
        >
          <Wifi size={15} />
          Way 2: Direct POS Proxy Wi-Fi Sync (:9101)
        </button>
      </div>

      {/* MODE 1: S3 CLOUD GRABBER */}
      {activeGrabMode === 's3' && (
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <CloudDownload color="#38bdf8" size={18} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
              Cloud S3 Backup Storage Grabber
            </h3>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Enter your S3 Bucket backup ZIP URL (AWS S3, MinIO, Cloudflare R2, or DigitalOcean Spaces) to fetch and parse instantly:
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
              S3 Backup Object / Download URL
            </label>
            <input 
              type="text" 
              value={s3Url}
              onChange={(e) => setS3Url(e.target.value)}
              placeholder="e.g. https://my-bucket.s3.amazonaws.com/backups/backup_20260826_205024.zip"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#fff',
                fontSize: '0.88rem',
                fontFamily: 'var(--font-mono)'
              }}
            />
          </div>

          <button 
            onClick={handleFetchS3Now}
            disabled={isFetchingS3}
            className="btn btn-emerald btn-sm"
          >
            {isFetchingS3 ? <RefreshCw className="animate-spin" size={14} /> : <CloudDownload size={14} />}
            Fetch & Synthesize S3 Backup ZIP
          </button>
        </div>
      )}

      {/* MODE 2: DIRECT POS PROXY SYNC */}
      {activeGrabMode === 'proxy' && (
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Wifi color="#34d399" size={18} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
              Direct POS Proxy HTTP Server Sync
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Android Proxy IP Address
              </label>
              <input 
                type="text" 
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="e.g. 192.168.8.100"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                HTTP Web Server Port
              </label>
              <input 
                type="number" 
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Auto-Polling Interval
              </label>
              <select 
                value={interval}
                onChange={(e) => setIntervalVal(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: '#fff',
                  fontSize: '0.88rem'
                }}
              >
                <option value={15}>Every 15 Seconds</option>
                <option value={30}>Every 30 Seconds</option>
                <option value={60}>Every 1 Minute</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button 
              onClick={handleTestProxyConnection}
              disabled={isTesting}
              className="btn btn-outline btn-sm"
            >
              {isTesting ? <RefreshCw className="animate-spin" size={14} /> : <Wifi size={14} color="#38bdf8" />}
              Test Connection (:9101)
            </button>

            <button 
              onClick={handleFetchProxyNow}
              disabled={isFetchingProxy}
              className="btn btn-primary btn-sm"
            >
              {isFetchingProxy ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} />}
              Fetch & Analyze Live POS Backup ZIP
            </button>
          </div>
        </div>
      )}

      {/* Result Alert */}
      {testResult && (
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          borderRadius: '10px',
          background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
          border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.85rem'
        }}>
          {testResult.success ? <CheckCircle color="#34d399" size={18} /> : <AlertTriangle color="#fb7185" size={18} />}
          <span style={{ color: testResult.success ? '#34d399' : '#fb7185' }}>
            {testResult.message}
          </span>
        </div>
      )}

    </div>
  );
};
