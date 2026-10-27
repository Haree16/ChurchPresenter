import React, { useState } from 'react';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { Download, Upload } from 'lucide-react';
import { api } from '../../services/api';
import { Theme } from '../../types';
import { isFontAvailable, missingFonts } from '../../services/themeFonts';

interface ThemeTransferBarProps {
  selectedTheme: Theme | null;
  customThemes: Theme[];
  onImported: (themes: Theme[]) => void;
}

const FILTERS = [{ name: 'Church Presenter theme', extensions: ['cptheme'] }];

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  borderRadius: '4px',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 600,
  border: '1px solid #334155',
  cursor: 'pointer',
};

/** Export themes to a `.cptheme` file (background image included) and import them elsewhere. */
export const ThemeTransferBar: React.FC<ThemeTransferBarProps> = ({ selectedTheme, customThemes, onImported }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMessage(null);
    setNotes([]);
    setError(null);
  };

  const fail = (err: any, fallback: string) => setError(typeof err === 'string' ? err : err?.message || fallback);

  const exportThemes = async (themes: Theme[], defaultName: string) => {
    reset();
    if (themes.length === 0) return;
    try {
      const dest = await saveFileDialog({ defaultPath: `${defaultName}.cptheme`, filters: FILTERS });
      if (!dest) return;
      setBusy(true);
      const res = await api.exportThemesToFile(themes.map((t) => t.id), dest);
      setMessage(`Exported ${res.count} theme${res.count === 1 ? '' : 's'}.`);
      setNotes(res.warnings);
    } catch (err) {
      fail(err, 'Could not export the theme.');
    } finally {
      setBusy(false);
    }
  };

  const importThemes = async () => {
    reset();
    try {
      const picked = await openFileDialog({ multiple: false, filters: FILTERS });
      if (!picked || Array.isArray(picked)) return;
      setBusy(true);
      const res = await api.importThemesFromFile(picked);
      const fontNotes = missingFonts(res.fonts, isFontAvailable).map(
        (f) => `The font "${f}" is not installed on this computer, so text will use a fallback font. Install it to match the original look.`
      );
      setMessage(`Imported ${res.imported.length} theme${res.imported.length === 1 ? '' : 's'}.`);
      setNotes([...res.warnings, ...fontNotes]);
      onImported(res.imported);
    } catch (err) {
      fail(err, 'Could not import that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="theme-transfer" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button type="button" data-testid="theme-import" disabled={busy} onClick={importThemes} style={buttonStyle}>
          <Upload size={12} /> Import…
        </button>
        <button
          type="button"
          data-testid="theme-export"
          disabled={busy || !selectedTheme}
          onClick={() => selectedTheme && exportThemes([selectedTheme], selectedTheme.name.replace(/[\\/:*?"<>|]+/g, '_'))}
          style={buttonStyle}
        >
          <Download size={12} /> Export
        </button>
        <button
          type="button"
          data-testid="theme-export-all"
          disabled={busy || customThemes.length === 0}
          onClick={() => exportThemes(customThemes, 'church-presenter-themes')}
          style={buttonStyle}
          title="Export every custom theme into one file"
        >
          Export all
        </button>
      </div>
      {message && (
        <div data-testid="theme-transfer-message" style={{ fontSize: '11px', color: '#6ee7b7' }}>
          {message}
        </div>
      )}
      {notes.map((n, i) => (
        <div key={i} data-testid="theme-transfer-note" style={{ fontSize: '11px', color: '#fcd34d' }}>
          {n}
        </div>
      ))}
      {error && (
        <div role="alert" data-testid="theme-transfer-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
