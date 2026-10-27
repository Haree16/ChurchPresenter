import React, { useEffect, useState } from 'react';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { X, Trash2, Plus } from 'lucide-react';
import { api } from '../services/api';
import { Prop } from '../types';
import {
  PROP_POSITIONS,
  MAX_PROP_NAME_CHARS,
  MAX_PROP_TEXT_CHARS,
  validateProp,
} from '../services/propLayout';

interface PropsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const blankProp = (): Prop => ({
  id: '',
  name: '',
  kind: 'text',
  text: '',
  imagePath: null,
  position: 'lower-third',
  sizePct: 6,
  textColor: '#ffffff',
  backgroundColor: '#000000',
});

const fieldStyle: React.CSSProperties = {
  padding: '6px 8px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '12px',
  minWidth: 0,
};

const labelStyle: React.CSSProperties = { fontSize: '11px', color: '#94a3b8', fontWeight: 600 };

export const PropsManagerModal: React.FC<PropsManagerModalProps> = ({ isOpen, onClose }) => {
  const [props, setProps] = useState<Prop[]>([]);
  const [draft, setDraft] = useState<Prop>(blankProp());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => setProps(await api.listProps());

  useEffect(() => {
    if (isOpen) {
      setDraft(blankProp());
      setError(null);
      void refresh();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const set = <K extends keyof Prop>(key: K, value: Prop[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const problem = validateProp(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (draft.id) await api.updateProp(draft);
      else await api.createProp(draft);
      setDraft(blankProp());
      await refresh();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not save the prop.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteProp(id);
      if (draft.id === id) setDraft(blankProp());
      await refresh();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not delete the prop.');
    }
  };

  const chooseImage = async () => {
    setError(null);
    try {
      const picked = await openFileDialog({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }],
      });
      if (!picked || Array.isArray(picked)) return;
      const asset = await api.importMediaAsset(picked);
      set('imagePath', asset.relativePath);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not import that image.');
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Manage props"
      data-testid="props-manager"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.7)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 'min(720px, 94vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '16px',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '15px' }}>Props</strong>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {props.length === 0 && <div style={{ fontSize: '12px', color: '#64748b' }}>No props saved yet.</div>}
          {props.map((p) => (
            <div
              key={p.id}
              data-testid="prop-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                backgroundColor: draft.id === p.id ? '#1e3a5f' : '#1e293b',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            >
              <button
                type="button"
                data-testid="prop-edit"
                onClick={() => {
                  setDraft({ ...p });
                  setError(null);
                }}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', fontSize: '12px' }}
              >
                <strong>{p.name}</strong>{' '}
                <span style={{ color: '#94a3b8' }}>
                  {p.kind === 'text' ? `“${p.text}”` : 'image'} · {PROP_POSITIONS.find((x) => x.value === p.position)?.label}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                data-testid="prop-delete"
                onClick={() => remove(p.id)}
                style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>Name</span>
            <input data-testid="prop-name" style={fieldStyle} value={draft.name} maxLength={MAX_PROP_NAME_CHARS} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>Type</span>
            <select data-testid="prop-kind" style={fieldStyle} value={draft.kind} onChange={(e) => set('kind', e.target.value as Prop['kind'])}>
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
          </label>

          {draft.kind === 'text' ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Text</span>
              <input data-testid="prop-text" style={fieldStyle} value={draft.text || ''} maxLength={MAX_PROP_TEXT_CHARS} onChange={(e) => set('text', e.target.value)} />
            </label>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Image</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" data-testid="prop-choose-image" onClick={chooseImage} style={{ ...fieldStyle, cursor: 'pointer' }}>
                  Choose image…
                </button>
                <span style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {draft.imagePath || 'No image chosen'}
                </span>
              </div>
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>Position</span>
            <select data-testid="prop-position" style={fieldStyle} value={draft.position} onChange={(e) => set('position', e.target.value as Prop['position'])}>
              {PROP_POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>{draft.kind === 'text' ? 'Text size (% of screen height)' : 'Width (% of screen width)'}</span>
            <input data-testid="prop-size" type="number" min={1} max={100} style={fieldStyle} value={draft.sizePct} onChange={(e) => set('sizePct', Math.round(Number(e.target.value)))} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>Text colour</span>
            <input data-testid="prop-text-color" type="color" value={draft.textColor} onChange={(e) => set('textColor', e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={labelStyle}>Background</span>
            <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                data-testid="prop-bg-color"
                type="color"
                value={draft.backgroundColor || '#000000'}
                disabled={!draft.backgroundColor}
                onChange={(e) => set('backgroundColor', e.target.value)}
              />
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input
                  data-testid="prop-bg-enabled"
                  type="checkbox"
                  checked={!!draft.backgroundColor}
                  onChange={(e) => set('backgroundColor', e.target.checked ? '#000000' : null)}
                />
                Backing box
              </label>
            </span>
          </label>
        </div>

        {error && (
          <div role="alert" data-testid="props-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {draft.id && (
            <button type="button" onClick={() => { setDraft(blankProp()); setError(null); }} style={{ ...fieldStyle, cursor: 'pointer' }}>
              <Plus size={12} /> New prop
            </button>
          )}
          <button
            type="button"
            data-testid="prop-save"
            onClick={save}
            disabled={saving}
            style={{ padding: '6px 14px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            {draft.id ? 'Save changes' : 'Add prop'}
          </button>
        </div>
      </div>
    </div>
  );
};
