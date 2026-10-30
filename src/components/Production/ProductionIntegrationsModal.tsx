import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { NetworkExposureControl, BindMode } from './NetworkExposureControl';
import { OscMacroAccess } from './OscMacroAccess';
import { MACRO_ACTIONS } from '../../services/macroSteps';
import { macroAction, midiActionLabel } from '../../services/macroAccess';
import {
  RemoteServerStatus,
  RemoteDevice,
  MidiStatus,
  MidiMapping,
  OscConfig,
  OscStatus,
  ActionMapping,
  Macro,
  ObsConfig,
  ObsStatus,
  CameraDeviceInfo,
  LiveVideoConfig,
  LiveVideoStatus,
  AlphaKeyConfig,
  AlphaKeyStatus,
  DisplayMonitor,
} from '../../types';
import { liveVideoService } from '../../services/liveVideoService';
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
  ShieldCheck,
  Lock,
  Key,
  Eye,
  EyeOff,
  Tv,
  Camera,
  Layers,
} from 'lucide-react';

interface ProductionIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'remote' | 'midi' | 'osc' | 'obs' | 'video' | 'alpha_key' | 'actions';
}

export const ProductionIntegrationsModal: React.FC<ProductionIntegrationsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'remote',
}) => {
  const [activeTab, setActiveTab] = useState<'remote' | 'midi' | 'osc' | 'obs' | 'video' | 'alpha_key' | 'actions'>(initialTab);

  // Who may connect to the remote server and OSC listener (applies on next start)
  const [bindMode, setBindMode] = useState<BindMode>('lan');

  // Remote Control state
  const [remoteStatus, setRemoteStatus] = useState<RemoteServerStatus | null>(null);
  const [remoteDevices, setRemoteDevices] = useState<RemoteDevice[]>([]);
  const [remotePort, setRemotePort] = useState<number>(8088);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [remoteTlsEnabled, setRemoteTlsEnabled] = useState<boolean>(true);
  const [copiedFingerprint, setCopiedFingerprint] = useState<boolean>(false);

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
  const [macros, setMacros] = useState<Macro[]>([]);
  const [oscSecretDraft, setOscSecretDraft] = useState<string>('');
  const [showOscSecret, setShowOscSecret] = useState<boolean>(false);

  // Actions state
  const [actionMappings, setActionMappings] = useState<ActionMapping[]>([]);
  const [actionTestResult, setActionTestResult] = useState<string | null>(null);

  // OBS state
  const [obsConfig, setObsConfig] = useState<ObsConfig | null>(null);
  const [obsStatus, setObsStatus] = useState<ObsStatus | null>(null);
  const [showObsPassword, setShowObsPassword] = useState<boolean>(false);
  const [obsConnecting, setObsConnecting] = useState<boolean>(false);
  const [obsSelectedScene, setObsSelectedScene] = useState<string>('');
  const [obsTestSceneResult, setObsTestSceneResult] = useState<string | null>(null);

  // Live Video / IMAG state
  const [liveVideoConfig, setLiveVideoConfig] = useState<LiveVideoConfig | null>(null);
  const [liveVideoStatus, setLiveVideoStatus] = useState<LiveVideoStatus | null>(null);
  const [cameraDevices, setCameraDevices] = useState<CameraDeviceInfo[]>([]);
  const previewVideoRef = React.useRef<HTMLVideoElement>(null);
  const [previewCapturing, setPreviewCapturing] = useState<boolean>(false);

  // Alpha Key state
  const [alphaKeyConfig, setAlphaKeyConfig] = useState<AlphaKeyConfig | null>(null);
  const [alphaKeyStatus, setAlphaKeyStatus] = useState<AlphaKeyStatus | null>(null);
  const [displayMonitors, setDisplayMonitors] = useState<DisplayMonitor[]>([]);

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
      const [rStatus, rDevs, mStatus, mMappings, oCfg, oStatus, aMappings, bMode, savedMacros, tlsEnabled, oObsCfg, oObsSt, lvCfg, lvSt, cDevs, akCfg, akSt, dMonitors] =
        await Promise.all([
          api.getRemoteServerStatus(),
          api.listRemoteDevices(),
          api.getMidiStatus(),
          api.listMidiMappings(),
          api.getOscConfig(),
          api.getOscStatus(),
          api.listActionMappings(),
          api.getNetworkBindMode(),
          api.listMacros(),
          api.getRemoteTlsEnabled(),
          api.getObsConfig(),
          api.getObsStatus(),
          api.getLiveVideoConfig(),
          api.getLiveVideoStatus(),
          api.listCameraDevices(),
          api.getAlphaKeyConfig(),
          api.getAlphaKeyStatus(),
          api.getAvailableMonitors(),
        ]);

      setMacros(savedMacros);
      setBindMode(bMode);
      setRemoteStatus(rStatus);
      setRemotePort(rStatus.port || 8088);
      setRemoteDevices(rDevs);
      setRemoteTlsEnabled(tlsEnabled);

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
      setOscSecretDraft(oCfg.sharedSecret || '');

      setActionMappings(aMappings);

      setObsConfig(oObsCfg);
      setObsStatus(oObsSt);
      if (oObsSt.currentScene) {
        setObsSelectedScene(oObsSt.currentScene);
      } else if (oObsSt.scenes.length > 0) {
        setObsSelectedScene(oObsSt.scenes[0]);
      }

      setLiveVideoConfig(lvCfg);
      setLiveVideoStatus(lvSt);
      setCameraDevices(cDevs);

      setAlphaKeyConfig(akCfg);
      setAlphaKeyStatus(akSt);
      setDisplayMonitors(dMonitors);
    } catch (e) {
      console.error('Failed to load integration states:', e);
    } finally {
      setLoading(false);
    }
  };

  const refreshLiveMonitors = async () => {
    try {
      const [mStatus, oStatus, rStatus, rDevs, oObsSt, lvSt, akSt] = await Promise.all([
        api.getMidiStatus(),
        api.getOscStatus(),
        api.getRemoteServerStatus(),
        api.listRemoteDevices(),
        api.getObsStatus(),
        api.getLiveVideoStatus(),
        api.getAlphaKeyStatus(),
      ]);
      setMidiStatus(mStatus);
      setOscStatus(oStatus);
      setRemoteStatus(rStatus);
      setRemoteDevices(rDevs);
      setObsStatus(oObsSt);
      setLiveVideoStatus(lvSt);
      setAlphaKeyStatus(akSt);
      if (oObsSt.currentScene && !obsSelectedScene) {
        setObsSelectedScene(oObsSt.currentScene);
      }
    } catch {
      // Ignore background refresh errors
    }
  };

  if (!isOpen) return null;

  const isTls = remoteStatus?.tlsEnabled ?? remoteTlsEnabled;
  const proto = isTls ? 'https' : 'http';
  const lanIp =
    remoteStatus?.isRunning && remoteStatus.bindAddress === '127.0.0.1'
      ? '127.0.0.1'
      : remoteStatus?.lanIps?.[0] || '127.0.0.1';
  const remoteUrl = remoteStatus?.remoteUrl || `${proto}://${lanIp}:${remotePort}/remote`;

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
    timer: boolean,
    macros: boolean
  ) => {
    try {
      await api.updateRemoteDevicePermissions(id, nav, blackout, live, timer, macros);
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

  const handleChangeOscAllowlist = async (allowlistActions: string) => {
    if (!oscConfig) return;
    try {
      const updated = await api.updateOscConfig({ ...oscConfig, allowlistActions });
      setOscConfig(updated);
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    }
  };

  const handleToggleTls = async (enabled: boolean) => {
    try {
      await api.setRemoteTlsEnabled(enabled);
      setRemoteTlsEnabled(enabled);
      const updated = await api.getRemoteServerStatus();
      setRemoteStatus(updated);
      setStatusMessage(`Remote TLS encryption ${enabled ? 'enabled' : 'disabled'}. Takes effect next time server starts.`);
    } catch (err: any) {
      setStatusMessage(`Error updating TLS: ${err?.message || err}`);
    }
  };

  const handleSaveOscSecret = async () => {
    if (!oscConfig) return;
    try {
      const secret = oscSecretDraft.trim() || null;
      const updated = await api.updateOscConfig({
        ...oscConfig,
        sharedSecret: secret,
      });
      setOscConfig(updated);
      const status = await api.getOscStatus();
      setOscStatus(status);
      setStatusMessage(secret ? 'OSC Shared Secret saved & enforced.' : 'OSC Shared Secret cleared (open to LAN).');
    } catch (err: any) {
      setStatusMessage(`Error saving OSC secret: ${err?.message || err}`);
    }
  };

  const handleGenerateSecret = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let res = '';
    for (let i = 0; i < 16; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setOscSecretDraft(res);
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

  // OBS Studio WebSocket Handlers
  const handleConnectObs = async () => {
    setObsConnecting(true);
    try {
      if (obsConfig) {
        await api.updateObsConfig(obsConfig);
      }
      const st = await api.obsConnect();
      setObsStatus(st);
      if (st.currentScene) {
        setObsSelectedScene(st.currentScene);
      }
      setStatusMessage(st.isConnected ? 'Connected to OBS Studio.' : `OBS: ${st.error || 'Connection failed'}`);
    } catch (err) {
      setStatusMessage(`Failed to connect to OBS: ${err}`);
    } finally {
      setObsConnecting(false);
    }
  };

  const handleDisconnectObs = async () => {
    try {
      const st = await api.obsDisconnect();
      setObsStatus(st);
      setStatusMessage('Disconnected from OBS Studio.');
    } catch (err) {
      setStatusMessage(`Failed to disconnect from OBS: ${err}`);
    }
  };

  const handleSaveObsConfig = async () => {
    if (!obsConfig) return;
    try {
      const updated = await api.updateObsConfig(obsConfig);
      setObsConfig(updated);
      setStatusMessage('OBS WebSocket configuration saved.');
    } catch (err) {
      setStatusMessage(`Error saving OBS config: ${err}`);
    }
  };

  const handleSetObsScene = async (sceneName: string) => {
    try {
      const st = await api.obsSetScene(sceneName);
      setObsStatus(st);
      setObsSelectedScene(sceneName);
      setObsTestSceneResult(`Switched active OBS scene to "${sceneName}"`);
      setTimeout(() => setObsTestSceneResult(null), 3000);
    } catch (err) {
      setObsTestSceneResult(`Failed to switch scene: ${err}`);
    }
  };

  const handleToggleObsStream = async () => {
    try {
      if (obsStatus?.isStreaming) {
        const st = await api.obsStopStream();
        setObsStatus(st);
        setStatusMessage('OBS Stream stopped.');
      } else {
        const st = await api.obsStartStream();
        setObsStatus(st);
        setStatusMessage('OBS Stream started.');
      }
    } catch (err) {
      setStatusMessage(`Stream error: ${err}`);
    }
  };

  const handleToggleObsRecord = async () => {
    try {
      if (obsStatus?.isRecording) {
        const st = await api.obsStopRecord();
        setObsStatus(st);
        setStatusMessage('OBS Recording stopped.');
      } else {
        const st = await api.obsStartRecord();
        setObsStatus(st);
        setStatusMessage('OBS Recording started.');
      }
    } catch (err) {
      setStatusMessage(`Record error: ${err}`);
    }
  };

  // Live Video Handlers
  const handleToggleLiveCameraActive = async () => {
    try {
      const active = await api.toggleLiveCamera();
      if (liveVideoConfig) {
        setLiveVideoConfig({ ...liveVideoConfig, isActive: active });
      }
      setStatusMessage(active ? 'Live Camera turned ON on Audience display.' : 'Live Camera turned OFF.');
    } catch (err) {
      setStatusMessage(`Camera toggle error: ${err}`);
    }
  };

  const handleSaveLiveVideoConfig = async () => {
    if (!liveVideoConfig) return;
    try {
      const updated = await api.updateLiveVideoConfig(liveVideoConfig);
      setLiveVideoConfig(updated);
      setStatusMessage('Live Video configuration saved.');
    } catch (err) {
      setStatusMessage(`Error saving Live Video config: ${err}`);
    }
  };

  const handleTogglePreviewCapture = async () => {
    if (previewCapturing) {
      liveVideoService.stopCapture();
      setPreviewCapturing(false);
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = null;
      }
    } else if (liveVideoConfig) {
      try {
        const stream = await liveVideoService.startCapture(liveVideoConfig);
        if (stream && previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
        }
        setPreviewCapturing(true);
      } catch (err) {
        setStatusMessage(`Preview error: ${err}`);
      }
    }
  };

  // Alpha Key Handlers
  const handleToggleAlphaKeyActive = async () => {
    try {
      const newActive = await api.toggleAlphaKey();
      if (alphaKeyConfig) {
        setAlphaKeyConfig({ ...alphaKeyConfig, isActive: newActive });
      }
      const st = await api.getAlphaKeyStatus();
      setAlphaKeyStatus(st);
      setStatusMessage(`Alpha Key output ${newActive ? 'activated (ON-AIR)' : 'deactivated'}.`);
    } catch (err) {
      setStatusMessage(`Error toggling Alpha Key: ${err}`);
    }
  };

  const handleUpdateAlphaKey = async (partial: Partial<AlphaKeyConfig>) => {
    try {
      const current = alphaKeyConfig || (await api.getAlphaKeyConfig());
      const merged = { ...current, ...partial };
      setAlphaKeyConfig(merged);
      const updated = await api.updateAlphaKeyConfig(merged);
      setAlphaKeyConfig(updated);
      setStatusMessage('Alpha Key configuration saved.');
    } catch (err) {
      setStatusMessage(`Error saving Alpha Key config: ${err}`);
    }
  };

  const handleOpenAlphaWindow = async (role: string) => {
    try {
      let monitorId: string | undefined;
      if (role === 'fill') monitorId = alphaKeyConfig?.fillMonitorId || undefined;
      else if (role === 'key') monitorId = alphaKeyConfig?.keyMonitorId || undefined;
      else if (role === 'combined') monitorId = alphaKeyConfig?.combinedMonitorId || undefined;

      const st = await api.openAlphaWindow(role, monitorId, false);
      setAlphaKeyStatus(st);
      setStatusMessage(`Alpha ${role} window opened.`);
    } catch (err) {
      setStatusMessage(`Error opening Alpha ${role} window: ${err}`);
    }
  };

  const handleCloseAlphaWindow = async (role: string) => {
    try {
      const st = await api.closeAlphaWindow(role);
      setAlphaKeyStatus(st);
      setStatusMessage(`Alpha ${role} window closed.`);
    } catch (err) {
      setStatusMessage(`Error closing Alpha ${role} window: ${err}`);
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
            onClick={() => setActiveTab('obs')}
            data-testid="tab-obs"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'obs' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'obs' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Tv size={16} />
            <span>OBS Studio</span>
            {obsStatus?.isConnected && (
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
            onClick={() => setActiveTab('video')}
            data-testid="tab-live-video"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'video' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'video' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Camera size={16} />
            <span>Live Video & IMAG</span>
            {liveVideoConfig?.isActive && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#0284c7',
                }}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('alpha_key')}
            data-testid="tab-alpha-key"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'alpha_key' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'alpha_key' ? '#60a5fa' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            <Layers size={16} />
            <span>Alpha Key (Key & Fill)</span>
            {alphaKeyConfig?.isActive && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
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

              {/* Phase 10.5: Remote TLS Security & Certificate Fingerprint Card */}
              <div
                data-testid="remote-tls-hardening-card"
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ShieldCheck size={18} color="#38bdf8" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#f8fafc' }}>
                        TLS / HTTPS Transport Encryption
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Self-signed TLS encryption protects mobile remote control from local network eavesdropping.
                      </div>
                    </div>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: remoteStatus?.isRunning ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#f8fafc',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid="remote-tls-toggle"
                      checked={remoteTlsEnabled}
                      disabled={remoteStatus?.isRunning}
                      onChange={(e) => handleToggleTls(e.target.checked)}
                      style={{ accentColor: '#3b82f6', width: '15px', height: '15px' }}
                    />
                    <span>{remoteTlsEnabled ? 'TLS Enabled (HTTPS)' : 'TLS Disabled (Plain HTTP)'}</span>
                  </label>
                </div>

                {remoteTlsEnabled && remoteStatus?.tlsFingerprint && (
                  <div
                    data-testid="remote-tls-fingerprint-box"
                    style={{
                      backgroundColor: '#090d16',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      border: '1px solid #1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                        Certificate SHA-256 Fingerprint
                      </div>
                      <div
                        data-testid="remote-tls-fingerprint"
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#38bdf8',
                          marginTop: '2px',
                          wordBreak: 'break-all',
                        }}
                      >
                        {remoteStatus.tlsFingerprint}
                      </div>
                    </div>

                    <button
                      type="button"
                      data-testid="copy-tls-fingerprint-btn"
                      onClick={() => {
                        if (remoteStatus.tlsFingerprint) {
                          navigator.clipboard.writeText(remoteStatus.tlsFingerprint);
                          setCopiedFingerprint(true);
                          setTimeout(() => setCopiedFingerprint(false), 2000);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {copiedFingerprint ? <Check size={12} color="#4ade80" /> : <Copy size={12} />}
                      <span>{copiedFingerprint ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
              </div>

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
                                        dev.canControlTimer,
                                        dev.canRunMacros
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
                                        dev.canControlTimer,
                                        dev.canRunMacros
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
                                        dev.canControlTimer,
                                        dev.canRunMacros
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
                                        e.target.checked,
                                        dev.canRunMacros
                                      )
                                    }
                                  />
                                  <span>Timers</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Lets this device run any saved macro">
                                  <input
                                    type="checkbox"
                                    data-testid="remote-can-run-macros"
                                    checked={dev.canRunMacros}
                                    onChange={(e) =>
                                      handleUpdatePermissions(
                                        dev.id,
                                        dev.canNavigate,
                                        dev.canBlackout,
                                        dev.canTakeLive,
                                        dev.canControlTimer,
                                        e.target.checked
                                      )
                                    }
                                  />
                                  <span>Macros</span>
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
                        {MACRO_ACTIONS.map((a) => (
                          <option key={a.action} value={a.action}>
                            {a.label}
                          </option>
                        ))}
                        {macros.length > 0 && (
                          <optgroup label="Macros">
                            {macros.map((mac) => (
                              <option key={mac.id} value={macroAction(mac.id)}>
                                {mac.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
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
                            {midiActionLabel(m.actionType, macros, MACRO_ACTIONS)}
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

              {/* OSC Packet Authentication & Shared Secret Card */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Lock size={16} color={oscStatus?.hasSharedSecret ? '#4ade80' : '#94a3b8'} />
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>
                        OSC Shared Secret Authentication
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: oscStatus?.hasSharedSecret
                            ? 'rgba(34, 197, 94, 0.2)'
                            : 'rgba(234, 179, 8, 0.2)',
                          color: oscStatus?.hasSharedSecret ? '#4ade80' : '#facc15',
                        }}
                      >
                        {oscStatus?.hasSharedSecret ? 'AUTHENTICATION ENFORCED' : 'OPEN / UNRESTRICTED'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      Require a shared passkey for all incoming UDP OSC packets to prevent unauthorized triggers on church networks.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showOscSecret ? 'text' : 'password'}
                      value={oscSecretDraft}
                      onChange={(e) => setOscSecretDraft(e.target.value)}
                      placeholder="No secret configured (open to network)"
                      style={{
                        width: '100%',
                        padding: '8px 36px 8px 12px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOscSecret(!showOscSecret)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px',
                      }}
                      title={showOscSecret ? 'Hide secret' : 'Show secret'}
                    >
                      {showOscSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  <button
                    onClick={handleGenerateSecret}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      backgroundColor: '#334155',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Key size={14} /> Generate
                  </button>

                  <button
                    onClick={handleSaveOscSecret}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#16a34a',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Save Secret
                  </button>

                  {oscSecretDraft && (
                    <button
                      onClick={async () => {
                        setOscSecretDraft('');
                        if (oscConfig) {
                          try {
                            const updated = await api.updateOscConfig({
                              ...oscConfig,
                              sharedSecret: null,
                            });
                            setOscConfig(updated);
                            const status = await api.getOscStatus();
                            setOscStatus(status);
                            setStatusMessage('OSC Shared Secret cleared (open to LAN).');
                          } catch (err: any) {
                            setStatusMessage(`Error clearing secret: ${err?.message || err}`);
                          }
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#dc2626',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {oscSecretDraft ? (
                  <div
                    style={{
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      border: '1px solid #1e293b',
                      fontSize: '11px',
                      color: '#94a3b8',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ color: '#38bdf8', fontWeight: 600 }}>
                      How to send authenticated packets from Companion, TouchOSC, or DAWs:
                    </div>
                    <div>
                      • <strong>Path Prefix (Recommended):</strong> Prepend the secret to the OSC path:{' '}
                      <code style={{ color: '#facc15' }}>/{oscSecretDraft}/cp/next</code> or{' '}
                      <code style={{ color: '#facc15' }}>/auth:{oscSecretDraft}/cp/next</code>
                    </div>
                    <div>
                      • <strong>Message Argument:</strong> Pass the secret as the first string parameter to{' '}
                      <code style={{ color: '#facc15' }}>/cp/next "{oscSecretDraft}"</code>
                    </div>
                  </div>
                ) : null}
              </div>

              {oscConfig && (
                <OscMacroAccess allowlist={oscConfig.allowlistActions} onChange={handleChangeOscAllowlist} />
              )}

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

          {/* ================= TAB 4: OBS STUDIO WEBSOCKET V5 ================= */}
          {activeTab === 'obs' && (
            <div data-testid="obs-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header Status Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>OBS Studio WebSocket v5</div>
                    <span
                      data-testid="obs-status-badge"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: obsStatus?.isConnected
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(148, 163, 184, 0.2)',
                        color: obsStatus?.isConnected ? '#4ade80' : '#94a3b8',
                        border: `1px solid ${obsStatus?.isConnected ? '#22c55e' : '#64748b'}`,
                      }}
                    >
                      {obsStatus?.isConnected
                        ? `Connected (${obsStatus.obsVersion ? `OBS v${obsStatus.obsVersion}` : 'v5'})`
                        : 'Disconnected'}
                    </span>
                    {obsStatus?.isStreaming && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          border: '1px solid #ef4444',
                        }}
                      >
                        LIVE ON AIR
                      </span>
                    )}
                    {obsStatus?.isRecording && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: 'rgba(234, 88, 12, 0.2)',
                          color: '#fb923c',
                          border: '1px solid #f97316',
                        }}
                      >
                        REC
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Automate scene switching, broadcast streaming, and recording synchronization with OBS Studio v28+.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {obsStatus?.isConnected ? (
                    <button
                      onClick={handleDisconnectObs}
                      data-testid="obs-disconnect-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '12px',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <Square size={13} fill="#fff" />
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectObs}
                      disabled={obsConnecting}
                      data-testid="obs-connect-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#22c55e',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '12px',
                        border: 'none',
                        cursor: obsConnecting ? 'not-allowed' : 'pointer',
                        opacity: obsConnecting ? 0.7 : 1,
                      }}
                    >
                      <Play size={13} fill="#fff" />
                      <span>{obsConnecting ? 'Connecting…' : 'Connect to OBS'}</span>
                    </button>
                  )}
                </div>
              </div>

              {obsStatus?.error && (
                <div
                  style={{
                    padding: '10px 14px',
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
                  <AlertCircle size={16} />
                  <span>{obsStatus.error}</span>
                </div>
              )}

              {/* Grid of Cards: Connection Config & Live Scene Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Connection Settings Card */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#cbd5e1' }}>
                    WebSocket Connection Settings
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid="obs-enable-toggle"
                      checked={obsConfig?.isEnabled ?? false}
                      onChange={(e) =>
                        obsConfig && setObsConfig({ ...obsConfig, isEnabled: e.target.checked })
                      }
                      style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }}
                    />
                    <span>Enable OBS Studio Integration</span>
                  </label>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Host / IP Address
                      </label>
                      <input
                        type="text"
                        data-testid="obs-host-input"
                        value={obsConfig?.host || '127.0.0.1'}
                        onChange={(e) =>
                          obsConfig && setObsConfig({ ...obsConfig, host: e.target.value })
                        }
                        placeholder="127.0.0.1"
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Port
                      </label>
                      <input
                        type="number"
                        data-testid="obs-port-input"
                        value={obsConfig?.port || 4455}
                        onChange={(e) =>
                          obsConfig && setObsConfig({ ...obsConfig, port: Number(e.target.value) })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Server Password (Optional)
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type={showObsPassword ? 'text' : 'password'}
                        data-testid="obs-password-input"
                        value={obsConfig?.password ?? ''}
                        onChange={(e) =>
                          obsConfig && setObsConfig({ ...obsConfig, password: e.target.value || null })
                        }
                        placeholder="Leave empty if password authentication is disabled in OBS"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowObsPassword(!showObsPassword)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >
                        {showObsPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={obsConfig?.autoConnect ?? true}
                        onChange={(e) =>
                          obsConfig && setObsConfig({ ...obsConfig, autoConnect: e.target.checked })
                        }
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span>Auto-connect on application launch</span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#cbd5e1',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={obsConfig?.switchSceneOnServiceItem ?? false}
                        onChange={(e) =>
                          obsConfig &&
                          setObsConfig({ ...obsConfig, switchSceneOnServiceItem: e.target.checked })
                        }
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span>Switch scene automatically when activating service items</span>
                    </label>
                  </div>

                  <button
                    onClick={handleSaveObsConfig}
                    data-testid="obs-save-config-btn"
                    style={{
                      marginTop: '6px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Save Settings
                  </button>
                </div>

                {/* Live Scene Control & Broadcast Actions Card */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#cbd5e1' }}>
                    Active Scene & Program Output
                  </div>

                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#0f172a',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                      Current Program Scene:
                    </div>
                    <div
                      data-testid="obs-current-scene-name"
                      style={{ fontSize: '15px', fontWeight: 700, color: '#38bdf8' }}
                    >
                      {obsStatus?.currentScene || (obsStatus?.isConnected ? 'None selected' : 'OBS Offline')}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Switch Program Scene
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        data-testid="obs-scene-select"
                        value={obsSelectedScene}
                        onChange={(e) => setObsSelectedScene(e.target.value)}
                        disabled={!obsStatus?.isConnected}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      >
                        {obsStatus?.scenes && obsStatus.scenes.length > 0 ? (
                          obsStatus.scenes.map((sc) => (
                            <option key={sc} value={sc}>
                              {sc}
                            </option>
                          ))
                        ) : (
                          <option value="">No scenes available</option>
                        )}
                      </select>
                      <button
                        onClick={() => obsSelectedScene && handleSetObsScene(obsSelectedScene)}
                        disabled={!obsStatus?.isConnected || !obsSelectedScene}
                        data-testid="obs-switch-scene-btn"
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#3b82f6',
                          border: 'none',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: !obsStatus?.isConnected ? 'not-allowed' : 'pointer',
                          opacity: !obsStatus?.isConnected ? 0.5 : 1,
                        }}
                      >
                        Switch
                      </button>
                    </div>
                    {obsTestSceneResult && (
                      <div style={{ fontSize: '11px', color: '#4ade80', marginTop: '6px' }}>
                        {obsTestSceneResult}
                      </div>
                    )}
                  </div>

                  {/* Broadcast & Recording Trigger Buttons */}
                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Live Broadcast Controls:</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={handleToggleObsStream}
                        disabled={!obsStatus?.isConnected}
                        data-testid="obs-stream-toggle-btn"
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: obsStatus?.isStreaming ? '#ef4444' : '#1e3a8a',
                          border: `1px solid ${obsStatus?.isStreaming ? '#dc2626' : '#2563eb'}`,
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: !obsStatus?.isConnected ? 'not-allowed' : 'pointer',
                          opacity: !obsStatus?.isConnected ? 0.5 : 1,
                        }}
                      >
                        {obsStatus?.isStreaming ? 'Stop Streaming' : 'Start Streaming'}
                      </button>

                      <button
                        onClick={handleToggleObsRecord}
                        disabled={!obsStatus?.isConnected}
                        data-testid="obs-record-toggle-btn"
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: obsStatus?.isRecording ? '#ea580c' : '#14532d',
                          border: `1px solid ${obsStatus?.isRecording ? '#c2410c' : '#16a34a'}`,
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: !obsStatus?.isConnected ? 'not-allowed' : 'pointer',
                          opacity: !obsStatus?.isConnected ? 0.5 : 1,
                        }}
                      >
                        {obsStatus?.isRecording ? 'Stop Recording' : 'Start Recording'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Protocol v5 Documentation Box */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#cbd5e1', marginBottom: '6px' }}>
                  OBS Studio Setup Guide (WebSocket Protocol v5)
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 }}>
                  1. In OBS Studio (v28 or later), open <strong>Tools &rarr; WebSocket Server Settings</strong>.<br />
                  2. Check <strong>Enable WebSocket server</strong> with Server Port <code>4455</code>.<br />
                  3. If Authentication is enabled, enter the exact password above.<br />
                  4. Church Presenter automatically authenticates using standard SHA-256 challenge-response hashing.
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB: LIVE VIDEO & IMAG ================= */}
          {activeTab === 'video' && (
            <div data-testid="live-video-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header Status Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Live Video Input & IMAG</div>
                    <span
                      data-testid="camera-status-badge"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: liveVideoConfig?.isActive
                          ? 'rgba(2, 132, 199, 0.2)'
                          : 'rgba(148, 163, 184, 0.2)',
                        color: liveVideoConfig?.isActive ? '#38bdf8' : '#94a3b8',
                        border: `1px solid ${liveVideoConfig?.isActive ? '#0284c7' : '#64748b'}`,
                      }}
                    >
                      {liveVideoConfig?.isActive ? 'LIVE ON OUTPUT' : 'STANDBY'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Capture live camera feeds, HDMI capture cards, or virtual cameras for IMAG worship lyrics backgrounds and PiP overlays.
                    {liveVideoStatus?.activeDeviceLabel && (
                      <span style={{ marginLeft: '6px', color: '#38bdf8' }}>
                        &bull; Active: {liveVideoStatus.activeDeviceLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleToggleLiveCameraActive}
                    data-testid="toggle-live-camera-output-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      backgroundColor: liveVideoConfig?.isActive ? '#ef4444' : '#0284c7',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '12px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {liveVideoConfig?.isActive ? (
                      <>
                        <Square size={13} fill="#fff" />
                        <span>Turn Camera Off</span>
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="#fff" />
                        <span>Take Camera Live</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Grid: Preview Box & Device Settings */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* Preview Monitor Card */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#cbd5e1' }}>
                      Camera Monitor Preview
                    </div>
                    <button
                      onClick={handleTogglePreviewCapture}
                      data-testid="toggle-preview-capture-btn"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        backgroundColor: previewCapturing ? '#334155' : '#2563eb',
                        border: 'none',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {previewCapturing ? 'Stop Preview' : 'Start Preview'}
                    </button>
                  </div>

                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16/9',
                      backgroundColor: '#090d16',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid #334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <video
                      ref={previewVideoRef}
                      data-testid="live-video-preview-element"
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: liveVideoConfig?.fitMode || 'cover',
                        transform: liveVideoConfig?.flipHorizontal ? 'scaleX(-1)' : undefined,
                        display: previewCapturing ? 'block' : 'none',
                      }}
                    />
                    {!previewCapturing && (
                      <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                        <Camera size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <div>Click "Start Preview" to test capture stream</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8' }}>
                    <div>
                      Resolution: <strong style={{ color: '#f8fafc' }}>{liveVideoConfig?.resolution || '1080p'}</strong>
                    </div>
                    <div>
                      Frame Rate: <strong style={{ color: '#f8fafc' }}>{liveVideoConfig?.frameRate || 30} FPS</strong>
                    </div>
                    <div>
                      Mode: <strong style={{ color: '#f8fafc' }}>{liveVideoConfig?.displayMode || 'IMAG'}</strong>
                    </div>
                  </div>
                </div>

                {/* Capture & IMAG Configuration Card */}
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#cbd5e1' }}>
                    Capture Device & IMAG Settings
                  </div>

                  {/* Device Picker */}
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Selected Video Input Device
                    </label>
                    <select
                      data-testid="camera-device-select"
                      value={liveVideoConfig?.selectedDeviceId || ''}
                      onChange={(e) =>
                        liveVideoConfig &&
                        setLiveVideoConfig({ ...liveVideoConfig, selectedDeviceId: e.target.value })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    >
                      {cameraDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label} {d.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Display Mode */}
                  <div>
                    <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Display Mode
                    </label>
                    <select
                      data-testid="camera-display-mode-select"
                      value={liveVideoConfig?.displayMode || 'background_imag'}
                      onChange={(e) =>
                        liveVideoConfig &&
                        setLiveVideoConfig({ ...liveVideoConfig, displayMode: e.target.value as any })
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    >
                      <option value="background_imag">IMAG Background (Beneath Lyrics & Scripture)</option>
                      <option value="standalone_slide">Full Screen Camera View</option>
                      <option value="pip">Picture-in-Picture (ASL / Sign Language / Pulpit)</option>
                    </select>
                  </div>

                  {/* PiP Position & Size (if PiP mode selected) */}
                  {liveVideoConfig?.displayMode === 'pip' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                          PiP Corner
                        </label>
                        <select
                          data-testid="camera-pip-position-select"
                          value={liveVideoConfig?.pipPosition || 'bottom_right'}
                          onChange={(e) =>
                            liveVideoConfig &&
                            setLiveVideoConfig({ ...liveVideoConfig, pipPosition: e.target.value as any })
                          }
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            fontSize: '12px',
                          }}
                        >
                          <option value="bottom_right">Bottom Right</option>
                          <option value="bottom_left">Bottom Left</option>
                          <option value="top_right">Top Right</option>
                          <option value="top_left">Top Left</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                          PiP Size ({liveVideoConfig?.pipSizePercent || 25}%)
                        </label>
                        <input
                          type="range"
                          min={15}
                          max={50}
                          value={liveVideoConfig?.pipSizePercent || 25}
                          onChange={(e) =>
                            liveVideoConfig &&
                            setLiveVideoConfig({ ...liveVideoConfig, pipSizePercent: Number(e.target.value) })
                          }
                          style={{ width: '100%', marginTop: '6px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Resolution & FPS */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Resolution
                      </label>
                      <select
                        data-testid="camera-resolution-select"
                        value={liveVideoConfig?.resolution || '1080p'}
                        onChange={(e) =>
                          liveVideoConfig &&
                          setLiveVideoConfig({ ...liveVideoConfig, resolution: e.target.value as any })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      >
                        <option value="1080p">1080p (Full HD)</option>
                        <option value="720p">720p (HD)</option>
                        <option value="4k">4K (UHD)</option>
                        <option value="default">Camera Default</option>
                      </select>
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                        Frame Rate
                      </label>
                      <select
                        data-testid="camera-fps-select"
                        value={liveVideoConfig?.frameRate || 30}
                        onChange={(e) =>
                          liveVideoConfig &&
                          setLiveVideoConfig({ ...liveVideoConfig, frameRate: Number(e.target.value) })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          color: '#f8fafc',
                          fontSize: '12px',
                        }}
                      >
                        <option value={30}>30 FPS</option>
                        <option value={60}>60 FPS</option>
                      </select>
                    </div>
                  </div>

                  {/* Flip Horizontal Checkbox */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid="camera-flip-checkbox"
                      checked={liveVideoConfig?.flipHorizontal ?? false}
                      onChange={(e) =>
                        liveVideoConfig &&
                        setLiveVideoConfig({ ...liveVideoConfig, flipHorizontal: e.target.checked })
                      }
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span>Flip Horizontal (Mirror Selfie Camera)</span>
                  </label>

                  <button
                    onClick={handleSaveLiveVideoConfig}
                    data-testid="camera-save-config-btn"
                    style={{
                      marginTop: '6px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#2563eb',
                      border: 'none',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Save Camera Settings
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= TAB 7: ALPHA KEY (KEY & FILL) ================= */}
          {activeTab === 'alpha_key' && (
            <div data-testid="alpha-key-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Header Card */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={18} style={{ color: '#38bdf8' }} />
                    Alpha Key & Fill Outputs (Hardware Switchers & ATEM)
                  </h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                    Send synchronized Fill (color graphics) and Key (black & white alpha mask) outputs to vision mixers (ATEM, Roland, Ross) for broadcast-grade overlays.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={handleToggleAlphaKeyActive}
                    data-testid="btn-toggle-alpha-active"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: alphaKeyConfig?.isActive ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {alphaKeyConfig?.isActive ? (
                      <>
                        <Square size={14} fill="#ffffff" />
                        <span>Take OFF-AIR</span>
                      </>
                    ) : (
                      <>
                        <Play size={14} fill="#ffffff" />
                        <span>Go ON-AIR</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Live Dual Preview Monitors: Fill vs Key Matte */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                }}
              >
                {/* Fill Preview */}
                <div
                  style={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>Fill Channel (RGB Graphics)</span>
                      {alphaKeyStatus?.fillWindowOpen && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#0284c7', color: '#fff' }}>Window Open</span>
                      )}
                    </div>
                    <button
                      onClick={() => alphaKeyStatus?.fillWindowOpen ? handleCloseAlphaWindow('fill') : handleOpenAlphaWindow('fill')}
                      data-testid="btn-toggle-fill-window"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid #334155',
                        backgroundColor: '#1e293b',
                        color: '#94a3b8',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {alphaKeyStatus?.fillWindowOpen ? 'Close Window' : 'Launch Fill Window'}
                    </button>
                  </div>
                  <div
                    data-testid="fill-preview-monitor"
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      backgroundColor: alphaKeyConfig?.premultiplied ? '#000000' : '#090d16',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      border: '1px solid #1e293b',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: alphaKeyConfig?.contentSource === 'overlay' ? 'flex-end' : 'center',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: alphaKeyConfig?.contentSource === 'overlay' ? 'rgba(15, 23, 42, 0.9)' : 'transparent',
                          padding: alphaKeyConfig?.contentSource === 'overlay' ? '8px 16px' : '0',
                          borderRadius: '8px',
                          border: alphaKeyConfig?.contentSource === 'overlay' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#2563eb', color: '#fff', fontWeight: 700, display: 'inline-block', marginBottom: '4px' }}>
                          CHURCH PRESENTER
                        </span>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                          Amazing Grace! How sweet the sound
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Matte Preview */}
                <div
                  style={{
                    backgroundColor: '#0f172a',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>Key Matte Channel (Alpha Mask)</span>
                      {alphaKeyStatus?.keyWindowOpen && (
                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#475569', color: '#fff' }}>Window Open</span>
                      )}
                    </div>
                    <button
                      onClick={() => alphaKeyStatus?.keyWindowOpen ? handleCloseAlphaWindow('key') : handleOpenAlphaWindow('key')}
                      data-testid="btn-toggle-key-window"
                      style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: '1px solid #334155',
                        backgroundColor: '#1e293b',
                        color: '#94a3b8',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {alphaKeyStatus?.keyWindowOpen ? 'Close Window' : 'Launch Key Window'}
                    </button>
                  </div>
                  <div
                    data-testid="key-preview-monitor"
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      backgroundColor: alphaKeyConfig?.keyInvert ? '#ffffff' : '#000000',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      border: '1px solid #1e293b',
                      filter: alphaKeyConfig && alphaKeyConfig.keyGain !== 1.0 ? `contrast(${alphaKeyConfig.keyGain * 100}%)` : undefined,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: alphaKeyConfig?.contentSource === 'overlay' ? 'flex-end' : 'center',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: alphaKeyConfig?.contentSource === 'overlay' ? (alphaKeyConfig?.keyInvert ? '#000000' : '#ffffff') : 'transparent',
                          padding: alphaKeyConfig?.contentSource === 'overlay' ? '8px 16px' : '0',
                          borderRadius: '8px',
                          border: alphaKeyConfig?.contentSource === 'overlay' ? `1px solid ${alphaKeyConfig?.keyInvert ? '#000000' : '#ffffff'}` : 'none',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: alphaKeyConfig?.keyInvert ? '#ffffff' : '#000000', color: alphaKeyConfig?.keyInvert ? '#000' : '#fff', fontWeight: 700, display: 'inline-block', marginBottom: '4px' }}>
                          CHURCH PRESENTER
                        </span>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: alphaKeyConfig?.keyInvert ? '#000000' : '#ffffff', textShadow: `1px 1px 2px ${alphaKeyConfig?.keyInvert ? '#000000' : '#ffffff'}` }}>
                          Amazing Grace! How sweet the sound
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Window Launch Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  backgroundColor: '#0f172a',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                  <strong>Output Window Controls:</strong> Launch or close all assigned Key & Fill outputs with a single click.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => {
                      if (alphaKeyConfig?.mode === 'side_by_side' || alphaKeyConfig?.mode === 'stacked') {
                        handleOpenAlphaWindow('combined');
                      } else {
                        handleOpenAlphaWindow('fill');
                        handleOpenAlphaWindow('key');
                      }
                    }}
                    data-testid="btn-launch-alpha-windows"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Launch All Key & Fill Outputs
                  </button>
                  <button
                    onClick={() => handleCloseAlphaWindow('all')}
                    data-testid="btn-close-alpha-windows"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #475569',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Close All Outputs
                  </button>
                </div>
              </div>

              {/* Settings Configuration Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px',
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  padding: '20px',
                }}
              >
                {/* Left Column: Routing & Modes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                    Routing & Output Layout
                  </h4>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Output Architecture
                    </label>
                    <select
                      value={alphaKeyConfig?.mode || 'dual_window'}
                      onChange={(e) => handleUpdateAlphaKey({ mode: e.target.value as any })}
                      data-testid="select-alpha-mode"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '13px',
                      }}
                    >
                      <option value="dual_window">Dual Dedicated Windows (Monitor A = Fill, Monitor B = Key)</option>
                      <option value="side_by_side">Side-by-Side 3840x1080 (Single SDI/HDMI Splitter)</option>
                      <option value="stacked">Over-Under 1920x2160 (Stacked Vertical)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Content Source
                    </label>
                    <select
                      value={alphaKeyConfig?.contentSource || 'overlay'}
                      onChange={(e) => handleUpdateAlphaKey({ contentSource: e.target.value as any })}
                      data-testid="select-alpha-content-source"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '13px',
                      }}
                    >
                      <option value="overlay">Livestream Lower Thirds & Overlays</option>
                      <option value="audience">Full Audience Presentation Slides</option>
                    </select>
                  </div>

                  {alphaKeyConfig?.mode === 'dual_window' ? (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                          Fill Channel Physical Monitor
                        </label>
                        <select
                          value={alphaKeyConfig?.fillMonitorId || ''}
                          onChange={(e) => handleUpdateAlphaKey({ fillMonitorId: e.target.value || null })}
                          data-testid="select-alpha-fill-monitor"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            fontSize: '13px',
                          }}
                        >
                          <option value="">(Default Secondary Display)</option>
                          {displayMonitors.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.width}x{m.height})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                          Key Matte Channel Physical Monitor
                        </label>
                        <select
                          value={alphaKeyConfig?.keyMonitorId || ''}
                          onChange={(e) => handleUpdateAlphaKey({ keyMonitorId: e.target.value || null })}
                          data-testid="select-alpha-key-monitor"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            fontSize: '13px',
                          }}
                        >
                          <option value="">(Default Tertiary Display)</option>
                          {displayMonitors.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.width}x{m.height})
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                        Combined Output Monitor (Side-by-Side / Stacked)
                      </label>
                      <select
                        value={alphaKeyConfig?.combinedMonitorId || ''}
                        onChange={(e) => handleUpdateAlphaKey({ combinedMonitorId: e.target.value || null })}
                        data-testid="select-alpha-combined-monitor"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f8fafc',
                          fontSize: '13px',
                        }}
                      >
                        <option value="">(Default Ultra-wide / Dual-Head Display)</option>
                        {displayMonitors.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.width}x{m.height})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Right Column: Keyer Calibration & Processing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                    Keyer Calibration & Processing
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>Premultiplied Alpha</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Fill rendered against black (Standard for ATEM Linear Keyers)</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={alphaKeyConfig?.premultiplied ?? true}
                        onChange={(e) => handleUpdateAlphaKey({ premultiplied: e.target.checked })}
                        data-testid="toggle-alpha-premultiplied"
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>Invert Key Matte</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>Inverts white and black for reverse luma keyers</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={alphaKeyConfig?.keyInvert ?? false}
                        onChange={(e) => handleUpdateAlphaKey({ keyInvert: e.target.checked })}
                        data-testid="toggle-alpha-invert"
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </label>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Key Gain Multiplier</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>{(alphaKeyConfig?.keyGain ?? 1.0).toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={alphaKeyConfig?.keyGain ?? 1.0}
                      onChange={(e) => handleUpdateAlphaKey({ keyGain: parseFloat(e.target.value) })}
                      data-testid="slider-alpha-gain"
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      <span>0.5x (Soft)</span>
                      <span>1.0x (Standard)</span>
                      <span>2.0x (Hard Edge)</span>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Black Clip Threshold</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8' }}>{alphaKeyConfig?.keyClipPercent ?? 0}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={alphaKeyConfig?.keyClipPercent ?? 0}
                      onChange={(e) => handleUpdateAlphaKey({ keyClipPercent: parseInt(e.target.value, 10) })}
                      data-testid="slider-alpha-clip"
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                      <span>0% (Full Shadow Gradient)</span>
                      <span>50% (High Clip)</span>
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
