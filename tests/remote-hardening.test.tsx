import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';

describe('Phase 10.5: Remote Hardening (TLS Fingerprint & OSC Shared Secret)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    // Reset default configs
    await api.setRemoteTlsEnabled(true);
    const oscCfg = await api.getOscConfig();
    await api.updateOscConfig({
      ...oscCfg,
      sharedSecret: null,
    });
  });

  describe('Remote TLS Configuration & Fingerprint API', () => {
    it('defaults to TLS enabled for maximum security', async () => {
      const enabled = await api.getRemoteTlsEnabled();
      expect(enabled).toBe(true);

      const status = await api.getRemoteServerStatus();
      expect(status.tlsEnabled).toBe(true);
      expect(status.remoteUrl).toMatch(/^https:\/\//);
      expect(status.tlsFingerprint).toBeDefined();
      expect(status.tlsFingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });

    it('allows toggling TLS off and reflects in server status and URL scheme', async () => {
      const result = await api.setRemoteTlsEnabled(false);
      expect(result).toBe(false);

      const enabled = await api.getRemoteTlsEnabled();
      expect(enabled).toBe(false);

      const status = await api.getRemoteServerStatus();
      expect(status.tlsEnabled).toBe(false);
      expect(status.remoteUrl).toMatch(/^http:\/\//);
    });

    it('returns SHA-256 fingerprint in remote server status when running', async () => {
      const started = await api.startRemoteServer(8088);
      expect(started.isRunning).toBe(true);
      expect(started.pairingPin).toBeDefined();
      expect(started.tlsFingerprint).toBeDefined();
      expect(started.tlsFingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      await api.stopRemoteServer();
    });
  });

  describe('OSC Shared Secret Hardening API', () => {
    it('retrieves default OSC config with no secret', async () => {
      const config = await api.getOscConfig();
      expect(config.sharedSecret).toBeNull();

      const status = await api.getOscStatus();
      expect(status.hasSharedSecret).toBe(false);
    });

    it('updates and persists OSC shared secret', async () => {
      const config = await api.getOscConfig();
      const updated = await api.updateOscConfig({
        ...config,
        sharedSecret: 'sanctuary-secret-2026',
      });

      expect(updated.sharedSecret).toBe('sanctuary-secret-2026');

      const reloaded = await api.getOscConfig();
      expect(reloaded.sharedSecret).toBe('sanctuary-secret-2026');

      const status = await api.getOscStatus();
      expect(status.hasSharedSecret).toBe(true);
    });

    it('clears OSC shared secret when nullified', async () => {
      const config = await api.getOscConfig();
      await api.updateOscConfig({
        ...config,
        sharedSecret: 'temporary-key',
      });

      let status = await api.getOscStatus();
      expect(status.hasSharedSecret).toBe(true);

      await api.updateOscConfig({
        ...config,
        sharedSecret: null,
      });

      status = await api.getOscStatus();
      expect(status.hasSharedSecret).toBe(false);
    });
  });

  describe('ProductionIntegrationsModal Security UI', () => {
    it('renders Remote TLS card and fingerprint copy control', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/TLS \/ HTTPS Transport Encryption/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Certificate SHA-256 Fingerprint/i)).toBeInTheDocument();
      expect(screen.getByTestId('copy-tls-fingerprint-btn')).toBeInTheDocument();
    });

    it('toggles Remote TLS from the modal interface', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/TLS \/ HTTPS Transport Encryption/i)).toBeInTheDocument();
      });

      const toggleCheckbox = screen.getByTestId('remote-tls-toggle');
      fireEvent.click(toggleCheckbox);

      await waitFor(async () => {
        const enabled = await api.getRemoteTlsEnabled();
        expect(enabled).toBe(false);
      });
    });

    it('navigates to OSC tab and allows setting and generating shared secret', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={vi.fn()} />);

      // Switch to OSC tab
      const oscTabBtn = screen.getByRole('button', { name: /OSC Network Control/i });
      fireEvent.click(oscTabBtn);

      await waitFor(() => {
        expect(screen.getByText(/OSC Shared Secret Authentication/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/OPEN \/ UNRESTRICTED/i)).toBeInTheDocument();

      // Click Generate button
      const generateBtn = screen.getByRole('button', { name: /Generate/i });
      fireEvent.click(generateBtn);

      // Verify input has a generated value
      const secretInput = screen.getByPlaceholderText(/No secret configured/i) as HTMLInputElement;
      expect(secretInput.value.length).toBe(16);

      // Click Save Secret
      const saveBtn = screen.getByRole('button', { name: /Save Secret/i });
      fireEvent.click(saveBtn);

      await waitFor(async () => {
        const status = await api.getOscStatus();
        expect(status.hasSharedSecret).toBe(true);
      });

      // Verify instruction guide is rendered
      expect(screen.getByText(/How to send authenticated packets/i)).toBeInTheDocument();
      expect(screen.getByText(/Path Prefix/i)).toBeInTheDocument();
    });
  });
});
