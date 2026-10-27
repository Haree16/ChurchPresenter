import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Database } from 'lucide-react';
import { DatabaseHealth } from '../types';
import { api } from '../services/api';

interface DatabaseRecoveryModalProps {
  health: DatabaseHealth;
  onRecovered: () => void;
}

export const DatabaseRecoveryModal: React.FC<DatabaseRecoveryModalProps> = ({
  health,
  onRecovered,
}) => {
  const [selectedBackup, setSelectedBackup] = useState<string>(
    health.availableBackups[0] || ''
  );
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRestore = async () => {
    setIsRecovering(true);
    setErrorMsg(null);
    try {
      await api.recoverDatabaseFromBackup(selectedBackup || null);
      onRecovered();
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to restore database from backup'
      );
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <div
      data-testid="database-recovery-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #ef4444',
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#450a0a',
            borderBottom: '1px solid #7f1d1d',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fef2f2', margin: 0 }}>
              Database Integrity Alert
            </h2>
            <p style={{ fontSize: '11px', color: '#fca5a5', margin: '2px 0 0 0' }}>
              Database file could not be verified or opened cleanly
            </p>
          </div>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              fontSize: '12px',
              color: '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>
              Error: {health.error || 'Database file is unreadable or corrupted.'}
            </div>
            <div>
              Target: <code style={{ color: '#38bdf8' }}>{health.dbPath || 'church_presenter.db'}</code>
            </div>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#f8fafc',
                marginBottom: '6px',
              }}
            >
              Select Backup to Restore:
            </label>
            {health.availableBackups.length > 0 ? (
              <select
                value={selectedBackup}
                onChange={(e) => setSelectedBackup(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#020617',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              >
                {health.availableBackups.map((bak) => (
                  <option key={bak} value={bak}>
                    {bak.split('/').pop() || bak}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '12px', color: '#f87171' }}>
                No automatic backups found in app directory.
              </div>
            )}
          </div>

          {errorMsg && (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '12px',
              }}
            >
              {errorMsg}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '10px',
            }}
          >
            <button
              type="button"
              disabled={isRecovering || health.availableBackups.length === 0}
              onClick={handleRestore}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isRecovering ? 0.7 : 1,
              }}
            >
              {isRecovering ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Restoring...</span>
                </>
              ) : (
                <>
                  <Database size={14} />
                  <span>Restore from Backup</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
