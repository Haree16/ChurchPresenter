import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { SlideTemplate } from '../types';
import { MAX_TEMPLATE_NAME_CHARS } from '../services/slideTemplates';

interface TemplatePanelProps {
  /** The editor's current look, saved when the user chooses "Save as template". */
  current: Omit<SlideTemplate, 'id' | 'name'>;
  /** Called with the chosen template so the editor can apply it to the slide being edited. */
  onApply: (template: SlideTemplate) => void;
}

const field: React.CSSProperties = {
  padding: '4px 6px',
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '12px',
  minWidth: 0,
};
const button: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
};

/** Apply a saved slide look, save the current one as a template, or delete a template. */
export const TemplatePanel: React.FC<TemplatePanelProps> = ({ current, onApply }) => {
  const [templates, setTemplates] = useState<SlideTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTemplates(await api.listSlideTemplates());
    } catch {
      // keep the previous list
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = templates.find((t) => t.id === selectedId) || null;
  const fail = (err: unknown, fallback: string) =>
    setError(typeof err === 'string' ? err : (err as Error)?.message || fallback);

  const save = async () => {
    setError(null);
    setMessage(null);
    try {
      const created = await api.createSlideTemplate({ ...current, id: '', name: newName } as SlideTemplate);
      setNewName('');
      await refresh();
      setSelectedId(created.id);
      setMessage(`Saved template "${created.name}".`);
    } catch (err) {
      fail(err, 'Could not save the template.');
    }
  };

  const remove = async () => {
    if (!selected) return;
    setError(null);
    setMessage(null);
    try {
      await api.deleteSlideTemplate(selected.id);
      setSelectedId('');
      await refresh();
      setMessage(`Deleted "${selected.name}".`);
    } catch (err) {
      fail(err, 'Could not delete the template.');
    }
  };

  return (
    <div data-testid="template-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>TEMPLATES</span>

      <div style={{ display: 'flex', gap: '6px' }}>
        <select
          data-testid="template-select"
          aria-label="Template"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{ ...field, flex: 1 }}
        >
          <option value="">{templates.length === 0 ? 'No templates yet' : 'Choose a template…'}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="template-apply"
          disabled={!selected}
          onClick={() => selected && onApply(selected)}
          style={{ ...button, color: selected ? '#f8fafc' : '#64748b' }}
          title="Replaces this slide's colours, text size, alignment, background, margin, outline and extra elements. The text stays."
        >
          Apply
        </button>
        <button
          type="button"
          data-testid="template-delete"
          disabled={!selected}
          onClick={remove}
          style={{ ...button, color: selected ? '#fca5a5' : '#64748b' }}
        >
          Delete
        </button>
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          data-testid="template-name"
          type="text"
          placeholder="Name for a new template"
          value={newName}
          maxLength={MAX_TEMPLATE_NAME_CHARS}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          style={{ ...field, flex: 1 }}
        />
        <button type="button" data-testid="template-save" disabled={!newName.trim()} onClick={save} style={{ ...button, color: newName.trim() ? '#f8fafc' : '#64748b' }}>
          Save this look
        </button>
      </div>

      {message && (
        <div data-testid="template-message" style={{ fontSize: '11px', color: '#6ee7b7' }}>
          {message}
        </div>
      )}
      {error && (
        <div role="alert" data-testid="template-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
