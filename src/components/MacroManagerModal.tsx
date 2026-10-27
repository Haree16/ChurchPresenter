import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { Look, Macro, MacroStep, Prop } from '../types';
import {
  MACRO_ACTIONS,
  MAX_ALERT_CHARS,
  MAX_AUTO_ADVANCE_SECONDS,
  MAX_MACRO_NAME_CHARS,
  MAX_MACRO_STEPS,
  MAX_WAIT_SECONDS,
  MIN_AUTO_ADVANCE_SECONDS,
  newStep,
  stepLabel,
  validateMacro,
} from '../services/macroSteps';

interface MacroManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const blank = (): Macro => ({ id: '', name: '', steps: [] });

const field: React.CSSProperties = {
  padding: '5px 8px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '12px',
  minWidth: 0,
};
const small: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 8px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: '#1e293b',
  color: '#cbd5e1',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
};

const STEP_TYPES: { type: MacroStep['type']; label: string }[] = [
  { type: 'action', label: 'Action' },
  { type: 'alert', label: 'Alert' },
  { type: 'prop', label: 'Prop' },
  { type: 'wait', label: 'Wait' },
  { type: 'look', label: 'Look' },
  { type: 'autoAdvance', label: 'Auto-advance' },
];

export const MacroManagerModal: React.FC<MacroManagerModalProps> = ({ isOpen, onClose }) => {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);
  const [draft, setDraft] = useState<Macro>(blank());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setMacros(await api.listMacros());
    setProps(await api.listProps());
    setLooks(await api.listLooks());
  };

  useEffect(() => {
    if (isOpen) {
      setDraft(blank());
      setError(null);
      void refresh();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const propName = (id: string) => props.find((p) => p.id === id)?.name;
  const setStep = (i: number, step: MacroStep) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, k) => (k === i ? step : s)) }));
  const addStep = (type: MacroStep['type']) =>
    setDraft((d) => (d.steps.length >= MAX_MACRO_STEPS ? d : { ...d, steps: [...d.steps, newStep(type)] }));
  const removeStep = (i: number) => setDraft((d) => ({ ...d, steps: d.steps.filter((_, k) => k !== i) }));
  const moveStep = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const to = i + dir;
      if (to < 0 || to >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[i], steps[to]] = [steps[to], steps[i]];
      return { ...d, steps };
    });

  const save = async () => {
    const problem = validateMacro(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = draft.id ? await api.updateMacro(draft) : await api.createMacro(draft);
      await refresh();
      setDraft(saved);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not save the macro.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteMacro(id);
      if (draft.id === id) setDraft(blank());
      await refresh();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not delete the macro.');
    }
  };

  const renderStepFields = (step: MacroStep, i: number) => {
    switch (step.type) {
      case 'action':
        return (
          <select data-testid="step-action" aria-label="Action" style={{ ...field, flex: 1 }} value={step.action} onChange={(e) => setStep(i, { type: 'action', action: e.target.value })}>
            {MACRO_ACTIONS.map((a) => (
              <option key={a.action} value={a.action}>
                {a.label}
              </option>
            ))}
          </select>
        );
      case 'alert':
        return (
          <>
            <input data-testid="step-alert-message" aria-label="Alert message" style={{ ...field, flex: 1 }} maxLength={MAX_ALERT_CHARS} placeholder="Message" value={step.message} onChange={(e) => setStep(i, { ...step, message: e.target.value })} />
            <select data-testid="step-alert-seconds" aria-label="Alert duration" style={field} value={step.seconds ?? 30} onChange={(e) => setStep(i, { ...step, seconds: Number(e.target.value) })}>
              <option value={10}>10 s</option>
              <option value={30}>30 s</option>
              <option value={60}>1 min</option>
              <option value={0}>Until cleared</option>
            </select>
          </>
        );
      case 'prop':
        return (
          <>
            <select data-testid="step-prop-mode" aria-label="Prop action" style={field} value={step.mode} onChange={(e) => setStep(i, { ...step, mode: e.target.value as 'show' | 'hide' | 'toggle' })}>
              <option value="show">Show</option>
              <option value="hide">Hide</option>
              <option value="toggle">Toggle</option>
            </select>
            <select data-testid="step-prop-id" aria-label="Prop" style={{ ...field, flex: 1 }} value={step.propId} onChange={(e) => setStep(i, { ...step, propId: e.target.value })}>
              <option value="">Choose a prop…</option>
              {props.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        );
      case 'look':
        return (
          <select data-testid="step-look-id" aria-label="Look" style={{ ...field, flex: 1 }} value={step.lookId} onChange={(e) => setStep(i, { type: 'look', lookId: e.target.value })}>
            <option value="">Choose a look…</option>
            {looks.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        );
      case 'wait':
        return (
          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '6px', alignItems: 'center' }}>
            Wait
            <input data-testid="step-wait-seconds" type="number" min={1} max={MAX_WAIT_SECONDS} style={{ ...field, width: '72px' }} value={step.seconds} onChange={(e) => setStep(i, { type: 'wait', seconds: Number(e.target.value) })} />
            seconds
          </label>
        );
      case 'autoAdvance':
        return (
          <>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '6px', alignItems: 'center' }}>
              Every
              <input data-testid="step-aa-interval" type="number" min={MIN_AUTO_ADVANCE_SECONDS} max={MAX_AUTO_ADVANCE_SECONDS} style={{ ...field, width: '72px' }} value={step.intervalSeconds} onChange={(e) => setStep(i, { ...step, intervalSeconds: Number(e.target.value) })} />
              s
            </label>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input data-testid="step-aa-loop" type="checkbox" checked={!!step.loopAtEnd} onChange={(e) => setStep(i, { ...step, loopAtEnd: e.target.checked })} />
              Loop
            </label>
          </>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Manage macros"
      data-testid="macro-manager"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: 'min(760px, 94vw)', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '15px' }}>Macros</strong>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {macros.length === 0 && <div style={{ fontSize: '12px', color: '#64748b' }}>No macros saved yet.</div>}
          {macros.map((m) => (
            <div key={m.id} data-testid="macro-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', backgroundColor: draft.id === m.id ? '#2e1065' : '#1e293b', borderRadius: '6px', fontSize: '12px' }}>
              <button type="button" data-testid="macro-edit" onClick={() => { setDraft(JSON.parse(JSON.stringify(m))); setError(null); }} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#f8fafc', cursor: 'pointer', fontSize: '12px' }}>
                <strong>{m.name}</strong> <span style={{ color: '#94a3b8' }}>{m.steps.length} step{m.steps.length === 1 ? '' : 's'}</span>
              </button>
              <button type="button" aria-label={`Delete ${m.name}`} data-testid="macro-delete" onClick={() => remove(m.id)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            Name
            <input data-testid="macro-name" style={field} maxLength={MAX_MACRO_NAME_CHARS} placeholder="e.g. Start service" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>

          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
            STEPS ({draft.steps.length}/{MAX_MACRO_STEPS}), run in order
          </div>
          {draft.steps.length === 0 && <div style={{ fontSize: '11px', color: '#64748b' }}>Add the first step below.</div>}
          {draft.steps.map((step, i) => (
            <div key={i} data-testid="step-row" style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '6px', backgroundColor: '#111c33', borderRadius: '6px' }}>
              <span style={{ color: '#64748b', width: '18px', fontSize: '11px' }}>{i + 1}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', width: '84px' }} title={stepLabel(step, propName, (id) => looks.find((l) => l.id === id)?.name)}>
                {STEP_TYPES.find((t) => t.type === step.type)?.label}
              </span>
              {renderStepFields(step, i)}
              <button type="button" data-testid="step-up" aria-label="Move step earlier" disabled={i === 0} onClick={() => moveStep(i, -1)} style={small}>
                <ArrowUp size={11} />
              </button>
              <button type="button" data-testid="step-down" aria-label="Move step later" disabled={i === draft.steps.length - 1} onClick={() => moveStep(i, 1)} style={small}>
                <ArrowDown size={11} />
              </button>
              <button type="button" data-testid="step-delete" aria-label="Delete step" onClick={() => removeStep(i)} style={{ ...small, color: '#fca5a5' }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Add step:</span>
            {STEP_TYPES.map((t) => (
              <button key={t.type} type="button" data-testid={`add-step-${t.type}`} disabled={draft.steps.length >= MAX_MACRO_STEPS} onClick={() => addStep(t.type)} style={small}>
                <Plus size={10} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" data-testid="macro-form-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          {draft.id && (
            <button type="button" onClick={() => { setDraft(blank()); setError(null); }} style={small}>
              <Plus size={11} /> New macro
            </button>
          )}
          <button type="button" data-testid="macro-save" onClick={save} disabled={saving} style={{ padding: '6px 14px', backgroundColor: '#6d28d9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            {draft.id ? 'Save changes' : 'Save macro'}
          </button>
        </div>
      </div>
    </div>
  );
};
