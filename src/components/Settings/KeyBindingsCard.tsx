import React, { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { MACRO_ACTIONS } from '../../services/macroSteps';
import {
  TARGET_TYPE_LABELS,
  describeBinding,
  eventToCombo,
  validateKeyBinding,
} from '../../services/keyBindings';
import { KeyBinding, KeyBindingTargetType, Look, Macro, Prop } from '../../types';

const TARGET_TYPES: KeyBindingTargetType[] = ['action', 'prop', 'macro', 'look'];

const fieldStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: '#0f172a',
  color: '#f8fafc',
  fontSize: '12px',
};

/** Settings card for the keyboard shortcuts that run an action, toggle a prop, run a macro or apply a look. */
export const KeyBindingsCard: React.FC = () => {
  const [bindings, setBindings] = useState<KeyBinding[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);

  const [targetType, setTargetType] = useState<KeyBindingTargetType>('action');
  const [targetId, setTargetId] = useState('');
  const [combo, setCombo] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [b, p, m, l] = await Promise.all([api.listKeyBindings(), api.listProps(), api.listMacros(), api.listLooks()]);
    setBindings(b);
    setProps(p);
    setMacros(m);
    setLooks(l);
  }, []);

  useEffect(() => {
    reload().catch((err) => setError(typeof err === 'string' ? err : err?.message || 'Could not load shortcuts.'));
  }, [reload]);

  const targetOptions: { id: string; label: string }[] =
    targetType === 'action'
      ? MACRO_ACTIONS.map((a) => ({ id: a.action, label: a.label }))
      : (targetType === 'prop' ? props : targetType === 'macro' ? macros : looks).map((t) => ({ id: t.id, label: t.name }));

  const draft = { combo, targetType, targetId };
  const draftProblem = combo || targetId ? validateKeyBinding(draft) : null;
  const clash = combo ? bindings.find((b) => b.combo === combo) : undefined;
  const canAdd = !!combo && !!targetId && !draftProblem && !clash;

  const onCaptureKey = (e: React.KeyboardEvent) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setCapturing(false);
      return;
    }
    const next = eventToCombo(e.nativeEvent);
    if (!next) return; // a modifier on its own: keep waiting for the key
    setCombo(next);
    setCapturing(false);
    setError(null);
  };

  const add = async () => {
    setError(null);
    try {
      await api.createKeyBinding({ id: '', combo, targetType, targetId });
      setCombo('');
      setTargetId('');
      await reload();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not save the shortcut.');
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteKeyBinding(id);
      await reload();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not remove the shortcut.');
    }
  };

  return (
    <div
      data-testid="key-bindings-card"
      style={{ padding: '16px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <div>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>Custom shortcuts</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
          Press a key to run an action, toggle a prop, run a macro or apply a look from the operator window. Arrows, Space, B, L, M, C and number keys keep their built-in jobs.
        </div>
      </div>

      {bindings.length === 0 ? (
        <div data-testid="key-bindings-empty" style={{ fontSize: '12px', color: '#94a3b8' }}>
          No custom shortcuts yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {bindings.map((b) => {
            const d = describeBinding(b, { props, macros, looks });
            return (
              <div
                key={b.id}
                data-testid="key-binding-row"
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', backgroundColor: '#0f172a', borderRadius: '6px' }}
              >
                <kbd style={{ minWidth: '90px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#334155', color: '#f8fafc', fontSize: '12px', fontWeight: 700 }}>
                  {b.combo}
                </kbd>
                <span style={{ flex: 1, fontSize: '12px', color: d.missing ? '#f87171' : '#cbd5e1' }}>{d.label}</span>
                <button
                  type="button"
                  aria-label={`Remove shortcut ${b.combo}`}
                  onClick={() => remove(b.id)}
                  style={{ color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          data-testid="key-capture"
          onClick={() => setCapturing(true)}
          onKeyDown={onCaptureKey}
          onBlur={() => setCapturing(false)}
          style={{ ...fieldStyle, minWidth: '150px', fontWeight: 700, cursor: 'pointer', borderColor: capturing ? '#60a5fa' : '#334155' }}
        >
          {capturing ? 'Press the keys…' : combo || 'Click, then press keys'}
        </button>
        <select
          data-testid="key-target-type"
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as KeyBindingTargetType);
            setTargetId('');
          }}
          style={fieldStyle}
        >
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TARGET_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select data-testid="key-target" value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ ...fieldStyle, minWidth: '180px' }}>
          <option value="">{targetOptions.length === 0 ? `No ${TARGET_TYPE_LABELS[targetType].toLowerCase()}s saved` : 'Choose…'}</option>
          {targetOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="key-add"
          disabled={!canAdd}
          onClick={add}
          style={{ ...fieldStyle, fontWeight: 600, cursor: canAdd ? 'pointer' : 'default', opacity: canAdd ? 1 : 0.5 }}
        >
          Add shortcut
        </button>
      </div>

      {(error || clash || draftProblem) && (
        <div data-testid="key-binding-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
          {error || (clash ? `${combo} is already assigned to another shortcut.` : draftProblem)}
        </div>
      )}
    </div>
  );
};
