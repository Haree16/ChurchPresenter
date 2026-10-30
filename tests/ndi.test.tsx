import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { Header } from '../src/components/Header';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { validateStep, stepLabel, newStep } from '../src/services/macroSteps';

describe('Phase 11.5: NDI Output (Network Device Interface LAN Streaming)', () => {
  beforeEach(async () => {
    // Reset to defaults
    await api.updateNdiConfig({
      id: 'default-ndi',
      isEnabled: true,
      isActive: false,
      streamName: 'Church Presenter Output',
      outputSource: 'audience',
      resolution: '1080p',
      frameRate: 60,
      includeAlpha: true,
      ndiGroup: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('NDI API & Mock Store', () => {
    it('fetches initial NDI config and status', async () => {
      const config = await api.getNdiConfig();
      expect(config).toBeDefined();
      expect(config.streamName).toBe('Church Presenter Output');
      expect(config.resolution).toBe('1080p');
      expect(config.frameRate).toBe(60);
      expect(config.includeAlpha).toBe(true);

      const status = await api.getNdiStatus();
      expect(status.isNdiInstalled).toBe(true);
      expect(status.isBroadcasting).toBe(false);
    });

    it('updates NDI config parameters', async () => {
      const updated = await api.updateNdiConfig({
        id: 'default-ndi',
        isEnabled: true,
        isActive: false,
        streamName: 'Sanctuary Main NDI',
        outputSource: 'overlay',
        resolution: '720p',
        frameRate: 30,
        includeAlpha: false,
        ndiGroup: 'Sanctuary',
        createdAt: '',
        updatedAt: '',
      });

      expect(updated.streamName).toBe('Sanctuary Main NDI');
      expect(updated.outputSource).toBe('overlay');
      expect(updated.resolution).toBe('720p');
      expect(updated.frameRate).toBe(30);
      expect(updated.includeAlpha).toBe(false);
      expect(updated.ndiGroup).toBe('Sanctuary');
    });

    it('starts, stops and toggles NDI streaming', async () => {
      expect(await api.startNdiOutput()).toBe(true);
      let status = await api.getNdiStatus();
      expect(status.isBroadcasting).toBe(true);
      expect(status.receiverCount).toBe(1);

      expect(await api.stopNdiOutput()).toBe(false);
      status = await api.getNdiStatus();
      expect(status.isBroadcasting).toBe(false);
      expect(status.receiverCount).toBe(0);

      const toggled = await api.toggleNdiOutput();
      expect(toggled).toBe(true);
      status = await api.getNdiStatus();
      expect(status.isBroadcasting).toBe(true);
    });

    it('sends NDI video frame', async () => {
      await api.startNdiOutput();
      const sent = await api.sendNdiFrame('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      expect(sent).toBe(true);
    });
  });

  describe('Action Registry & Macros', () => {
    it('dispatches NDI actions via unified action registry', async () => {
      await api.stopNdiOutput();
      await api.dispatchAction('start_ndi_output');
      let config = await api.getNdiConfig();
      expect(config.isActive).toBe(true);

      await api.dispatchAction('toggle_ndi_output');
      config = await api.getNdiConfig();
      expect(config.isActive).toBe(false);

      await api.dispatchAction('stop_ndi_output');
      config = await api.getNdiConfig();
      expect(config.isActive).toBe(false);
    });

    it('validates and formats NDI macro steps', () => {
      const step = newStep('ndi');
      expect(step.type).toBe('ndi');
      expect((step as any).command).toBe('toggle');

      expect(validateStep({ type: 'ndi', command: 'start' })).toBeNull();
      expect(validateStep({ type: 'ndi', command: 'stop' })).toBeNull();
      expect(validateStep({ type: 'ndi', command: 'toggle' })).toBeNull();

      expect(stepLabel({ type: 'ndi', command: 'start' })).toBe('NDI: Start Stream');
      expect(stepLabel({ type: 'ndi', command: 'stop' })).toBe('NDI: Stop Stream');
      expect(stepLabel({ type: 'ndi', command: 'toggle' })).toBe('NDI: Toggle Stream');
    });

    it('executes NDI macro step inside a macro', async () => {
      await api.stopNdiOutput();
      const macro = await api.createMacro({
        id: 'macro-ndi-1',
        name: 'Start Broadcast LAN',
        steps: [{ type: 'ndi', command: 'start' }],
        createdAt: '',
        updatedAt: '',
      });

      await api.runMacro(macro.id);
      const config = await api.getNdiConfig();
      expect(config.isActive).toBe(true);
    });
  });

  describe('Macro Manager Modal UI', () => {
    it('allows selecting NDI step type and command', async () => {
      render(<MacroManagerModal isOpen={true} onClose={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('macro-manager')).toBeInTheDocument());

      const addNdiBtn = screen.getByTestId('add-step-ndi');
      expect(addNdiBtn).toBeInTheDocument();
      fireEvent.click(addNdiBtn);

      await waitFor(() => {
        expect(screen.getByTestId('step-ndi-command')).toBeInTheDocument();
      });

      const commandSelect = screen.getByTestId('step-ndi-command');
      fireEvent.change(commandSelect, { target: { value: 'start' } });
      expect((commandSelect as HTMLSelectElement).value).toBe('start');
    });
  });

  describe('Header NDI Quick-Action Button', () => {
    it('renders NDI button and reflects active state', () => {
      const onToggle = vi.fn();
      const mockAudienceStatus = { isOpen: true, isFullscreen: false, monitorName: 'Display 2' };
      const mockStageStatus = { isOpen: false, isFullscreen: false, monitorName: null };
      const mockPresState = {
        currentPresentationId: 'p1',
        currentSlideId: 's1',
        currentSlideIndex: 0,
        totalSlides: 1,
        currentSlide: null,
        nextSlide: null,
        isLive: true,
        isBlackout: false,
        isLogo: false,
        mediaPlayback: null,
      } as any;

      const { rerender } = render(
        <Header
          {...({
            presentationState: mockPresState,
            audienceStatus: mockAudienceStatus,
            stageStatus: mockStageStatus,
            onToggleBlackout: () => {},
            isNdiActive: false,
            onToggleNdiOutput: onToggle,
          } as any)}
        />
      );

      const btn = screen.getByTestId('header-ndi-toggle-btn');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('NDI');

      fireEvent.click(btn);
      expect(onToggle).toHaveBeenCalledTimes(1);

      rerender(
        <Header
          {...({
            presentationState: mockPresState,
            audienceStatus: mockAudienceStatus,
            stageStatus: mockStageStatus,
            onToggleBlackout: () => {},
            isNdiActive: true,
            onToggleNdiOutput: onToggle,
          } as any)}
        />
      );

      expect(btn).toHaveTextContent('NDI ON');
    });
  });

  describe('Production Integrations Modal - NDI Output Tab', () => {
    it('renders NDI tab with controls, monitor, and updates configuration', async () => {
      render(
        <ProductionIntegrationsModal
          isOpen={true}
          onClose={() => {}}
          initialTab="ndi"
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('ndi-tab-panel')).toBeInTheDocument();
      });

      // Stream announcement name input
      const streamNameInput = screen.getByTestId('input-ndi-stream-name') as HTMLInputElement;
      expect(streamNameInput.value).toBe('Church Presenter Output');
      fireEvent.change(streamNameInput, { target: { value: 'Live Stream NDI' } });
      await waitFor(async () => {
        const cfg = await api.getNdiConfig();
        expect(cfg.streamName).toBe('Live Stream NDI');
      });

      // Output source selector
      const sourceSelect = screen.getByTestId('select-ndi-source') as HTMLSelectElement;
      fireEvent.change(sourceSelect, { target: { value: 'overlay' } });
      await waitFor(async () => {
        const cfg = await api.getNdiConfig();
        expect(cfg.outputSource).toBe('overlay');
      });

      // Resolution selector
      const resSelect = screen.getByTestId('select-ndi-resolution') as HTMLSelectElement;
      fireEvent.change(resSelect, { target: { value: '720p' } });
      await waitFor(async () => {
        const cfg = await api.getNdiConfig();
        expect(cfg.resolution).toBe('720p');
      });

      // Frame rate selector
      const fpsSelect = screen.getByTestId('select-ndi-framerate') as HTMLSelectElement;
      fireEvent.change(fpsSelect, { target: { value: '30' } });
      await waitFor(async () => {
        const cfg = await api.getNdiConfig();
        expect(cfg.frameRate).toBe(30);
      });

      // Toggle alpha channel
      const alphaToggle = screen.getByTestId('toggle-ndi-alpha') as HTMLInputElement;
      expect(alphaToggle.checked).toBe(true);
      fireEvent.click(alphaToggle);
      await waitFor(async () => {
        const cfg = await api.getNdiConfig();
        expect(cfg.includeAlpha).toBe(false);
      });

      // NDI group input
      const groupInput = screen.getByTestId('input-ndi-group') as HTMLInputElement;
      fireEvent.change(groupInput, { target: { value: 'SanctuaryLAN' } });
      await waitFor(async () => {
        const cfg = await api.getNdiConfig();
        expect(cfg.ndiGroup).toBe('SanctuaryLAN');
      });

      // Start stream toggle
      const toggleBtn = screen.getByTestId('btn-toggle-ndi-active');
      expect(toggleBtn).toHaveTextContent('Start NDI Stream');
      fireEvent.click(toggleBtn);
      await waitFor(async () => {
        const status = await api.getNdiStatus();
        expect(status.isBroadcasting).toBe(true);
      });

      // Check runtime banner
      expect(screen.getByTestId('ndi-runtime-banner')).toBeInTheDocument();
      expect(screen.getByTestId('ndi-runtime-banner')).toHaveTextContent('NDI Runtime Detected');

      // Check stream monitor preview & tally
      expect(screen.getByTestId('ndi-preview-monitor')).toBeInTheDocument();
      expect(screen.getByTestId('ndi-tally-receivers')).toBeInTheDocument();
    });
  });
});
