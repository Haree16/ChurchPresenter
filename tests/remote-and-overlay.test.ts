import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { LivestreamOverlayConfig } from '../src/types';

describe('Phase 5: Mobile Remote Control & Livestream OBS Overlay', () => {
  describe('Livestream & OBS Transparent Overlay', () => {
    let overlayConfig: LivestreamOverlayConfig;

    it('loads the default livestream overlay configuration', async () => {
      overlayConfig = await api.getOverlayConfig();
      expect(overlayConfig).toBeDefined();
      expect(overlayConfig.layoutMode).toBe('lower_third');
      expect(overlayConfig.authToken).toBeDefined();
      expect(overlayConfig.textColor).toBe('#ffffff');
    });

    it('updates overlay layout mode and typography', async () => {
      overlayConfig = await api.updateOverlayConfig({
        ...overlayConfig,
        layoutMode: 'full_screen',
        fontSizePx: 56,
        textAlignment: 'center',
        safeMarginHorizontalPct: 7.5,
        safeMarginVerticalPct: 8.0,
      });

      expect(overlayConfig.layoutMode).toBe('full_screen');
      expect(overlayConfig.fontSizePx).toBe(56);
      expect(overlayConfig.safeMarginHorizontalPct).toBe(7.5);

      const fetched = await api.getOverlayConfig();
      expect(fetched.layoutMode).toBe('full_screen');
      expect(fetched.fontSizePx).toBe(56);
    });

    it('toggles overlay clear (hiding lyrics while keeping background intact)', async () => {
      const isClearedFirst = await api.toggleOverlayClear();
      expect(isClearedFirst).toBe(true);

      const configAfterClear = await api.getOverlayConfig();
      expect(configAfterClear.isCleared).toBe(true);

      const isClearedSecond = await api.toggleOverlayClear();
      expect(isClearedSecond).toBe(false);

      const configAfterRestore = await api.getOverlayConfig();
      expect(configAfterRestore.isCleared).toBe(false);
    });

    it('regenerates overlay authentication token for OBS URL security', async () => {
      const oldToken = overlayConfig.authToken;
      const newToken = await api.regenerateOverlayToken();

      expect(newToken).toBeDefined();
      expect(newToken.length).toBeGreaterThan(10);
      expect(newToken).not.toBe(oldToken);

      const updated = await api.getOverlayConfig();
      expect(updated.authToken).toBe(newToken);
    });

    it('retrieves overlay render payload', async () => {
      const payload = await api.getOverlayRenderPayload();
      expect(payload).toBeDefined();
      expect(payload.layoutMode).toBe('full_screen');
      expect(typeof payload.isCleared).toBe('boolean');
      expect(typeof payload.isBlackout).toBe('boolean');
    });
  });

  describe('Local Mobile Remote Control & Device Pairing Workflow', () => {
    it('checks remote server status (offline by default)', async () => {
      const status = await api.getRemoteServerStatus();
      expect(status).toBeDefined();
      expect(status.port).toBe(8088);
      expect(typeof status.isRunning).toBe('boolean');
      expect(status.lanIps.length).toBeGreaterThanOrEqual(1);
    });

    it('starts and stops the remote control micro-server', async () => {
      const started = await api.startRemoteServer(8099);
      expect(started.isRunning).toBe(true);
      expect(started.port).toBe(8099);

      const stopped = await api.stopRemoteServer();
      expect(stopped.isRunning).toBe(false);
    });

    it('lists paired remote devices', async () => {
      const devices = await api.listRemoteDevices();
      expect(devices.length).toBeGreaterThanOrEqual(1);
      const testDev = devices[0];
      expect(testDev.id).toBeDefined();
      expect(testDev.deviceName).toBeDefined();
      expect(testDev.ipAddress).toBeDefined();
    });

    it('approves or revokes remote device authorization', async () => {
      const devices = await api.listRemoteDevices();
      const dev = devices[0];

      // Revoke approval
      await api.approveRemoteDevice(dev.id, false);
      let updated = (await api.listRemoteDevices()).find((d) => d.id === dev.id);
      expect(updated?.isApproved).toBe(false);

      // Re-approve device
      await api.approveRemoteDevice(dev.id, true);
      updated = (await api.listRemoteDevices()).find((d) => d.id === dev.id);
      expect(updated?.isApproved).toBe(true);
    });

    it('updates granular device permissions', async () => {
      const devices = await api.listRemoteDevices();
      const dev = devices[0];

      await api.updateRemoteDevicePermissions(
        dev.id,
        true,  // canNavigate
        false, // canBlackout
        false, // canTakeLive
        true   // canControlTimer
      );

      const updated = (await api.listRemoteDevices()).find((d) => d.id === dev.id);
      expect(updated?.canNavigate).toBe(true);
      expect(updated?.canBlackout).toBe(false);
      expect(updated?.canTakeLive).toBe(false);
      expect(updated?.canControlTimer).toBe(true);
    });
  });
});
