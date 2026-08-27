import React, { useState } from 'react';
import { ShoppingBag, Search, Download, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import type { ItemSalesSummary } from '../types/audit';

interface ItemSalesAuditProps {
  items: ItemSalesSummary[];
  fileName: string;
}

export const ItemSalesAudit: React.FC<ItemSalesAuditProps> = ({ items, fileName }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MAIN' | 'MODIFIERS'>('ALL');

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.variant.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterType === 'MAIN') return matchesSearch && !item.isModifier;
    if (filterType === 'MODIFIERS') return matchesSearch && item.isModifier;
    return matchesSearch;
  });

  const totalQtySold = items.reduce((sum, item) => sum + item.totalQtySold, 0);
  const totalRevenue = items.reduce((sum, item) => sum + item.totalRevenue, 0);
  const topProduct = items.length > 0 ? items[0] : null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  };

  const handleExportCSV = () => {
    const headers = ['Product Key', 'Item Name', 'Variant / Details', 'Total Qty Sold', 'Total Revenue (IDR)', 'Distinct Orders Count', 'Is Modifier'];
    const rows = filteredItems.map(i => [
      `"${i.productKey.replace(/"/g, '""')}"`,
      `"${i.itemName.replace(/"/g, '""')}"`,
      `"${i.variant.replace(/"/g, '""')}"`,
      i.totalQtySold,
      i.totalRevenue,
      i.orderCount,
      i.isModifier ? 'YES' : 'NO'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `item_sales_summary_${fileName.replace(/\.zip$/i, '')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Total Units Sold
            </span>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '8px', color: '#38bdf8' }}>
              <ShoppingBag size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            {totalQtySold} items
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Extracted from canonical POS receipts
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Total Itemized Revenue
            </span>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '8px', color: '#34d399' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
            {formatCurrency(totalRevenue)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Calculated across {items.length} product lines
          </span>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Top Selling Product
            </span>
            <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '8px', borderRadius: '8px', color: '#c084fc' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#c084fc', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {topProduct ? topProduct.itemName : 'N/A'}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {topProduct ? `${topProduct.totalQtySold} units sold` : 'No data'}
          </span>
        </div>

      </div>

      {/* Main Table Panel */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingBag size={22} color="#38bdf8" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Itemized Product Sales Summary ({items.length} Unique Items)</h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            
            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search menu item or variant..."
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
              onChange={(e) => setFilterType(e.target.value as any)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'rgba(15, 23, 42, 0.8)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            >
              <option value="ALL">All Item Types ({items.length})</option>
              <option value="MAIN">Main Products Only</option>
              <option value="MODIFIERS">Modifiers & Add-ons (`+`)</option>
            </select>

            {/* CSV Export Button */}
            <button 
              onClick={handleExportCSV}
              disabled={filteredItems.length === 0}
              className="btn btn-emerald btn-sm"
            >
              <Download size={14} /> Export Item Sales CSV
            </button>

          </div>
        </div>

        {/* Table */}
        {filteredItems.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <AlertCircle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
            <p>No product items found matching the current search filters or dataset.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Variant / Details</th>
                  <th>Total Quantity Sold</th>
                  <th>Total Revenue</th>
                  <th>Orders Count</th>
                  <th>Item Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.productKey}>
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {item.itemName}
                    </td>
                    <td style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                      {item.variant || '-'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>
                      {item.totalQtySold}x
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#34d399', fontWeight: 600 }}>
                      {item.totalRevenue > 0 ? formatCurrency(item.totalRevenue) : '-'}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {item.orderCount} orders
                    </td>
                    <td>
                      <span className={`badge ${item.isModifier ? 'badge-amber' : 'badge-emerald'}`}>
                        {item.isModifier ? 'Modifier / Add-on' : 'Main Product'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
