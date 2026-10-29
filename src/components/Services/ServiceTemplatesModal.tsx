import React, { useCallback, useEffect, useState } from 'react';
import { Layers, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { Service, ServiceTemplateSummary } from '../../types';
import { defaultServiceTitle, validateServiceTitle, validateTemplateName, MAX_TEMPLATE_NAME_CHARS } from '../../services/serviceTemplates';

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px',
};
const panel: React.CSSProperties = {
  width: '560px', maxWidth: '95vw', maxHeight: '90vh', backgroundColor: '#090d16', borderRadius: '12px',
  border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const field: React.CSSProperties = {
  padding: '6px 8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f8fafc', fontSize: '12px',
};
const primary: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '12px', fontWeight: 600,
};

const errorText = (err: unknown, fallback: string): string => (typeof err === 'string' ? err : (err as Error)?.message || fallback);

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the new service once it has been made. */
  onCreated: (service: Service) => void;
}

/** Start a new service from a saved template, or delete templates. */
export const ServiceTemplatesModal: React.FC<TemplatesModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [templates, setTemplates] = useState<ServiceTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [keepSongs, setKeepSongs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setTemplates(await api.listServiceTemplates());
    } catch (err) {
      setError(errorText(err, 'Could not load the templates.'));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(null);
      setError(null);
      void reload();
    }
  }, [isOpen, reload]);

  if (!isOpen) return null;

  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const titleProblem = selected ? validateServiceTitle(title) : null;

  const choose = (t: ServiceTemplateSummary) => {
    setSelectedId(t.id);
    setTitle(defaultServiceTitle(t.name, date));
    setError(null);
  };

  const create = async () => {
    if (!selected || titleProblem) return;
    setBusy(true);
    setError(null);
    try {
      const service = await api.createServiceFromTemplate(selected.id, title, date || null, keepSongs);
      onCreated(service);
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not make the service.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: ServiceTemplateSummary) => {
    setError(null);
    try {
      await api.deleteServiceTemplate(t.id);
      if (selectedId === t.id) setSelectedId(null);
      await reload();
    } catch (err) {
      setError(errorText(err, 'Could not delete the template.'));
    }
  };

  return (
    <div style={overlay}>
      <div data-testid="service-templates-modal" style={panel}>
        <div style={{ padding: '14px 20px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="#38bdf8" />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>New service from a template</span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {templates.length === 0 ? (
            <div data-testid="templates-empty" style={{ fontSize: '12px', color: '#94a3b8' }}>
              No templates yet. Use the template button on a service in the list to save it as one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {templates.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    data-testid="template-choice"
                    aria-pressed={t.id === selectedId}
                    onClick={() => choose(t)}
                    style={{
                      flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                      backgroundColor: t.id === selectedId ? '#1e293b' : '#0f172a', color: '#f8fafc',
                      border: `1px solid ${t.id === selectedId ? '#3b82f6' : '#1e293b'}`,
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {t.itemCount} {t.itemCount === 1 ? 'item' : 'items'}
                      {t.slotCount > 0 && `, ${t.slotCount} for songs or scripture`}
                    </div>
                  </button>
                  <button
                    type="button"
                    data-testid="template-delete"
                    aria-label={`Delete template ${t.name}`}
                    onClick={() => remove(t)}
                    style={{ padding: '0 10px', borderRadius: '6px', border: '1px solid #1e293b', backgroundColor: '#0f172a', color: '#f87171', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selected && (
            <div data-testid="template-form" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                Title of the new service
                <input data-testid="template-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
              </label>
              <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                Date (optional)
                <input
                  data-testid="template-date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    // keep a title that still follows the template name in step with the date
                    if (title === defaultServiceTitle(selected.name, date)) setTitle(defaultServiceTitle(selected.name, e.target.value));
                    setDate(e.target.value);
                  }}
                  style={field}
                />
              </label>
              {selected.slotCount > 0 && (
                <label style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <input data-testid="template-keep" type="checkbox" checked={keepSongs} onChange={(e) => setKeepSongs(e.target.checked)} style={{ marginTop: '2px' }} />
                  <span>
                    Keep the songs and scripture from the template
                    <span style={{ display: 'block', color: '#64748b' }}>
                      Off: each one becomes an empty "Worship song" or "Scripture reading" line to fill in.
                    </span>
                  </span>
                </label>
              )}
              {titleProblem && title && (
                <div role="alert" style={{ fontSize: '12px', color: '#fca5a5' }}>
                  {titleProblem}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  data-testid="template-create"
                  disabled={!!titleProblem || busy}
                  onClick={create}
                  style={{ ...primary, opacity: titleProblem || busy ? 0.5 : 1, cursor: titleProblem || busy ? 'default' : 'pointer' }}
                >
                  Create service
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" data-testid="template-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface SaveDialogProps {
  service: Service | null;
  onClose: () => void;
  onSaved: (template: ServiceTemplateSummary) => void;
}

/** Asks for a name and saves a service as a template. Open when `service` is set. */
export const SaveServiceTemplateDialog: React.FC<SaveDialogProps> = ({ service, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(service?.title ?? '');
    setError(null);
  }, [service]);

  if (!service) return null;
  const problem = validateTemplateName(name);

  const save = async () => {
    if (problem) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.saveServiceAsTemplate(service.id, name));
      onClose();
    } catch (err) {
      setError(errorText(err, 'Could not save the template.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay}>
      <div data-testid="save-template-dialog" style={{ ...panel, width: '420px' }}>
        <div style={{ padding: '14px 20px', backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b', fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
          Save "{service.title}" as a template
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Saves the order of this service's items and the slides of each. A new service made from it can start with songs and scripture left empty.
          </div>
          <input
            data-testid="save-template-name"
            type="text"
            autoFocus
            value={name}
            maxLength={MAX_TEMPLATE_NAME_CHARS}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            style={field}
          />
          {(error || (problem && name)) && (
            <div role="alert" data-testid="save-template-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
              {error || problem}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} style={{ ...field, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              type="button"
              data-testid="save-template-confirm"
              disabled={!!problem || busy}
              onClick={save}
              style={{ ...primary, opacity: problem || busy ? 0.5 : 1, cursor: problem || busy ? 'default' : 'pointer' }}
            >
              Save template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
