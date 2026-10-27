import React, { useState, useEffect } from 'react';
import {
  X,
  Settings as SettingsIcon,
  HardDrive,
  ShieldCheck,
  Activity,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Info,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import { api } from '../../services/api';
import { LogoSettingsCard } from './LogoSettingsCard';
import { StageLayoutEditor } from '../Stage/StageLayoutEditor';
import { AppInfo, AppDiagnosticEntry, AppDiagnosticFilter } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBackupModal?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenBackupModal,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'storage' | 'diagnostics' | 'maintenance'>('general');
  const [isStageLayoutOpen, setIsStageLayoutOpen] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [diagnostics, setDiagnostics] = useState<AppDiagnosticEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterComponent, setFilterComponent] = useState<string>('ALL');
  const [copiedDb, setCopiedDb] = useState(false);
  const [copiedMedia, setCopiedMedia] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const info = await api.getAppInfo();
      setAppInfo(info);
      setIntegrityStatus(info.databaseIntegrity ? 'Healthy (Verified ok)' : 'Warning / Needs Attention');
    } catch {
      // Fallback
    }

    try {
      const filter: AppDiagnosticFilter = {
        level: filterLevel === 'ALL' ? null : filterLevel,
        component: filterComponent === 'ALL' ? null : filterComponent,
        limit: 100,
      };
      const logs = await api.getDiagnosticsLog(filter);
      setDiagnostics(logs);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, filterLevel, filterComponent]);

  if (!isOpen) return null;

  const handleVerifyIntegrity = async () => {
    setIsVerifying(true);
    try {
      const results = await api.verifyDatabaseIntegrity();
      const isOk = results.length === 1 && results[0] === 'ok';
      setIntegrityStatus(isOk ? 'Healthy (Verified ok)' : `Integrity notes: ${results.join(', ')}`);
      await api.logClientDiagnostic(
        isOk ? 'INFO' : 'WARN',
        'Database',
        `Manual PRAGMA integrity_check performed: ${results.join(', ')}`
      );
    } catch (e: any) {
      setIntegrityStatus(`Verification error: ${e.message || String(e)}`);
    } finally {
      setIsVerifying(false);
      loadData();
    }
  };

  const handleClearLogs = async () => {
    if (window.confirm('Clear all diagnostic logs? This will not affect presentations, songs, or service data.')) {
      await api.clearDiagnosticsLog();
      await api.logClientDiagnostic('INFO', 'Application', 'Diagnostic logs cleared by operator');
      loadData();
    }
  };

  const handleResetActionMappings = async () => {
    if (window.confirm('Reset all keyboard shortcut action mappings to standard defaults?')) {
      await api.resetActionMappingsToDefault();
      setResetMessage('Action mappings have been reset to factory defaults.');
      setTimeout(() => setResetMessage(null), 4000);
    }
  };

  const copyToClipboard = (text: string, type: 'db' | 'media') => {
    navigator.clipboard.writeText(text);
    if (type === 'db') {
      setCopiedDb(true);
      setTimeout(() => setCopiedDb(false), 2000);
    } else {
      setCopiedMedia(true);
      setTimeout(() => setCopiedMedia(false), 2000);
    }
  };

  return (
    <div
      data-testid="settings-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '90vh',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#090d16',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <SettingsIcon size={20} color="#60a5fa" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', color: '#f8fafc' }}>
                Application Settings & Diagnostics
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Church Presenter v{appInfo?.version || '1.0.0'} • Release Engineering & Reliability
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#0b1120',
            padding: '0 16px',
            gap: '8px',
          }}
        >
          {[
            { id: 'general', label: 'General & About', icon: Info },
            { id: 'storage', label: 'Storage & Database', icon: HardDrive },
            { id: 'diagnostics', label: 'Diagnostic Logs', icon: Activity },
            { id: 'maintenance', label: 'Safety & Reset', icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  border: 'none',
                  borderBottom: isSelected ? '2px solid #3b82f6' : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color: isSelected ? '#60a5fa' : '#94a3b8',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, color: '#e2e8f0', fontSize: '13px' }}>
          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    Application
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                    {appInfo?.name || 'Church Presenter'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    Release Version
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                    v{appInfo?.version || '1.0.0'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    Target Platform
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                    {appInfo?.targetOs === 'windows' ? 'Windows 10/11' : 'Linux Desktop (Arch / EndeavourOS / Ubuntu)'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                    Build Mode
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#a78bfa', marginTop: '2px' }}>
                    {appInfo?.buildProfile?.toUpperCase() || 'RELEASE'}
                  </div>
                </div>
              </div>

              {/* Offline-First Guarantee */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid #22c55e',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <ShieldCheck size={20} color="#4ade80" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#4ade80', fontSize: '14px' }}>
                    100% Offline-First Live Presentation Guarantee
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.5 }}>
                    All presentations, worship songs, Bible scriptures, playlists, motion video backgrounds, and timers execute locally from your machine without requiring an active internet connection.
                  </div>
                </div>
              </div>

              {/* Statistics Overview */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                }}
              >
                <div style={{ padding: '14px', backgroundColor: '#1e293b', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#60a5fa' }}>
                    {appInfo?.totalServices || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Saved Services</div>
                </div>
                <div style={{ padding: '14px', backgroundColor: '#1e293b', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#38bdf8' }}>
                    {appInfo?.totalSongs || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Worship Songs</div>
                </div>
                <div style={{ padding: '14px', backgroundColor: '#1e293b', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#a78bfa' }}>
                    {appInfo?.totalMedia || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Media Assets</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STORAGE & DATABASE */}
          {activeTab === 'general' && (
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <LogoSettingsCard />
              <div
                data-testid="stage-layout-card"
                style={{ padding: '16px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}
              >
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>Stage display layout</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Choose which panels the stage monitor shows (current and next slide, clock, timer, messages) and where.
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="open-stage-layout"
                  onClick={() => setIsStageLayoutOpen(true)}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f8fafc', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Edit layout…
                </button>
              </div>
            </div>
          )}
          <StageLayoutEditor isOpen={isStageLayoutOpen} onClose={() => setIsStageLayoutOpen(false)} />

          {activeTab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* SQLite Location */}
              <div style={{ padding: '14px', backgroundColor: '#1e293b', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>SQLite Database File</div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(appInfo?.databasePath || '', 'db')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#334155',
                      border: 'none',
                      color: '#cbd5e1',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedDb ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
                    <span>{copiedDb ? 'Copied' : 'Copy Path'}</span>
                  </button>
                </div>
                <div
                  style={{
                    backgroundColor: '#090d16',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    marginTop: '8px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#93c5fd',
                    wordBreak: 'break-all',
                  }}
                >
                  {appInfo?.databasePath || 'Resolving...'}
                </div>
              </div>

              {/* Media Directory */}
              <div style={{ padding: '14px', backgroundColor: '#1e293b', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>Media Assets Directory</div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(appInfo?.mediaDir || '', 'media')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#334155',
                      border: 'none',
                      color: '#cbd5e1',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedMedia ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
                    <span>{copiedMedia ? 'Copied' : 'Copy Path'}</span>
                  </button>
                </div>
                <div
                  style={{
                    backgroundColor: '#090d16',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    marginTop: '8px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#93c5fd',
                    wordBreak: 'break-all',
                  }}
                >
                  {appInfo?.mediaDir || 'Resolving...'}
                </div>
              </div>

              {/* Database Integrity Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>Database Integrity Status</div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: integrityStatus?.includes('Healthy') ? '#4ade80' : '#f87171',
                      fontWeight: 600,
                      marginTop: '4px',
                    }}
                  >
                    {integrityStatus || 'Checking...'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Runs PRAGMA integrity_check to verify zero corruption in B-tree, table pages, and foreign keys.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleVerifyIntegrity}
                  disabled={isVerifying}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#2563eb',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: isVerifying ? 'wait' : 'pointer',
                  }}
                >
                  <RefreshCw size={14} className={isVerifying ? 'animate-spin' : ''} />
                  <span>{isVerifying ? 'Verifying...' : 'Check Now'}</span>
                </button>
              </div>

              {/* Pre-Migration Automatic Safety Snapshots Info */}
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#090d16',
                  borderRadius: '6px',
                  border: '1px solid #1e293b',
                  fontSize: '12px',
                  color: '#94a3b8',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#e2e8f0' }}>Automatic Upgrade Safety:</strong> Before every schema upgrade or restore, a timestamped snapshot (<code style={{ color: '#38bdf8' }}>.pre-migration-v*.bak</code>) is created automatically in the database directory. The 5 most recent snapshots are automatically retained.
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTIC LOGS */}
          {activeTab === 'diagnostics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>Level:</label>
                  <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value)}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '12px',
                    }}
                  >
                    <option value="ALL">All Levels</option>
                    <option value="INFO">INFO</option>
                    <option value="WARN">WARN</option>
                    <option value="ERROR">ERROR</option>
                  </select>

                  <label style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '8px' }}>Component:</label>
                  <select
                    value={filterComponent}
                    onChange={(e) => setFilterComponent(e.target.value)}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '12px',
                    }}
                  >
                    <option value="ALL">All Components</option>
                    <option value="Database">Database</option>
                    <option value="DisplayManager">DisplayManager</option>
                    <option value="MediaEngine">MediaEngine</option>
                    <option value="AudienceView">AudienceView</option>
                    <option value="OperatorView">OperatorView</option>
                    <option value="MidiService">MidiService</option>
                    <option value="OscService">OscService</option>
                    <option value="RemoteServer">RemoteServer</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={loadData}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#cbd5e1',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => api.openDevtools()}
                    title="Open Live Web Inspector & Console"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid #3b82f6',
                      color: '#60a5fa',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <Terminal size={13} />
                    <span>Open Web Inspector</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearLogs}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: '#7f1d1d',
                      border: 'none',
                      color: '#fca5a5',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Clear Logs</span>
                  </button>
                </div>
              </div>

              {/* Logs Table */}
              <div
                style={{
                  backgroundColor: '#090d16',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  maxHeight: '360px',
                  overflowY: 'auto',
                }}
              >
                {diagnostics.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    No diagnostic entries matching current filter.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Timestamp</th>
                        <th style={{ padding: '8px 12px' }}>Level</th>
                        <th style={{ padding: '8px 12px' }}>Component</th>
                        <th style={{ padding: '8px 12px' }}>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostics.map((log) => {
                        const levelColor =
                          log.level === 'ERROR' || log.level === 'FATAL'
                            ? '#f87171'
                            : log.level === 'WARN'
                            ? '#fbbf24'
                            : '#60a5fa';
                        const levelBg =
                          log.level === 'ERROR' || log.level === 'FATAL'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : log.level === 'WARN'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(59, 130, 246, 0.15)';

                        return (
                          <tr key={log.id} style={{ borderBottom: '1px solid #141f33' }}>
                            <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span
                                style={{
                                  backgroundColor: levelBg,
                                  color: levelColor,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 700,
                                  fontSize: '10px',
                                }}
                              >
                                {log.level}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#93c5fd', fontWeight: 600 }}>
                              {log.component}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>
                              <div>{log.message}</div>
                              {log.details && (
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>
                                  {log.details}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: SAFETY & RESET */}
          {activeTab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {resetMessage && (
                <div style={{ padding: '10px 14px', backgroundColor: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#4ade80', borderRadius: '6px' }}>
                  {resetMessage}
                </div>
              )}

              {/* Data Safety Notice */}
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid #3b82f6',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <ShieldCheck size={22} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#93c5fd', fontSize: '14px' }}>
                    Zero Data Loss Guarantee
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px', lineHeight: 1.5 }}>
                    Upgrading Church Presenter, verifying database integrity, or resetting shortcuts never deletes or resets your worship songs, services, or presentations.
                  </div>
                </div>
              </div>

              {/* Reset Shortcuts Action */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>Reset Keyboard Shortcut Mappings</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Restores default keyboard shortcuts (Space / Right Arrow = Next Slide, B = Blackout, etc.) without altering any presentations or songs.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetActionMappings}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#334155',
                    border: '1px solid #475569',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Reset Shortcuts</span>
                </button>
              </div>

              {/* System Backup Shortcut */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>Full System Backup & Restore</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Export or import complete church data including songs, themes, service plans, timers, stage display, and media references.
                  </div>
                </div>

                {onOpenBackupModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenBackupModal();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      color: '#ffffff',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <HardDrive size={14} />
                    <span>Open Backup Manager</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: '#090d16',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#334155',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
