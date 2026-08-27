import React from 'react';
import { Filter, ArrowRight } from 'lucide-react';
import type { SynthesisMetrics } from '../types/audit';

interface SynthesisSummaryBannerProps {
  metrics: SynthesisMetrics;
  synthesisEnabled: boolean;
}

export const SynthesisSummaryBanner: React.FC<SynthesisSummaryBannerProps> = ({ metrics, synthesisEnabled }) => {
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="glass-panel glass-panel-glow" style={{ padding: '20px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        top: '-10px',
        right: '-10px',
        width: '120px',
        height: '120px',
        background: synthesisEnabled ? 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: synthesisEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
            border: `1px solid ${synthesisEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
            padding: '12px',
            borderRadius: '12px',
            color: synthesisEnabled ? '#34d399' : '#38bdf8'
          }}>
            <Filter size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Data Synthesizer Pipeline Status</h3>
              <span className={`badge ${synthesisEnabled ? 'badge-emerald' : 'badge-cyan'}`}>
                {synthesisEnabled ? 'SYNTHESIZED INSIGHTS ACTIVE' : 'RAW TELEMETRY VIEW'}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {synthesisEnabled 
                ? `Filtered out ${metrics.duplicateRetryCount} network duplicate retries (${formatBytes(metrics.duplicateWastedBytes)} wasted overhead) & ${metrics.testPrintCount} test prints.`
                : `Displaying all ${metrics.rawTotalCaptures} un-filtered raw captures directly from TCP payload stream.`}
            </p>
          </div>
        </div>

        {/* Breakdown Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Raw Captures</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>{metrics.rawTotalCaptures}</span>
          </div>

          <ArrowRight size={16} color="var(--text-muted)" />

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <span style={{ fontSize: '0.7rem', color: '#34d399', display: 'block', fontWeight: 500 }}>Clean Valid Receipts</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>{metrics.synthesizedValidCaptures}</span>
          </div>

          <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
            <span style={{ fontSize: '0.7rem', color: '#fb7185', display: 'block', fontWeight: 500 }}>Network Retries</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fb7185' }}>{metrics.duplicateRetryCount}</span>
          </div>

          <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '10px 16px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <span style={{ fontSize: '0.7rem', color: '#fbbf24', display: 'block', fontWeight: 500 }}>Test Prints</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fbbf24' }}>{metrics.testPrintCount}</span>
          </div>
        </div>

      </div>
    </div>
  );
};
