import React, { useState, useEffect } from 'react';
import {
  Video,
  Play,
  Square,
  Pause,
  Folder,
  Trash2,
  Settings,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  FileVideo,
} from 'lucide-react';
import { api } from '../../services/api';
import { recordingService } from '../../services/recordingService';
import { RecordingConfig, RecordingStatus, RecordedFile } from '../../types';

interface RecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordingModal: React.FC<RecordingModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<RecordingConfig>({
    outputDirectory: null,
    containerFormat: 'webm',
    resolution: '1080p',
    videoBitrate: 5_000_000,
    frameRate: 30,
    includeAudio: true,
  });

  const [status, setStatus] = useState<RecordingStatus>({
    isRecording: false,
    isPaused: false,
    sessionId: null,
    startedAt: null,
    elapsedSeconds: 0,
    currentFilePath: null,
    currentFileSizeBytes: 0,
    totalFramesRecorded: 0,
    outputDirectory: '',
  });

  const [recordings, setRecordings] = useState<RecordedFile[]>([]);
  const [customFilename, setCustomFilename] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    try {
      const [cfg, st, files] = await Promise.all([
        api.getRecordingConfig(),
        api.getRecordingStatus(),
        api.listRecordings(),
      ]);
      setConfig(cfg);
      setStatus(st);
      setRecordings(files);
    } catch (err: any) {
      console.error('Failed to load recording state:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void loadData();
      const interval = setInterval(async () => {
        try {
          const st = await api.getRecordingStatus();
          setStatus(st);
        } catch {}
      }, 1000);

      const unlistenStatus = api.onRecordingStatusChanged((newSt) => {
        setStatus(newSt);
      });

      const unlistenCompleted = api.onRecordingCompleted(() => {
        void loadData();
      });

      return () => {
        clearInterval(interval);
        unlistenStatus();
        unlistenCompleted();
      };
    }
  }, [isOpen]);

  const handleStartRecording = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const newStatus = await recordingService.startCapture(
        null,
        customFilename.trim() || undefined
      );
      setStatus(newStatus);
      setCustomFilename('');
      setMessage({ text: 'Recording started successfully.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: `Failed to start recording: ${err?.message || err}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const recorded = await recordingService.stopCapture();
      const st = await api.getRecordingStatus();
      setStatus(st);
      const list = await api.listRecordings();
      setRecordings(list);
      setMessage({
        text: `Recording saved: ${recorded.filename} (${formatBytes(recorded.fileSizeBytes)})`,
        type: 'success',
      });
    } catch (err: any) {
      setMessage({ text: `Failed to stop recording: ${err?.message || err}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePause = async () => {
    try {
      if (status.isPaused) {
        const st = await recordingService.resumeCapture();
        setStatus(st);
      } else {
        const st = await recordingService.pauseCapture();
        setStatus(st);
      }
    } catch (err: any) {
      setMessage({ text: `Failed to toggle pause: ${err?.message || err}`, type: 'error' });
    }
  };

  const handleSaveConfig = async (newCfg: RecordingConfig) => {
    try {
      const saved = await api.updateRecordingConfig(newCfg);
      setConfig(saved);
      setMessage({ text: 'Recording configuration saved.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: `Failed to update configuration: ${err?.message || err}`, type: 'error' });
    }
  };

  const handleDeleteRecording = async (filename: string) => {
    if (confirm(`Delete recording "${filename}"? This action cannot be undone.`)) {
      try {
        await api.deleteRecording(filename);
        setRecordings((prev) => prev.filter((r) => r.filename !== filename));
        setMessage({ text: `Deleted ${filename}`, type: 'success' });
      } catch (err: any) {
        setMessage({ text: `Failed to delete file: ${err?.message || err}`, type: 'error' });
      }
    }
  };

  const handleOpenFolder = async () => {
    try {
      await api.openRecordingFolder();
    } catch (err: any) {
      setMessage({ text: `Failed to open folder: ${err?.message || err}`, type: 'error' });
    }
  };

  const formatDuration = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (!isOpen) return null;

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
        data-testid="recording-modal"
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
                backgroundColor: status.isRecording ? '#dc2626' : '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Video size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                Audience Output Recording
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Capture live presentations and worship services directly to high-quality video files
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

        {/* Message Banner */}
        {message && (
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: message.type === 'success' ? 'rgba(22, 163, 74, 0.2)' : 'rgba(220, 38, 38, 0.2)',
              borderBottom: `1px solid ${message.type === 'success' ? '#16a34a' : '#dc2626'}`,
              color: message.type === 'success' ? '#4ade80' : '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{message.text}</span>
            </div>
            <button
              onClick={() => setMessage(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Live Recording Control Card */}
          <div
            data-testid="recording-live-card"
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: status.isRecording ? '1px solid #dc2626' : '1px solid #334155',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: status.isRecording ? 'rgba(220, 38, 38, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: status.isRecording ? '2px solid #ef4444' : '2px solid #64748b',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: status.isRecording ? '2px' : '50%',
                    backgroundColor: status.isRecording ? '#ef4444' : '#94a3b8',
                  }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    data-testid="recording-status-badge"
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: status.isRecording
                        ? status.isPaused
                          ? 'rgba(234, 179, 8, 0.2)'
                          : 'rgba(220, 38, 38, 0.2)'
                        : 'rgba(100, 116, 139, 0.2)',
                      color: status.isRecording
                        ? status.isPaused
                          ? '#facc15'
                          : '#f87171'
                        : '#94a3b8',
                    }}
                  >
                    {status.isRecording
                      ? status.isPaused
                        ? 'RECORDING PAUSED'
                        : '● RECORDING LIVE'
                      : 'RECORDER STANDBY'}
                  </span>

                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                    {config.resolution.toUpperCase()} • {config.frameRate} FPS • {config.containerFormat.toUpperCase()}
                  </span>
                </div>

                <div
                  data-testid="recording-elapsed-timer"
                  style={{
                    fontSize: '26px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: status.isRecording ? '#f8fafc' : '#64748b',
                    marginTop: '4px',
                  }}
                >
                  {formatDuration(status.elapsedSeconds)}
                </div>

                {status.isRecording && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    Size: {formatBytes(status.currentFileSizeBytes)}
                    {status.currentFilePath && ` • ${status.currentFilePath.split('/').pop()}`}
                  </div>
                )}
              </div>
            </div>

            {/* Recording Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {!status.isRecording ? (
                <>
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder="Custom filename (optional)"
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                      width: '200px',
                    }}
                  />
                  <button
                    data-testid="start-recording-btn"
                    onClick={handleStartRecording}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      backgroundColor: '#dc2626',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <Play size={16} /> Start Recording
                  </button>
                </>
              ) : (
                <>
                  <button
                    data-testid="pause-recording-btn"
                    onClick={handleTogglePause}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      backgroundColor: '#334155',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {status.isPaused ? (
                      <>
                        <Play size={15} /> Resume
                      </>
                    ) : (
                      <>
                        <Pause size={15} /> Pause
                      </>
                    )}
                  </button>

                  <button
                    data-testid="stop-recording-btn"
                    onClick={handleStopRecording}
                    disabled={loading}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      backgroundColor: '#991b1b',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    <Square size={16} /> Stop Recording
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Configuration Card */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings size={16} color="#38bdf8" />
              <span style={{ fontWeight: 700, fontSize: '14px' }}>Video & Output Settings</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '14px',
              }}
            >
              {/* Container Format */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                  CONTAINER FORMAT
                </label>
                <select
                  data-testid="recording-format-select"
                  value={config.containerFormat}
                  disabled={status.isRecording}
                  onChange={(e) => handleSaveConfig({ ...config, containerFormat: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  <option value="webm">WebM (VP9/VP8, Recommended)</option>
                  <option value="mp4">MP4 (H.264/AVC)</option>
                </select>
              </div>

              {/* Resolution */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                  RESOLUTION
                </label>
                <select
                  data-testid="recording-resolution-select"
                  value={config.resolution}
                  disabled={status.isRecording}
                  onChange={(e) => handleSaveConfig({ ...config, resolution: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  <option value="1080p">1080p Full HD (1920×1080)</option>
                  <option value="720p">720p HD (1280×720)</option>
                  <option value="4k">4K Ultra HD (3840×2160)</option>
                  <option value="native">Native Display Match</option>
                </select>
              </div>

              {/* Framerate */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                  FRAMERATE
                </label>
                <select
                  data-testid="recording-framerate-select"
                  value={config.frameRate}
                  disabled={status.isRecording}
                  onChange={(e) => handleSaveConfig({ ...config, frameRate: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  <option value={30}>30 FPS (Standard worship)</option>
                  <option value={60}>60 FPS (High motion clarity)</option>
                </select>
              </div>

              {/* Quality / Bitrate */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                  BITRATE QUALITY
                </label>
                <select
                  data-testid="recording-bitrate-select"
                  value={config.videoBitrate}
                  disabled={status.isRecording}
                  onChange={(e) => handleSaveConfig({ ...config, videoBitrate: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                >
                  <option value={2_500_000}>2.5 Mbps (Low bandwidth / Small file)</option>
                  <option value={5_000_000}>5.0 Mbps (Recommended Standard)</option>
                  <option value={8_000_000}>8.0 Mbps (High Quality)</option>
                  <option value={16_000_000}>16.0 Mbps (Ultra Archive)</option>
                </select>
              </div>
            </div>

            {/* Folder and Audio Options */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                paddingTop: '6px',
                borderTop: '1px solid #334155',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.includeAudio}
                  disabled={status.isRecording}
                  onChange={(e) => handleSaveConfig({ ...config, includeAudio: e.target.checked })}
                  style={{ accentColor: '#3b82f6', width: '15px', height: '15px' }}
                />
                <span>Capture Audio (Presentation media and audio backing tracks)</span>
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Output: <code style={{ color: '#38bdf8' }}>{status.outputDirectory || 'Default Folder'}</code>
                </span>
                <button
                  data-testid="open-recording-folder-btn"
                  onClick={handleOpenFolder}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Folder size={14} /> Open Folder
                </button>
              </div>
            </div>
          </div>

          {/* Recordings Library List */}
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: '1px solid #334155',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#0f172a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileVideo size={16} color="#38bdf8" />
                <span style={{ fontWeight: 700, fontSize: '13px' }}>Recent Recordings</span>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: '#1e293b',
                    fontSize: '11px',
                    color: '#94a3b8',
                  }}
                >
                  {recordings.length}
                </span>
              </div>
              <button
                onClick={loadData}
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
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            {recordings.length === 0 ? (
              <div
                style={{
                  padding: '30px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '13px',
                }}
              >
                No recordings saved yet. Click "Start Recording" above during a presentation.
              </div>
            ) : (
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#090d16', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Filename</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Duration</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Size</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordings.map((rec, idx) => (
                      <tr
                        key={`${rec.filename}-${rec.createdAt}-${idx}`}
                        style={{ borderBottom: '1px solid #1e293b' }}
                      >
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>
                          {rec.filename}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                          {new Date(rec.createdAt).toLocaleDateString()} {new Date(rec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#38bdf8' }}>
                          {formatDuration(rec.durationSeconds)}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                          {formatBytes(rec.fileSizeBytes)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteRecording(rec.filename)}
                            title="Delete Recording"
                            style={{
                              padding: '4px',
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
