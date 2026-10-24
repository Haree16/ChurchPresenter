import React from 'react';
import {
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Repeat,
  Film,
  Music,
  Maximize2,
  X,
} from 'lucide-react';
import { MediaPlaybackState } from '../../types';
import { api } from '../../services/api';
import { formatMediaDuration } from '../../services/mediaService';

interface MediaControlsBarProps {
  mediaPlayback: MediaPlaybackState | null | undefined;
  onUpdatePlayback?: (state: MediaPlaybackState | null) => void;
}

export const MediaControlsBar: React.FC<MediaControlsBarProps> = ({
  mediaPlayback,
  onUpdatePlayback,
}) => {
  if (!mediaPlayback || !mediaPlayback.mediaUrl) {
    return null;
  }

  const isVideo = mediaPlayback.mediaType === 'video';
  const isAudio = mediaPlayback.mediaType === 'audio';

  const updateState = async (updates: Partial<MediaPlaybackState>) => {
    const nextState: MediaPlaybackState = {
      ...mediaPlayback,
      ...updates,
    };
    try {
      await api.setMediaPlayback(nextState);
      if (onUpdatePlayback) onUpdatePlayback(nextState);
    } catch (err) {
      console.error('Failed to update media playback:', err);
    }
  };

  const handleTogglePlay = () => {
    updateState({ isPlaying: !mediaPlayback.isPlaying });
  };

  const handleStop = () => {
    updateState({ isPlaying: false, currentTime: 0 });
  };

  const handleToggleMute = () => {
    updateState({ isMuted: !mediaPlayback.isMuted });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    updateState({ volume: vol, isMuted: vol === 0 });
  };

  const handleToggleLoop = () => {
    updateState({ isLooping: !mediaPlayback.isLooping });
  };

  const handleFitModeChange = (mode: 'cover' | 'contain' | 'stretch') => {
    updateState({ fitMode: mode });
  };

  const handleClose = async () => {
    try {
      await api.setMediaPlayback(null);
      if (onUpdatePlayback) onUpdatePlayback(null);
    } catch (err) {
      console.error('Failed to stop media playback:', err);
    }
  };

  return (
    <div
      data-testid="media-controls-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#0b1329',
        borderTop: '1px solid #1e293b',
        borderBottom: '1px solid #1e293b',
        color: '#f8fafc',
        fontSize: '0.875rem',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      {/* Media Type & Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
        {isVideo ? (
          <Film size={18} style={{ color: '#38bdf8' }} />
        ) : isAudio ? (
          <Music size={18} style={{ color: '#a855f7' }} />
        ) : (
          <Maximize2 size={18} style={{ color: '#22c55e' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontWeight: 600,
              color: '#f1f5f9',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '180px',
            }}
            title={mediaPlayback.mediaUrl}
          >
            {mediaPlayback.mediaUrl.split('/').pop() || 'Live Media'}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>
            {mediaPlayback.isPlaying ? '● Playing Live' : '❚❚ Paused'}
          </span>
        </div>
      </div>

      {/* Playback Controls (Play/Pause, Stop, Time) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          data-testid="media-play-pause-btn"
          onClick={handleTogglePlay}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: mediaPlayback.isPlaying ? '#38bdf8' : '#22c55e',
            color: '#000',
            cursor: 'pointer',
          }}
          title={mediaPlayback.isPlaying ? 'Pause' : 'Play'}
        >
          {mediaPlayback.isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button
          data-testid="media-stop-btn"
          onClick={handleStop}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            border: '1px solid #334155',
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            cursor: 'pointer',
          }}
          title="Stop & Rewind"
        >
          <Square size={14} />
        </button>

        {/* Duration / Progress */}
        <span
          data-testid="media-time-display"
          style={{
            fontVariantNumeric: 'tabular-nums',
            color: '#cbd5e1',
            fontSize: '0.8rem',
            marginLeft: '4px',
          }}
        >
          {formatMediaDuration(mediaPlayback.currentTime)} /{' '}
          {formatMediaDuration(mediaPlayback.duration)}
        </span>
      </div>

      {/* Volume & Audio Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          data-testid="media-mute-btn"
          onClick={handleToggleMute}
          style={{
            background: 'none',
            border: 'none',
            color: mediaPlayback.isMuted ? '#ef4444' : '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
          title={mediaPlayback.isMuted ? 'Unmute' : 'Mute'}
        >
          {mediaPlayback.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        <input
          data-testid="media-volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={mediaPlayback.isMuted ? 0 : mediaPlayback.volume}
          onChange={handleVolumeChange}
          style={{
            width: '70px',
            accentColor: '#38bdf8',
            cursor: 'pointer',
          }}
          title={`Volume: ${Math.round((mediaPlayback.isMuted ? 0 : mediaPlayback.volume) * 100)}%`}
        />

        <button
          data-testid="media-loop-btn"
          onClick={handleToggleLoop}
          style={{
            background: 'none',
            border: 'none',
            color: mediaPlayback.isLooping ? '#38bdf8' : '#64748b',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
          title={mediaPlayback.isLooping ? 'Looping enabled' : 'Looping disabled'}
        >
          <Repeat size={16} />
        </button>
      </div>

      {/* Video Fit Mode Selector (Cover, Contain, Stretch) */}
      {isVideo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Fit:</span>
          {(['cover', 'contain', 'stretch'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleFitModeChange(mode)}
              style={{
                fontSize: '0.75rem',
                textTransform: 'capitalize',
                padding: '2px 8px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: mediaPlayback.fitMode === mode ? '#2563eb' : '#1e293b',
                color: mediaPlayback.fitMode === mode ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      )}

      {/* Dismiss / Eject Button */}
      <button
        data-testid="media-eject-btn"
        onClick={handleClose}
        style={{
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          marginLeft: 'auto',
        }}
        title="Stop and clear media output"
      >
        <X size={16} />
      </button>
    </div>
  );
};
export default MediaControlsBar;
