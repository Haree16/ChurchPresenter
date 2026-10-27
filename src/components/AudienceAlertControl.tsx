import React, { useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../services/api';
import { AudienceAlert } from '../types';
import { MAX_ALERT_CHARS, useActiveAlert } from './AlertBanner';

interface AudienceAlertControlProps {
  alert: AudienceAlert | null | undefined;
}

const DURATIONS: { label: string; seconds: number }[] = [
  { label: '10 s', seconds: 10 },
  { label: '30 s', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: 'Until cleared', seconds: 0 },
];

/** Operator controls for the banner shown over the audience output (e.g. nursery calls). */
export const AudienceAlertControl: React.FC<AudienceAlertControlProps> = ({ alert }) => {
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const active = useActiveAlert(alert);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await api.sendAlert(trimmed, seconds);
      setText('');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not show the alert.');
    }
  };

  const clear = async () => {
    setError(null);
    try {
      await api.clearAlert();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not clear the alert.');
    }
  };

  return (
    <div
      data-testid="audience-alert-control"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: active ? '1px solid #f59e0b' : '1px solid #334155',
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
          <BellRing size={12} />
          Audience Alert
        </span>
        {active && (
          <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 700, letterSpacing: '0.05em' }}>
            ON SCREEN
          </span>
        )}
      </div>
      {active && (
        <div
          data-testid="audience-alert-active"
          style={{
            fontSize: '11px',
            color: '#fde68a',
            backgroundColor: '#422006',
            padding: '4px 6px',
            borderRadius: '4px',
            wordBreak: 'break-word',
          }}
        >
          "{active.message}"
        </div>
      )}
      <input
        type="text"
        value={text}
        maxLength={MAX_ALERT_CHARS}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void send();
        }}
        placeholder="Nursery: family 12 please"
        data-testid="input-alert-text"
        style={{
          padding: '6px 8px',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '6px',
          color: '#f8fafc',
          fontSize: '12px',
          minWidth: 0,
        }}
      />
      <div style={{ display: 'flex', gap: '6px' }}>
        <select
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
          aria-label="Alert duration"
          data-testid="select-alert-duration"
          style={{
            padding: '6px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#f8fafc',
            fontSize: '12px',
          }}
        >
          {DURATIONS.map((d) => (
            <option key={d.seconds} value={d.seconds}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="btn-send-alert"
          onClick={send}
          disabled={!text.trim()}
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: text.trim() ? '#b45309' : '#334155',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: text.trim() ? 'pointer' : 'default',
          }}
        >
          Show Alert
        </button>
        <button
          type="button"
          data-testid="btn-clear-alert"
          onClick={clear}
          disabled={!active}
          style={{
            padding: '6px 8px',
            backgroundColor: '#334155',
            border: 'none',
            borderRadius: '6px',
            color: active ? '#cbd5e1' : '#64748b',
            fontSize: '11px',
            fontWeight: 600,
            cursor: active ? 'pointer' : 'default',
          }}
        >
          Clear
        </button>
      </div>
      {error && (
        <div role="alert" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
