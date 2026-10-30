import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Sliders, Trash2, X, Monitor } from 'lucide-react';
import { api } from '../services/api';
import { Look, OutputConfig, PresentationState, Prop, ScreenLookConfig, Theme } from '../types';
import { lookMatches, MAX_LOOK_NAME_CHARS } from '../services/looks';

interface LooksControlProps {
  presentationState: PresentationState;
}

/** Operator panel: apply a saved arrangement of logo, blackout and props, or save the current one. */
export const LooksControl: React.FC<LooksControlProps> = ({ presentationState }) => {
  const [looks, setLooks] = useState<Look[]>([]);
  const [outputs, setOutputs] = useState<OutputConfig[]>([]);
  const [availableProps, setAvailableProps] = useState<Prop[]>([]);
  const [availableThemes, setAvailableThemes] = useState<Theme[]>([]);
  const [targetOutputId, setTargetOutputId] = useState<string>('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-screen look editing modal
  const [editingLook, setEditingLook] = useState<Look | null>(null);
  const [draftLook, setDraftLook] = useState<Look | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [lks, outs, prps, thms] = await Promise.all([
        api.listLooks(),
        api.listOutputs().catch(() => []),
        api.listProps().catch(() => []),
        api.listThemes().catch(() => []),
      ]);
      setLooks(lks);
      setOutputs(outs);
      setAvailableProps(prps);
      setAvailableThemes(thms);
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fail = (err: unknown, fallback: string) =>
    setError(typeof err === 'string' ? err : (err as Error)?.message || fallback);

  const apply = async (id: string, screenId?: string) => {
    setError(null);
    setMessage(null);
    try {
      const effectiveScreen = screenId !== undefined ? screenId : (targetOutputId || undefined);
      await api.applyLook(id, effectiveScreen);
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

  const openEditor = (look: Look) => {
    setEditingLook(look);
    setDraftLook(JSON.parse(JSON.stringify(look)));
  };

  const closeEditor = () => {
    setEditingLook(null);
    setDraftLook(null);
  };

  const saveDraftLook = async () => {
    if (!draftLook) return;
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateLook(draftLook);
      await refresh();
      setMessage(`Updated look "${updated.name}".`);
      closeEditor();
    } catch (err) {
      fail(err, 'Could not update look configurations.');
    }
  };

  const toggleScreenOverride = (outputId: string, enabled: boolean) => {
    if (!draftLook) return;
    const currentConfigs = draftLook.screenConfigs ? [...draftLook.screenConfigs] : [];
    if (enabled) {
      if (!currentConfigs.some((c) => c.outputId === outputId)) {
        currentConfigs.push({
          outputId,
          logo: draftLook.logo,
          blackout: draftLook.blackout,
          propIds: [...draftLook.propIds],
          themeId: null,
        });
      }
    } else {
      const idx = currentConfigs.findIndex((c) => c.outputId === outputId);
      if (idx >= 0) currentConfigs.splice(idx, 1);
    }
    setDraftLook({ ...draftLook, screenConfigs: currentConfigs });
  };

  const updateScreenConfig = (outputId: string, update: Partial<ScreenLookConfig>) => {
    if (!draftLook) return;
    const currentConfigs = (draftLook.screenConfigs ? [...draftLook.screenConfigs] : []).map((sc) => {
      if (sc.outputId === outputId) {
        return { ...sc, ...update };
      }
      return sc;
    });
    setDraftLook({ ...draftLook, screenConfigs: currentConfigs });
  };

  return (
    <div
      data-testid="looks-control"
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', marginTop: '4px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Eye size={12} />
          Looks
        </span>

        {outputs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: '#64748b' }}>Target:</span>
            <select
              data-testid="look-target-screen"
              value={targetOutputId}
              onChange={(e) => setTargetOutputId(e.target.value)}
              style={{
                backgroundColor: '#0f172a',
                color: '#cbd5e1',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #334155',
                cursor: 'pointer',
              }}
            >
              <option value="">All Screens (Global)</option>
              {outputs.map((out) => (
                <option key={out.id} value={out.id}>
                  {out.name} ({out.outputType})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {looks.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          No looks yet. Set up the logo and props the way you want, then save it below.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {looks.map((l) => {
            const on = lookMatches(l, presentationState, targetOutputId || undefined);
            const hasScreenConfigs = (l.screenConfigs && l.screenConfigs.length > 0) || false;
            return (
              <span key={l.id} style={{ display: 'inline-flex' }}>
                <button
                  type="button"
                  data-testid="look-apply"
                  aria-pressed={on}
                  onClick={() => apply(l.id)}
                  title={`${l.logo ? 'Logo on' : 'Logo off'}${l.blackout ? ', blackout' : ''}, ${l.propIds.length} prop${l.propIds.length === 1 ? '' : 's'}${hasScreenConfigs ? ` (${l.screenConfigs!.length} screen overrides)` : ''}`}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px 0 0 6px',
                    border: `1px solid ${on ? '#fbbf24' : '#334155'}`,
                    backgroundColor: on ? '#78350f' : '#0f172a',
                    color: on ? '#fff' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {hasScreenConfigs && <Monitor size={11} style={{ color: '#38bdf8' }} />}
                  {l.name}
                </button>
                <button
                  type="button"
                  data-testid="look-edit"
                  aria-label={`Configure per-screen for ${l.name}`}
                  onClick={() => openEditor(l)}
                  title="Configure per-screen outputs"
                  style={{
                    padding: '4px 6px',
                    border: '1px solid #334155',
                    borderLeft: 'none',
                    backgroundColor: '#0f172a',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <Sliders size={11} />
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

      {/* Per-Screen Look Configuration Modal */}
      {editingLook && draftLook && (
        <div
          data-testid="look-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '16px',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sliders size={16} color="#38bdf8" />
                Configure Look: {draftLook.name}
              </h3>
              <button
                type="button"
                data-testid="look-modal-close"
                onClick={closeEditor}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Global Settings */}
            <div style={{ padding: '8px 12px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Global Default Layers (Applies to all outputs without overrides)
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    data-testid="look-global-logo"
                    checked={draftLook.logo}
                    onChange={(e) => setDraftLook({ ...draftLook, logo: e.target.checked })}
                  />
                  Logo Layer
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    data-testid="look-global-blackout"
                    checked={draftLook.blackout}
                    onChange={(e) => setDraftLook({ ...draftLook, blackout: e.target.checked })}
                  />
                  Blackout Layer
                </label>
              </div>
            </div>

            {/* Per-Screen Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>
                Per-Screen Output Targets & Themes
              </div>

              {outputs.length === 0 ? (
                <div style={{ fontSize: '11px', color: '#64748b' }}>No outputs configured.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {outputs.map((out) => {
                    const sc = draftLook.screenConfigs?.find((c) => c.outputId === out.id);
                    const isOverridden = !!sc;

                    return (
                      <div
                        key={out.id}
                        data-testid={`look-screen-row-${out.id}`}
                        style={{
                          padding: '10px',
                          backgroundColor: isOverridden ? '#1e293b' : '#0f172a',
                          border: `1px solid ${isOverridden ? '#38bdf8' : '#334155'}`,
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{out.name}</span>
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#334155', color: '#cbd5e1' }}>
                              {out.outputType}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                data-testid={`look-screen-override-${out.id}`}
                                checked={isOverridden}
                                onChange={(e) => toggleScreenOverride(out.id, e.target.checked)}
                              />
                              Override for this screen
                            </label>
                            <button
                              type="button"
                              data-testid={`look-screen-apply-${out.id}`}
                              onClick={() => apply(draftLook.id, out.id)}
                              style={{
                                padding: '3px 8px',
                                fontSize: '11px',
                                backgroundColor: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              Apply to screen
                            </button>
                          </div>
                        </div>

                        {isOverridden && sc && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #334155' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                data-testid={`look-screen-logo-${out.id}`}
                                checked={sc.logo}
                                onChange={(e) => updateScreenConfig(out.id, { logo: e.target.checked })}
                              />
                              Logo
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                data-testid={`look-screen-blackout-${out.id}`}
                                checked={sc.blackout}
                                onChange={(e) => updateScreenConfig(out.id, { blackout: e.target.checked })}
                              />
                              Blackout
                            </label>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Theme:</span>
                              <select
                                data-testid={`look-screen-theme-${out.id}`}
                                value={sc.themeId || ''}
                                onChange={(e) => updateScreenConfig(out.id, { themeId: e.target.value || null })}
                                style={{
                                  backgroundColor: '#0f172a',
                                  color: '#f8fafc',
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #334155',
                                }}
                              >
                                <option value="">Default (Follow Presentation)</option>
                                {availableThemes.map((thm) => (
                                  <option key={thm.id} value={thm.id}>
                                    {thm.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {availableProps.length > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Props:</span>
                                {availableProps.map((p) => {
                                  const propOn = sc.propIds.includes(p.id);
                                  return (
                                    <button
                                      type="button"
                                      key={p.id}
                                      data-testid={`look-screen-prop-${out.id}-${p.id}`}
                                      onClick={() => {
                                        const newProps = propOn
                                          ? sc.propIds.filter((id) => id !== p.id)
                                          : [...sc.propIds, p.id];
                                        updateScreenConfig(out.id, { propIds: newProps });
                                      }}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '10px',
                                        borderRadius: '3px',
                                        border: `1px solid ${propOn ? '#38bdf8' : '#334155'}`,
                                        backgroundColor: propOn ? '#0369a1' : '#0f172a',
                                        color: '#fff',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {p.name}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                data-testid="look-modal-apply-all"
                onClick={() => apply(draftLook.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Apply to All Screens
              </button>
              <button
                type="button"
                data-testid="look-modal-save"
                onClick={saveDraftLook}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Save Changes
              </button>
              <button
                type="button"
                data-testid="look-modal-cancel"
                onClick={closeEditor}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
