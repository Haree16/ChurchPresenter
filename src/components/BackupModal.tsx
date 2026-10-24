import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Database,
} from 'lucide-react';
import { BackupData } from '../types';
import { api } from '../services/api';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataRestored: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onDataRestored,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Import state
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setExportStatus(null);

      const backup = await api.exportBackup();

      // Convert to downloadable JSON blob
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `church-presenter-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportStatus(
        `Successfully exported ${backup.presentations.length} presentation(s) and ${backup.slides.length} slide(s).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setImportStatus(null);
    setParsedBackup(null);
    setConfirmOverwrite(false);

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text) as BackupData;

        // Strict schema validation
        if (!json.version || !Array.isArray(json.presentations) || !Array.isArray(json.slides)) {
          throw new Error(
            'Invalid backup format: The file is missing mandatory version, presentations, or slides arrays.'
          );
        }

        // Validate presentation objects
        for (const p of json.presentations) {
          if (!p.id || !p.title) {
            throw new Error(
              `Invalid presentation record: Missing id or title on item ${JSON.stringify(p)}`
            );
          }
        }

        // Validate slide objects
        for (const s of json.slides) {
          if (!s.id || !s.presentationId || typeof s.body !== 'string') {
            throw new Error(
              `Invalid slide record: Missing id, presentationId, or body text on item ${JSON.stringify(
                s
              )}`
            );
          }
        }

        setParsedBackup(json);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to parse JSON backup file';
        setErrorMessage(msg);
      }
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected file from disk.');
    };
    reader.readAsText(file);
  };

  const handlePerformRestore = async () => {
    if (!parsedBackup) return;

    if (importMode === 'overwrite' && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage(null);
      setImportStatus(null);

      const result = await api.importBackup(parsedBackup, importMode);

      setImportStatus(
        `Restore completed successfully! Processed ${result.presentationsImported} presentation(s) and ${result.slidesImported} slide(s).`
      );
      setParsedBackup(null);
      setConfirmOverwrite(false);
      onDataRestored();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Restore operation failed';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '580px',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} color="#3b82f6" />
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
              Data Protection, Backup & Restore
            </span>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
          <button
            onClick={() => setActiveTab('export')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: activeTab === 'export' ? '#1e293b' : '#0f172a',
              color: activeTab === 'export' ? '#3b82f6' : '#94a3b8',
              borderBottom: activeTab === 'export' ? '2px solid #3b82f6' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Download size={15} />
            <span>Export Backup</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: activeTab === 'import' ? '#1e293b' : '#0f172a',
              color: activeTab === 'import' ? '#3b82f6' : '#94a3b8',
              borderBottom: activeTab === 'import' ? '2px solid #3b82f6' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Upload size={15} />
            <span>Restore Backup</span>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMessage && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {activeTab === 'export' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
                Export your entire library of worship songs, scriptures, sermons, and slide formatting
                to a portable JSON backup file. No internet connection is needed.
              </div>

              {exportStatus && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    color: '#6ee7b7',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{exportStatus}</span>
                </div>
              )}

              <button
                onClick={handleExport}
                disabled={isProcessing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginTop: '8px',
                }}
              >
                {isProcessing ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                <span>Generate & Download Backup File</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
                Select a previously exported <code>.json</code> backup file to restore. Data will be
                validated before any modifications occur.
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: '2px dashed #475569',
                  backgroundColor: '#1e293b',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Upload size={22} color="#94a3b8" />
                <span>Click to browse and choose a backup file</span>
              </button>

              {parsedBackup && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid #3b82f6',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileCheck size={18} color="#60a5fa" />
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                      Backup File Validated
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                    • Version: <strong>{parsedBackup.version}</strong>
                    <br />
                    • Presentations found: <strong>{parsedBackup.presentations.length}</strong>
                    <br />• Slides found: <strong>{parsedBackup.slides.length}</strong>
                  </div>

                  {/* Mode Selector */}
                  <div style={{ marginTop: '4px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#94a3b8',
                        marginBottom: '6px',
                      }}
                    >
                      Restore Mode:
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'merge'}
                          onChange={() => {
                            setImportMode('merge');
                            setConfirmOverwrite(false);
                          }}
                        />
                        <span>Merge (Safe: adds non-duplicate records)</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === 'overwrite'}
                          onChange={() => setImportMode('overwrite')}
                        />
                        <span style={{ color: '#fca5a5' }}>Replace (Overwrites existing data)</span>
                      </label>
                    </div>
                  </div>

                  {confirmOverwrite && (
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid #ef4444',
                        color: '#fca5a5',
                        fontSize: '12px',
                        lineHeight: 1.4,
                      }}
                    >
                      <strong>Are you sure you want to replace all current data?</strong>
                      <br />
                      This action will overwrite current presentations and slides with the contents of
                      the backup file. Click "Confirm & Replace" below to proceed.
                    </div>
                  )}

                  <button
                    onClick={handlePerformRestore}
                    disabled={isProcessing}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      backgroundColor:
                        importMode === 'overwrite' ? '#dc2626' : '#2563eb',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {isProcessing ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    <span>
                      {confirmOverwrite
                        ? 'Confirm & Replace All Data'
                        : importMode === 'overwrite'
                        ? 'Proceed with Overwrite...'
                        : 'Restore and Merge Data'}
                    </span>
                  </button>
                </div>
              )}

              {importStatus && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid #10b981',
                    color: '#6ee7b7',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>{importStatus}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#090d16',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              fontSize: '12px',
              border: '1px solid #334155',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
