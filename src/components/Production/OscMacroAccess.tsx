import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Macro } from '../../types';
import { isAllMacrosAllowed, isMacroAllowed, macroOscPath, setAllMacrosAllowed, setMacroAllowed } from '../../services/macroAccess';

interface OscMacroAccessProps {
  allowlist: string;
  onChange: (allowlist: string) => void;
}

/** Lets the operator choose which saved macros OSC messages may run, and shows each macro's OSC address. */
export const OscMacroAccess: React.FC<OscMacroAccessProps> = ({ allowlist, onChange }) => {
  const [macros, setMacros] = useState<Macro[]>([]);

  useEffect(() => {
    api.listMacros().then(setMacros).catch(() => setMacros([]));
  }, []);

  const all = isAllMacrosAllowed(allowlist);

  return (
    <div data-testid="osc-macro-access" style={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '16px' }}>
      <div style={{ fontWeight: 700, fontSize: '14px' }}>Run macros over OSC</div>
      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
        Send an OSC message to a macro's address to run it. Each macro must be allowed here first; nothing runs by default.
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginTop: '10px', color: '#fbbf24' }}>
        <input type="checkbox" data-testid="osc-allow-all-macros" checked={all} onChange={(e) => onChange(setAllMacrosAllowed(allowlist, e.target.checked))} />
        Allow every macro (anyone on your network could run any of them)
      </label>
      {macros.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>No macros saved yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
          {macros.map((m) => (
            <label key={m.id} data-testid="osc-macro-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <input
                type="checkbox"
                aria-label={`Allow ${m.name}`}
                checked={isMacroAllowed(allowlist, m.id)}
                disabled={all}
                onChange={(e) => onChange(setMacroAllowed(allowlist, m.id, e.target.checked))}
              />
              <span style={{ minWidth: '120px', fontWeight: 600 }}>{m.name}</span>
              <code style={{ color: '#38bdf8', userSelect: 'all' }}>{macroOscPath(m.id)}</code>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
