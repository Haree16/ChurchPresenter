import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { MediaAsset, Theme } from '../../types';

interface ThemeBackgroundControlProps {
  theme: Theme;
  onChange: (patch: Partial<Theme>) => void;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '12px',
};

/** Picks a background image for a theme from the media library, and how it fills the screen. */
export const ThemeBackgroundControl: React.FC<ThemeBackgroundControlProps> = ({ theme, onChange }) => {
  const [images, setImages] = useState<MediaAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .listMediaAssets()
      .then((assets) => {
        if (!cancelled) setImages(assets.filter((a) => a.mediaType === 'image'));
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = images.find((a) => a.relativePath === theme.backgroundImagePath);
  // an image set some other way (an imported theme) is still shown, just not in the library
  const hasUnlisted = !!theme.backgroundImagePath && !current;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '12px' }}>
      <div>
        <label htmlFor="theme-bg-image" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
          Background Image
        </label>
        <select
          id="theme-bg-image"
          data-testid="theme-bg-image"
          style={selectStyle}
          value={current?.id ?? (hasUnlisted ? '__current__' : '')}
          disabled={theme.isBuiltIn}
          onChange={(e) => {
            const asset = images.find((a) => a.id === e.target.value);
            if (!asset && e.target.value === '__current__') return;
            onChange({ backgroundImageId: asset?.id ?? null, backgroundImagePath: asset?.relativePath ?? null });
          }}
        >
          <option value="">None (solid colour)</option>
          {hasUnlisted && <option value="__current__">Imported image</option>}
          {images.map((a) => (
            <option key={a.id} value={a.id}>
              {a.originalFilename}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="theme-bg-mode" style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
          Fit
        </label>
        <select
          id="theme-bg-mode"
          data-testid="theme-bg-mode"
          style={selectStyle}
          value={theme.backgroundMode || 'cover'}
          disabled={theme.isBuiltIn || !theme.backgroundImagePath}
          onChange={(e) => onChange({ backgroundMode: e.target.value as Theme['backgroundMode'] })}
        >
          <option value="cover">Fill (crop)</option>
          <option value="contain">Fit (letterbox)</option>
          <option value="stretch">Stretch</option>
        </select>
      </div>
    </div>
  );
};
