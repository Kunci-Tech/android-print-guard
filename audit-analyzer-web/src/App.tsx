import { useCallback, useState } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { DailyAuditWorkspace } from './components/DailyAuditWorkspace';
import { parseAuditZipArchive } from './utils/zipParser';
import type { ParsedAuditArchive } from './types/audit';

export function App() {
  const [currentArchive, setCurrentArchive] = useState<ParsedAuditArchive | null>(null);
  const [selectedOperationalDate, setSelectedOperationalDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const applyArchive = useCallback((archive: ParsedAuditArchive) => {
    setCurrentArchive(archive);
    setSelectedOperationalDate(archive.auditModel.defaultOperationalDate ?? archive.auditModel.availableOperationalDates[0] ?? '');
  }, []);

  const loadPresetSampleBackup = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/sample_backup.zip');
      if (!response.ok) {
        throw new Error(`Failed to fetch preset sample backup (HTTP ${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const parsed = await parseAuditZipArchive(buffer, 'backup_20260826_205024.zip');
      applyArchive(parsed);
    } catch (err) {
      console.error('Error loading preset sample backup', err);
    } finally {
      setIsLoading(false);
    }
  }, [applyArchive]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setIsLoading(true);
    try {
      const parsed = await parseAuditZipArchive(file, file.name);
      applyArchive(parsed);
    } catch (err) {
      console.error('Failed to parse uploaded backup file', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="audit-app-shell">
      <div className="audit-page">
        <Header
          currentArchive={currentArchive}
          onFileUpload={handleFileUpload}
          onLoadSampleData={loadPresetSampleBackup}
          isLoading={isLoading}
        />

        {currentArchive && selectedOperationalDate ? (
          <DailyAuditWorkspace
            archive={currentArchive}
            selectedDate={selectedOperationalDate}
            onSelectedDateChange={setSelectedOperationalDate}
          />
        ) : (
          <FileUpload
            onArchiveParsed={applyArchive}
            onLoadSampleData={loadPresetSampleBackup}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}

export default App;
