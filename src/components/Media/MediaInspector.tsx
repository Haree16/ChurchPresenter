import React, { useState, useEffect } from 'react';
import {
  Crop,
  RotateCw,
  Volume2,
  VolumeX,
  Scissors,
  Repeat,
  Camera,
  Check,
  Sliders,
} from 'lucide-react';
import { MediaAsset } from '../../types';

interface MediaInspectorProps {
  asset: MediaAsset;
  onUpdateAsset: (updated: MediaAsset) => Promise<void>;
  videoElementRef?: React.RefObject<HTMLVideoElement | null>;
}

export const MediaInspector: React.FC<MediaInspectorProps> = ({
  asset,
  onUpdateAsset,
  videoElementRef,
}) => {
  const [cropTop, setCropTop] = useState<number>(asset.cropTop ?? 0);
  const [cropBottom, setCropBottom] = useState<number>(asset.cropBottom ?? 0);
  const [cropLeft, setCropLeft] = useState<number>(asset.cropLeft ?? 0);
  const [cropRight, setCropRight] = useState<number>(asset.cropRight ?? 0);
  const [rotation, setRotation] = useState<number>(asset.rotation ?? 0);
  const [volume, setVolume] = useState<number>(asset.volume ?? 1.0);
  const [trimIn, setTrimIn] = useState<number>(asset.trimIn ?? 0);
  const [trimOut, setTrimOut] = useState<number | null>(asset.trimOut ?? null);
  const [isLooping, setIsLooping] = useState<boolean>(asset.isLooping ?? true);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(asset.thumbnailPath ?? null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state whenever selected asset changes
  useEffect(() => {
    setCropTop(asset.cropTop ?? 0);
    setCropBottom(asset.cropBottom ?? 0);
    setCropLeft(asset.cropLeft ?? 0);
    setCropRight(asset.cropRight ?? 0);
    setRotation(asset.rotation ?? 0);
    setVolume(asset.volume ?? 1.0);
    setTrimIn(asset.trimIn ?? 0);
    setTrimOut(asset.trimOut ?? null);
    setIsLooping(asset.isLooping ?? true);
    setThumbnailPath(asset.thumbnailPath ?? null);
    setSaveSuccess(false);
    setError(null);
  }, [asset.id]);

  const handleSave = async (overrides?: Partial<MediaAsset>) => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updated: MediaAsset = {
        ...asset,
        cropTop,
        cropBottom,
        cropLeft,
        cropRight,
        rotation,
        volume,
        trimIn,
        trimOut,
        isLooping,
        thumbnailPath,
        ...overrides,
      };

      await onUpdateAsset(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCaptureVideoThumbnail = async () => {
    const video = videoElementRef?.current;
    if (!video) {
      setError('Video preview element is not ready.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize 2D canvas.');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      setThumbnailPath(dataUrl);
      await handleSave({ thumbnailPath: dataUrl });
    } catch (err) {
      setError(`Failed to capture thumbnail: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSetInFromCurrent = () => {
    const video = videoElementRef?.current;
    if (video) {
      const current = parseFloat(video.currentTime.toFixed(2));
      setTrimIn(current);
    }
  };

  const handleSetOutFromCurrent = () => {
    const video = videoElementRef?.current;
    if (video) {
      const current = parseFloat(video.currentTime.toFixed(2));
      setTrimOut(current);
    }
  };

  const handleResetDefaults = async () => {
    setCropTop(0);
    setCropBottom(0);
    setCropLeft(0);
    setCropRight(0);
    setRotation(0);
    setVolume(1.0);
    setTrimIn(0);
    setTrimOut(null);
    setIsLooping(true);

    await handleSave({
      cropTop: 0,
      cropBottom: 0,
      cropLeft: 0,
      cropRight: 0,
      rotation: 0,
      volume: 1.0,
      trimIn: 0,
      trimOut: null,
      isLooping: true,
    });
  };

  const isAudioOrVideo = asset.mediaType === 'video' || asset.mediaType === 'audio';

  return (
    <div
      data-testid="media-inspector-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontSize: '0.8rem',
        color: '#e2e8f0',
      }}
    >
      {/* Inspector Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#f8fafc' }}>
          <Sliders size={15} style={{ color: '#38bdf8' }} />
          <span>Media Inspector</span>
        </div>
        <button
          type="button"
          onClick={handleResetDefaults}
          title="Reset to defaults"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: '0.7rem',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          Reset All
        </button>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
          }}
        >
          {error}
        </div>
      )}

      {/* 1. Crop Settings */}
      <div
        style={{
          backgroundColor: '#0f172a',
          borderRadius: '6px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: 600 }}>
            <Crop size={13} style={{ color: '#38bdf8' }} />
            <span>Crop (Inset %)</span>
          </div>
          {(cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) && (
            <button
              type="button"
              onClick={() => {
                setCropTop(0);
                setCropBottom(0);
                setCropLeft(0);
                setCropRight(0);
              }}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.7rem', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem' }}>
              <span>Top: {cropTop}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={45}
              value={cropTop}
              onChange={(e) => setCropTop(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem' }}>
              <span>Bottom: {cropBottom}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={45}
              value={cropBottom}
              onChange={(e) => setCropBottom(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem' }}>
              <span>Left: {cropLeft}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={45}
              value={cropLeft}
              onChange={(e) => setCropLeft(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem' }}>
              <span>Right: {cropRight}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={45}
              value={cropRight}
              onChange={(e) => setCropRight(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>
        </div>
      </div>

      {/* 2. Rotation Settings */}
      <div
        style={{
          backgroundColor: '#0f172a',
          borderRadius: '6px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: 600 }}>
          <RotateCw size={13} style={{ color: '#38bdf8' }} />
          <span>Rotation</span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {[0, 90, 180, 270].map((deg) => (
            <button
              key={deg}
              type="button"
              onClick={() => setRotation(deg)}
              style={{
                flex: 1,
                padding: '4px 0',
                borderRadius: '4px',
                fontSize: '0.75rem',
                border: rotation === deg ? '1px solid #38bdf8' : '1px solid #334155',
                backgroundColor: rotation === deg ? 'rgba(56, 189, 248, 0.15)' : '#1e293b',
                color: rotation === deg ? '#38bdf8' : '#cbd5e1',
                cursor: 'pointer',
                fontWeight: rotation === deg ? 700 : 400,
              }}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>

      {/* 3. Audio Volume (for Video/Audio) */}
      {isAudioOrVideo && (
        <div
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: 600 }}>
              {volume === 0 ? (
                <VolumeX size={13} style={{ color: '#f43f5e' }} />
              ) : (
                <Volume2 size={13} style={{ color: '#38bdf8' }} />
              )}
              <span>Volume: {Math.round(volume * 100)}%</span>
            </div>
            <button
              type="button"
              onClick={() => setVolume(volume > 0 ? 0 : 1.0)}
              style={{
                background: 'none',
                border: 'none',
                color: volume === 0 ? '#38bdf8' : '#94a3b8',
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            >
              {volume === 0 ? 'Unmute' : 'Mute'}
            </button>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8' }}
          />
        </div>
      )}

      {/* 4. Playback Trim & Loop (for Video/Audio) */}
      {isAudioOrVideo && (
        <div
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: 600 }}>
            <Scissors size={13} style={{ color: '#38bdf8' }} />
            <span>Trim Playback (In / Out)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', marginBottom: '2px' }}>
                Trim In (sec)
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={trimIn}
                  onChange={(e) => setTrimIn(Math.max(0, parseFloat(e.target.value) || 0))}
                  style={{
                    width: '100%',
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    padding: '3px 6px',
                    fontSize: '0.75rem',
                  }}
                />
                {asset.mediaType === 'video' && (
                  <button
                    type="button"
                    onClick={handleSetInFromCurrent}
                    title="Set from current player frame"
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                    }}
                  >
                    Here
                  </button>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', marginBottom: '2px' }}>
                Trim Out (sec)
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="End"
                  value={trimOut ?? ''}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setTrimOut(val === '' ? null : Math.max(0, parseFloat(val) || 0));
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    color: '#f8fafc',
                    padding: '3px 6px',
                    fontSize: '0.75rem',
                  }}
                />
                {asset.mediaType === 'video' && (
                  <button
                    type="button"
                    onClick={handleSetOutFromCurrent}
                    title="Set from current player frame"
                    style={{
                      padding: '2px 6px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                    }}
                  >
                    Here
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Repeat size={13} style={{ color: isLooping ? '#38bdf8' : '#64748b' }} />
              <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Loop Playback</span>
            </div>
            <input
              type="checkbox"
              checked={isLooping}
              onChange={(e) => setIsLooping(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
            />
          </div>
        </div>
      )}

      {/* 5. Video Thumbnail Capture */}
      {asset.mediaType === 'video' && (
        <div
          style={{
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontWeight: 600 }}>
              <Camera size={13} style={{ color: '#38bdf8' }} />
              <span>Video Thumbnail</span>
            </div>
            {thumbnailPath && (
              <button
                type="button"
                onClick={() => {
                  setThumbnailPath(null);
                  void handleSave({ thumbnailPath: null });
                }}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.7rem', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleCaptureVideoThumbnail}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 10px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              color: '#f8fafc',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <Camera size={13} />
            <span>Capture Current Frame as Thumbnail</span>
          </button>
        </div>
      )}

      {/* Save Button */}
      <button
        type="button"
        data-testid="media-inspector-save-btn"
        onClick={() => void handleSave()}
        disabled={isSaving}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '8px 12px',
          backgroundColor: '#0284c7',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: isSaving ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.7 : 1,
          marginTop: '4px',
        }}
      >
        {saveSuccess ? (
          <>
            <Check size={14} style={{ color: '#86efac' }} />
            <span>Saved Settings</span>
          </>
        ) : (
          <span>{isSaving ? 'Saving...' : 'Apply & Save Settings'}</span>
        )}
      </button>
    </div>
  );
};
