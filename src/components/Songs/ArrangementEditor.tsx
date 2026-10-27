import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Star, Trash2, X } from 'lucide-react';
import { SongArrangement, SongSection } from '../../types';
import { sectionColor } from '../../services/sectionColors';

interface ArrangementEditorProps {
  sections: SongSection[];
  arrangements: SongArrangement[];
  onChange: (arrangements: SongArrangement[]) => void;
  disabled?: boolean;
}

const newArrangementId = () => `arr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

export const ArrangementEditor: React.FC<ArrangementEditorProps> = ({
  sections,
  arrangements,
  onChange,
  disabled = false,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = arrangements.find((a) => a.id === activeId) || arrangements[0] || null;
  const byId = new Map(sections.map((s) => [s.id, s]));

  const update = (id: string, patch: Partial<SongArrangement>) =>
    onChange(arrangements.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const addArrangement = () => {
    const arr: SongArrangement = {
      id: newArrangementId(),
      songId: sections[0]?.songId || '',
      name: `Arrangement ${arrangements.length + 1}`,
      sectionIds: sections.map((s) => s.id),
      isDefault: arrangements.length === 0,
    };
    onChange([...arrangements, arr]);
    setActiveId(arr.id);
  };

  const removeArrangement = (id: string) => {
    const remaining = arrangements.filter((a) => a.id !== id);
    if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }
    onChange(remaining);
    setActiveId(null);
  };

  const setDefault = (id: string) =>
    onChange(arrangements.map((a) => ({ ...a, isDefault: a.id === id })));

  const move = (arr: SongArrangement, index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= arr.sectionIds.length) return;
    const ids = [...arr.sectionIds];
    [ids[index], ids[to]] = [ids[to], ids[index]];
    update(arr.id, { sectionIds: ids });
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: '11px',
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
  };

  return (
    <div
      data-testid="arrangement-editor"
      style={{
        marginTop: '16px',
        padding: '14px',
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>Arrangements</span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          Play sections in a custom order, repeating any (e.g. V1 C V2 C B C).
        </span>
        <button
          type="button"
          data-testid="add-arrangement-btn"
          disabled={disabled || sections.length === 0}
          onClick={addArrangement}
          style={{ ...buttonStyle, marginLeft: 'auto' }}
        >
          <Plus size={12} /> New arrangement
        </button>
      </div>

      {arrangements.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          None yet. Without one, every section plays once in editor order.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {arrangements.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActiveId(a.id)}
                style={{
                  ...buttonStyle,
                  backgroundColor: active?.id === a.id ? '#1d4ed8' : '#1e293b',
                  color: active?.id === a.id ? '#fff' : '#cbd5e1',
                }}
              >
                {a.isDefault && <Star size={11} fill="currentColor" />}
                {a.name}
              </button>
            ))}
          </div>

          {active && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={active.name}
                  disabled={disabled}
                  onChange={(e) => update(active.id, { name: e.target.value })}
                  aria-label="Arrangement name"
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  disabled={disabled || active.isDefault}
                  onClick={() => setDefault(active.id)}
                  style={buttonStyle}
                  title="The default arrangement is used when adding the song to a service"
                >
                  <Star size={11} /> {active.isDefault ? 'Default' : 'Make default'}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeArrangement(active.id)}
                  style={{ ...buttonStyle, color: '#fca5a5' }}
                >
                  <Trash2 size={11} /> Delete
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {active.sectionIds.map((sid, i) => {
                  const sec = byId.get(sid);
                  if (!sec) return null;
                  const color = sectionColor(sec);
                  return (
                    <div
                      key={`${sid}-${i}`}
                      data-testid="arrangement-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        borderLeft: `4px solid ${color}`,
                        backgroundColor: '#111c33',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: '#e2e8f0',
                      }}
                    >
                      <span style={{ color: '#64748b', width: '18px' }}>{i + 1}</span>
                      <span style={{ fontWeight: 600 }}>{sec.label}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
                        <button type="button" disabled={disabled || i === 0} onClick={() => move(active, i, -1)} aria-label="Move up" style={{ ...buttonStyle, padding: '2px 4px' }}>
                          <ArrowUp size={11} />
                        </button>
                        <button type="button" disabled={disabled || i === active.sectionIds.length - 1} onClick={() => move(active, i, 1)} aria-label="Move down" style={{ ...buttonStyle, padding: '2px 4px' }}>
                          <ArrowDown size={11} />
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => update(active.id, { sectionIds: active.sectionIds.filter((_, k) => k !== i) })}
                          aria-label="Remove"
                          style={{ ...buttonStyle, padding: '2px 4px' }}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Add:</span>
                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => update(active.id, { sectionIds: [...active.sectionIds, sec.id] })}
                    style={{ ...buttonStyle, borderLeft: `4px solid ${sectionColor(sec)}` }}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
