import React, { useState } from 'react';
import { FileText, Code, Printer, X } from 'lucide-react';
import type { SynthesizedCapture } from '../types/audit';
import { generateHexDump } from '../utils/escposParser';

interface RawEvidenceModalProps {
  capture: SynthesizedCapture | null;
  relatedCaptures?: SynthesizedCapture[];
  onClose: () => void;
}

export const RawEvidenceModal: React.FC<RawEvidenceModalProps> = ({
  capture: initialCapture,
  relatedCaptures = [],
  onClose
}) => {
  const [activeCapture, setActiveCapture] = useState<SynthesizedCapture | null>(
    initialCapture || relatedCaptures[0] || null
  );
  const [inspectorTab, setInspectorTab] = useState<'virtual' | 'ascii' | 'hex'>('virtual');

  if (!activeCapture) return null;

  const allCaptures = relatedCaptures.length > 0
    ? relatedCaptures
    : initialCapture
      ? [initialCapture]
      : [];

  return (
    <div
      className="audit-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 8, 16, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.12)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span className="badge badge-cyan">{activeCapture.category.replace(/_/g, ' ')}</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                Raw ESC/POS Evidence Inspector
              </h3>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              {activeCapture.raw_filename} · Order {activeCapture.parsedReceipt.orderNumber || 'Unbound'} · Captured {new Date(activeCapture.captured_at).toLocaleString('id-ID')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '8px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Multi-capture selector if related captures exist */}
        {allCaptures.length > 1 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 24px',
            background: 'rgba(15, 23, 42, 0.8)',
            borderBottom: '1px solid var(--border-color)',
            overflowX: 'auto'
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '6px' }}>
              Related Evidences ({allCaptures.length}):
            </span>
            {allCaptures.map(cap => (
              <button
                key={cap.id}
                type="button"
                className={`audit-chip ${activeCapture.id === cap.id ? 'audit-chip-cyan' : ''}`}
                onClick={() => setActiveCapture(cap)}
                style={{ fontSize: '0.75rem' }}
              >
                {cap.category.replace(/_/g, ' ')} ({cap.parsedReceipt.orderNumber || cap.id.slice(-6)})
              </button>
            ))}
          </div>
        )}

        {/* Modal Inspector Tabs */}
        <div style={{
          display: 'flex',
          gap: '10px',
          padding: '10px 24px',
          background: 'rgba(15, 23, 42, 0.9)',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <button
            type="button"
            className={`btn btn-sm ${inspectorTab === 'virtual' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setInspectorTab('virtual')}
          >
            <Printer size={14} style={{ marginRight: '6px' }} /> Virtual Thermal Receipt
          </button>
          <button
            type="button"
            className={`btn btn-sm ${inspectorTab === 'ascii' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setInspectorTab('ascii')}
          >
            <FileText size={14} style={{ marginRight: '6px' }} /> ASCII Text Stream
          </button>
          <button
            type="button"
            className={`btn btn-sm ${inspectorTab === 'hex' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setInspectorTab('hex')}
          >
            <Code size={14} style={{ marginRight: '6px' }} /> Hex Dump Inspector
          </button>
        </div>

        {/* Modal Content Body */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          background: '#090d16'
        }}>
          {inspectorTab === 'virtual' && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div className="thermal-receipt">
                <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '1px dashed #666', paddingBottom: '8px' }}>
                  <strong style={{ fontSize: '1rem', display: 'block', color: '#111' }}>
                    {activeCapture.parsedReceipt.department || 'KUNCI KUPPI POS'}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: '#555', display: 'block' }}>
                    Capture IP: {activeCapture.source_address || '127.0.0.1'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#555', display: 'block' }}>
                    File: {activeCapture.raw_filename}
                  </span>
                </div>

                {activeCapture.parsedReceipt.lines.length === 0 ? (
                  <p style={{ color: '#888', fontStyle: 'italic', textAlign: 'center' }}>[Empty or raw bytes only payload]</p>
                ) : (
                  activeCapture.parsedReceipt.lines.map((line, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontWeight: line.includes('**') || line.includes('================') ? 'bold' : 'normal',
                        textAlign: line.includes('RINGKASAN') || line.includes('BAR') || line.includes('KITCHEN') ? 'center' : 'left',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: '2px 0',
                        color: '#1e293b'
                      }}
                    >
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {inspectorTab === 'ascii' && (
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: '#34d399',
              background: 'rgba(0,0,0,0.6)',
              padding: '16px',
              borderRadius: '8px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              margin: 0
            }}>
              {activeCapture.parsedReceipt.asciiText || '[No readable ASCII characters found in binary ESC/POS payload]'}
            </pre>
          )}

          {inspectorTab === 'hex' && (
            <pre style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: '#38bdf8',
              background: 'rgba(0,0,0,0.8)',
              padding: '16px',
              borderRadius: '8px',
              overflowX: 'auto',
              lineHeight: '1.5',
              margin: 0
            }}>
              {generateHexDump(activeCapture.parsedReceipt.rawBytes)}
            </pre>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderTop: '1px solid var(--border-color)',
          fontSize: '0.78rem',
          color: 'var(--text-muted)'
        }}>
          <span>SHA256: <code>{activeCapture.sha256.slice(0, 16)}...</code></span>
          <span>Payload Size: {activeCapture.bytes} bytes</span>
        </div>
      </div>
    </div>
  );
};
