import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { PresentationState, Slide, StageConfig, StagePanel, StagePanelKind } from '../../types';
import { StageCanvas } from './StageCanvas';
import {
  MAX_STAGE_FONT_PCT,
  MAX_STAGE_PANELS,
  STAGE_PANEL_KINDS,
  STAGE_PRESETS,
  clampPanel,
  createPanel,
  defaultFontPct,
  kindLabel,
  validatePanels,
} from '../../services/stageLayouts';

interface StageLayoutEditorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a layout was saved, so open stage windows can refresh. */
  onSaved?: (config: StageConfig) => void;
}

const slide = (title: string, body: string): Slide => ({
  id: title, presentationId: 'p', sortOrder: 0, title, body, backgroundColor: '#000', foregroundColor: '#fff',
  fontSize: 'large', textAlignment: 'center', createdAt: '', updatedAt: '',
});

/** What the preview shows while designing: a live slide, the next one, a timer and a message. */
const SAMPLE_STATE: PresentationState = {
  currentPresentationId: 'p', currentSlideId: 'cur', currentSlideIndex: 1, totalSlides: 6,
  currentSlide: slide('Chorus', 'Amazing grace! How sweet the sound\nThat saved a wretch like me'),
  nextSlide: slide('Verse 2', "'Twas grace that taught my heart to fear\nAnd grace my fears relieved"),
  isBlackout: false, isLive: true, currentItemId: 'item', stageMessage: 'Wrap up in 2 minutes',
  timerState: {
    id: 't', name: 'Sermon', timerType: 'countdown', durationSeconds: 1800, warningThresholdSeconds: 300,
    isRunning: false, startTimeEpochMs: null, accumulatedSeconds: 0,
  } as any,
};

const field: React.CSSProperties = {
  padding: '4px 6px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px',
  color: '#f8fafc', fontSize: '12px', minWidth: 0, width: '100%', boxSizing: 'border-box',
};
const label: React.CSSProperties = { fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' };
const button: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#1e293b',
  color: '#cbd5e1', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
};

