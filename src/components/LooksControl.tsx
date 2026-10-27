import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Look, PresentationState } from '../types';
import { lookMatches, MAX_LOOK_NAME_CHARS } from '../services/looks';

interface LooksControlProps {
  presentationState: PresentationState;
}

/** Operator panel: apply a saved arrangement of logo, blackout and props, or save the current one. */
export const LooksControl: React.FC<LooksControlProps> = ({ presentationState }) => {
  const [looks, setLooks] = useState<Look[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLooks(await api.listLooks());
    } catch {
      // keep the previous list
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fail = (err: unknown, fallback: string) =>
    setError(typeof err === 'string' ? err : (err as Error)?.message || fallback);

  const apply = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      await api.applyLook(id);
    } catch (err) {
      fail(err, 'Could not apply the look.');
      void refresh();
    }
  };

  const saveCurrent = async () => {
    setError(null);
    setMessage(null);
    try {
      const saved = await api.captureLook(name);
      setName('');
      await refresh();
      setMessage(`Saved look "${saved.name}".`);
    } catch (err) {
      fail(err, 'Could not save the look.');
    }
  };

  const remove = async (look: Look) => {
    setError(null);
    setMessage(null);
    try {
      await api.deleteLook(look.id);
      await refresh();
    } catch (err) {
      fail(err, 'Could not delete the look.');
    }
  };

  return (
    <div
      data-testid="looks-control"
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', marginTop: '4px' }}
    >
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Eye size={12} />
        Looks
      </span>

      {looks.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          No looks yet. Set up the logo and props the way you want, then save it below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {looks.map((l) => {
            const on = lookMatches(l, presentationState);
            return (
              <span key={l.id} style={{ display: 'inline-flex' }}>
                <button
                  type="button"
                  data-testid="look-apply"
                  aria-pressed={on}
                  onClick={() => apply(l.id)}
                  title={`${l.logo ? 'Logo on' : 'Logo off'}${l.blackout ? ', blackout' : ''}, ${l.propIds.length} prop${l.propIds.length === 1 ? '' : 's'}`}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px 0 0 6px',
                    border: `1px solid ${on ? '#fbbf24' : '#334155'}`,
                    backgroundColor: on ? '#78350f' : '#0f172a',
                    color: on ? '#fff' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {l.name}
                </button>
                <button
                  type="button"
                  data-testid="look-delete"
                  aria-label={`Delete ${l.name}`}
                  onClick={() => remove(l)}
                  style={{ padding: '4px 6px', borderRadius: '0 6px 6px 0', border: '1px solid #334155', borderLeft: 'none', backgroundColor: '#0f172a', color: '#fca5a5', cursor: 'pointer' }}
                >
                  <Trash2 size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          data-testid="look-name"
          type="text"
          placeholder="Name for the current screen"
          value={name}
          maxLength={MAX_LOOK_NAME_CHARS}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveCurrent();
          }}
          style={{ flex: 1, minWidth: 0, padding: '4px 6px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '12px' }}
        />
        <button
          type="button"
          data-testid="look-save"
          disabled={!name.trim()}
          onClick={saveCurrent}
          style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#1e293b', color: name.trim() ? '#f8fafc' : '#64748b', fontSize: '11px', fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default' }}
        >
          Save current
        </button>
      </div>

      {message && (
        <div data-testid="look-message" style={{ fontSize: '11px', color: '#6ee7b7' }}>
          {message}
        </div>
      )}
      {error && (
        <div role="alert" data-testid="look-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
