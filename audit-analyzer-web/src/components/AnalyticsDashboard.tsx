import React from 'react';
import { Cpu, HardDrive, Filter, Layers, Activity, PieChart, ShieldAlert } from 'lucide-react';
import type { SynthesisMetrics } from '../types/audit';

interface AnalyticsDashboardProps {
  metrics: SynthesisMetrics;
  synthesisEnabled: boolean;
  totalAuditEvents: number;
  pinFailedCount: number;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  metrics,
  synthesisEnabled,
  totalAuditEvents,
  pinFailedCount
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const activeCapturesCount = synthesisEnabled ? metrics.synthesizedValidCaptures : metrics.rawTotalCaptures;
  const activeBytesCount = synthesisEnabled ? metrics.synthesizedValidBytes : metrics.rawTotalBytes;

  return (
    <div>
      {/* Top Metric KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* KPI 1: Active Print Count */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {synthesisEnabled ? 'Clean Unique Receipts' : 'Total Raw Captures'}
            </span>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '8px', color: '#38bdf8' }}>
              <Layers size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            {activeCapturesCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {synthesisEnabled ? `${metrics.rawTotalCaptures} raw total - ${metrics.duplicateRetryCount} retries` : 'Includes network retries & test prints'}
          </span>
        </div>

        {/* KPI 2: Total Volume Bytes */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {synthesisEnabled ? 'Synthesized Data Volume' : 'Total Raw Payload Stream'}
            </span>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '8px', color: '#34d399' }}>
              <HardDrive size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
            {formatBytes(activeBytesCount)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {synthesisEnabled ? `${formatBytes(metrics.duplicateWastedBytes)} wasted retries eliminated` : 'Total bytes received over socket'}
          </span>
        </div>

        {/* KPI 3: Duplicate Retries */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Network Duplicate Retries
            </span>
            <div style={{ background: 'rgba(244, 63, 94, 0.15)', padding: '8px', borderRadius: '8px', color: '#fb7185' }}>
              <Filter size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fb7185', marginBottom: '4px' }}>
            {metrics.duplicateRetryCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {formatBytes(metrics.duplicateWastedBytes)} wasted TCP overhead
          </span>
        </div>

        {/* KPI 4: Security Audit Events */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Security Audit Events
            </span>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '8px', borderRadius: '8px', color: '#fbbf24' }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
            {totalAuditEvents}
          </div>
          <span style={{ fontSize: '0.75rem', color: pinFailedCount > 0 ? '#fb7185' : 'var(--text-muted)' }}>
            {pinFailedCount > 0 ? `⚠️ ${pinFailedCount} Unauthorized PIN attempts` : 'Zero PIN security violations'}
          </span>
        </div>

      </div>

      {/* Middle Grid: Category Breakdown & POS Source Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        
        {/* Department / Category Breakdown */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <PieChart size={20} color="#38bdf8" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Receipt Category Classification</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Customer Bills */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: '#f8fafc', fontWeight: 500 }}>Customer POS Receipts (`KK`)</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>{metrics.categoryCounts.CUSTOMER_BILL}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${(metrics.categoryCounts.CUSTOMER_BILL / Math.max(metrics.rawTotalCaptures, 1)) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #0284c7, #38bdf8)'
                }} />
              </div>
            </div>

            {/* Kitchen & Bar Tickets */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: '#f8fafc', fontWeight: 500 }}>Kitchen & Bar Tickets (`BAR`/`KITCHEN`)</span>
                <span style={{ fontWeight: 600, color: '#34d399' }}>{metrics.categoryCounts.KITCHEN_TICKET}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${(metrics.categoryCounts.KITCHEN_TICKET / Math.max(metrics.rawTotalCaptures, 1)) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #059669, #34d399)'
                }} />
              </div>
            </div>

            {/* Daily Summary Reports */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: '#f8fafc', fontWeight: 500 }}>Daily Sales Summary Reports (`RINGKASAN`)</span>
                <span style={{ fontWeight: 600, color: '#c084fc' }}>{metrics.categoryCounts.DAILY_SUMMARY}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${(metrics.categoryCounts.DAILY_SUMMARY / Math.max(metrics.rawTotalCaptures, 1)) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #9333ea, #c084fc)'
                }} />
              </div>
            </div>

            {/* Test Prints */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                <span style={{ color: '#f8fafc', fontWeight: 500 }}>Test Prints & Minimal Payload Checks</span>
                <span style={{ fontWeight: 600, color: '#fbbf24' }}>{metrics.categoryCounts.TEST_PRINT}</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${(metrics.categoryCounts.TEST_PRINT / Math.max(metrics.rawTotalCaptures, 1)) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #d97706, #fbbf24)'
                }} />
              </div>
            </div>

          </div>
        </div>

        {/* POS Source IP Breakdown */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Activity size={20} color="#34d399" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>POS Client Source IP Breakdown</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(metrics.posSourceBreakdown).map(([ip, data]) => (
              <div key={ip} style={{
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', fontFamily: 'var(--font-mono)' }}>
                    {ip}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    {data.valid} clean receipts | {data.retries} retries
                  </span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>
                    {data.total} jobs
                  </span>
                  <span className="badge badge-emerald" style={{ marginLeft: '8px' }}>
                    {((data.valid / data.total) * 100).toFixed(0)}% valid
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Hourly Volume Distribution Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Cpu size={20} color="#a855f7" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Hourly Print Throughput Timeline</h3>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time Window</th>
                <th>Raw Packets Received</th>
                <th>Clean Valid Receipts</th>
                <th>Duplicate Retries</th>
                <th>Status / Health</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.hourlyVolume).map(([hour, data]) => {
                const retries = data.raw - data.valid;
                return (
                  <tr key={hour}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{hour}</td>
                    <td>{data.raw} captures</td>
                    <td style={{ color: '#34d399', fontWeight: 600 }}>{data.valid} valid</td>
                    <td style={{ color: retries > 0 ? '#fb7185' : 'var(--text-muted)' }}>
                      {retries > 0 ? `${retries} retries` : '0 retries'}
                    </td>
                    <td>
                      <span className={`badge ${retries > 3 ? 'badge-amber' : 'badge-emerald'}`}>
                        {retries > 3 ? 'Network Latency' : 'Optimal'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
