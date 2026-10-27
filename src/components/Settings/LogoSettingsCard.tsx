import React, { useState } from 'react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { api } from '../../services/api';
import { useLogoUrl, DEFAULT_LOGO_URL } from '../../hooks/useLogoUrl';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];

/** Settings card for the image shown by "clear to logo" (key: L). */
export const LogoSettingsCard: React.FC = () => {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoUrl = useLogoUrl(version);
  const isCustom = logoUrl !== DEFAULT_LOGO_URL;

  const choose = async () => {
    setError(null);
    setMessage(null);
    try {
      const picked = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
      });
      if (!picked || Array.isArray(picked)) return;
      await api.setCustomLogo(picked);
      setVersion((v) => v + 1);
      setMessage('Logo updated. It appears the next time you clear to logo.');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not set the logo.');
    }
  };

  const reset = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.clearCustomLogo();
      setVersion((v) => v + 1);
      setMessage('Using the built-in logo.');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not reset the logo.');
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div
      data-testid="logo-settings-card"
      style={{
        padding: '16px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          width: '120px',
          height: '68px',
          backgroundColor: '#000',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img
          data-testid="logo-preview"
          src={logoUrl}
          alt="Logo preview"
          style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>Logo screen</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 8px' }}>
          Shown on the audience screen when you press L. {isCustom ? 'Using your custom image.' : 'Using the built-in logo.'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" data-testid="logo-choose-btn" onClick={choose} style={buttonStyle}>
            Choose image…
          </button>
          <button
            type="button"
            data-testid="logo-reset-btn"
            onClick={reset}
            disabled={!isCustom}
            style={{ ...buttonStyle, color: isCustom ? '#f8fafc' : '#64748b', cursor: isCustom ? 'pointer' : 'default' }}
          >
            Use built-in logo
          </button>
        </div>
        {message && <div style={{ marginTop: '6px', fontSize: '12px', color: '#6ee7b7' }}>{message}</div>}
        {error && <div role="alert" style={{ marginTop: '6px', fontSize: '12px', color: '#fca5a5' }}>{error}</div>}
      </div>
    </div>
  );
};