export const StageLayoutEditor: React.FC<StageLayoutEditorProps> = ({ isOpen, onClose, onSaved }) => {
  const [config, setConfig] = useState<StageConfig | null>(null);
  const [panels, setPanels] = useState<StagePanel[]>([]);
  const [highContrast, setHighContrast] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelsRef = useRef<StagePanel[]>([]);
  panelsRef.current = panels;

  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    const p = panelsRef.current.find((x) => x.id === id);
    if (!p) return;
    e.preventDefault();
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!drag || !rect || rect.width === 0 || rect.height === 0) return;
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      setPanels((list) => list.map((p) => (p.id === drag.id ? clampPanel({ ...p, x: drag.origX + dx, y: drag.origY + dy }) : p)));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setMessage(null);
    setSelectedId(null);
    api.getStageConfig().then((cfg) => {
      setConfig(cfg);
      setPanels(cfg.panels ? cfg.panels.map((p) => ({ ...p })) : []);
      setHighContrast(cfg.highContrast);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const selected = panels.find((p) => p.id === selectedId) || null;
  const used = new Set(panels.map((p) => p.kind));
  const update = (patch: Partial<StagePanel>) => {
    if (!selected) return;
    setPanels((list) => list.map((p) => (p.id === selected.id ? clampPanel({ ...p, ...patch }) : p)));
  };

  const add = (kind: StagePanelKind) => {
    if (used.has(kind) || panels.length >= MAX_STAGE_PANELS) return;
    const created = createPanel(kind, panels);
    setPanels([...panels, created]);
    setSelectedId(created.id);
  };

  const remove = () => {
    if (!selected) return;
    setPanels(panels.filter((p) => p.id !== selected.id));
    setSelectedId(null);
  };

  const save = async () => {
    if (!config) return;
    const problem = validatePanels(panels);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await api.updateStageConfig({ ...config, panels, highContrast });
      setConfig(saved);
      setMessage(panels.length === 0 ? 'Saved. The stage display uses the classic layout.' : 'Layout saved.');
      onSaved?.(saved);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not save the layout.');
    } finally {
      setSaving(false);
    }
  };

  const num = (key: 'x' | 'y' | 'w' | 'h', testId: string, text: string) => (
    <label style={label}>
      {text}
      <input
        data-testid={testId}
        type="number"
        min={0}
        max={100}
        step={1}
        value={selected ? Math.round(selected[key] * 10) / 10 : 0}
        onChange={(e) => update({ [key]: Number(e.target.value) } as Partial<StagePanel>)}
        style={field}
      />
    </label>
  );

  return (
    <div
      role="dialog"
      aria-label="Stage layout"
      data-testid="stage-layout-editor"
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.75)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: 'min(980px, 96vw)', maxHeight: '94vh', overflowY: 'auto', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '16px', color: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '15px' }}>Stage display layout</strong>
          <button type="button" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '16px' }}>
          <div>
            <div style={{ aspectRatio: '16 / 9', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
              <StageCanvas
                ref={canvasRef}
                panels={panels}
                state={SAMPLE_STATE}
                clock="10:42:07"
                timer={{ display: '24:31', isWarning: false, isExpired: false }}
                highContrast={highContrast}
                interactive
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPanelPointerDown={startDrag}
              />
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
              {panels.length === 0
                ? 'No panels: the stage display uses the classic layout. Add panels or pick a preset to design your own.'
                : 'Drag a panel to move it. Select it to set its size and text size. Preview uses sample text.'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={label}>
              Start from a preset
              <select
                data-testid="stage-preset"
                value=""
                onChange={(e) => {
                  const preset = STAGE_PRESETS.find((p) => p.key === e.target.value);
                  if (preset) {
                    setPanels(preset.build());
                    setSelectedId(null);
                    setMessage(null);
                  }
                }}
                style={field}
              >
                <option value="">Choose…</option>
                {STAGE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <div style={{ ...label, marginBottom: '4px' }}>Add a panel</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {STAGE_PANEL_KINDS.map((k) => (
                  <button
                    key={k.kind}
                    type="button"
                    data-testid={`add-panel-${k.kind}`}
                    disabled={used.has(k.kind) || panels.length >= MAX_STAGE_PANELS}
                    onClick={() => add(k.kind)}
                    style={{ ...button, opacity: used.has(k.kind) ? 0.4 : 1 }}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {panels.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid="panel-row"
                  aria-pressed={p.id === selectedId}
                  onClick={() => setSelectedId(p.id)}
                  style={{ ...button, textAlign: 'left', backgroundColor: p.id === selectedId ? '#1e3a5f' : '#1e293b', borderColor: p.id === selectedId ? '#38bdf8' : '#334155' }}
                >
                  {kindLabel(p.kind)}
                </button>
              ))}
            </div>

            {selected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#0b1220', border: '1px solid #1e293b', borderRadius: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {num('x', 'panel-x', 'X %')}
                  {num('y', 'panel-y', 'Y %')}
                  {num('w', 'panel-w', 'W %')}
                  {num('h', 'panel-h', 'H %')}
                </div>
                <label style={label}>
                  Text size (% of screen height; default {defaultFontPct(selected.kind)})
                  <input
                    data-testid="panel-font"
                    type="number"
                    min={1}
                    max={MAX_STAGE_FONT_PCT}
                    step={0.5}
                    value={selected.fontSizePct ?? defaultFontPct(selected.kind)}
                    onChange={(e) => update({ fontSizePct: Number(e.target.value) })}
                    style={field}
                  />
                </label>
                <button type="button" data-testid="panel-delete" onClick={remove} style={{ ...button, color: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}>
                  <Trash2 size={11} /> Remove panel
                </button>
              </div>
            )}

            <label style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
              <input data-testid="stage-high-contrast" type="checkbox" checked={highContrast} onChange={(e) => setHighContrast(e.target.checked)} />
              High contrast (pure black background)
            </label>
          </div>
        </div>

        {error && (
          <div role="alert" data-testid="stage-layout-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
            {error}
          </div>
        )}
        {message && (
          <div data-testid="stage-layout-message" style={{ fontSize: '12px', color: '#6ee7b7' }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="stage-use-classic"
            onClick={() => {
              setPanels([]);
              setSelectedId(null);
              setMessage(null);
            }}
            style={button}
            title="Remove all panels so the stage display uses the classic layout"
          >
            Use classic layout
          </button>
          <button type="button" data-testid="stage-layout-save" disabled={saving || !config} onClick={save} style={{ padding: '6px 16px', backgroundColor: '#0369a1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Save layout
          </button>
        </div>
      </div>
    </div>
  );
};
