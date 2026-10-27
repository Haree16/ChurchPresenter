import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { api } from '../src/services/api';
import { NetworkExposureControl } from '../src/components/Production/NetworkExposureControl';

describe('Network exposure control', () => {
  it('warns about unencrypted HTTP on the local-network setting for the remote', () => {
    render(<NetworkExposureControl kind="remote" mode="lan" onChange={vi.fn()} />);
    const note = screen.getByTestId('network-exposure-note-remote').textContent || '';
    expect(note).toMatch(/not encrypted/i);
    expect(note).toMatch(/PIN/);
  });

  it('warns that OSC has no password on the local-network setting', () => {
    render(<NetworkExposureControl kind="osc" mode="lan" onChange={vi.fn()} />);
    expect(screen.getByTestId('network-exposure-note-osc').textContent).toMatch(/no password/i);
  });

  it('shows a reassuring note instead of the warning for this-computer-only', () => {
    render(<NetworkExposureControl kind="remote" mode="local" onChange={vi.fn()} />);
    const note = screen.getByTestId('network-exposure-note-remote').textContent || '';
    expect(note).toMatch(/only this computer/i);
    expect(note).not.toMatch(/not encrypted/i);
  });

  it('reports the chosen mode and can be locked while running', () => {
    const onChange = vi.fn();
    const { rerender } = render(<NetworkExposureControl kind="remote" mode="lan" onChange={onChange} />);
    fireEvent.change(screen.getByTestId('bind-mode-select-remote'), { target: { value: 'local' } });
    expect(onChange).toHaveBeenCalledWith('local');

    rerender(<NetworkExposureControl kind="remote" mode="lan" onChange={onChange} locked />);
    expect((screen.getByTestId('bind-mode-select-remote') as HTMLSelectElement).disabled).toBe(true);
  });

  it('stores the mode via the API, defaults to lan and rejects unknown values', async () => {
    expect(await api.getNetworkBindMode()).toBe('lan');
    expect(await api.setNetworkBindMode('local')).toBe('local');
    expect(await api.getNetworkBindMode()).toBe('local');
    await expect(api.setNetworkBindMode('everyone' as any)).rejects.toThrow(/Unknown network mode/);
    expect(await api.setNetworkBindMode('lan')).toBe('lan');
  });
});
