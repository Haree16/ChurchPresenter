import React, { useCallback, useEffect, useState } from 'react';
import { Eraser, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { ClearGroup, ClearLayer } from '../types';
import { CLEAR_LAYERS, MAX_CLEAR_GROUP_NAME_CHARS, describeLayers, validateClearGroup } from '../services/clearGroups';

/** Operator panel: clear a chosen combination of layers with one click, or make a new combination. */
export const ClearGroupsControl: React.FC = () => {
  const [groups, setGroups] = useState<ClearGroup[]>([]);
  const [name, setName] = useState('');
  const [layers, setLayers] = useState<ClearLayer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setGroups(await api.listClearGroups());
    } catch {
      // keep the previous list
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fail = (err: unknown, fallback: string) =>
    setError(typeof err === 'string' ? err : (err as Error)?.message || fallback);

  const run = async (id: string) => {
    setError(null);
    try {
      await api.runClearGroup(id);
    } catch (err) {
      fail(err, 'Could not clear the group.');
      void refresh();
    }
  };

  const toggleLayer = (layer: ClearLayer) =>
    setLayers((cur) => (cur.includes(layer) ? cur.filter((l) => l !== layer) : [...cur, layer]));

  const draft = { name, layers };
  const canSave = validateClearGroup(draft) === null;

  const save = async () => {
    setError(null);
    try {
      await api.createClearGroup({ id: '', name, layers: CLEAR_LAYERS.map((c) => c.layer).filter((l) => layers.includes(l)) });
      setName('');
      setLayers([]);
      await refresh();
    } catch (err) {
      fail(err, 'Could not save the clear group.');
    }
  };

  const remove = async (g: ClearGroup) => {
    setError(null);
    try {
      await api.deleteClearGroup(g.id);
      await refresh();
    } catch (err) {
      fail(err, 'Could not delete the clear group.');
    }
  };

  return (
    <div
      data-testid="clear-groups-control"
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', marginTop: '4px' }}
    >
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Eraser size={12} />
        Clear groups
      </span>

      {groups.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          No clear groups yet. Tick the layers to clear together, name the group and save it below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {groups.map((g) => (
            <span key={g.id} style={{ display: 'inline-flex' }}>
              <button
                type="button"
                data-testid="clear-group-run"
                onClick={() => run(g.id)}
                title={`Clears: ${describeLayers(g.layers)}`}
                style={{ padding: '4px 10px', borderRadius: '6px 0 0 6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#cbd5e1', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                {g.name}
              </button>
              <button
                type="button"
                data-testid="clear-group-delete"
                aria-label={`Delete ${g.name}`}
                onClick={() => remove(g)}
                style={{ padding: '4px 6px', borderRadius: '0 6px 6px 0', border: '1px solid #334155', borderLeft: 'none', backgroundColor: '#0f172a', color: '#fca5a5', cursor: 'pointer' }}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
        {CLEAR_LAYERS.map((c) => (
          <label key={c.layer} style={{ fontSize: '11px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="checkbox"
              data-testid={`clear-layer-${c.layer}`}
              checked={layers.includes(c.layer)}
              onChange={() => toggleLayer(c.layer)}
            />
            {c.label}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          data-testid="clear-group-name"
          type="text"
          placeholder="Name for the ticked layers"
          value={name}
          maxLength={MAX_CLEAR_GROUP_NAME_CHARS}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) void save();
          }}
          style={{ flex: 1, minWidth: 0, padding: '4px 6px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#f8fafc', fontSize: '12px' }}
        />
        <button
          type="button"
          data-testid="clear-group-save"
          disabled={!canSave}
          onClick={save}
          style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#1e293b', color: canSave ? '#f8fafc' : '#64748b', fontSize: '11px', fontWeight: 600, cursor: canSave ? 'pointer' : 'default' }}
        >
          Save group
        </button>
      </div>

      {error && (
        <div role="alert" data-testid="clear-group-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
