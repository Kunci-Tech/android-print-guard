import React, { useState } from 'react';
import { FileText, Search, Code, Eye, Printer, AlertCircle, X } from 'lucide-react';
import type { SynthesizedCapture } from '../types/audit';
import { generateHexDump } from '../utils/escposParser';

interface ReceiptInspectorProps {
  captures: SynthesizedCapture[];
  synthesisEnabled: boolean;
}

export const ReceiptInspector: React.FC<ReceiptInspectorProps> = ({ captures, synthesisEnabled }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedCapture, setSelectedCapture] = useState<SynthesizedCapture | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'virtual' | 'ascii' | 'hex'>('virtual');

  const displayedCaptures = captures.filter(c => {
    if (synthesisEnabled && categoryFilter === 'CLEAN_ONLY' && !c.isSynthesizedValid) {
      return false;
    }
    if (categoryFilter === 'DUPLICATES' && !c.isDuplicateRetry) {
      return false;
    }
    if (categoryFilter !== 'ALL' && categoryFilter !== 'CLEAN_ONLY' && categoryFilter !== 'DUPLICATES' && c.category !== categoryFilter) {
      return false;
    }

    const searchLower = searchTerm.toLowerCase();
    return (
      c.id.toLowerCase().includes(searchLower) ||
      c.raw_filename.toLowerCase().includes(searchLower) ||
      c.sha256.toLowerCase().includes(searchLower) ||
      c.parsedReceipt.asciiText.toLowerCase().includes(searchLower)
    );
  });

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      
      {/* Search & Filter Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Printer size={22} color="#38bdf8" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Captured Receipt & ESC/POS Inspector</h2>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search receipt text, SHA, ID..."
              style={{
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'rgba(15, 23, 42, 0.8)',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          >
            <option value="ALL">All Captures ({captures.length})</option>
            <option value="CLEAN_ONLY">Clean Valid Receipts Only</option>
            <option value="DUPLICATES">Network Duplicates / Retries</option>
            <option value="CUSTOMER_BILL">Customer Bills (`KK`)</option>
            <option value="KITCHEN_TICKET">Kitchen/Bar Tickets</option>
            <option value="DAILY_SUMMARY">Daily Sales Summaries</option>
            <option value="TEST_PRINT">Test Prints</option>
          </select>

        </div>
      </div>

      {/* Main Table */}
      <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Captured Time</th>
              <th>Receipt Category</th>
              <th>Synthesis Status</th>
              <th>Payload Size</th>
              <th>Department / Preview</th>
              <th>SHA-256 Checksum</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayedCaptures.map(c => (
              <tr 
                key={c.id}
                onClick={() => setSelectedCapture(c)}
                style={{ cursor: 'pointer', background: selectedCapture?.id === c.id ? 'rgba(56, 189, 248, 0.08)' : undefined }}
              >
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {new Date(c.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
                <td>
                  <span className={`badge ${
                    c.category === 'CUSTOMER_BILL' ? 'badge-cyan' :
                    c.category === 'KITCHEN_TICKET' ? 'badge-emerald' :
                    c.category === 'DAILY_SUMMARY' ? 'badge-violet' : 'badge-amber'
                  }`}>
                    {c.category}
                  </span>
                </td>
                <td>
                  {c.isDuplicateRetry ? (
                    <span className="badge badge-rose">
                      <AlertCircle size={12} /> RETRY ({c.retryTimeDiffSeconds?.toFixed(0)}s diff)
                    </span>
                  ) : c.category === 'TEST_PRINT' ? (
                    <span className="badge badge-amber">TEST PRINT</span>
                  ) : (
                    <span className="badge badge-emerald">VALID UNIQUE</span>
                  )}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  {formatBytes(c.bytes)}
                </td>
                <td style={{ fontSize: '0.85rem', color: '#cbd5e1', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.parsedReceipt.department ? `[${c.parsedReceipt.department}] ` : ''}
                  {c.parsedReceipt.lines.slice(0, 2).join(' | ')}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {c.sha256.substring(0, 12)}...
                </td>
                <td>
                  <button className="btn btn-outline btn-sm">
                    <Eye size={13} /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal / Drawer for ESC/POS Inspector */}
      {selectedCapture && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '750px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: '#0f172a',
            borderColor: 'rgba(56, 189, 248, 0.4)'
          }}>
            
            {/* Modal Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  ESC/POS Payload Inspector: {selectedCapture.id}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Captured at {selectedCapture.captured_at} | Size: {formatBytes(selectedCapture.bytes)} | SHA256: {selectedCapture.sha256.substring(0, 16)}...
                </p>
              </div>

              <button 
                onClick={() => setSelectedCapture(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Inspector Tabs */}
            <div style={{ display: 'flex', gap: '10px', padding: '12px 20px', background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid var(--border-color)' }}>
              <button 
                className={`btn btn-sm ${inspectorTab === 'virtual' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setInspectorTab('virtual')}
              >
                <Printer size={14} /> Virtual Thermal Receipt Card
              </button>
              <button 
                className={`btn btn-sm ${inspectorTab === 'ascii' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setInspectorTab('ascii')}
              >
                <FileText size={14} /> ASCII Stream Text
              </button>
              <button 
                className={`btn btn-sm ${inspectorTab === 'hex' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setInspectorTab('hex')}
              >
                <Code size={14} /> Hex Dump Inspector
              </button>
            </div>

            {/* Modal Body Content */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, background: '#090d16' }}>
              
              {inspectorTab === 'virtual' && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className="thermal-receipt">
                    <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '1px dashed #666', paddingBottom: '8px' }}>
                      <strong style={{ fontSize: '1rem', display: 'block' }}>
                        {selectedCapture.parsedReceipt.department || 'KUNCI KUPPI POS'}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#555' }}>
                        Source: {selectedCapture.source_address} -&gt; {selectedCapture.printer_ip}:{selectedCapture.printer_port}
                      </span>
                    </div>

                    {selectedCapture.parsedReceipt.lines.map((line, idx) => (
                      <div key={idx} style={{ 
                        fontWeight: line.includes('**') || line.includes('================') ? 'bold' : 'normal',
                        textAlign: line.includes('RINGKASAN') || line.includes('BAR') ? 'center' : 'left',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        margin: '2px 0'
                      }}>
                        {line}
                      </div>
                    ))}
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
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedCapture.parsedReceipt.asciiText || '[No readable ASCII characters found in binary ESC/POS payload]'}
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
                  lineHeight: '1.5'
                }}>
                  {generateHexDump(selectedCapture.parsedReceipt.rawBytes)}
                </pre>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
