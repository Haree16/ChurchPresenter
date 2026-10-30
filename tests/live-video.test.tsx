import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateStep, stepLabel, newStep, validateMacro } from '../src/services/macroSteps';
import { AudienceView } from '../src/components/AudienceView';
import { Header } from '../src/components/Header';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { Macro, MacroStep, PresentationState, AudienceWindowStatus } from '../src/types';

describe('Phase 11.3: Live Video Input (Capture Devices & IMAG)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    // Reset default live video configuration
    await api.updateLiveVideoConfig({
      id: 'default-live-video',
      isEnabled: true,
      isActive: false,
      selectedDeviceId: 'default-cam',
      resolution: '1080p',
      frameRate: 30,
      aspectRatio: '16:9',
      fitMode: 'cover',
      flipHorizontal: false,
      opacity: 1.0,
      displayMode: 'background_imag',
      pipPosition: 'bottom_right',
      pipSizePercent: 25,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('Live Video Config & Devices API', () => {
    it('retrieves default live video configuration and devices', async () => {
      const config = await api.getLiveVideoConfig();
      expect(config.isEnabled).toBe(true);
      expect(config.isActive).toBe(false);
      expect(config.resolution).toBe('1080p');
      expect(config.displayMode).toBe('background_imag');

      const devices = await api.listCameraDevices();
      expect(devices.length).toBeGreaterThanOrEqual(1);
      expect(devices.some((d) => d.deviceId === 'default-cam')).toBe(true);

      const status = await api.getLiveVideoStatus();
      expect(status.isCapturing).toBe(false);
      expect(status.availableDevices.length).toBeGreaterThanOrEqual(1);
    });

    it('toggles live camera active state and updates config', async () => {
      let active = await api.toggleLiveCamera();
      expect(active).toBe(true);

      let config = await api.getLiveVideoConfig();
      expect(config.isActive).toBe(true);

      let status = await api.getLiveVideoStatus();
      expect(status.isCapturing).toBe(true);

      active = await api.toggleLiveCamera();
      expect(active).toBe(false);

      config = await api.getLiveVideoConfig();
      expect(config.isActive).toBe(false);
    });

    it('persists modified camera settings (resolution, PiP mode, frame rate)', async () => {
      const updated = await api.updateLiveVideoConfig({
        id: 'default-live-video',
        isEnabled: true,
        isActive: true,
        selectedDeviceId: 'obs-cam',
        resolution: '4k',
        frameRate: 60,
        aspectRatio: '16:9',
        fitMode: 'contain',
        flipHorizontal: true,
        opacity: 0.85,
        displayMode: 'pip',
        pipPosition: 'top_right',
        pipSizePercent: 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(updated.resolution).toBe('4k');
      expect(updated.frameRate).toBe(60);
      expect(updated.fitMode).toBe('contain');
      expect(updated.flipHorizontal).toBe(true);
      expect(updated.displayMode).toBe('pip');
      expect(updated.pipPosition).toBe('top_right');
      expect(updated.pipSizePercent).toBe(30);

      const reloaded = await api.getLiveVideoConfig();
      expect(reloaded.selectedDeviceId).toBe('obs-cam');
      expect(reloaded.displayMode).toBe('pip');
    });

    it('handles camera actions via dispatchAction', async () => {
      let config = await api.getLiveVideoConfig();
      expect(config.isActive).toBe(false);

      await api.dispatchAction('toggle_live_camera');
      config = await api.getLiveVideoConfig();
      expect(config.isActive).toBe(true);

      await api.dispatchAction('switch_next_camera');
      config = await api.getLiveVideoConfig();
      expect(config.selectedDeviceId).toBe('obs-cam');
    });
  });

  describe('Macro Step Validation & Execution for Camera', () => {
    it('validates camera macro steps correctly', () => {
      const validToggle: MacroStep = { type: 'camera', command: 'toggle' };
      expect(validateStep(validToggle)).toBeNull();

      const validSelect: MacroStep = {
        type: 'camera',
        command: 'select_device',
        deviceId: 'cam-01',
      };
      expect(validateStep(validSelect)).toBeNull();

      const invalidSelect: MacroStep = {
        type: 'camera',
        command: 'select_device',
        deviceId: '',
      };
      expect(validateStep(invalidSelect)).toContain('choose a camera device');
    });

    it('generates correct labels and default steps for Camera', () => {
      const step = newStep('camera');
      expect(step).toEqual({ type: 'camera', command: 'toggle' });

      expect(stepLabel({ type: 'camera', command: 'enable' })).toBe('Camera: Turn On');
      expect(stepLabel({ type: 'camera', command: 'disable' })).toBe('Camera: Turn Off');
      expect(stepLabel({ type: 'camera', command: 'toggle' })).toBe('Camera: Toggle Live');
      expect(stepLabel({ type: 'camera', command: 'select_device', deviceId: 'Pulpit Cam' })).toBe(
        'Camera: Switch Device (Pulpit Cam)'
      );
    });

    it('executes Camera macro steps in a macro run', async () => {
      const macro: Macro = {
        id: 'macro-live-cam',
        name: 'Enable Pulpit IMAG Camera',
        steps: [
          { type: 'camera', command: 'select_device', deviceId: 'obs-cam' },
          { type: 'camera', command: 'enable' },
        ],
      };

      expect(validateMacro(macro)).toBeNull();

      const created = await api.createMacro(macro);
      await api.runMacro(created.id);

      const config = await api.getLiveVideoConfig();
      expect(config.selectedDeviceId).toBe('obs-cam');
      expect(config.isActive).toBe(true);
    });
  });

  describe('AudienceView Live Video & IMAG Rendering', () => {
    it('renders IMAG background video element when camera is active', async () => {
      // Set active live video config
      await api.updateLiveVideoConfig({
        id: 'default-live-video',
        isEnabled: true,
        isActive: true,
        selectedDeviceId: 'default-cam',
        resolution: '1080p',
        frameRate: 30,
        aspectRatio: '16:9',
        fitMode: 'cover',
        flipHorizontal: false,
        opacity: 0.9,
        displayMode: 'background_imag',
        pipPosition: 'bottom_right',
        pipSizePercent: 25,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AudienceView />);

      await waitFor(() => {
        expect(screen.getByTestId('audience-live-camera-background')).toBeInTheDocument();
      });

      const videoEl = screen.getByTestId('audience-live-camera-background');
      expect(videoEl).toHaveStyle({ opacity: '0.9' });
    });

    it('renders Picture-in-Picture camera box when PiP mode is selected', async () => {
      await api.updateLiveVideoConfig({
        id: 'default-live-video',
        isEnabled: true,
        isActive: true,
        selectedDeviceId: 'default-cam',
        resolution: '1080p',
        frameRate: 30,
        aspectRatio: '16:9',
        fitMode: 'cover',
        flipHorizontal: true,
        opacity: 1.0,
        displayMode: 'pip',
        pipPosition: 'bottom_left',
        pipSizePercent: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<AudienceView />);

      await waitFor(() => {
        expect(screen.getByTestId('audience-camera-pip')).toBeInTheDocument();
      });

      const pipBox = screen.getByTestId('audience-camera-pip');
      expect(pipBox).toHaveStyle({ width: '20%' });

      const pipVideo = screen.getByTestId('audience-camera-pip-video');
      expect(pipVideo).toHaveStyle({ transform: 'scaleX(-1)' });
    });
  });

  describe('Header Camera Toggle Control', () => {
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

    it('renders camera toggle button and reflects state changes', () => {
      const onToggle = vi.fn();
      const { rerender } = render(
        <Header
          presentationState={mockPresState}
          audienceStatus={mockAudienceStatus}
          activeView="presentations"
          onChangeView={() => {}}
          onOpenDisplayModal={() => {}}
          onOpenShortcutsModal={() => {}}
          onOpenBackupModal={() => {}}
          onOpenMediaModal={() => {}}
          onOpenTimerModal={() => {}}
          onOpenStageModal={() => {}}
          onToggleBlackout={() => {}}
          isLiveCameraActive={false}
          onToggleLiveCamera={onToggle}
        />
      );

      const btn = screen.getByTestId('header-camera-toggle-btn');
      expect(btn).toHaveTextContent('Camera');
      fireEvent.click(btn);
      expect(onToggle).toHaveBeenCalledTimes(1);

      rerender(
        <Header
          presentationState={mockPresState}
          audienceStatus={mockAudienceStatus}
          activeView="presentations"
          onChangeView={() => {}}
          onOpenDisplayModal={() => {}}
          onOpenShortcutsModal={() => {}}
          onOpenBackupModal={() => {}}
          onOpenMediaModal={() => {}}
          onOpenTimerModal={() => {}}
          onOpenStageModal={() => {}}
          onToggleBlackout={() => {}}
          isLiveCameraActive={true}
          onToggleLiveCamera={onToggle}
        />
      );

      expect(screen.getByTestId('header-camera-toggle-btn')).toHaveTextContent('CAM ON');
    });
  });

  describe('Production Integrations Modal Live Video Tab UI', () => {
    it('renders Live Video tab and switches settings', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="video" />);

      await waitFor(() => {
        expect(screen.getByTestId('live-video-panel')).toBeInTheDocument();
      });

      expect(screen.getByText('Live Video Input & IMAG')).toBeInTheDocument();
      expect(screen.getByTestId('camera-device-select')).toBeInTheDocument();
      expect(screen.getByTestId('camera-display-mode-select')).toBeInTheDocument();

      // Change display mode to pip
      const modeSelect = screen.getByTestId('camera-display-mode-select');
      fireEvent.change(modeSelect, { target: { value: 'pip' } });

      await waitFor(() => {
        expect(screen.getByTestId('camera-pip-position-select')).toBeInTheDocument();
      });

      // Toggle output live button
      const toggleBtn = screen.getByTestId('toggle-live-camera-output-btn');
      expect(toggleBtn).toHaveTextContent('Take Camera Live');
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        expect(screen.getByTestId('camera-status-badge')).toHaveTextContent('LIVE ON OUTPUT');
      });
    });

    it('toggles preview capture on/off in the monitor', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="video" />);

      await waitFor(() => {
        expect(screen.getByTestId('toggle-preview-capture-btn')).toBeInTheDocument();
      });

      const previewBtn = screen.getByTestId('toggle-preview-capture-btn');
      expect(previewBtn).toHaveTextContent('Start Preview');

      fireEvent.click(previewBtn);

      await waitFor(() => {
        expect(previewBtn).toHaveTextContent('Stop Preview');
      });
    });
  });

  describe('Macro Manager Modal Camera Step UI', () => {
    it('adds and configures a camera macro step', async () => {
      render(<MacroManagerModal isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        expect(screen.getByTestId('macro-manager')).toBeInTheDocument();
      });

      const addCamBtn = screen.getByTestId('add-step-camera');
      expect(addCamBtn).toBeInTheDocument();
      fireEvent.click(addCamBtn);

      await waitFor(() => {
        expect(screen.getByTestId('step-camera-command')).toBeInTheDocument();
      });

      // Switch command to select_device
      const cmdSelect = screen.getByTestId('step-camera-command');
      fireEvent.change(cmdSelect, { target: { value: 'select_device' } });

      await waitFor(() => {
        expect(screen.getByTestId('step-camera-device')).toBeInTheDocument();
      });

      const devInput = screen.getByTestId('step-camera-device');
      fireEvent.change(devInput, { target: { value: 'Elgato Cam Link 4K' } });
      expect(devInput).toHaveValue('Elgato Cam Link 4K');
    });
  });
});
