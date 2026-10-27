import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export type BindMode = 'local' | 'lan';

interface NetworkExposureControlProps {
  mode: BindMode;
  kind: 'remote' | 'osc';
  onChange: (mode: BindMode) => void;
  /** True while the server/listener is running; the new mode applies on next start. */
  locked?: boolean;
}

const LAN_WARNING: Record<NetworkExposureControlProps['kind'], string> = {
  remote:
    'Any phone or computer on this network can open the remote page. Controlling needs the 6-digit PIN, but the connection is plain HTTP (not encrypted), so use it only on a network you trust, never on public or guest Wi-Fi.',
  osc:
    'OSC has no password. Any device on this network can send the commands in the allowlist below. Only enable it on a network you trust.',
};

export const NetworkExposureControl: React.FC<NetworkExposureControlProps> = ({
  mode,
  kind,
  onChange,
  locked = false,
}) => {
  const isLan = mode === 'lan';
  const Icon = isLan ? ShieldAlert : ShieldCheck;

  return (
    <div
      data-testid={`network-exposure-${kind}`}
      style={{
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${isLan ? '#a16207' : '#166534'}`,
        backgroundColor: isLan ? 'rgba(234, 179, 8, 0.08)' : 'rgba(34, 197, 94, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <Icon size={15} color={isLan ? '#facc15' : '#4ade80'} />
        <label htmlFor={`bind-mode-${kind}`} style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>
          Who can connect:
        </label>
        <select
          id={`bind-mode-${kind}`}
          data-testid={`bind-mode-select-${kind}`}
          value={mode}
          disabled={locked}
          title={locked ? 'Stop the server first to change this' : undefined}
          onChange={(e) => onChange(e.target.value as BindMode)}
          style={{
            padding: '4px 8px',
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#f8fafc',
            fontSize: '12px',
          }}
        >
          <option value="lan">Devices on my local network</option>
          <option value="local">This computer only</option>
        </select>
        {locked && (
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Stop to change.</span>
        )}
      </div>
      <div
        data-testid={`network-exposure-note-${kind}`}
        style={{ fontSize: '11px', lineHeight: 1.5, color: isLan ? '#fde68a' : '#bbf7d0' }}
      >
        {isLan
          ? LAN_WARNING[kind]
          : 'Only this computer can connect, so phones and other devices will not be able to reach it.'}
      </div>
    </div>
  );
};
