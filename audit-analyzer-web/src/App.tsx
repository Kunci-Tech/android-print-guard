import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SynthesisSummaryBanner } from './components/SynthesisSummaryBanner';
import { FileUpload } from './components/FileUpload';
import { AutoGrabConfig } from './components/AutoGrabConfig';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { SecurityAuditLogs } from './components/SecurityAuditLogs';
import { ReceiptInspector } from './components/ReceiptInspector';
import { ItemSalesAudit } from './components/ItemSalesAudit';
import { OrderMasterLog } from './components/OrderMasterLog';
import { ReconciliationThreatDashboard } from './components/ReconciliationThreatDashboard';

import { parseAuditZipArchive } from './utils/zipParser';
import type { ParsedAuditArchive } from './types/audit';

export function App() {
  const [activeTab, setActiveTab] = useState<'reconcile' | 'items' | 'orders' | 'analytics' | 'receipts' | 'audit' | 'autograb' | 'upload'>('reconcile');
  const [synthesisEnabled] = useState<boolean>(true);
  const [currentArchive, setCurrentArchive] = useState<ParsedAuditArchive | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [autoGrabStatus, setAutoGrabStatus] = useState<string>('IDLE');

  // Auto-load preset backup_20260826_205024.zip on initial launch if available
  useEffect(() => {
    loadPresetSampleBackup();
  }, []);

  const loadPresetSampleBackup = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/sample_backup.zip');
      if (!response.ok) {
        throw new Error(`Failed to fetch preset sample backup (HTTP ${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const parsed = await parseAuditZipArchive(buffer, 'backup_20260826_205024.zip');
      setCurrentArchive(parsed);
      setActiveTab('reconcile');
    } catch (err) {
      console.error('Error loading preset sample backup', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsLoading(true);
    try {
      const parsed = await parseAuditZipArchive(file, file.name);
      setCurrentArchive(parsed);
      setActiveTab('reconcile');
    } catch (err) {
      console.error('Failed to parse uploaded backup file', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchiveLoaded = (archive: ParsedAuditArchive) => {
    setCurrentArchive(archive);
    setActiveTab('reconcile');
  };

  const pinFailedCount = currentArchive 
    ? currentArchive.auditEvents.filter(e => e.event_type.includes('PIN_FAIL')).length 
    : 0;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Container */}
      <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '0 24px 40px 24px' }}>
        
        {/* Navigation Header */}
        <Header 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentArchive={currentArchive}
          onFileUpload={handleFileUpload}
          onLoadSampleData={loadPresetSampleBackup}
          isLoading={isLoading}
          autoGrabStatus={autoGrabStatus}
        />

        {/* Upload View Tab */}
        {activeTab === 'upload' && (
          <FileUpload 
            onArchiveParsed={handleArchiveLoaded}
            onLoadSampleData={loadPresetSampleBackup}
            isLoading={isLoading}
          />
        )}

        {/* Active Archive View */}
        {currentArchive && activeTab !== 'upload' && (
          <>
            {/* Synthesizer Banner */}
            <SynthesisSummaryBanner 
              metrics={currentArchive.metrics}
              synthesisEnabled={synthesisEnabled}
            />

            {/* Tab Views */}
            {activeTab === 'reconcile' && (
              <ReconciliationThreatDashboard 
                reconciliation={currentArchive.reconciliation}
                fileName={currentArchive.fileName}
              />
            )}

            {activeTab === 'items' && (
              <ItemSalesAudit 
                items={currentArchive.itemSalesSummary}
                fileName={currentArchive.fileName}
              />
            )}

            {activeTab === 'orders' && (
              <OrderMasterLog 
                groups={currentArchive.transactionGroups}
                fileName={currentArchive.fileName}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsDashboard 
                metrics={currentArchive.metrics}
                synthesisEnabled={synthesisEnabled}
                totalAuditEvents={currentArchive.auditEvents.length}
                pinFailedCount={pinFailedCount}
              />
            )}

            {activeTab === 'receipts' && (
              <ReceiptInspector 
                captures={currentArchive.synthesizedCaptures}
                synthesisEnabled={synthesisEnabled}
              />
            )}

            {activeTab === 'audit' && (
              <SecurityAuditLogs 
                events={currentArchive.auditEvents}
              />
            )}

            {activeTab === 'autograb' && (
              <AutoGrabConfig 
                onArchiveGrabbed={handleArchiveLoaded}
                autoGrabStatus={autoGrabStatus}
                setAutoGrabStatus={setAutoGrabStatus}
              />
            )}
          </>
        )}

      </div>

    </div>
  );
}

export default App;
