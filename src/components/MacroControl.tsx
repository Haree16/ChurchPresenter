import React, { useCallback, useEffect, useState } from 'react';
import { Play, Square, Workflow } from 'lucide-react';
import { api } from '../services/api';
import { Macro, PresentationState } from '../types';
import { MacroManagerModal } from './MacroManagerModal';

interface MacroControlProps {
  presentationState: PresentationState;
}

/** Operator panel: run a saved macro with one click, see its progress, or stop it. */
export const MacroControl: React.FC<MacroControlProps> = ({ presentationState }) => {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = presentationState.runningMacro ?? null;

  const refresh = useCallback(async () => {
    try {
      setMacros(await api.listMacros());
    } catch {
      // keep the previous list
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (id: string) => {
    setError(null);
    try {
      await api.runMacro(id);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not run the macro.');
    }
  };

  const stop = async () => {
    setError(null);
    try {
      await api.stopMacro();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not stop the macro.');
    }
  };

  return (
    <div
      data-testid="macro-control"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: running ? '1px solid #a78bfa' : '1px solid #334155',
        marginTop: '4px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Workflow size={12} />
          Macros
        </span>
        <button
          type="button"
          data-testid="btn-manage-macros"
          onClick={() => setIsManagerOpen(true)}
          style={{ padding: '2px 8px', backgroundColor: '#334155', border: 'none', borderRadius: '6px', color: '#cbd5e1', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
        >
          Manage…
        </button>
      </div>

      {running && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span data-testid="macro-running" style={{ flex: 1, fontSize: '11px', color: '#ddd6fe' }}>
            Running “{running.name}” (step {running.step} of {running.total})
          </span>
          <button
            type="button"
            data-testid="macro-stop"
            onClick={stop}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', backgroundColor: '#b91c1c', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
          >
            <Square size={10} /> Stop
          </button>
        </div>
      )}

      {macros.length === 0 ? (
        <div style={{ fontSize: '11px', color: '#64748b' }}>No macros yet. Use Manage to build one, e.g. “Start service”.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {macros.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid="macro-run"
              disabled={!!running}
              onClick={() => run(m.id)}
              title={running ? 'Another macro is running' : `Run “${m.name}” (${m.steps.length} steps)`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #4c1d95',
                backgroundColor: running ? '#1e1b3a' : '#5b21b6',
                color: running ? '#7c6fb0' : '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: running ? 'default' : 'pointer',
              }}
            >
              <Play size={10} /> {m.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" data-testid="macro-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <MacroManagerModal
        isOpen={isManagerOpen}
        onClose={() => {
          setIsManagerOpen(false);
          void refresh();
        }}
      />
    </div>
  );
};
