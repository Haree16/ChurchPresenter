import React from 'react';
import {
  Tv,
  HelpCircle,
  Database,
  Radio,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Music,
  LayoutGrid,
  Palette,
  Image as ImageIcon,
  Calendar,
  Clock,
  Monitor,
  Layers,
  Eye,
  Zap,
  Activity,
  Settings,
  Sliders,
  Video,
  Camera,
} from 'lucide-react';
import {
  PresentationState,
  AudienceWindowStatus,
  StageWindowStatus,
  RemoteServerStatus,
  RecordingStatus,
} from '../types';

// Shared geometry for every header action button: same height, padding and
// type, with the label kept on one line so text always fits.
const headerBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: '28px',
  padding: '0 10px',
  boxSizing: 'border-box',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 600,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

export type OperatorActiveView = 'services' | 'presentations' | 'songs' | 'themes';

interface HeaderProps {
  presentationState: PresentationState;
  audienceStatus: AudienceWindowStatus;
  stageStatus?: StageWindowStatus;
  remoteServerStatus?: RemoteServerStatus;
  recordingStatus?: RecordingStatus;
  activeView: OperatorActiveView;
  onChangeView: (view: OperatorActiveView) => void;
  onOpenDisplayModal: () => void;
  onOpenShortcutsModal: () => void;
  onOpenBackupModal: () => void;
  onOpenMediaModal: () => void;
  onOpenTimerModal: () => void;
  onOpenStageModal: () => void;
  onOpenOutputModal?: () => void;
  onOpenMultiViewerModal?: () => void;
  onOpenOverlayModal?: () => void;
  onOpenRecordingModal?: () => void;
  onOpenIntegrationsModal?: () => void;
  onOpenHardwareModal?: () => void;
  onOpenDiagnosticsModal?: () => void;
  onOpenSettingsModal?: () => void;
  onToggleBlackout: () => void;
  onToggleLogo?: () => void;
  onClearMedia?: () => void;
  onClearAll?: () => void;
  isLiveCameraActive?: boolean;
  onToggleLiveCamera?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  presentationState,
  audienceStatus,
  stageStatus,
  remoteServerStatus,
  recordingStatus,
  isLiveCameraActive,
  onToggleLiveCamera,
  activeView,
  onChangeView,
  onOpenDisplayModal,
  onOpenShortcutsModal,
  onOpenBackupModal,
  onOpenMediaModal,
  onOpenTimerModal,
  onOpenStageModal,
  onOpenOutputModal,
  onOpenMultiViewerModal,
  onOpenOverlayModal,
  onOpenRecordingModal,
  onOpenIntegrationsModal,
  onOpenHardwareModal,
  onOpenDiagnosticsModal,
  onOpenSettingsModal,
  onToggleBlackout,
  onToggleLogo,
  onClearMedia,
  onClearAll,
}) => {
  const { isLive, isBlackout, isLogo } = presentationState;

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: '#090d16',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        gap: '12px',
      }}
    >
      {/* Brand & Navigation Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src="/logo.png"
            alt="Church Presenter"
            style={{ width: '32px', height: '32px', borderRadius: '8px' }}
          />
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: '14px',
                color: '#f8fafc',
                lineHeight: 1.2,
              }}
            >
              Church Presenter
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>
              Production Ready • Multi-Window & Livestream Presentation (v1.0.0)
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#0f172a',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid #1e293b',
          }}
        >
          <button
            type="button"
            onClick={() => onChangeView('services')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor:
                activeView === 'services' ? '#1e293b' : 'transparent',
              color: activeView === 'services' ? '#60a5fa' : '#94a3b8',
              border:
                activeView === 'services'
                  ? '1px solid #334155'
                  : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Calendar size={14} />
            <span>Services</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeView('presentations')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor:
                activeView === 'presentations' ? '#1e293b' : 'transparent',
              color: activeView === 'presentations' ? '#38bdf8' : '#94a3b8',
              border:
                activeView === 'presentations'
                  ? '1px solid #334155'
                  : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid size={14} />
            <span>Presentations</span>
          </button>


          <button
            type="button"
            onClick={() => onChangeView('songs')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor:
                activeView === 'songs' ? '#1e293b' : 'transparent',
              color: activeView === 'songs' ? '#f59e0b' : '#94a3b8',
              border:
                activeView === 'songs'
                  ? '1px solid #334155'
                  : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Music size={14} />
            <span>Songs Library</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeView('themes')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor:
                activeView === 'themes' ? '#1e293b' : 'transparent',
              color: activeView === 'themes' ? '#a855f7' : '#94a3b8',
              border:
                activeView === 'themes'
                  ? '1px solid #334155'
                  : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            <Palette size={14} />
            <span>Themes</span>
          </button>
        </nav>
      </div>

      {/* Center - Live & Blackout Status Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isBlackout ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              color: '#f87171',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            <EyeOff size={13} />
            BLACKOUT ACTIVE
          </div>
        ) : isLive ? (
          <div
            className="badge-live-pulse"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            <Radio size={13} />
            LIVE ON AIR
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            STANDBY
          </div>
        )}

        {/* Remote Server Status Badge */}
        {remoteServerStatus?.isRunning && (
          <div
            data-testid="remote-status-badge"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '28px',
              boxSizing: 'border-box',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid #22c55e',
              color: '#4ade80',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                boxShadow: '0 0 6px #22c55e',
              }}
            />
            REMOTE IS ON {remoteServerStatus.pairingPin ? `(PIN: ${remoteServerStatus.pairingPin})` : ''}
          </div>
        )}

        {/* Audience Output Monitor Pill */}
        <button
          type="button"
          onClick={onOpenDisplayModal}
          title="Configure Displays and Audience Window"
          style={{
            ...headerBtn,
            backgroundColor: audienceStatus.isOpen
              ? 'rgba(16, 185, 129, 0.15)'
              : '#1e293b',
            border: `1px solid ${
              audienceStatus.isOpen ? '#059669' : '#334155'
            }`,
            color: audienceStatus.isOpen ? '#34d399' : '#cbd5e1',
          }}
        >
          <Tv size={14} />
          <span>
            {audienceStatus.isOpen
              ? `Audience: ${audienceStatus.monitorName || 'Display 2'}`
              : 'Audience: Off'}
          </span>
          {audienceStatus.isOpen ? (
            <CheckCircle2 size={12} color="#34d399" />
          ) : (
            <AlertCircle size={12} color="#94a3b8" />
          )}
        </button>

        {/* Clear Layers */}
        {onClearMedia && (
          <button
            type="button"
            data-testid="clear-media-btn"
            onClick={onClearMedia}
            disabled={!presentationState.mediaPlayback}
            title="Stop media on the output (Shortcut: M)"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: presentationState.mediaPlayback ? '#f8fafc' : '#64748b',
              cursor: presentationState.mediaPlayback ? 'pointer' : 'default',
            }}
          >
            Clear Media (M)
          </button>
        )}
        {onClearAll && (
          <button
            type="button"
            data-testid="clear-all-btn"
            onClick={onClearAll}
            title="Clear slide, media, logo and blackout: blank output (Shortcut: C)"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            Clear All (C)
          </button>
        )}

        {/* Logo Toggle Button */}
        {onToggleLogo && (
          <button
            type="button"
            data-testid="toggle-logo-btn"
            onClick={onToggleLogo}
            title="Clear to Logo (Shortcut: L)"
            style={{
              ...headerBtn,
              backgroundColor: isLogo ? '#1d4ed8' : '#1e293b',
              border: `1px solid ${isLogo ? '#60a5fa' : '#334155'}`,
              color: isLogo ? '#ffffff' : '#f8fafc',
            }}
          >
            <span>{isLogo ? 'Logo On (L)' : 'Logo (L)'}</span>
          </button>
        )}
        <button
          type="button"
          data-testid="toggle-blackout-btn"
          onClick={onToggleBlackout}
          title="Toggle Black Screen (Shortcut: B)"
          style={{
            ...headerBtn,
            backgroundColor: isBlackout ? '#b91c1c' : '#1e293b',
            border: `1px solid ${isBlackout ? '#ef4444' : '#334155'}`,
            color: isBlackout ? '#ffffff' : '#f8fafc',
          }}
        >
          <EyeOff size={13} />
          <span>{isBlackout ? 'Restore (B)' : 'Black Screen (B)'}</span>
        </button>
      </div>

      {/* Right - Modals and Tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={onOpenMediaModal}
          title="Manage Local Background Images & Videos"
          style={{
            ...headerBtn,
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
          }}
        >
          <ImageIcon size={14} />
          <span>Media</span>
        </button>

        <button
          type="button"
          data-testid="header-timers-btn"
          onClick={onOpenTimerModal}
          title="Service & Stage Timers"
          style={{
            ...headerBtn,
            backgroundColor: presentationState.timerState?.isRunning
              ? 'rgba(56, 189, 248, 0.2)'
              : '#1e293b',
            color: presentationState.timerState?.isRunning ? '#38bdf8' : '#cbd5e1',
            border: `1px solid ${
              presentationState.timerState?.isRunning ? '#38bdf8' : '#334155'
            }`,
          }}
        >
          <Clock size={14} />
          <span>Timers</span>
        </button>

        <button
          type="button"
          data-testid="header-stage-btn"
          onClick={onOpenStageModal}
          title="Stage / Confidence Display Preview"
          style={{
            ...headerBtn,
            backgroundColor: stageStatus?.isOpen
              ? 'rgba(34, 197, 94, 0.2)'
              : '#1e293b',
            color: stageStatus?.isOpen ? '#4ade80' : '#cbd5e1',
            border: `1px solid ${stageStatus?.isOpen ? '#22c55e' : '#334155'}`,
          }}
        >
          <Monitor size={14} />
          <span>Stage {stageStatus?.isOpen ? 'On' : 'Preview'}</span>
        </button>

        {onOpenOutputModal && (
          <button
            type="button"
            data-testid="header-outputs-btn"
            onClick={onOpenOutputModal}
            title="Configure Independent Outputs"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
            }}
          >
            <Layers size={14} />
            <span>Outputs</span>
          </button>
        )}

        {onOpenMultiViewerModal && (
          <button
            type="button"
            data-testid="header-multiviewer-btn"
            onClick={onOpenMultiViewerModal}
            title="Open Multi-Viewer Broadcast Monitor"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid #0284c7',
            }}
          >
            <LayoutGrid size={14} />
            <span>Multi-Viewer</span>
          </button>
        )}

        {onOpenOverlayModal && (
          <button
            type="button"
            data-testid="header-overlay-btn"
            onClick={onOpenOverlayModal}
            title="Livestream & OBS Overlay Settings"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
            }}
          >
            <Eye size={14} />
            <span>Overlay</span>
          </button>
        )}

        {onOpenRecordingModal && (
          <button
            type="button"
            data-testid="header-recording-btn"
            onClick={onOpenRecordingModal}
            title={recordingStatus?.isRecording ? "Audience Output Recording Active - Click to Manage" : "Audience Output Recording"}
            style={{
              ...headerBtn,
              backgroundColor: recordingStatus?.isRecording ? '#dc2626' : '#1e293b',
              color: recordingStatus?.isRecording ? '#ffffff' : '#cbd5e1',
              border: recordingStatus?.isRecording ? '1px solid #ef4444' : '1px solid #334155',
            }}
          >
            <Video size={14} color={recordingStatus?.isRecording ? '#ffffff' : '#cbd5e1'} />
            <span>
              {recordingStatus?.isRecording
                ? `REC ${Math.floor((recordingStatus.elapsedSeconds || 0) / 60)
                    .toString()
                    .padStart(2, '0')}:${((recordingStatus.elapsedSeconds || 0) % 60)
                    .toString()
                    .padStart(2, '0')}`
                : 'Record'}
            </span>
          </button>
        )}

        {onToggleLiveCamera && (
          <button
            type="button"
            data-testid="header-camera-toggle-btn"
            onClick={onToggleLiveCamera}
            title={isLiveCameraActive ? "Live Camera Active (Click to Turn Off)" : "Live Camera Background (Click to Turn On)"}
            style={{
              ...headerBtn,
              backgroundColor: isLiveCameraActive ? '#0284c7' : '#1e293b',
              color: isLiveCameraActive ? '#ffffff' : '#cbd5e1',
              border: isLiveCameraActive ? '1px solid #38bdf8' : '1px solid #334155',
            }}
          >
            <Camera size={14} color={isLiveCameraActive ? '#ffffff' : '#cbd5e1'} />
            <span>{isLiveCameraActive ? 'CAM ON' : 'Camera'}</span>
          </button>
        )}

        {onOpenIntegrationsModal && (
          <button
            type="button"
            data-testid="header-integrations-btn"
            onClick={onOpenIntegrationsModal}
            title="Remote, MIDI, OSC & Action Integrations"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
            }}
          >
            <Zap size={14} />
            <span>Integrations</span>
          </button>
        )}

        {onOpenHardwareModal && (
          <button
            type="button"
            data-testid="header-hardware-btn"
            onClick={onOpenHardwareModal}
            title="Stream Deck, DMX Lighting & Timecode"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
            }}
          >
            <Sliders size={14} />
            <span>Hardware</span>
          </button>
        )}

        {onOpenDiagnosticsModal && (
          <button
            type="button"
            data-testid="header-diagnostics-btn"
            onClick={onOpenDiagnosticsModal}
            title="System Diagnostics & Output Health"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
            }}
          >
            <Activity size={14} />
            <span>Diagnostics</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenBackupModal}
          title="Local Database Backup & Restore"
          style={{
            ...headerBtn,
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
          }}
        >
          <Database size={14} />
          <span>Backup</span>
        </button>

        {onOpenSettingsModal && (
          <button
            type="button"
            data-testid="header-settings-btn"
            onClick={onOpenSettingsModal}
            title="Application Settings & Diagnostics"
            style={{
              ...headerBtn,
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              border: '1px solid #334155',
            }}
          >
            <Settings size={14} />
            <span>Settings</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenShortcutsModal}
          title="Keyboard Shortcuts Cheat Sheet"
          style={{
            ...headerBtn,
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
          }}
        >
          <HelpCircle size={14} />
          <span>Shortcuts</span>
        </button>
      </div>
    </header>
  );
};
