import React, { useCallback, useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { api } from '../services/api';
import { Prop, PresentationState } from '../types';
import { PropsManagerModal } from './PropsManagerModal';

interface PropsControlProps {
  presentationState: PresentationState;
}

/** Operator panel: one button per saved prop to show/hide it over the output. */
export const PropsControl: React.FC<PropsControlProps> = ({ presentationState }) => {
  const [props, setProps] = useState<Prop[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeIds = new Set((presentationState.activeProps || []).map((p) => p.id));

  const refresh = useCallback(async () => {
    try {
      setProps(await api.listProps());
    } catch {
      // keep the previous list
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async (id: string) => {
    setError(null);
    try {
      await api.toggleProp(id);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not change the prop.');
      void refresh();
    }
  };

  const clearAll = async () => {
    setError(null);
    try {
      await api.clearProps();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not clear props.');
    }
  };

  return (
    <div
      data-testid="props-control"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: activeIds.size > 0 ? '1px solid #38bdf8' : '1px solid #334155',
        marginTop: '4px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Layers size={12} />
          Props
        </span>
        <span style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            data-testid="btn-clear-props"
            onClick={clearAll}
            disabled={activeIds.size === 0}
            style={{
              padding: '2px 8px',
              backgroundColor: '#334155',
              border: 'none',
              borderRadius: '6px',
              color: activeIds.size > 0 ? '#cbd5e1' : '#64748b',
              fontSize: '11px',
              fontWeight: 600,
              cursor: activeIds.size > 0 ? 'pointer' : 'default',
            }}
          >
            Clear Props
          </button>
          <button
            type="button"
            data-testid="btn-manage-props"
            onClick={() => setIsManagerOpen(true)}
            style={{
              padding: '2px 8px',
              backgroundColor: '#334155',
              border: 'none',
              borderRadius: '6px',
              color: '#cbd5e1',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Manage…
          </button>
        </span>
      </div>

      {props.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#64748b' }}>
          No props yet. Use Manage to add a lower-third or a logo bug.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {props.map((p) => {
            const on = activeIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                data-testid="prop-toggle"
                aria-pressed={on}
                onClick={() => toggle(p.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${on ? '#38bdf8' : '#334155'}`,
                  backgroundColor: on ? '#0369a1' : '#0f172a',
                  color: on ? '#ffffff' : '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}
      {error && (
        <div role="alert" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <PropsManagerModal
        isOpen={isManagerOpen}
        onClose={() => {
          setIsManagerOpen(false);
          void refresh();
        }}
      />
    </div>
  );
};
