import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateStep, stepLabel, newStep, validateMacro } from '../src/services/macroSteps';
import { AlphaKeyView } from '../src/components/Broadcast/AlphaKeyView';
import { Header } from '../src/components/Header';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { Macro, MacroStep, PresentationState, AudienceWindowStatus } from '../src/types';

describe('Phase 11.4: Alpha Key (Key and Fill Dual Outputs for Hardware Switchers)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    // Reset default alpha key configuration
    await api.updateAlphaKeyConfig({
      id: 'default-alpha-key',
      isEnabled: true,
      isActive: false,
      mode: 'dual_window',
      contentSource: 'overlay',
      fillMonitorId: null,
      keyMonitorId: null,
      combinedMonitorId: null,
      premultiplied: true,
      keyGain: 1.0,
      keyInvert: false,
      keyClipPercent: 0.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await api.closeAlphaWindow('all');
  });

  describe('Alpha Key Config & Status API', () => {
    it('retrieves default alpha key configuration', async () => {
      const config = await api.getAlphaKeyConfig();
      expect(config.isEnabled).toBe(true);
      expect(config.isActive).toBe(false);
      expect(config.mode).toBe('dual_window');
      expect(config.contentSource).toBe('overlay');
      expect(config.premultiplied).toBe(true);
      expect(config.keyGain).toBe(1.0);
      expect(config.keyInvert).toBe(false);

      const status = await api.getAlphaKeyStatus();
      expect(status.isEnabled).toBe(true);
      expect(status.isActive).toBe(false);
      expect(status.fillWindowOpen).toBe(false);
      expect(status.keyWindowOpen).toBe(false);
    });

    it('toggles alpha key active on-air state', async () => {
      let active = await api.toggleAlphaKey();
      expect(active).toBe(true);

      let config = await api.getAlphaKeyConfig();
      expect(config.isActive).toBe(true);

      let status = await api.getAlphaKeyStatus();
      expect(status.isActive).toBe(true);

      active = await api.toggleAlphaKey();
      expect(active).toBe(false);
    });

    it('updates alpha key settings and mode', async () => {
      const updated = await api.updateAlphaKeyConfig({
        id: 'default-alpha-key',
        isEnabled: true,
        isActive: true,
        mode: 'side_by_side',
        contentSource: 'audience',
        fillMonitorId: 'display-1',
        keyMonitorId: 'display-2',
        combinedMonitorId: 'display-3',
        premultiplied: false,
        keyGain: 1.5,
        keyInvert: true,
        keyClipPercent: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(updated.mode).toBe('side_by_side');
      expect(updated.contentSource).toBe('audience');
      expect(updated.premultiplied).toBe(false);
      expect(updated.keyGain).toBe(1.5);
      expect(updated.keyInvert).toBe(true);
      expect(updated.keyClipPercent).toBe(10);
    });

    it('opens and closes alpha key output windows', async () => {
      let status = await api.openAlphaWindow('fill');
      expect(status.fillWindowOpen).toBe(true);

      status = await api.openAlphaWindow('key');
      expect(status.keyWindowOpen).toBe(true);

      status = await api.closeAlphaWindow('fill');
      expect(status.fillWindowOpen).toBe(false);
      expect(status.keyWindowOpen).toBe(true);

      status = await api.closeAlphaWindow('all');
      expect(status.fillWindowOpen).toBe(false);
      expect(status.keyWindowOpen).toBe(false);
    });

    it('handles toggle_alpha_key action via dispatchAction', async () => {
      let config = await api.getAlphaKeyConfig();
      expect(config.isActive).toBe(false);

      await api.dispatchAction('toggle_alpha_key');
      config = await api.getAlphaKeyConfig();
      expect(config.isActive).toBe(true);

      await api.dispatchAction('toggle_alpha_key');
      config = await api.getAlphaKeyConfig();
      expect(config.isActive).toBe(false);
    });
  });

  describe('Macro Step Validation & Execution for Alpha Key', () => {
    it('validates alpha key macro steps', () => {
      expect(validateStep({ type: 'alpha_key', command: 'toggle' })).toBeNull();
      expect(validateStep({ type: 'alpha_key', command: 'enable' })).toBeNull();
      expect(validateStep({ type: 'alpha_key', command: 'disable' })).toBeNull();
      expect(validateStep({ type: 'alpha_key', command: '' as any })).toContain('choose an alpha key command');
    });

    it('generates correct labels and default step for alpha key', () => {
      const step = newStep('alpha_key');
      expect(step).toEqual({ type: 'alpha_key', command: 'toggle' });

      expect(stepLabel({ type: 'alpha_key', command: 'toggle' })).toBe('Alpha Key: Toggle Key & Fill');
      expect(stepLabel({ type: 'alpha_key', command: 'enable' })).toBe('Alpha Key: Enable Output');
      expect(stepLabel({ type: 'alpha_key', command: 'disable' })).toBe('Alpha Key: Disable Output');
    });

    it('executes alpha key macro step in macro run', async () => {
      const macro: Macro = {
        id: 'macro-alpha-1',
        name: 'Test Alpha Key Macro',
        steps: [
          { type: 'alpha_key', command: 'enable' },
        ],
        sortOrder: 0,
      };

      const created = await api.createMacro(macro);
      await api.runMacro(created.id);

      await waitFor(async () => {
        const config = await api.getAlphaKeyConfig();
        expect(config.isActive).toBe(true);
      });
    });
  });

  describe('AlphaKeyView Rendering', () => {
    beforeEach(async () => {
      const pres = await api.createPresentation('Alpha Key Test Pres', 'Worship');
      const slide = await api.createSlide(pres.id, {
        title: 'Alpha Slide 1',
        body: 'Praise the Lord, my soul',
      });
      await api.setLiveSlide(pres.id, slide.id);

      await api.updateAlphaKeyConfig({
        id: 'default-alpha-key',
        isEnabled: true,
        isActive: true,
        mode: 'dual_window',
        contentSource: 'overlay',
        fillMonitorId: null,
        keyMonitorId: null,
        combinedMonitorId: null,
        premultiplied: true,
        keyGain: 1.0,
        keyInvert: false,
        keyClipPercent: 0.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('renders Fill window with colored graphics and title badge', async () => {
      render(<AlphaKeyView role="fill" />);

      await waitFor(() => {
        expect(screen.getByTestId('alpha-fill-window')).toBeInTheDocument();
      });

      expect(screen.getByTestId('alpha-fill-card')).toBeInTheDocument();
      expect(screen.getByText('Alpha Slide 1')).toBeInTheDocument();
      expect(screen.getByText('Praise the Lord, my soul')).toBeInTheDocument();
    });

    it('renders Key Matte window with pure white text mask against black', async () => {
      render(<AlphaKeyView role="key" />);

      await waitFor(() => {
        expect(screen.getByTestId('alpha-key-window')).toBeInTheDocument();
      });

      const keyText = screen.getByTestId('alpha-key-text');
      expect(keyText).toHaveStyle({ color: '#ffffff' });

      const keyCard = screen.getByTestId('alpha-key-card');
      expect(keyCard).toHaveStyle({ backgroundColor: 'rgba(255, 255, 255, 0.95)' });
    });

    it('renders inverted Key Matte when keyInvert is enabled', async () => {
      await api.updateAlphaKeyConfig({
        id: 'default-alpha-key',
        isEnabled: true,
        isActive: true,
        mode: 'dual_window',
        contentSource: 'overlay',
        fillMonitorId: null,
        keyMonitorId: null,
        combinedMonitorId: null,
        premultiplied: true,
        keyGain: 1.0,
        keyInvert: true,
        keyClipPercent: 0.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AlphaKeyView role="key" />);

      await waitFor(() => {
        expect(screen.getByTestId('alpha-key-text')).toHaveStyle({ color: '#000000' });
      });
    });

    it('renders Combined view with side-by-side Fill and Key channels', async () => {
      await api.updateAlphaKeyConfig({
        id: 'default-alpha-key',
        isEnabled: true,
        isActive: true,
        mode: 'side_by_side',
        contentSource: 'overlay',
        fillMonitorId: null,
        keyMonitorId: null,
        combinedMonitorId: null,
        premultiplied: true,
        keyGain: 1.0,
        keyInvert: false,
        keyClipPercent: 0.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AlphaKeyView role="combined" />);

      await waitFor(() => {
        expect(screen.getByTestId('alpha-combined-window')).toBeInTheDocument();
      });

      expect(screen.getByTestId('alpha-combined-fill')).toBeInTheDocument();
      expect(screen.getByTestId('alpha-combined-key')).toBeInTheDocument();
      expect(screen.getByText('Fill Channel')).toBeInTheDocument();
      expect(screen.getByText('Key Matte Channel')).toBeInTheDocument();
    });
  });

  describe('Header Alpha Key Toggle Control', () => {
    const mockPresState: PresentationState = {
      currentPresentationId: 'pres-1',
      currentSlideId: 'slide-1',
      currentSlideIndex: 0,
      totalSlides: 1,
      currentSlide: null,
      nextSlide: null,
      isBlackout: false,
      isLogo: false,
      isLive: true,
      mediaPlayback: null,
    };

    const mockAudienceStatus: AudienceWindowStatus = {
      isOpen: true,
      isFullscreen: false,
      monitorName: 'Display 2',
    };

    it('renders alpha key toggle button and reflects active state', () => {
      const handleToggle = vi.fn();
      const { rerender } = render(
        <Header
          presentationState={mockPresState}
          audienceStatus={mockAudienceStatus}
          stageStatus={{ isOpen: false, monitorName: null, isFullscreen: false }}
          activeView="presentations"
          onChangeView={vi.fn()}
          onOpenDisplayModal={vi.fn()}
          onOpenShortcutsModal={vi.fn()}
          onOpenBackupModal={vi.fn()}
          onToggleBlackout={vi.fn()}
          isAlphaKeyActive={false}
          onToggleAlphaKey={handleToggle}
        />
      );

      const btn = screen.getByTestId('header-alpha-key-toggle-btn');
      expect(btn).toHaveTextContent('Key & Fill');

      fireEvent.click(btn);
      expect(handleToggle).toHaveBeenCalledTimes(1);

      rerender(
        <Header
          presentationState={mockPresState}
          audienceStatus={mockAudienceStatus}
          stageStatus={{ isOpen: false, monitorName: null, isFullscreen: false }}
          activeView="presentations"
          onChangeView={vi.fn()}
          onOpenDisplayModal={vi.fn()}
          onOpenShortcutsModal={vi.fn()}
          onOpenBackupModal={vi.fn()}
          onToggleBlackout={vi.fn()}
          isAlphaKeyActive={true}
          onToggleAlphaKey={handleToggle}
        />
      );

      expect(screen.getByTestId('header-alpha-key-toggle-btn')).toHaveTextContent('KEY ON');
    });
  });

  describe('Production Integrations Modal Alpha Key Tab UI', () => {
    it('renders Alpha Key tab and live dual monitors', async () => {
      render(
        <ProductionIntegrationsModal
          isOpen={true}
          onClose={vi.fn()}
          initialTab="alpha_key"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('alpha-key-tab-panel')).toBeInTheDocument();
      });

      expect(screen.getByTestId('fill-preview-monitor')).toBeInTheDocument();
      expect(screen.getByTestId('key-preview-monitor')).toBeInTheDocument();
      expect(screen.getByTestId('btn-toggle-alpha-active')).toBeInTheDocument();
      expect(screen.getByTestId('select-alpha-mode')).toBeInTheDocument();
    });

    it('modifies alpha key calibration parameters (gain, invert, clip)', async () => {
      render(
        <ProductionIntegrationsModal
          isOpen={true}
          onClose={vi.fn()}
          initialTab="alpha_key"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('slider-alpha-gain')).toBeInTheDocument();
      });

      const gainSlider = screen.getByTestId('slider-alpha-gain');
      fireEvent.change(gainSlider, { target: { value: '1.8' } });

      await waitFor(async () => {
        const config = await api.getAlphaKeyConfig();
        expect(config.keyGain).toBe(1.8);
      });

      const invertToggle = screen.getByTestId('toggle-alpha-invert');
      fireEvent.click(invertToggle);

      await waitFor(async () => {
        const config = await api.getAlphaKeyConfig();
        expect(config.keyInvert).toBe(true);
      });

      const clipSlider = screen.getByTestId('slider-alpha-clip');
      fireEvent.change(clipSlider, { target: { value: '25' } });

      await waitFor(async () => {
        const config = await api.getAlphaKeyConfig();
        expect(config.keyClipPercent).toBe(25);
      });
    });

    it('launches and closes alpha windows via action buttons', async () => {
      render(
        <ProductionIntegrationsModal
          isOpen={true}
          onClose={vi.fn()}
          initialTab="alpha_key"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('btn-launch-alpha-windows')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('btn-launch-alpha-windows'));

      await waitFor(async () => {
        const st = await api.getAlphaKeyStatus();
        expect(st.fillWindowOpen).toBe(true);
        expect(st.keyWindowOpen).toBe(true);
      });

      fireEvent.click(screen.getByTestId('btn-close-alpha-windows'));

      await waitFor(async () => {
        const st = await api.getAlphaKeyStatus();
        expect(st.fillWindowOpen).toBe(false);
        expect(st.keyWindowOpen).toBe(false);
      });
    });
  });

  describe('Macro Manager Modal Alpha Key Step UI', () => {
    it('adds and configures an alpha key macro step', async () => {
      render(<MacroManagerModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('macro-manager')).toBeInTheDocument();
      });

      const addAlphaBtn = screen.getByTestId('add-step-alpha_key');
      expect(addAlphaBtn).toBeInTheDocument();
      fireEvent.click(addAlphaBtn);

      await waitFor(() => {
        expect(screen.getByTestId('step-alpha-key-command')).toBeInTheDocument();
      });

      const commandSelect = screen.getByTestId('step-alpha-key-command');
      fireEvent.change(commandSelect, { target: { value: 'enable' } });
      expect(commandSelect).toHaveValue('enable');
    });
  });
});
