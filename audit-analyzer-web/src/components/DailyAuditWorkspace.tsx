import React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileSearch,
  ReceiptText,
  Search,
  ShieldAlert,
  TrendingDown
} from 'lucide-react';
import type { DailyPrintAudit, ParsedAuditArchive, SynthesizedCapture } from '../types/audit';
import { RawEvidenceModal } from './RawEvidenceModal';

interface DailyAuditWorkspaceProps {
  archive: ParsedAuditArchive;
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function formatDateTime(value: string | undefined): string {
  if (!value) return 'No summary';
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getVerdictTone(audit: DailyPrintAudit): {
  badgeClass: string;
  icon: React.ReactNode;
  label: string;
} {
  if (audit.verdict === 'PROVISIONAL') {
    return { badgeClass: 'badge-amber', icon: <Clock size={14} />, label: 'Provisional' };
  }
  if (audit.verdict === 'HIGH_PRIORITY_FINDINGS') {
    return { badgeClass: 'badge-rose', icon: <ShieldAlert size={14} />, label: 'High-Priority Findings' };
  }
  if (audit.verdict === 'INCOMPLETE_COVERAGE') {
    return { badgeClass: 'badge-amber', icon: <FileSearch size={14} />, label: 'Incomplete Coverage' };
  }
  if (audit.verdict === 'MISSING_SUMMARY') {
    return { badgeClass: 'badge-rose', icon: <AlertTriangle size={14} />, label: 'Missing Summary' };
  }
  return { badgeClass: 'badge-emerald', icon: <CheckCircle2 size={14} />, label: 'Clean' };
}

function getVerifyingSummaryText(audit: DailyPrintAudit): string {
  if (!audit.verifyingSummary) {
    return `No Daily Sales Summary Snapshot was captured for Operational Date ${audit.operationalDate}.`;
  }

  const cutoffText = audit.excludedAfterCutoffCount > 0
    ? ` ${audit.excludedAfterCutoffCount} later event(s) are excluded until a newer summary is captured.`
    : '';

  return `Using the latest Daily Sales Summary Snapshot captured ${formatDateTime(audit.verifyingSummary.capturedAt)}.${cutoffText}`;
}

export const DailyAuditWorkspace: React.FC<DailyAuditWorkspaceProps> = ({
  archive,
  selectedDate,
  onSelectedDateChange
}) => {
  const [gapFilterTab, setGapFilterTab] = React.useState<'ALL' | 'MISSING_PAID' | 'SUMMARY_EXCEEDS'>('ALL');
  const [itemSearchTerm, setItemSearchTerm] = React.useState('');
  const [itemFilterTab, setItemFilterTab] = React.useState<'ALL' | 'DISCREPANCIES' | 'MATCHES'>('ALL');

  const [modalTargetCapture, setModalTargetCapture] = React.useState<SynthesizedCapture | null>(null);
  const [modalRelatedCaptures, setModalRelatedCaptures] = React.useState<SynthesizedCapture[]>([]);

  const handleOpenCaptureModal = (captureId?: string, relatedCaptureIds?: string[]) => {
    if (!captureId && (!relatedCaptureIds || relatedCaptureIds.length === 0)) return;

    const findCapture = (id: string) => archive.synthesizedCaptures.find(c => c.id === id);

    const primary = captureId ? findCapture(captureId) : undefined;
    const related = (relatedCaptureIds ?? [])
      .map(id => findCapture(id))
      .filter((c): c is SynthesizedCapture => Boolean(c));

    if (primary || related.length > 0) {
      setModalTargetCapture(primary || related[0]);
      setModalRelatedCaptures(related);
    }
  };

  const handleOpenModalForOrderOrProduct = (
    posOrderNumber?: string,
    productName?: string,
    evidenceIds?: string[],
    primaryCaptureId?: string
  ) => {
    if (primaryCaptureId) {
      const primary = archive.synthesizedCaptures.find(c => c.id === primaryCaptureId);
      if (primary) {
        const related = (evidenceIds ?? []).map(id => archive.synthesizedCaptures.find(c => c.id === id)).filter((c): c is SynthesizedCapture => Boolean(c));
        setModalTargetCapture(primary);
        setModalRelatedCaptures(related.length > 0 ? related : [primary]);
        return;
      }
    }

    if (evidenceIds && evidenceIds.length > 0) {
      const directCaptures = archive.synthesizedCaptures.filter(c => evidenceIds.includes(c.id));
      if (directCaptures.length > 0) {
        setModalTargetCapture(directCaptures[0]);
        setModalRelatedCaptures(directCaptures);
        return;
      }
    }

    if (posOrderNumber) {
      const orderCaptures = archive.synthesizedCaptures.filter(c => c.parsedReceipt.orderNumber === posOrderNumber);
      if (orderCaptures.length > 0) {
        setModalTargetCapture(orderCaptures[0]);
        setModalRelatedCaptures(orderCaptures);
        return;
      }
    }

    if (productName) {
      const tokens = productName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
      const productCaptures = archive.synthesizedCaptures.filter(c => {
        const textLower = c.parsedReceipt.asciiText.toLowerCase();
        return tokens.length > 0 && tokens.every(token => textLower.includes(token));
      });

      if (productCaptures.length > 0) {
        setModalTargetCapture(productCaptures[0]);
        setModalRelatedCaptures(productCaptures);
        return;
      }
    }

    if (audit?.verifyingSummary) {
      const summaryCapture = archive.synthesizedCaptures.find(c => c.id === audit.verifyingSummary?.sourceCaptureId);
      if (summaryCapture) {
        setModalTargetCapture(summaryCapture);
        setModalRelatedCaptures([summaryCapture]);
        return;
      }
    }

    if (archive.synthesizedCaptures.length > 0) {
      setModalTargetCapture(archive.synthesizedCaptures[0]);
      setModalRelatedCaptures(archive.synthesizedCaptures);
    }
  };

  const audit = archive.auditModel.dailyAudits.find(item => item.operationalDate === selectedDate)
    ?? archive.auditModel.dailyAudits[0];
  const verdict = audit ? getVerdictTone(audit) : null;

  if (!audit) {
    return (
      <main className="audit-workspace">
        <section className="glass-panel audit-empty-state">
          <AlertTriangle size={24} />
          <h2>No parseable operational dates</h2>
          <p>The archive was loaded, but no dated summary or POS order evidence could be reconstructed.</p>
        </section>
      </main>
    );
  }

  const missingPaidGaps = audit.printCoverageGaps.filter(g => g.reason === 'MISSING_FINAL_PAID_BILL');
  const summaryExceedsGaps = audit.printCoverageGaps.filter(g => g.reason === 'SUMMARY_EXCEEDS_CAPTURED_PRODUCTION');
  
  const displayedGaps = gapFilterTab === 'MISSING_PAID'
    ? missingPaidGaps
    : gapFilterTab === 'SUMMARY_EXCEEDS'
      ? summaryExceedsGaps
      : audit.printCoverageGaps;

  const filteredItemComparisons = (audit.itemComparisons ?? []).filter(item => {
    const matchesSearch = item.normalizedProduct.toLowerCase().includes(itemSearchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (itemFilterTab === 'DISCREPANCIES') return item.status !== 'MATCH';
    if (itemFilterTab === 'MATCHES') return item.status === 'MATCH';
    return true;
  });

  const handleExportItemizedCSV = () => {
    const headers = [
      'Product Name',
      'Checker Routed Qty',
      'Checker Paid Qty',
      'Daily Summary Qty',
      'Unit Price (IDR)',
      'Discrepancy Qty',
      'Discrepancy Revenue (IDR)',
      'Status'
    ];

    const rows = filteredItemComparisons.map(i => [
      `"${i.normalizedProduct.replace(/"/g, '""')}"`,
      i.routedQuantity,
      i.paidQuantity,
      i.summaryQuantity,
      i.unitPrice,
      i.discrepancyQuantity,
      i.discrepancyRevenue,
      i.status
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `itemized_summary_comparison_${audit.operationalDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalSuspiciousLoss = audit.findings.reduce((sum, f) => sum + f.estimatedValue, 0);
  const totalUncapturedGapValue = audit.printCoverageGaps.reduce((sum, g) => sum + (g.estimatedValue ?? 0), 0);
  const hasCashFinding = audit.findings.some(f => /cash/i.test(f.paymentMethod || ''));

  return (
    <main className="audit-workspace">
      <section className="audit-topbar">
        <div>
          <span className="audit-eyebrow">Active archive</span>
          <h2>{archive.fileName}</h2>
        </div>
        <label className="audit-date-picker">
          <CalendarDays size={16} />
          <select value={audit.operationalDate} onChange={event => onSelectedDateChange(event.target.value)}>
            {archive.auditModel.availableOperationalDates.map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
        </label>
      </section>

      {/* Top Financial Anomaly Alert Banner */}
      {(audit.findings.length > 0 || totalSuspiciousLoss > 0 || totalUncapturedGapValue > 0) && (
        <section className="glass-panel audit-anomaly-banner">
          <div className="audit-anomaly-header">
            <div className="audit-anomaly-title">
              <ShieldAlert size={22} className="text-rose" />
              <div>
                <h3>Financial Anomaly Alert</h3>
                <p>Post-routing reductions & uncaptured coverage gaps detected for {audit.operationalDate}</p>
              </div>
            </div>
            {hasCashFinding && (
              <span className="badge badge-rose">
                <AlertTriangle size={13} /> Cash Payment Findings
              </span>
            )}
          </div>
          <div className="audit-anomaly-metrics">
            <div>
              <span>Suspicious Reduction Loss</span>
              <strong className="text-rose">{formatCurrency(totalSuspiciousLoss)}</strong>
            </div>
            <div>
              <span>High-Priority Reductions</span>
              <strong>{audit.findings.length} findings</strong>
            </div>
            <div>
              <span>Print Coverage Gaps</span>
              <strong>{audit.printCoverageGaps.length} gaps ({formatCurrency(totalUncapturedGapValue)})</strong>
            </div>
            <div>
              <span>Provisional Exclusions</span>
              <strong>{audit.excludedAfterCutoffCount} events after summary</strong>
            </div>
          </div>
          <div className="audit-quick-links">
            <a href="#findings-section" className="audit-chip audit-chip-rose">View {audit.findings.length} High-Priority Findings</a>
            <a href="#reconciliation-section" className="audit-chip audit-chip-cyan">View Revenue Reconciliation</a>
            <a href="#gaps-section" className="audit-chip audit-chip-amber">View {audit.printCoverageGaps.length} Coverage Gaps</a>
          </div>
        </section>
      )}

      <section className="glass-panel audit-verdict-panel">
        <div>
          <span className={`badge ${verdict?.badgeClass ?? 'badge-cyan'}`}>
            {verdict?.icon}
            {verdict?.label}
          </span>
          <h1>Post-routing reduction audit</h1>
          <p>{getVerifyingSummaryText(audit)}</p>
        </div>
        <div className="audit-verdict-stats">
          <div>
            <span>Operational Date</span>
            <strong>{audit.operationalDate}</strong>
          </div>
          <div>
            <span>Verifying summary</span>
            <strong>{formatDateTime(audit.verifyingSummary?.capturedAt)}</strong>
          </div>
          <div>
            <span>Production exposure</span>
            <strong>{audit.summaryComparison.productionExposureQuantity} units</strong>
          </div>
          <div>
            <span>POS paid quantity</span>
            <strong>{audit.summaryComparison.paidQuantity} units</strong>
          </div>
          <div>
            <span>Summary quantity</span>
            <strong>{audit.summaryComparison.summaryQuantity} units</strong>
          </div>
          <div>
            <span>Summary revenue</span>
            <strong>{formatCurrency(audit.summaryComparison.summaryRevenue)}</strong>
          </div>
          <div>
            <span>Summary deliveries</span>
            <strong>{audit.verifyingSummary ? `${audit.verifyingSummary.uniquePayloadCount} unique / ${audit.verifyingSummary.deliveryCount} total` : 'None'}</strong>
          </div>
          <div>
            <span>Provisional exclusions</span>
            <strong>{audit.excludedAfterCutoffCount}</strong>
          </div>
        </div>
      </section>

      {audit.isProvisional && (
        <section className="glass-panel audit-warning-row">
          <AlertTriangle size={18} />
          <span>
            Results are provisional for {audit.operationalDate}; evidence captured after {formatDateTime(audit.verifyingSummary?.capturedAt)} is not included in comparisons.
          </span>
        </section>
      )}

      {!audit.verifyingSummary && (
        <section className="glass-panel audit-warning-row">
          <AlertTriangle size={18} />
          <span>
            This Operational Date has captured POS evidence but no Daily Sales Summary Snapshot, so summary comparisons are unavailable.
          </span>
        </section>
      )}

      {/* Sales & Revenue Reconciliation Section */}
      <section id="reconciliation-section" className="audit-section">
        <div className="audit-section-header">
          <div>
            <span className="audit-eyebrow">Reconciliation</span>
            <h3>Sales & Revenue Comparison</h3>
          </div>
          <span className={`badge ${audit.summaryComparison.revenueMatchStatus === 'MATCH' ? 'badge-emerald' : audit.summaryComparison.revenueMatchStatus === 'PRODUCTION_EXCEEDS_SUMMARY' ? 'badge-rose' : 'badge-amber'}`}>
            {audit.summaryComparison.revenueMatchStatus === 'MATCH' ? 'Revenue Match' : audit.summaryComparison.revenueMatchStatus === 'PRODUCTION_EXCEEDS_SUMMARY' ? 'Production Exceeds Summary' : audit.summaryComparison.revenueMatchStatus === 'SUMMARY_EXCEEDS_PRODUCTION' ? 'Summary Exceeds Production' : 'Untested'}
          </span>
        </div>

        <div className="glass-panel audit-reconcile-grid">
          <div className="audit-reconcile-card">
            <span>Production Exposure</span>
            <strong>{formatCurrency(audit.summaryComparison.productionExposureRevenue)}</strong>
            <small>{audit.summaryComparison.productionExposureQuantity} routed items</small>
          </div>
          <div className="audit-reconcile-card">
            <span>POS Paid Sales</span>
            <strong>{formatCurrency(audit.summaryComparison.paidRevenue)}</strong>
            <small>{audit.summaryComparison.paidQuantity} paid items</small>
          </div>
          <div className="audit-reconcile-card">
            <span>Daily Summary Revenue</span>
            <strong>{formatCurrency(audit.summaryComparison.summaryRevenue)}</strong>
            <small>{audit.summaryComparison.summaryQuantity} summary items</small>
          </div>
          <div className="audit-reconcile-card highlight">
            <span>Net Revenue Gap</span>
            <strong className={audit.summaryComparison.revenueGap !== 0 ? 'text-rose' : 'text-emerald'}>
              {formatCurrency(audit.summaryComparison.revenueGap)}
            </strong>
            <small>{audit.summaryComparison.summaryRevenue > audit.summaryComparison.paidRevenue ? 'Summary > POS Paid' : 'POS Paid >= Summary'}</small>
          </div>
        </div>
      </section>

      {/* Itemized Sales & Summary Comparison Table */}
      <section id="item-comparison-section" className="audit-section">
        <div className="audit-section-header">
          <div>
            <span className="audit-eyebrow">Itemized Audit</span>
            <h3>Itemized Sales & Summary Comparison</h3>
          </div>
          <div className="audit-table-controls">
            <div className="audit-search-box">
              <Search size={14} className="audit-search-icon" />
              <input
                type="text"
                placeholder="Search product..."
                value={itemSearchTerm}
                onChange={e => setItemSearchTerm(e.target.value)}
              />
            </div>
            <div className="audit-tab-group">
              <button
                type="button"
                className={`audit-tab ${itemFilterTab === 'ALL' ? 'active' : ''}`}
                onClick={() => setItemFilterTab('ALL')}
              >
                All ({(audit.itemComparisons ?? []).length})
              </button>
              <button
                type="button"
                className={`audit-tab ${itemFilterTab === 'DISCREPANCIES' ? 'active' : ''}`}
                onClick={() => setItemFilterTab('DISCREPANCIES')}
              >
                Discrepancies ({(audit.itemComparisons ?? []).filter(i => i.status !== 'MATCH').length})
              </button>
              <button
                type="button"
                className={`audit-tab ${itemFilterTab === 'MATCHES' ? 'active' : ''}`}
                onClick={() => setItemFilterTab('MATCHES')}
              >
                Matches ({(audit.itemComparisons ?? []).filter(i => i.status === 'MATCH').length})
              </button>
            </div>
            <button
              type="button"
              className="audit-chip audit-chip-cyan"
              onClick={handleExportItemizedCSV}
              title="Export itemized comparison to CSV"
            >
              <Download size={14} style={{ marginRight: '6px' }} /> Export CSV
            </button>
          </div>
        </div>

        <div className="glass-panel audit-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th style={{ textAlign: 'center' }}>Checker Routed Qty</th>
                <th style={{ textAlign: 'center' }}>Checker Paid Qty</th>
                <th style={{ textAlign: 'center' }}>Daily Summary Qty</th>
                <th style={{ textAlign: 'right' }}>Est. Unit Price</th>
                <th style={{ textAlign: 'center' }}>Discrepancy Qty</th>
                <th style={{ textAlign: 'right' }}>Est. Gap Value</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItemComparisons.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No products match the selected criteria for operational date {audit.operationalDate}.
                  </td>
                </tr>
              ) : (
                filteredItemComparisons.map(item => (
                  <tr key={item.productKey}>
                    <td>
                      <strong style={{ color: 'var(--text-main)' }}>{item.normalizedProduct}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="audit-qty-pill">{item.routedQuantity}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="audit-qty-pill">{item.paidQuantity}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="audit-qty-pill summary">{item.summaryQuantity}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`audit-qty-pill ${item.discrepancyQuantity > 0 ? 'rose' : item.discrepancyQuantity < 0 ? 'cyan' : 'emerald'}`}>
                        {item.discrepancyQuantity > 0 ? `+${item.discrepancyQuantity}` : item.discrepancyQuantity}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: item.discrepancyRevenue !== 0 ? 600 : 400 }} className={item.discrepancyRevenue > 0 ? 'text-rose' : ''}>
                      {formatCurrency(item.discrepancyRevenue)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge ${item.status === 'MATCH' ? 'badge-emerald' : item.status === 'MISSING_PRODUCTION' ? 'badge-amber' : 'badge-cyan'}`}>
                        {item.status === 'MATCH' ? 'Match' : item.status === 'MISSING_PRODUCTION' ? 'Missing Production' : 'Excess Production'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="audit-chip audit-chip-cyan"
                        onClick={() => handleOpenModalForOrderOrProduct(undefined, item.normalizedProduct, item.evidenceIds, item.primaryCaptureId)}
                        style={{ cursor: 'pointer', fontSize: '0.72rem' }}
                        title="View raw ESC/POS evidence modal"
                      >
                        <Eye size={12} style={{ marginRight: '4px' }} /> Raw Data
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* High Priority Post-routing Reductions Section */}
      <section id="findings-section" className="audit-section">
        <div className="audit-section-header">
          <div>
            <span className="audit-eyebrow">High priority</span>
            <h3>Post-routing reductions</h3>
          </div>
          <span className="badge badge-rose">{audit.findings.length} findings</span>
        </div>
        {audit.findings.length === 0 ? (
          <div className="glass-panel audit-empty-row">
            <CheckCircle2 size={18} />
            <span>No routed item was lower in the paid POS state for this date.</span>
          </div>
        ) : (
          <div className="audit-finding-list">
            {audit.findings.map(finding => (
              <article
                key={finding.id}
                className="glass-panel audit-finding"
                onClick={() => handleOpenCaptureModal(finding.primaryCaptureId ?? finding.evidenceIds[0], finding.evidenceIds)}
                style={{ cursor: 'pointer' }}
                title="Click to view raw ESC/POS evidence modal"
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="badge badge-rose"><TrendingDown size={13} /> Reduction</span>
                    <span className="audit-chip audit-chip-cyan" style={{ fontSize: '0.72rem' }}>
                      <Eye size={12} style={{ marginRight: '4px' }} /> View Raw Evidence
                    </span>
                  </div>
                  <h4>{finding.normalizedProduct}</h4>
                  <p>{finding.posOrderNumber} · {finding.department.replace(/_/g, ' ')}</p>
                </div>
                <dl>
                  <div>
                    <dt>Routed</dt>
                    <dd>{finding.exposureQuantity}</dd>
                  </div>
                  <div>
                    <dt>Paid</dt>
                    <dd>{finding.posQuantity}</dd>
                  </div>
                  <div>
                    <dt>Reduced</dt>
                    <dd>{finding.reductionQuantity}</dd>
                  </div>
                  <div>
                    <dt>Cashier</dt>
                    <dd>{finding.cashier || '-'}</dd>
                  </div>
                  <div>
                    <dt>POS user</dt>
                    <dd>{finding.posUser || '-'}</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>{finding.paymentMethod || '-'}</dd>
                  </div>
                  <div>
                    <dt>Event time</dt>
                    <dd>{formatDateTime(finding.eventTime)}</dd>
                  </div>
                  <div>
                    <dt>Est. value</dt>
                    <dd className="text-rose font-bold">{formatCurrency(finding.estimatedValue)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Upgraded Print Coverage Gaps Section with Filter Tabs */}
      <section id="gaps-section" className="audit-section">
        <div className="audit-section-header">
          <div>
            <span className="audit-eyebrow">Coverage</span>
            <h3>Print coverage gaps</h3>
          </div>
          <div className="audit-tab-group">
            <button
              type="button"
              className={`audit-tab ${gapFilterTab === 'ALL' ? 'active' : ''}`}
              onClick={() => setGapFilterTab('ALL')}
            >
              All ({audit.printCoverageGaps.length})
            </button>
            <button
              type="button"
              className={`audit-tab ${gapFilterTab === 'MISSING_PAID' ? 'active' : ''}`}
              onClick={() => setGapFilterTab('MISSING_PAID')}
            >
              Missing Paid Bill ({missingPaidGaps.length})
            </button>
            <button
              type="button"
              className={`audit-tab ${gapFilterTab === 'SUMMARY_EXCEEDS' ? 'active' : ''}`}
              onClick={() => setGapFilterTab('SUMMARY_EXCEEDS')}
            >
              Summary Exceeds ({summaryExceedsGaps.length})
            </button>
          </div>
        </div>

        {displayedGaps.length === 0 ? (
          <div className="glass-panel audit-empty-row">
            <ReceiptText size={18} />
            <span>No coverage gaps match the selected filter.</span>
          </div>
        ) : (
          <div className="audit-gap-cards-grid">
            {displayedGaps.map(gap => (
              <div
                key={gap.id}
                className="glass-panel audit-gap-card"
                onClick={() => handleOpenModalForOrderOrProduct(gap.posOrderNumber, gap.normalizedProduct, gap.sourceEvidenceIds, gap.primaryCaptureId)}
                style={{ cursor: 'pointer' }}
                title="Click to view raw ESC/POS evidence modal"
              >
                <div className="audit-gap-card-header">
                  <div>
                    <span className="audit-order-badge">{gap.posOrderNumber || 'Summary Scope'}</span>
                    <h4>{gap.normalizedProduct}</h4>
                  </div>
                  <span className={`badge ${gap.reason === 'MISSING_FINAL_PAID_BILL' ? 'badge-amber' : 'badge-cyan'}`}>
                    {gap.reason === 'MISSING_FINAL_PAID_BILL' ? 'Missing Paid Receipt' : 'Summary > Production'}
                  </span>
                </div>
                <div className="audit-gap-card-body">
                  <div className="audit-qty-pills">
                    <div>
                      <span>Routed Qty</span>
                      <strong>{gap.exposureQuantity}</strong>
                    </div>
                    <div>
                      <span>Paid Qty</span>
                      <strong>{gap.paidQuantity ?? 0}</strong>
                    </div>
                    <div>
                      <span>Summary Qty</span>
                      <strong>{gap.summaryQuantity}</strong>
                    </div>
                  </div>
                  <div className="audit-gap-card-footer">
                    <span>Est. Unit Price: {formatCurrency(gap.unitPrice ?? 0)}</span>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Eye size={12} color="#38bdf8" /> Impact: {formatCurrency(gap.estimatedValue ?? 0)}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="audit-section audit-support-grid">
        <div>
          <div className="audit-section-header">
            <div>
              <span className="audit-eyebrow">Void and cancellation</span>
              <h3>Retained evidence</h3>
            </div>
            <span className="badge badge-amber">{audit.voidEvidence.length} events</span>
          </div>
          <div className="audit-gap-list">
            {audit.voidEvidence.length === 0 ? (
              <div className="glass-panel audit-empty-row">
                <ReceiptText size={18} />
                <span>No void production evidence before the verifying summary.</span>
              </div>
            ) : audit.voidEvidence.map(event => (
              <div
                key={event.id}
                className="glass-panel audit-gap"
                onClick={() => handleOpenCaptureModal(event.sourceCaptureId)}
                style={{ cursor: 'pointer' }}
                title="Click to view raw evidence modal"
              >
                <strong>{event.posOrderNumber || 'Untracked order'}</strong>
                <span>{formatDateTime(event.capturedAt)} · {event.rawFileName}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="audit-section-header">
            <div>
              <span className="audit-eyebrow">Complimentary</span>
              <h3>Excluded from paid-sales reconciliation</h3>
            </div>
            <span className="badge badge-cyan">{audit.complimentaryEvidence.length} events</span>
          </div>
          <div className="audit-gap-list">
            {audit.complimentaryEvidence.length === 0 ? (
              <div className="glass-panel audit-empty-row">
                <ReceiptText size={18} />
                <span>No complimentary activity before the verifying summary.</span>
              </div>
            ) : audit.complimentaryEvidence.map(event => (
              <div
                key={event.id}
                className="glass-panel audit-gap"
                onClick={() => handleOpenCaptureModal(event.sourceCaptureId)}
                style={{ cursor: 'pointer' }}
                title="Click to view raw evidence modal"
              >
                <strong>{event.posOrderNumber || 'Untracked order'}</strong>
                <span>{formatDateTime(event.capturedAt)} · {event.rawFileName}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="audit-section">
        <div className="audit-section-header">
          <div>
            <span className="audit-eyebrow">Verifying summary</span>
            <h3>Snapshot delivery history</h3>
          </div>
          <span className="badge badge-cyan">
            {audit.verifyingSummary ? `${audit.verifyingSummary.uniquePayloadCount} unique payload(s)` : 'No summary'}
          </span>
        </div>
        {!audit.verifyingSummary ? (
          <div className="glass-panel audit-empty-row">
            <ReceiptText size={18} />
            <span>No Daily Sales Summary Snapshot deliveries were captured for this Operational Date.</span>
          </div>
        ) : (
          <div className="audit-gap-list">
            {audit.verifyingSummary.deliveries.map(delivery => (
              <div
                key={delivery.sourceCaptureId}
                className="glass-panel audit-gap"
                onClick={() => handleOpenCaptureModal(delivery.sourceCaptureId)}
                style={{ cursor: 'pointer' }}
                title="Click to view raw summary payload modal"
              >
                <strong>{formatDateTime(delivery.capturedAt)} · {delivery.rawFileName}</strong>
                <span>{delivery.isDuplicateDelivery ? `duplicate of ${delivery.duplicateOfId}` : 'unique payload'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="audit-section">
        <div className="audit-section-header">
          <div>
            <span className="audit-eyebrow">Evidence</span>
            <h3>Order timelines</h3>
          </div>
          <span className="badge badge-cyan">{audit.orderTimelines.length} orders</span>
        </div>
        <div className="audit-timeline-list">
          {audit.orderTimelines.map(order => (
            <details key={order.orderKey} className="glass-panel audit-timeline">
              <summary>
                <span>{order.posOrderNumber}</span>
                <span>{order.exposures.length} products</span>
                <ChevronDown size={16} />
              </summary>
              <div className="audit-timeline-body">
                {order.events.map(event => (
                  <div
                    key={event.id}
                    className="audit-event-row"
                    onClick={() => handleOpenCaptureModal(event.sourceCaptureId)}
                    style={{ cursor: 'pointer' }}
                    title="Click to view raw ESC/POS evidence modal"
                  >
                    <span>{formatDateTime(event.capturedAt)}</span>
                    <strong>{event.eventKind.replace(/_/g, ' ')}</strong>
                    <em>{event.rawFileName}</em>
                    <small>{event.rawEvidence.sha256}</small>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Raw ESC/POS Evidence Inspection Modal */}
      {modalTargetCapture && (
        <RawEvidenceModal
          capture={modalTargetCapture}
          relatedCaptures={modalRelatedCaptures}
          onClose={() => setModalTargetCapture(null)}
        />
      )}
    </main>
  );
};
