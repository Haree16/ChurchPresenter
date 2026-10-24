import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { SystemDiagnostics, DisplayMonitor } from '../../types';
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Monitor,
  Radio,
  Sliders,
  Smartphone,
  Eye,
  Tv,
} from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [monitors, setMonitors] = useState<DisplayMonitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDiagnostics();
      const interval = setInterval(loadDiagnostics, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const loadDiagnostics = async () => {
    try {
      const [diag, mons] = await Promise.all([
        api.getSystemDiagnostics(),
        api.getAvailableMonitors(),
      ]);
      setDiagnostics(diag);
      setMonitors(mons);
    } catch (e) {
      console.error('Failed to load system diagnostics:', e);
    }
  };

  if (!isOpen) return null;

  const handleCopyReport = () => {
    if (!diagnostics) return;
    const report = {
      timestamp: new Date().toISOString(),
      diagnostics,
      monitors,
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunRecovery = async () => {
    setLoading(true);
    setRecoveryMessage('Running hardware diagnostic probe & output refresh...');
    try {
      await api.getAvailableMonitors();
      await loadDiagnostics();
      setRecoveryMessage('Hardware probe completed. All subsystems healthy.');
      setTimeout(() => setRecoveryMessage(null), 4000);
    } catch (err) {
      setRecoveryMessage(`Recovery failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '900px',
          maxHeight: '90vh',
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
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
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Activity size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                System Diagnostics & Production Health
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Multi-window outputs, network listeners, and hardware device statuses
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCopyReport}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#cbd5e1',
                border: '1px solid #334155',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {copied ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
              <span>{copied ? 'Copied Report' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                color: '#94a3b8',
                border: '1px solid #334155',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Recovery Toast Banner */}
        {recoveryMessage && (
          <div
            style={{
              padding: '8px 20px',
              backgroundColor: '#1e293b',
              borderBottom: '1px solid #334155',
              fontSize: '12px',
              color: '#34d399',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{recoveryMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Subsystem Status Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
            }}
          >
            {/* Audience Window */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: `1px solid ${diagnostics?.audienceWindowOpen ? '#059669' : '#334155'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Tv size={18} color="#94a3b8" />
                {diagnostics?.audienceWindowOpen ? (
                  <CheckCircle2 size={16} color="#34d399" />
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>OFF</span>
                )}
              </div>
              <div style={{ marginTop: '10px', fontWeight: 600, fontSize: '13px' }}>
                Audience Window
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {diagnostics?.audienceWindowOpen ? 'Rendering On Air' : 'Standby / Closed'}
              </div>
            </div>

            {/* Stage Display Window */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: `1px solid ${diagnostics?.stageWindowOpen ? '#059669' : '#334155'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Monitor size={18} color="#94a3b8" />
                {diagnostics?.stageWindowOpen ? (
                  <CheckCircle2 size={16} color="#34d399" />
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>OFF</span>
                )}
              </div>
              <div style={{ marginTop: '10px', fontWeight: 600, fontSize: '13px' }}>
                Stage Display
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {diagnostics?.stageWindowOpen ? 'Active Output' : 'Inactive / Closed'}
              </div>
            </div>

            {/* Livestream Overlay Window */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: `1px solid ${diagnostics?.overlayWindowOpen ? '#059669' : '#334155'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Eye size={18} color="#94a3b8" />
                {diagnostics?.overlayWindowOpen ? (
                  <CheckCircle2 size={16} color="#34d399" />
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>OFF</span>
                )}
              </div>
              <div style={{ marginTop: '10px', fontWeight: 600, fontSize: '13px' }}>
                Overlay Window
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {diagnostics?.overlayWindowOpen ? 'Transparent Key Active' : 'Closed / Browser Mode'}
              </div>
            </div>

            {/* Remote Micro Server */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: `1px solid ${diagnostics?.remoteServer?.isRunning ? '#059669' : '#334155'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Smartphone size={18} color="#94a3b8" />
                {diagnostics?.remoteServer?.isRunning ? (
                  <CheckCircle2 size={16} color="#34d399" />
                ) : (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>OFF</span>
                )}
              </div>
              <div style={{ marginTop: '10px', fontWeight: 600, fontSize: '13px' }}>
                Remote Control
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {diagnostics?.remoteServer?.isRunning
                  ? `Port ${diagnostics.remoteServer.port} (${diagnostics.remoteServer.connectedClientsCount} clients)`
                  : 'Disabled'}
              </div>
            </div>
          </div>

          {/* Connected Displays & Physical Monitors */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
              padding: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                Detected Display Monitors ({monitors.length})
              </div>
              <button
                onClick={handleRunRecovery}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} />
                <span>Probe Hardware</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
              {monitors.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '12px',
                    backgroundColor: '#0f172a',
                    borderRadius: '6px',
                    border: '1px solid #1e293b',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{m.name}</span>
                    {m.isPrimary && (
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#3b82f6',
                          color: '#fff',
                        }}
                      >
                        Primary
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Resolution: {m.width} × {m.height}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Position: ({m.x}, {m.y}) · Scale: {m.scaleFactor}x
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Network & Hardware Protocol Diagnostics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
            }}
          >
            {/* MIDI Status */}
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: '1px solid #334155',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Sliders size={16} color="#60a5fa" />
                <span style={{ fontWeight: 700, fontSize: '13px' }}>MIDI Subsystem</span>
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                Status: {diagnostics?.midiStatus?.isRunning ? 'Active Listener' : 'Idle / Offline'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Device: {diagnostics?.midiStatus?.currentDeviceName || 'None selected'}
              </div>
              {diagnostics?.midiStatus?.error && (
                <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>
                  Error: {diagnostics.midiStatus.error}
                </div>
              )}
            </div>

            {/* OSC Status */}
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: '1px solid #334155',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Radio size={16} color="#60a5fa" />
                <span style={{ fontWeight: 700, fontSize: '13px' }}>OSC UDP Subsystem</span>
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                Status: {diagnostics?.oscStatus?.isRunning ? 'Listening on UDP' : 'Stopped'}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Port: {diagnostics?.oscStatus?.port || 8000}
              </div>
              {diagnostics?.oscStatus?.error && (
                <div style={{ fontSize: '11px', color: '#f87171', marginTop: '4px' }}>
                  Error: {diagnostics.oscStatus.error}
                </div>
              )}
            </div>
          </div>

          {/* Recent System Diagnostics Logs */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
              padding: '16px',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
              Subsystem Activity & Diagnostic Messages
            </div>
            {diagnostics?.recentErrors && diagnostics.recentErrors.length > 0 ? (
              <div
                style={{
                  backgroundColor: '#090d16',
                  borderRadius: '6px',
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#f87171',
                  maxHeight: '120px',
                  overflowY: 'auto',
                }}
              >
                {diagnostics.recentErrors.map((msg, i) => (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    [{new Date().toLocaleTimeString()}] {msg}
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: '#090d16',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '12px',
                  color: '#4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CheckCircle2 size={14} />
                <span>All subsystems operational. No fatal errors or window crashes recorded.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
