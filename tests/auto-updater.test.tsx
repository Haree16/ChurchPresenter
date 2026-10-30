import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { SettingsModal } from '../src/components/Settings/SettingsModal';
import { OperatorView } from '../src/components/OperatorView';

describe('Phase 10.4: Auto-updater (Signed Feeds, Startup Checks & Live Service Lock)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    // Reset presentation state
    await api.clearAll();

    // Reset default updater config
    await api.saveUpdaterConfig({
      checkOnStartup: true,
      feedUrl: 'https://updates.churchpresenter.org/v2/releases/latest.json',
      lastCheckedAt: null,
    });
  });

  describe('Updater Service API & Models', () => {
    it('retrieves default updater config', async () => {
      const config = await api.getUpdaterConfig();
      expect(config.checkOnStartup).toBe(true);
      expect(config.feedUrl).toContain('updates.churchpresenter.org');
    });

    it('persists modified updater configuration', async () => {
      const updated = await api.saveUpdaterConfig({
        checkOnStartup: false,
        feedUrl: 'https://church.internal/releases/feed.json',
        lastCheckedAt: '2026-10-30T10:00:00Z',
      });

      expect(updated.checkOnStartup).toBe(false);
      expect(updated.feedUrl).toBe('https://church.internal/releases/feed.json');

      const reloaded = await api.getUpdaterConfig();
      expect(reloaded.checkOnStartup).toBe(false);
      expect(reloaded.feedUrl).toBe('https://church.internal/releases/feed.json');
    });

    it('checks for updates gracefully and reports state', async () => {
      const res = await api.checkForUpdates();
      expect(res).toBeDefined();
      expect(res.currentVersion).toBe('1.0.0');
      expect(res.latestVersion).toBe('1.0.0');
      expect(res.isAvailable).toBe(false);
      expect(res.isLiveBlocked).toBe(false);
    });

    it('allows installing update when presentation is not live', async () => {
      const state = await api.getPresentationState();
      expect(state.isLive).toBe(false);

      const installRes = await api.installUpdate();
      expect(installRes.success).toBe(true);
      expect(installRes.message).toContain('Update verified and staged');
    });

    it('STRICT SAFETY: rejects installing update if presentation is live', async () => {
      // Create a presentation and take a slide live
      const pres = await api.createPresentation('Sunday Worship', 'Worship');
      const slide = await api.createSlide(pres.id, {
        presentationId: pres.id,
        sortOrder: 0,
        title: 'Opening Hymn',
        body: 'Praise God from whom all blessings flow',
        backgroundColor: '#000000',
        foregroundColor: '#ffffff',
        fontSize: 'large',
        textAlignment: 'center',
      });

      await api.setLiveSlide(pres.id, slide.id);
      const state = await api.getPresentationState();
      expect(state.isLive).toBe(true);

      // Attempting to install update while live MUST throw error
      await expect(api.installUpdate()).rejects.toThrow(
        /Cannot install updates while a presentation is live/i
      );
    });
  });

  describe('SettingsModal Software Updates Tab UI', () => {
    it('renders updates tab and displays current version info', async () => {
      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={false} />);

      // Switch to Updates tab
      const updatesTabBtn = screen.getByRole('button', { name: /Software Updates/i });
      fireEvent.click(updatesTabBtn);

      expect(screen.getByTestId('updates-settings-tab')).toBeInTheDocument();
      expect(screen.getByText(/Installed Version/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Church Presenter v1.0.0/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('check-updates-btn')).toBeInTheDocument();
      expect(screen.getByTestId('updater-startup-checkbox')).toBeInTheDocument();
      expect(screen.getByTestId('updater-feed-input')).toBeInTheDocument();
    });

    it('toggles check on startup preference in UI', async () => {
      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={false} />);

      fireEvent.click(screen.getByRole('button', { name: /Software Updates/i }));

      const checkbox = screen.getByTestId('updater-startup-checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(true);

      fireEvent.click(checkbox);
      await waitFor(async () => {
        const cfg = await api.getUpdaterConfig();
        expect(cfg.checkOnStartup).toBe(false);
      });
    });

    it('updates custom feed URL and allows resetting to default', async () => {
      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={false} />);

      fireEvent.click(screen.getByRole('button', { name: /Software Updates/i }));

      const input = screen.getByTestId('updater-feed-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'https://custom-mirror.church/v2/latest.json' } });

      const saveBtn = screen.getByTestId('updater-save-feed-btn');
      fireEvent.click(saveBtn);

      await waitFor(async () => {
        const cfg = await api.getUpdaterConfig();
        expect(cfg.feedUrl).toBe('https://custom-mirror.church/v2/latest.json');
      });

      // Reset to default
      const resetBtn = screen.getByTestId('updater-reset-feed-btn');
      fireEvent.click(resetBtn);

      await waitFor(async () => {
        const cfg = await api.getUpdaterConfig();
        expect(cfg.feedUrl).toContain('updates.churchpresenter.org');
      });
    });

    it('displays up-to-date message when no updates are found', async () => {
      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={false} />);

      fireEvent.click(screen.getByRole('button', { name: /Software Updates/i }));

      const checkBtn = screen.getByTestId('check-updates-btn');
      fireEvent.click(checkBtn);

      await waitFor(() => {
        expect(screen.getByTestId('up-to-date-notice')).toBeInTheDocument();
        expect(screen.getByText(/Church Presenter is up to date/i)).toBeInTheDocument();
      });
    });

    it('displays available update details and allows installation when not live', async () => {
      vi.spyOn(api, 'checkForUpdates').mockResolvedValueOnce({
        isAvailable: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseNotes: '• Phase 10 Integrations\n• Stream Deck & DMX lighting cue triggers\n• High performance rendering',
        publishedAt: '2026-10-30T12:00:00Z',
        downloadUrl: 'https://updates.churchpresenter.org/v2/downloads/1.1.0.tar.gz',
        isLiveBlocked: false,
        error: null,
      });

      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={false} />);

      fireEvent.click(screen.getByRole('button', { name: /Software Updates/i }));
      fireEvent.click(screen.getByTestId('check-updates-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('update-available-card')).toBeInTheDocument();
        expect(screen.getByText(/New Version Available: v1.1.0/i)).toBeInTheDocument();
        expect(screen.getByText(/Stream Deck & DMX lighting cue triggers/i)).toBeInTheDocument();
      });

      // Install button is enabled and clickable
      const installBtn = screen.getByTestId('install-update-btn');
      expect(installBtn).not.toBeDisabled();

      fireEvent.click(installBtn);
      await waitFor(() => {
        expect(screen.getByTestId('updater-install-status')).toBeInTheDocument();
        expect(screen.getByText(/Update verified and staged/i)).toBeInTheDocument();
      });
    });

    it('LOCKS installation with prominent safety banner when presentation is live', async () => {
      vi.spyOn(api, 'checkForUpdates').mockResolvedValueOnce({
        isAvailable: true,
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseNotes: 'Security and feature update',
        publishedAt: '2026-10-30T12:00:00Z',
        downloadUrl: 'https://updates.churchpresenter.org/v2/downloads/1.1.0.tar.gz',
        isLiveBlocked: true,
        error: null,
      });

      // Render with isLive = true
      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={true} />);

      fireEvent.click(screen.getByRole('button', { name: /Software Updates/i }));

      // Live safety locked banner must be visible
      expect(screen.getByTestId('updater-live-locked-banner')).toBeInTheDocument();
      expect(screen.getByText(/Installation Locked During Live Service/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('check-updates-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('update-available-card')).toBeInTheDocument();
      });

      // Install button MUST be disabled
      const installBtn = screen.getByTestId('install-update-btn');
      expect(installBtn).toBeDisabled();
      expect(installBtn).toHaveAttribute('title', expect.stringMatching(/Cannot install while a presentation is live/i));
    });

    it('handles offline/network errors gracefully without crashing', async () => {
      vi.spyOn(api, 'checkForUpdates').mockResolvedValueOnce({
        isAvailable: false,
        currentVersion: '1.0.0',
        latestVersion: '1.0.0',
        releaseNotes: null,
        publishedAt: null,
        downloadUrl: null,
        isLiveBlocked: false,
        error: 'Network connection refused (offline church sanctuary network)',
      });

      render(<SettingsModal isOpen={true} onClose={() => {}} isLive={false} />);

      fireEvent.click(screen.getByRole('button', { name: /Software Updates/i }));
      fireEvent.click(screen.getByTestId('check-updates-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('updater-error-notice')).toBeInTheDocument();
        expect(screen.getByText(/Offline Mode \/ Feed Inaccessible/i)).toBeInTheDocument();
        expect(screen.getByText(/remain 100% operational offline/i)).toBeInTheDocument();
      });
    });
  });

  describe('OperatorView Startup Check & Banner', () => {
    it('shows update available banner on startup and navigates to Settings', async () => {
      vi.spyOn(api, 'checkForUpdates').mockResolvedValueOnce({
        isAvailable: true,
        currentVersion: '1.0.0',
        latestVersion: '1.2.0',
        releaseNotes: 'Performance enhancements',
        publishedAt: '2026-10-30T12:00:00Z',
        downloadUrl: null,
        isLiveBlocked: false,
        error: null,
      });

      render(<OperatorView />);

      await waitFor(() => {
        expect(screen.getByTestId('startup-update-banner')).toBeInTheDocument();
        expect(screen.getByText(/Church Presenter Update Available \(v1.2.0\)/i)).toBeInTheDocument();
      });

      // Click "View in Settings" opens settings modal
      const viewBtn = screen.getByTestId('open-updates-from-banner');
      fireEvent.click(viewBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      });
    });
  });
});
