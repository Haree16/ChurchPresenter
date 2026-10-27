import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { api } from '../services/api';
import { PresentationState } from '../types';
import { MAX_AUTO_ADVANCE_SECONDS, MIN_AUTO_ADVANCE_SECONDS } from '../services/macroSteps';

interface AutoAdvanceControlProps {
  presentationState: PresentationState;
}

const PRESETS = [3, 5, 8, 10, 15, 30];

const field: React.CSSProperties = {
  padding: '4px 6px',
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '6px',
  color: '#f8fafc',
  fontSize: '12px',
  minWidth: 0,
};

/** Seconds until `targetMs`, refreshed every second while `active`. */
function useSecondsUntil(targetMs: number | null | undefined, active: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, targetMs]);
  return active && targetMs != null ? Math.max(0, Math.ceil((targetMs - now) / 1000)) : null;
}

/** Operator control: advance the live slide automatically, optionally looping. */
export const AutoAdvanceControl: React.FC<AutoAdvanceControlProps> = ({ presentationState }) => {
  const [interval, setInterval_] = useState(8);
  const [loop, setLoop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = presentationState.autoAdvance ?? null;
  const countdown = useSecondsUntil(run?.nextAtMs, !!run);
  const canStart = !!presentationState.isLive && !!presentationState.currentSlideId;
  const intervalValid =
    Number.isInteger(interval) && interval >= MIN_AUTO_ADVANCE_SECONDS && interval <= MAX_AUTO_ADVANCE_SECONDS;

  const start = async () => {
    setError(null);
    try {
      await api.startAutoAdvance(interval, loop);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not start auto-advance.');
    }
  };

  const stop = async () => {
    setError(null);
    try {
      await api.stopAutoAdvance();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not stop auto-advance.');
    }
  };

  const paused = !!run && (!presentationState.isLive || presentationState.isBlackout);

  return (
    <div
      data-testid="auto-advance-control"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: run ? '1px solid #34d399' : '1px solid #334155',
        marginTop: '4px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Timer size={12} />
          Auto-Advance
        </span>
        {run && (
          <span data-testid="auto-advance-status" style={{ fontSize: '10px', color: paused ? '#fbbf24' : '#34d399', fontWeight: 700, letterSpacing: '0.05em' }}>
            {paused ? 'PAUSED' : `NEXT IN ${countdown ?? 0}s`}
          </span>
        )}
      </div>

      {run ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#cbd5e1', flex: 1 }}>
            Every {run.intervalSeconds} s{run.loopAtEnd ? ', looping' : ', stops after the last slide'}
          </span>
          <button
            type="button"
            data-testid="auto-advance-stop"
            onClick={stop}
            style={{ padding: '4px 12px', backgroundColor: '#b91c1c', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Stop
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                data-testid="auto-advance-preset"
                aria-pressed={interval === p}
                onClick={() => setInterval_(p)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${interval === p ? '#34d399' : '#334155'}`,
                  backgroundColor: interval === p ? '#064e3b' : '#0f172a',
                  color: '#e2e8f0',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {p}s
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Every
              <input
                data-testid="auto-advance-interval"
                type="number"
                min={MIN_AUTO_ADVANCE_SECONDS}
                max={MAX_AUTO_ADVANCE_SECONDS}
                value={interval}
                onChange={(e) => setInterval_(Number(e.target.value))}
                style={{ ...field, width: '64px' }}
              />
              s
            </label>
            <label style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input data-testid="auto-advance-loop" type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              Loop
            </label>
            <button
              type="button"
              data-testid="auto-advance-start"
              onClick={start}
              disabled={!canStart || !intervalValid}
              title={canStart ? undefined : 'Take a slide live first'}
              style={{
                marginLeft: 'auto',
                padding: '4px 12px',
                backgroundColor: canStart && intervalValid ? '#047857' : '#334155',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: canStart && intervalValid ? 'pointer' : 'default',
              }}
            >
              Start
            </button>
          </div>
          {!canStart && <div style={{ fontSize: '11px', color: '#64748b' }}>Take a slide live first. It advances from there.</div>}
          {!intervalValid && (
            <div style={{ fontSize: '11px', color: '#fca5a5' }}>
              Use a whole number of seconds from {MIN_AUTO_ADVANCE_SECONDS} to {MAX_AUTO_ADVANCE_SECONDS}.
            </div>
          )}
        </>
      )}

      {error && (
        <div role="alert" data-testid="auto-advance-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
