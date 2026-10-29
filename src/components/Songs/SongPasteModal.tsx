import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, X } from 'lucide-react';
import { SongSection } from '../../types';
import { api } from '../../services/api';
import { parseLyricsText } from '../../services/lyricsParser';

interface SongPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (songId: string, title: string) => void;
}

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '13px',
};

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 14px',
  borderRadius: '6px',
  border: `1px solid ${primary ? '#2563eb' : '#334155'}`,
  backgroundColor: primary ? '#2563eb' : '#1e293b',
  color: '#f8fafc',
  fontSize: '12px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? 'default' : 'pointer',
});

export const SongPasteModal: React.FC<SongPasteModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('Tamil');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => parseLyricsText(text), [text]);

  const pasteFromClipboard = async () => {
    setError(null);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) {
        setError('The clipboard is empty.');
        return;
      }
      setText(clip);
    } catch {
      setError('Could not read the clipboard. Paste into the box with Ctrl+V instead.');
    }
  };

  // Offer the first line as the title until the user types their own.
  useEffect(() => {
    if (!isOpen) {
      setText('');
      setTitle('');
      setError(null);
    }
  }, [isOpen]);

  const handleCreate = async () => {
    const name = title.trim() || text.trim().split('\n')[0].slice(0, 60);
    if (!name || sections.length === 0) {
      setError('Paste some lyrics first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = Date.now();
      const created = await api.createSong(
        { title: name, language, category: 'Worship', tags: [] },
        sections.map((s, i) => ({
          id: `sec-${now}-${i}`,
          songId: '',
          sectionType: s.sectionType,
          label: s.label,
          lyrics: s.lyrics,
          sortOrder: i,
        })) as SongSection[]
      );
      onCreated(created.song.id, created.song.title);
      onClose();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to create the song.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="song-paste-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '860px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          backgroundColor: '#090d16',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
            <ClipboardPaste size={18} color="#38bdf8" /> Import lyrics from clipboard
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: '#94a3b8' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', gap: '16px', minHeight: 0, flex: 1 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                aria-label="Song title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Song title (defaults to the first line)"
                style={{ ...field, flex: 1 }}
              />
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ ...field, width: '110px' }}
              >
                <option value="Tamil">Tamil</option>
                <option value="English">English</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <button type="button" onClick={pasteFromClipboard} style={btn(false)}>
              <ClipboardPaste size={13} /> Paste from clipboard
            </button>
            <textarea
              aria-label="Lyrics"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Paste lyrics here.\nA blank line starts a new slide.\nName a section with a line like "Chorus" or "[Verse 2]".'}
              style={{ ...field, flex: 1, minHeight: '260px', resize: 'none', lineHeight: 1.45 }}
            />
          </div>

          <div style={{ width: '280px', overflowY: 'auto', fontSize: '12px' }}>
            <div style={{ color: '#94a3b8', marginBottom: '8px' }}>
              {sections.length} section{sections.length === 1 ? '' : 's'}
            </div>
            {sections.map((s, i) => (
              <div
                key={i}
                style={{
                  marginBottom: '8px',
                  padding: '8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                }}
              >
                <div style={{ color: '#60a5fa', fontWeight: 600, marginBottom: '4px' }}>{s.label}</div>
                <div style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>{s.lyrics}</div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div style={{ flex: 1, color: '#fbbf24', fontSize: '12px' }}>{error}</div>
          <button type="button" onClick={onClose} style={btn(false)}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || sections.length === 0}
            style={btn(true, saving || sections.length === 0)}
          >
            Create song
          </button>
        </div>
      </div>
    </div>
  );
};
