import React, { useState } from 'react';
import { ShieldCheck, Search, Key, CheckCircle, AlertOctagon } from 'lucide-react';
import type { AuditEvent } from '../types/audit';

interface SecurityAuditLogsProps {
  events: AuditEvent[];
}

export const SecurityAuditLogs: React.FC<SecurityAuditLogsProps> = ({ events }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredEvents = events.filter(ev => {
    const matchesSearch = 
      ev.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ev.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterType === 'ALL') return matchesSearch;
    if (filterType === 'PIN_FAIL') return matchesSearch && ev.event_type.includes('PIN_FAIL');
    if (filterType === 'SERVICE') return matchesSearch && (ev.event_type.includes('SERVICE') || ev.event_type.includes('AUTOSTART'));
    if (filterType === 'BACKUP') return matchesSearch && ev.event_type.includes('S3');
    return matchesSearch;
  });

  const getEventBadge = (eventType: string) => {
    if (eventType.includes('FAIL') || eventType.includes('ERROR')) {
      return <span className="badge badge-rose"><AlertOctagon size={12} /> {eventType}</span>;
    }
    if (eventType.includes('SUCCESS') || eventType.includes('STARTED')) {
      return <span className="badge badge-emerald"><CheckCircle size={12} /> {eventType}</span>;
    }
    if (eventType.includes('PIN')) {
      return <span className="badge badge-amber"><Key size={12} /> {eventType}</span>;
    }
    return <span className="badge badge-cyan">{eventType}</span>;
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldCheck size={22} color="#fbbf24" />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Security & Service Audit Events Log</h2>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search audit details..."
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

          {/* Filter Types */}
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'rgba(15, 23, 42, 0.8)',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          >
            <option value="ALL">All Event Types ({events.length})</option>
            <option value="PIN_FAIL">PIN Failures</option>
            <option value="SERVICE">Service & Autostart</option>
            <option value="BACKUP">S3 Cloud Backups</option>
          </select>

        </div>
      </div>

      {/* Table */}
      {filteredEvents.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No security audit events match the current search filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Details / Payload</th>
                <th>PIN Authorized</th>
                <th>Event ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map(ev => (
                <tr key={ev.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {ev.timestamp}
                  </td>
                  <td>
                    {getEventBadge(ev.event_type)}
                  </td>
                  <td style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>
                    {ev.details}
                  </td>
                  <td>
                    <span className={`badge ${ev.pin_authorized ? 'badge-emerald' : 'badge-amber'}`}>
                      {ev.pin_authorized ? 'Authorized' : 'Unrestricted'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {ev.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
