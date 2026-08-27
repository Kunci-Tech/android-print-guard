import React, { useState } from 'react';
import { Layers, Search, Download, Eye, X } from 'lucide-react';
import type { TransactionGroup } from '../types/audit';

interface OrderMasterLogProps {
  groups: TransactionGroup[];
  fileName: string;
}

export const OrderMasterLog: React.FC<OrderMasterLogProps> = ({ groups, fileName }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<TransactionGroup | null>(null);

  const filteredGroups = groups.filter(g => {
    const searchLower = searchTerm.toLowerCase();
    const h = g.canonicalHeader;

    return (
      g.orderNumber.toLowerCase().includes(searchLower) ||
      (h && h.customer.toLowerCase().includes(searchLower)) ||
      (h && h.user.toLowerCase().includes(searchLower)) ||
      (h && h.cashier.toLowerCase().includes(searchLower)) ||
      (h && h.table.toLowerCase().includes(searchLower))
    );
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  const handleExportCSV = () => {
    const headers = ['Order Number', 'Date', 'Customer', 'Table', 'User / Waiter', 'Cashier', 'Sales Type', 'Payment Method', 'Item Count', 'Total Revenue (IDR)', 'Print Stream Copies'];
    const rows = filteredGroups.map(g => {
      const h = g.canonicalHeader;
      return [
        `"${g.orderNumber}"`,
        `"${h?.date || ''}"`,
        `"${(h?.customer || '').replace(/"/g, '""')}"`,
        `"${(h?.table || '').replace(/"/g, '""')}"`,
        `"${(h?.user || '').replace(/"/g, '""')}"`,
        `"${(h?.cashier || '').replace(/"/g, '""')}"`,
        `"${h?.salesType || ''}"`,
        `"${h?.paymentMethod || ''}"`,
        h?.totalItemCount || 0,
        h?.totalAmount || 0,
        g.totalPrintCount
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pos_order_master_log_${fileName.replace(/\.zip$/i, '')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      
      {/* Top Main Panel */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={22} color="#38bdf8" />
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>POS Order Master Log & Reconciliation</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Grouped by unique POS Order ID ({groups.length} distinct transactions captured from raw print stream)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            
            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Order #, Customer, Cashier..."
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

            {/* CSV Export Button */}
            <button 
              onClick={handleExportCSV}
              className="btn btn-emerald btn-sm"
            >
              <Download size={14} /> Export POS Order Log CSV
            </button>

          </div>
        </div>

        {/* Master Log Table */}
        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Date & Time</th>
                <th>Customer Name</th>
                <th>Table</th>
                <th>User / Cashier</th>
                <th>Items Count</th>
                <th>Total Revenue</th>
                <th>Print Stream Copies</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(g => {
                const h = g.canonicalHeader;
                return (
                  <tr 
                    key={g.orderNumber}
                    onClick={() => setSelectedGroup(g)}
                    style={{ cursor: 'pointer', background: selectedGroup?.orderNumber === g.orderNumber ? 'rgba(56, 189, 248, 0.08)' : undefined }}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                      {g.orderNumber}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {h?.date || '-'}
                    </td>
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {h?.customer || '-'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {h?.table || '-'}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {h?.cashier || h?.user || '-'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600, color: '#34d399' }}>
                      {h?.totalItemCount || 0} items
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600, color: '#34d399' }}>
                      {h?.totalAmount ? formatCurrency(h.totalAmount) : '-'}
                    </td>
                    <td>
                      <span className={`badge ${g.totalPrintCount > 1 ? 'badge-violet' : 'badge-cyan'}`}>
                        {g.totalPrintCount} print copies ({g.hasCustomerBill ? 'Bill + Tickets' : 'Ticket Only'})
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm">
                        <Eye size={13} /> View Order
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* Order Detail Modal */}
      {selectedGroup && (
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
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                  Transaction Master: {selectedGroup.orderNumber}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {selectedGroup.totalPrintCount} captured print stream tickets | Customer: {selectedGroup.canonicalHeader?.customer || 'N/A'} | Table: {selectedGroup.canonicalHeader?.table || 'N/A'}
                </p>
              </div>

              <button 
                onClick={() => setSelectedGroup(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, background: '#090d16' }}>
              
              {/* Header Info Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Date / Time</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{selectedGroup.canonicalHeader?.date || 'N/A'}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Cashier / User</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>{selectedGroup.canonicalHeader?.cashier || selectedGroup.canonicalHeader?.user || 'N/A'}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Payment Method</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#38bdf8' }}>{selectedGroup.canonicalHeader?.paymentMethod || 'N/A'}</span>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Total Amount</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#34d399' }}>{selectedGroup.canonicalHeader?.totalAmount ? formatCurrency(selectedGroup.canonicalHeader.totalAmount) : 'N/A'}</span>
                </div>
              </div>

              {/* Items List Table */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', color: '#38bdf8' }}>
                Parsed Line Items ({selectedGroup.canonicalHeader?.items.length || 0})
              </h4>

              {selectedGroup.canonicalHeader && selectedGroup.canonicalHeader.items.length > 0 ? (
                <table className="data-table" style={{ marginBottom: '24px' }}>
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Variant / Option</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Total Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.canonicalHeader.items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: '#fff' }}>
                          {item.itemName}
                        </td>
                        <td style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                          {item.variant || '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                          {item.quantity}x
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                          {item.unitPrice > 0 ? formatCurrency(item.unitPrice) : '-'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#34d399' }}>
                          {item.totalPrice > 0 ? formatCurrency(item.totalPrice) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px' }}>
                  No item price lines extracted for this transaction header.
                </div>
              )}

              {/* Print Stream Copies List */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '12px', color: '#c084fc' }}>
                Captured Stream Tickets ({selectedGroup.totalPrintCount})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedGroup.canonicalBill && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>
                      ⭐ Canonical Customer Bill ({selectedGroup.canonicalBill.id})
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {selectedGroup.canonicalBill.bytes} bytes | {selectedGroup.canonicalBill.captured_at}
                    </span>
                  </div>
                )}

                {selectedGroup.associatedTickets.map(ticket => (
                  <div key={ticket.id} style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                      📋 Associated Stream Ticket ({ticket.category} - {ticket.id})
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {ticket.bytes} bytes | {ticket.captured_at}
                    </span>
                  </div>
                ))}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
};
