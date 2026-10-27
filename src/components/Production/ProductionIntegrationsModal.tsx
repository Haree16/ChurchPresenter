import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { NetworkExposureControl, BindMode } from './NetworkExposureControl';
import {
  RemoteServerStatus,
  RemoteDevice,
  MidiStatus,
  MidiMapping,
  OscConfig,
  OscStatus,
  ActionMapping,
} from '../../types';
import {
  Smartphone,
  Sliders,
  Radio,
  Keyboard,
  RefreshCw,
  Trash2,
  CheckCircle,
  Copy,
  ExternalLink,
  Play,
  Square,
  AlertCircle,
  Check,
  Zap,
} from 'lucide-react';

interface ProductionIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'remote' | 'midi' | 'osc' | 'actions';
}

export const ProductionIntegrationsModal: React.FC<ProductionIntegrationsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'remote',
}) => {
  const [activeTab, setActiveTab] = useState<'remote' | 'midi' | 'osc' | 'actions'>(initialTab);

  // Who may connect to the remote server and OSC listener (applies on next start)
  const [bindMode, setBindMode] = useState<BindMode>('lan');

  // Remote Control state
  const [remoteStatus, setRemoteStatus] = useState<RemoteServerStatus | null>(null);
  const [remoteDevices, setRemoteDevices] = useState<RemoteDevice[]>([]);
  const [remotePort, setRemotePort] = useState<number>(8088);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // MIDI state
  const [midiStatus, setMidiStatus] = useState<MidiStatus | null>(null);
  const [midiMappings, setMidiMappings] = useState<MidiMapping[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string>('');
  const [isAddingMidi, setIsAddingMidi] = useState(false);
  const [newMidiMapping, setNewMidiMapping] = useState<Partial<MidiMapping>>({
    name: 'New MIDI Trigger',
    channel: 0,
    messageType: 'note_on',
    noteOrCc: 60,
    actionType: 'next_slide',
    isEnabled: true,
  });

  // OSC state
  const [oscConfig, setOscConfig] = useState<OscConfig | null>(null);
  const [oscStatus, setOscStatus] = useState<OscStatus | null>(null);
  const [oscPort, setOscPort] = useState<number>(8000);

  // Actions state
  const [actionMappings, setActionMappings] = useState<ActionMapping[]>([]);
  const [actionTestResult, setActionTestResult] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAll();
      const interval = setInterval(refreshLiveMonitors, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rStatus, rDevs, mStatus, mMappings, oCfg, oStatus, aMappings, bMode] =
        await Promise.all([
          api.getRemoteServerStatus(),
          api.listRemoteDevices(),
          api.getMidiStatus(),
          api.listMidiMappings(),
          api.getOscConfig(),
          api.getOscStatus(),
          api.listActionMappings(),
          api.getNetworkBindMode(),
        ]);

      setBindMode(bMode);
      setRemoteStatus(rStatus);
      setRemotePort(rStatus.port || 8088);
      setRemoteDevices(rDevs);

      setMidiStatus(mStatus);
      if (mStatus.currentDeviceName) {
        setSelectedMidiDevice(mStatus.currentDeviceName);
      } else if (mStatus.availableDevices.length > 0) {
        setSelectedMidiDevice(mStatus.availableDevices[0]);
      }
      setMidiMappings(mMappings);

      setOscConfig(oCfg);
      setOscStatus(oStatus);
      setOscPort(oCfg.listenPort || 8000);

      setActionMappings(aMappings);
    } catch (e) {
      console.error('Failed to load integration states:', e);
    } finally {
      setLoading(false);
    }
  };

  const refreshLiveMonitors = async () => {
    try {
      const [mStatus, oStatus, rStatus, rDevs] = await Promise.all([
        api.getMidiStatus(),
        api.getOscStatus(),
        api.getRemoteServerStatus(),
        api.listRemoteDevices(),
      ]);
      setMidiStatus(mStatus);
      setOscStatus(oStatus);
      setRemoteStatus(rStatus);
      setRemoteDevices(rDevs);
    } catch {
      // Ignore background refresh errors
    }
  };

  if (!isOpen) return null;

  const lanIp =
    remoteStatus?.isRunning && remoteStatus.bindAddress === '127.0.0.1'
      ? '127.0.0.1'
      : remoteStatus?.lanIps?.[0] || '127.0.0.1';
  const remoteUrl = `http://${lanIp}:${remotePort}/remote`;

  const handleBindModeChange = async (mode: BindMode) => {
    try {
      setBindMode(await api.setNetworkBindMode(mode));
      setStatusMessage(
        mode === 'local'
          ? 'Remote and OSC will accept connections from this computer only.'
          : 'Remote and OSC will accept connections from your local network.'
      );
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  };

  // Remote Handlers
  const handleToggleRemoteServer = async () => {
    setLoading(true);
    try {
      if (remoteStatus?.isRunning) {
        const res = await api.stopRemoteServer();
        setRemoteStatus(res);
        setStatusMessage('Remote control server stopped.');
      } else {
        const res = await api.startRemoteServer(remotePort);
        setRemoteStatus(res);
        setStatusMessage(`Remote server started on port ${remotePort}`);
      }
      const devs = await api.listRemoteDevices();
      setRemoteDevices(devs);
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDevice = async (id: string, approve: boolean) => {
    try {
      await api.approveRemoteDevice(id, approve);
      const devs = await api.listRemoteDevices();
      setRemoteDevices(devs);
      setStatusMessage(approve ? 'Device approved.' : 'Device revoked.');
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  };

  const handleUpdatePermissions = async (
    id: string,
    nav: boolean,
    blackout: boolean,
    live: boolean,
    timer: boolean
  ) => {
    try {
      await api.updateRemoteDevicePermissions(id, nav, blackout, live, timer);
      const devs = await api.listRemoteDevices();
      setRemoteDevices(devs);
    } catch (err) {
      setStatusMessage(`Error updating permissions: ${err}`);
    }
  };

  const handleDeleteDevice = async (id: string) => {
    try {
      await api.deleteRemoteDevice(id);
      const devs = await api.listRemoteDevices();
      setRemoteDevices(devs);
      setStatusMessage('Device removed.');
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  };

  // MIDI Handlers
  const handleToggleMidi = async () => {
    setLoading(true);
    try {
      if (midiStatus?.isRunning) {
        const res = await api.stopMidiListener();
        setMidiStatus(res);
        setStatusMessage('MIDI listener stopped.');
      } else {
        const res = await api.startMidiListener(selectedMidiDevice || undefined);
        setMidiStatus(res);
        setStatusMessage(`MIDI listener active on ${selectedMidiDevice || 'default'}`);
      }
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMidiMapping = async () => {
    if (!newMidiMapping.name || !newMidiMapping.actionType) return;
    try {
      const created: MidiMapping = {
        id: `midi-map-${Date.now()}`,
        name: newMidiMapping.name,
        channel: newMidiMapping.channel ?? 0,
        messageType: newMidiMapping.messageType || 'note_on',
        noteOrCc: Number(newMidiMapping.noteOrCc) || 0,
        actionType: newMidiMapping.actionType,
        isEnabled: newMidiMapping.isEnabled ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await api.createMidiMapping(created);
      const updated = await api.listMidiMappings();
      setMidiMappings(updated);
      setIsAddingMidi(false);
      setStatusMessage('New MIDI mapping saved.');
    } catch (err) {
      setStatusMessage(`Error creating mapping: ${err}`);
    }
  };

  const handleDeleteMidiMapping = async (id: string) => {
    try {
      await api.deleteMidiMapping(id);
      const updated = await api.listMidiMappings();
      setMidiMappings(updated);
      setStatusMessage('MIDI mapping deleted.');
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  };

  // OSC Handlers
  const handleToggleOsc = async () => {
    setLoading(true);
    try {
      if (oscStatus?.isRunning) {
        const res = await api.stopOscListener();
        setOscStatus(res);
        setStatusMessage('OSC listener stopped.');
      } else {
        const res = await api.startOscListener(oscPort);
        setOscStatus(res);
        setStatusMessage(`OSC listener active on UDP port ${oscPort}`);
      }
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOscPort = async () => {
    if (!oscConfig) return;
    try {
      const updated = await api.updateOscConfig({
        ...oscConfig,
        listenPort: oscPort,
      });
      setOscConfig(updated);
      setStatusMessage(`OSC listening port set to ${oscPort}`);
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  };

  // Action Dispatch Handlers
  const handleTestDispatch = async (action: string) => {
    try {
      await api.dispatchAction(action);
      setActionTestResult(`Triggered '${action}' successfully.`);
      setTimeout(() => setActionTestResult(null), 3000);
    } catch (err) {
      setActionTestResult(`Dispatch error: ${err}`);
    }
  };

  const handleResetActionDefaults = async () => {
    if (confirm('Reset all action shortcuts and dispatch mappings to default?')) {
      try {
        await api.resetActionMappingsToDefault();
        const updated = await api.listActionMappings();
        setActionMappings(updated);
        setStatusMessage('Action mappings reset to system defaults.');
      } catch (err) {
        setStatusMessage(`Error resetting: ${err}`);
      }
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
          width: '940px',
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
                backgroundColor: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                Production Integrations & Remote Control
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Local Mobile Remote, Hardware MIDI, OSC Network & Unified Action Registry
              </div>
            </div>
          </div>
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

        {/* Status Toast Banner */}
        {statusMessage && (
          <div
            style={{
              padding: '8px 20px',
              backgroundColor: '#1e293b',
              borderBottom: '1px solid #334155',
              fontSize: '12px',
              color: '#38bdf8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#090d16',
            borderBottom: '1px solid #1e293b',
            padding: '0 16px',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setActiveTab('remote')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'remote' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'remote' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Smartphone size={16} />
            <span>Mobile Remote Control</span>
            {remoteStatus?.isRunning && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                }}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('midi')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'midi' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'midi' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Sliders size={16} />
            <span>MIDI Controllers</span>
            {midiStatus?.isRunning && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                }}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('osc')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'osc' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'osc' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Radio size={16} />
            <span>OSC Network Control</span>
            {oscStatus?.isRunning && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#22c55e',
                }}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('actions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'actions' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'actions' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Keyboard size={16} />
            <span>Unified Action Map</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* ================= TAB 1: REMOTE CONTROL ================= */}
          {activeTab === 'remote' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Server Control Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: remoteStatus?.isRunning
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                        color: remoteStatus?.isRunning ? '#4ade80' : '#f87171',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {remoteStatus?.isRunning ? 'SERVER RUNNING' : 'SERVER STOPPED'}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>
                      Local Micro HTTP Server
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Runs locally on your LAN. Connect mobile phones and tablets to advance slides.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#94a3b8' }}>Port:</label>
                    <input
                      type="number"
                      value={remotePort}
                      onChange={(e) => setRemotePort(Number(e.target.value))}
                      disabled={remoteStatus?.isRunning}
                      style={{
                        width: '70px',
                        padding: '4px 8px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleToggleRemoteServer}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: remoteStatus?.isRunning ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {remoteStatus?.isRunning ? (
                      <>
                        <Square size={14} /> Stop Server
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Start Server
                      </>
                    )}
                  </button>
                </div>
              </div>

              <NetworkExposureControl
                kind="remote"
                mode={bindMode}
                onChange={handleBindModeChange}
                locked={!!remoteStatus?.isRunning || !!oscStatus?.isRunning}
              />

              {/* Pairing Info & PIN Box */}
              {remoteStatus?.isRunning && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                  }}
                >
                  {/* Left: Mobile Web App URL */}
                  <div
                    style={{
                      padding: '16px',
                      backgroundColor: '#131d31',
                      borderRadius: '8px',
                      border: '1px solid #1e3a8a',
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 600 }}>
                      MOBILE WEB APP ADDRESS
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#ffffff',
                        margin: '8px 0',
                        wordBreak: 'break-all',
                        fontFamily: 'monospace',
                      }}
                    >
                      {remoteUrl}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(remoteUrl);
                          setCopiedUrl(true);
                          setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedUrl ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                        <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                      </button>
                      <a
                        href={remoteUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#93c5fd',
                          fontSize: '12px',
                          textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Open in Browser</span>
                      </a>
                    </div>
                  </div>

                  {/* Right: Security Pairing PIN */}
                  <div
                    style={{
                      padding: '16px',
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                          SECURE PAIRING PIN
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#e2e8f0',
                            backgroundColor: '#0f172a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          6-Digit Handshake
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '32px',
                          fontWeight: 800,
                          letterSpacing: '0.25em',
                          color: '#38bdf8',
                          margin: '10px 0',
                          fontFamily: 'monospace',
                        }}
                      >
                        {remoteStatus.pairingPin || '384920'}
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Enter this PIN on your mobile device during pairing. Operator approval is
                      required for every new remote device.
                    </div>
                  </div>
                </div>
              )}

              {/* Paired & Pending Devices List */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    Connected & Paired Remote Devices ({remoteDevices.length})
                  </div>
                  <button
                    onClick={refreshLiveMonitors}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>

                {remoteDevices.length === 0 ? (
                  <div
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '13px',
                    }}
                  >
                    No mobile devices have paired yet. Open the remote URL on your phone and enter
                    the PIN above.
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #334155',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                          <th style={{ textAlign: 'left', padding: '10px 14px' }}>Device Name</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px' }}>IP Address</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px' }}>Status</th>
                          <th style={{ textAlign: 'left', padding: '10px 14px' }}>Permissions</th>
                          <th style={{ textAlign: 'right', padding: '10px 14px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remoteDevices.map((dev) => (
                          <tr
                            key={dev.id}
                            style={{
                              borderBottom: '1px solid #334155',
                              backgroundColor: dev.isApproved ? 'transparent' : 'rgba(234, 179, 8, 0.05)',
                            }}
                          >
                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                              {dev.deviceName}
                              <div style={{ fontSize: '10px', color: '#64748b' }}>
                                Seen: {new Date(dev.lastSeenAt).toLocaleTimeString()}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', fontFamily: 'monospace' }}>
                              {dev.ipAddress}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              {dev.isApproved ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#4ade80',
                                    fontWeight: 600,
                                  }}
                                >
                                  <CheckCircle size={14} /> Approved
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    color: '#facc15',
                                    fontWeight: 600,
                                  }}
                                >
                                  <AlertCircle size={14} /> Pending Approval
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={dev.canNavigate}
                                    onChange={(e) =>
                                      handleUpdatePermissions(
                                        dev.id,
                                        e.target.checked,
                                        dev.canBlackout,
                                        dev.canTakeLive,
                                        dev.canControlTimer
                                      )
                                    }
                                  />
                                  <span>Nav</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={dev.canBlackout}
                                    onChange={(e) =>
                                      handleUpdatePermissions(
                                        dev.id,
                                        dev.canNavigate,
                                        e.target.checked,
                                        dev.canTakeLive,
                                        dev.canControlTimer
                                      )
                                    }
                                  />
                                  <span>Blackout</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={dev.canTakeLive}
                                    onChange={(e) =>
                                      handleUpdatePermissions(
                                        dev.id,
                                        dev.canNavigate,
                                        dev.canBlackout,
                                        e.target.checked,
                                        dev.canControlTimer
                                      )
                                    }
                                  />
                                  <span>Go Live</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="checkbox"
                                    checked={dev.canControlTimer}
                                    onChange={(e) =>
                                      handleUpdatePermissions(
                                        dev.id,
                                        dev.canNavigate,
                                        dev.canBlackout,
                                        dev.canTakeLive,
                                        e.target.checked
                                      )
                                    }
                                  />
                                  <span>Timers</span>
                                </label>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                <button
                                  onClick={() => handleApproveDevice(dev.id, !dev.isApproved)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    backgroundColor: dev.isApproved ? '#b91c1c' : '#15803d',
                                    color: '#ffffff',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {dev.isApproved ? 'Revoke' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleDeleteDevice(dev.id)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #ef4444',
                                    backgroundColor: 'transparent',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 2: MIDI INTEGRATION ================= */}
          {activeTab === 'midi' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Listener Control Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: midiStatus?.isRunning
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                        color: midiStatus?.isRunning ? '#4ade80' : '#f87171',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {midiStatus?.isRunning ? 'LISTENER ACTIVE' : 'LISTENER IDLE'}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>
                      Hardware MIDI Controller Input
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Connect USB MIDI keyboards, foot pedals, or stream decks (e.g. Behringer, Korg,
                    Elgato) to advance slides.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <select
                    value={selectedMidiDevice}
                    onChange={(e) => setSelectedMidiDevice(e.target.value)}
                    disabled={midiStatus?.isRunning}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      maxWidth: '220px',
                    }}
                  >
                    {midiStatus?.availableDevices && midiStatus.availableDevices.length > 0 ? (
                      midiStatus.availableDevices.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))
                    ) : (
                      <option value="">No MIDI devices detected</option>
                    )}
                  </select>

                  <button
                    onClick={handleToggleMidi}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: midiStatus?.isRunning ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {midiStatus?.isRunning ? (
                      <>
                        <Square size={14} /> Disconnect
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Connect MIDI
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Event Monitor Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#090d16',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: midiStatus?.lastEvent ? '#22c55e' : '#64748b',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                    LIVE MIDI MONITOR:
                  </span>
                  {midiStatus?.lastEvent ? (
                    <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {midiStatus.lastEvent.messageType.toUpperCase()} | Ch:{' '}
                      {midiStatus.lastEvent.channel} | Note/CC: {midiStatus.lastEvent.noteOrCc} | Val:{' '}
                      {midiStatus.lastEvent.value}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      Waiting for incoming MIDI messages...
                    </span>
                  )}
                </div>
                {midiStatus?.lastEvent && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {new Date(midiStatus.lastEvent.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Mappings Table */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    Configured MIDI Action Triggers ({midiMappings.length})
                  </div>
                  <button
                    onClick={() => setIsAddingMidi(!isAddingMidi)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isAddingMidi ? 'Cancel' : '+ Add MIDI Trigger'}
                  </button>
                </div>

                {/* Add Mapping Drawer */}
                {isAddingMidi && (
                  <div
                    style={{
                      padding: '16px',
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      border: '1px solid #3b82f6',
                      marginBottom: '14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr) auto',
                      gap: '10px',
                      alignItems: 'end',
                    }}
                  >
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Label</label>
                      <input
                        type="text"
                        value={newMidiMapping.name || ''}
                        onChange={(e) =>
                          setNewMidiMapping({ ...newMidiMapping, name: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Type</label>
                      <select
                        value={newMidiMapping.messageType || 'note_on'}
                        onChange={(e) =>
                          setNewMidiMapping({
                            ...newMidiMapping,
                            messageType: e.target.value as 'note_on' | 'control_change',
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      >
                        <option value="note_on">Note On</option>
                        <option value="control_change">CC (Control Change)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Channel (0 = Any)</label>
                      <input
                        type="number"
                        min="0"
                        max="16"
                        value={newMidiMapping.channel ?? 0}
                        onChange={(e) =>
                          setNewMidiMapping({
                            ...newMidiMapping,
                            channel: Number(e.target.value),
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Note / CC#</label>
                      <input
                        type="number"
                        min="0"
                        max="127"
                        value={newMidiMapping.noteOrCc ?? 60}
                        onChange={(e) =>
                          setNewMidiMapping({
                            ...newMidiMapping,
                            noteOrCc: Number(e.target.value),
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: '#94a3b8' }}>Action</label>
                      <select
                        value={newMidiMapping.actionType || 'next_slide'}
                        onChange={(e) =>
                          setNewMidiMapping({ ...newMidiMapping, actionType: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      >
                        <option value="next_slide">Next Slide</option>
                        <option value="previous_slide">Previous Slide</option>
                        <option value="toggle_blackout">Toggle Blackout</option>
                        <option value="toggle_clear">Clear Overlay</option>
                        <option value="go_live">Go Live</option>
                        <option value="toggle_timer">Toggle Timer</option>
                      </select>
                    </div>
                    <button
                      onClick={handleSaveMidiMapping}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: '#16a34a',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer',
                        height: '32px',
                      }}
                    >
                      Save
                    </button>
                  </div>
                )}

                <div
                  style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid #334155',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                        <th style={{ textAlign: 'left', padding: '10px 14px' }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px' }}>Type</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px' }}>Channel</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px' }}>Note / CC#</th>
                        <th style={{ textAlign: 'left', padding: '10px 14px' }}>Mapped Action</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px' }}>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {midiMappings.map((m) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{m.name}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#0f172a',
                                fontSize: '11px',
                              }}
                            >
                              {m.messageType}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {m.channel === 0 ? 'Any' : m.channel}
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace' }}>
                            {m.noteOrCc}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#60a5fa', fontWeight: 600 }}>
                            {m.actionType}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteMidiMapping(m.id)}
                              style={{
                                padding: '4px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 3: OSC NETWORK CONTROL ================= */}
          {activeTab === 'osc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Listener Control Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: oscStatus?.isRunning
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                        color: oscStatus?.isRunning ? '#4ade80' : '#f87171',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {oscStatus?.isRunning ? 'UDP LISTENER ACTIVE' : 'UDP LISTENER STOPPED'}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>
                      Open Sound Control (OSC) Receiver
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Receive low-latency UDP messages from companion software, digital audio consoles
                    (Behringer X32, Allen & Heath), or QLab.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '12px', color: '#94a3b8' }}>Port:</label>
                    <input
                      type="number"
                      value={oscPort}
                      onChange={(e) => setOscPort(Number(e.target.value))}
                      onBlur={handleSaveOscPort}
                      disabled={oscStatus?.isRunning}
                      style={{
                        width: '70px',
                        padding: '4px 8px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleToggleOsc}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: oscStatus?.isRunning ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {oscStatus?.isRunning ? (
                      <>
                        <Square size={14} /> Stop OSC
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Start OSC
                      </>
                    )}
                  </button>
                </div>
              </div>

              <NetworkExposureControl
                kind="osc"
                mode={bindMode}
                onChange={handleBindModeChange}
                locked={!!remoteStatus?.isRunning || !!oscStatus?.isRunning}
              />

              {/* Live OSC Packet Monitor */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#090d16',
                  borderRadius: '8px',
                  border: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: oscStatus?.lastReceivedPath ? '#22c55e' : '#64748b',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                    LAST OSC PACKET:
                  </span>
                  {oscStatus?.lastReceivedPath ? (
                    <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#38bdf8' }}>
                      {oscStatus.lastReceivedPath}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      No incoming UDP packets received yet
                    </span>
                  )}
                </div>
                {oscStatus?.lastReceivedTime && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {new Date(oscStatus.lastReceivedTime).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Supported OSC Commands Reference Card */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  padding: '16px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>
                  Supported OSC Command Paths
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    fontSize: '12px',
                  }}
                >
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <code style={{ color: '#38bdf8', fontWeight: 700 }}>/cp/next</code>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Advances to the next slide in the presentation.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <code style={{ color: '#38bdf8', fontWeight: 700 }}>/cp/prev</code>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Moves back to the previous slide.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <code style={{ color: '#38bdf8', fontWeight: 700 }}>/cp/blackout</code>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Toggles blackout on audience and presentation outputs.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <code style={{ color: '#38bdf8', fontWeight: 700 }}>/cp/clear</code>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Clears overlay/lyrics text without blanking background.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <code style={{ color: '#38bdf8', fontWeight: 700 }}>/cp/live</code>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Takes the current preview item or slide live on air.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <code style={{ color: '#38bdf8', fontWeight: 700 }}>/cp/slide/{'{index}'}</code>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>
                      Jumps directly to a 1-indexed slide in current presentation.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 4: UNIFIED ACTION MAP ================= */}
          {activeTab === 'actions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px' }}>
                    Unified Action Registry & Debounce Dispatcher
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Centralized pipeline with 80ms atomic debouncing preventing double-triggers from
                    pedals or rapid button presses.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleResetActionDefaults}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#cbd5e1',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>

              {actionTestResult && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid #22c55e',
                    color: '#4ade80',
                    fontSize: '12px',
                  }}
                >
                  {actionTestResult}
                </div>
              )}

              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  border: '1px solid #334155',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Action Name</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Keyboard Key</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>Test Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionMappings.map((a) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          {a.displayLabel}
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{a.actionName}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#0f172a',
                              fontSize: '11px',
                              color: '#94a3b8',
                            }}
                          >
                            {a.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {a.keyboardShortcut ? (
                            <kbd
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#334155',
                                border: '1px solid #475569',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                              }}
                            >
                              {a.keyboardShortcut}
                            </kbd>
                          ) : (
                            <span style={{ color: '#64748b' }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ color: a.isEnabled ? '#4ade80' : '#f87171' }}>
                            {a.isEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleTestDispatch(a.actionName)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #3b82f6',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              color: '#60a5fa',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            Fire Action
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
