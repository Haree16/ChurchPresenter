import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';

describe('Display & Monitor Manager', () => {
  it('detects available monitors and distinguishes primary from secondary display', async () => {
    const monitors = await api.getAvailableMonitors();
    expect(Array.isArray(monitors)).toBe(true);
    expect(monitors.length).toBeGreaterThan(0);

    const primary = monitors.find((m) => m.isPrimary);
    expect(primary).toBeDefined();
    expect(primary?.width).toBeGreaterThan(0);
    expect(primary?.height).toBeGreaterThan(0);
  });

  it('handles opening and closing audience window gracefully', async () => {
    // Open audience window on external display
    const openStatus = await api.openAudienceWindow('external-projector', true);
    expect(openStatus.isOpen).toBe(true);
    expect(openStatus.isFullscreen).toBe(true);

    // Close audience window
    const closeStatus = await api.closeAudienceWindow();
    expect(closeStatus.isOpen).toBe(false);
  });

  it('persists and restores display preference setting', async () => {
    await api.setSetting('selectedMonitorId', 'external-projector');
    const val = await api.getSetting('selectedMonitorId');
    expect(val).toBe('external-projector');
  });
});
