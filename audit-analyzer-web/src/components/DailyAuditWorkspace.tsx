import React from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileSearch,
  ReceiptText,
  ShieldAlert,
  TrendingDown
} from 'lucide-react';
import type { DailyPrintAudit, ParsedAuditArchive } from '../types/audit';

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
            <strong>{audit.summaryComparison.productionExposureQuantity}</strong>
          </div>
          <div>
            <span>POS paid quantity</span>
            <strong>{audit.summaryComparison.paidQuantity}</strong>
          </div>
          <div>
            <span>Summary quantity</span>
            <strong>{audit.summaryComparison.summaryQuantity}</strong>
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

      <section className="audit-section">
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
              <article key={finding.id} className="glass-panel audit-finding">
                <div>
                  <span className="badge badge-rose"><TrendingDown size={13} /> Reduction</span>
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
                    <dd>{formatCurrency(finding.estimatedValue)}</dd>
                  </div>
                </dl>
              </article>
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
              <div key={event.id} className="glass-panel audit-gap">
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
              <div key={event.id} className="glass-panel audit-gap">
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
              <div key={delivery.sourceCaptureId} className="glass-panel audit-gap">
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
            <span className="audit-eyebrow">Coverage</span>
            <h3>Print coverage gaps</h3>
          </div>
          <span className="badge badge-amber">{audit.printCoverageGaps.length} gaps</span>
        </div>
        {audit.printCoverageGaps.length === 0 ? (
          <div className="glass-panel audit-empty-row">
            <ReceiptText size={18} />
            <span>Captured final-bill evidence covers the reconstructed production orders.</span>
          </div>
        ) : (
          <div className="audit-gap-list">
            {audit.printCoverageGaps.map(gap => (
              <div key={gap.id} className="glass-panel audit-gap">
                <strong>{gap.normalizedProduct}</strong>
                <span>{gap.reason.replace(/_/g, ' ').toLowerCase()}</span>
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
                  <div key={event.id} className="audit-event-row">
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
    </main>
  );
};
