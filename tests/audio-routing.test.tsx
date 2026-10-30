import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { AudioRoutingService } from '../src/services/audioRoutingService';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';
import { MediaInspector } from '../src/components/Media/MediaInspector';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { validateStep, stepLabel, newStep } from '../src/services/macroSteps';
import { MediaAsset } from '../src/types';

describe('Phase 11.7: Audio Routing & Multi-Zone Soundcard Output', () => {
  beforeEach(async () => {
    // Reset audio config to default
    await api.updateAudioConfig({
      id: 'default-audio',
      mainDeviceId: 'default',
      mainDeviceName: 'Default Audio - Main Sanctuary PA',
      cueDeviceId: 'default',
      cueDeviceName: 'Default Audio - Stage / IEM Cue',
      masterVolume: 1.0,
      cueVolume: 1.0,
      isMuted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('AudioRoutingService & Soundcard Device Enumeration', () => {
    it('enumerates hardware audio devices gracefully with fallback', async () => {
      const devices = await AudioRoutingService.enumerateAudioDevices();
      expect(devices.length).toBeGreaterThan(0);
      expect(devices[0].id).toBe('default');
      expect(devices[0].channels).toBe(2);
      expect(devices[0].sampleRate).toBe(48000);
    });

    it('enumerates audio output devices from navigator.mediaDevices when available', async () => {
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {
          enumerateDevices: vi.fn().mockResolvedValue([
            { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Microphone' },
            { kind: 'audiooutput', deviceId: 'dante-1', label: 'Dante Virtual Soundcard (Ch 1-2)' },
            { kind: 'audiooutput', deviceId: 'headphones-1', label: 'Focusrite Scarlett Headphone Cue' },
          ]),
        },
      });

      const devices = await AudioRoutingService.enumerateAudioDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('dante-1');
      expect(devices[0].name).toBe('Dante Virtual Soundcard (Ch 1-2)');
      expect(devices[1].id).toBe('headphones-1');

      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: originalMediaDevices,
      });
    });

    it('applies setSinkId on HTMLMediaElement when supported', async () => {
      const mediaEl = document.createElement('audio');
      const setSinkIdMock = vi.fn().mockResolvedValue(undefined);
      (mediaEl as any).setSinkId = setSinkIdMock;

      const success = await AudioRoutingService.applyAudioSink(mediaEl, 'focusrite-scarlett');
      expect(success).toBe(true);
      expect(setSinkIdMock).toHaveBeenCalledWith('focusrite-scarlett');
    });

    it('falls back safely when setSinkId is not supported on element', async () => {
      const mediaEl = document.createElement('audio');
      delete (mediaEl as any).setSinkId;

      const success = await AudioRoutingService.applyAudioSink(mediaEl, 'focusrite-scarlett');
      expect(success).toBe(false);
    });

    it('synthesizes test chime tones using Web Audio API', async () => {
      const closeMock = vi.fn();
      const mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockOsc = {
        type: 'sine',
        frequency: {
          setValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };

      const mockAudioCtx = vi.fn().mockImplementation(() => ({
        currentTime: 0,
        destination: {},
        createGain: () => mockGain,
        createOscillator: () => mockOsc,
        close: closeMock,
      }));

      (window as any).AudioContext = mockAudioCtx;

      await AudioRoutingService.playTestChime('default', 0.8);
      expect(mockAudioCtx).toHaveBeenCalled();
      expect(mockOsc.start).toHaveBeenCalled();
      expect(mockOsc.stop).toHaveBeenCalled();
    });
  });

  describe('API Endpoints & Mock Store Audio Methods', () => {
    it('retrieves and updates audio routing configuration', async () => {
      const cfg = await api.getAudioConfig();
      expect(cfg.id).toBe('default-audio');
      expect(cfg.masterVolume).toBe(1.0);
      expect(cfg.isMuted).toBe(false);

      const updated = await api.updateAudioConfig({
        ...cfg,
        mainDeviceId: 'main-sanctuary-pa',
        cueDeviceId: 'stage-iem-cue',
        masterVolume: 0.85,
        cueVolume: 0.6,
      });

      expect(updated.mainDeviceId).toBe('main-sanctuary-pa');
      expect(updated.cueDeviceId).toBe('stage-iem-cue');
      expect(updated.masterVolume).toBe(0.85);
      expect(updated.cueVolume).toBe(0.6);
    });

    it('sets master volume clamped within 0.0 to 1.0', async () => {
      await api.setMasterVolume(0.72);
      let cfg = await api.getAudioConfig();
      expect(cfg.masterVolume).toBe(0.72);

      await api.setMasterVolume(1.5);
      cfg = await api.getAudioConfig();
      expect(cfg.masterVolume).toBe(1.0);

      await api.setMasterVolume(-0.2);
      cfg = await api.getAudioConfig();
      expect(cfg.masterVolume).toBe(0.0);
    });

    it('toggles master audio mute state', async () => {
      let cfg = await api.toggleAudioMute();
      expect(cfg.isMuted).toBe(true);

      cfg = await api.toggleAudioMute();
      expect(cfg.isMuted).toBe(false);
    });

    it('lists available system audio devices via API', async () => {
      const devices = await api.listAudioDevices();
      expect(devices.length).toBeGreaterThanOrEqual(2);
      expect(devices.some((d) => d.id === 'default')).toBe(true);
    });
  });

  describe('Unified Action Registry Dispatching', () => {
    it('dispatches toggle_audio_mute action', async () => {
      const cfgBefore = await api.getAudioConfig();
      expect(cfgBefore.isMuted).toBe(false);

      await api.dispatchAction('toggle_audio_mute');
      const cfgAfter = await api.getAudioConfig();
      expect(cfgAfter.isMuted).toBe(true);
    });

    it('dispatches volume_up and volume_down actions (+/- 5%)', async () => {
      await api.setMasterVolume(0.5);

      await api.dispatchAction('volume_up');
      let cfg = await api.getAudioConfig();
      expect(cfg.masterVolume).toBeCloseTo(0.55, 2);

      await api.dispatchAction('volume_down');
      cfg = await api.getAudioConfig();
      expect(cfg.masterVolume).toBeCloseTo(0.5, 2);
    });
  });

  describe('Macro Engine Integration', () => {
    it('validates audio macro steps accurately', () => {
      expect(validateStep({ type: 'audio', command: 'toggle_mute' })).toBeNull();
      expect(validateStep({ type: 'audio', command: 'mute' })).toBeNull();
      expect(validateStep({ type: 'audio', command: 'unmute' })).toBeNull();
      expect(validateStep({ type: 'audio', command: 'set_volume', volume: 0.75 })).toBeNull();
      expect(validateStep({ type: 'audio', command: 'set_volume', volume: 1.5 })).toContain('between 0.0 and 1.0');
      expect(validateStep({ type: 'audio', command: 'set_device', deviceId: 'pa-out' })).toBeNull();
      expect(validateStep({ type: 'audio', command: '' as any })).toContain('choose an audio command');
    });

    it('formats human-readable labels for audio steps', () => {
      expect(stepLabel({ type: 'audio', command: 'mute' })).toBe('Audio: Mute Output');
      expect(stepLabel({ type: 'audio', command: 'unmute' })).toBe('Audio: Unmute Output');
      expect(stepLabel({ type: 'audio', command: 'toggle_mute' })).toBe('Audio: Toggle Mute');
      expect(stepLabel({ type: 'audio', command: 'set_volume', volume: 0.75 })).toBe('Audio: Set Volume to 75%');
      expect(stepLabel({ type: 'audio', command: 'set_device', deviceId: 'stage-iem' })).toBe(
        'Audio: Set Output Soundcard (stage-iem)'
      );
    });

    it('creates default audio step via newStep', () => {
      const step = newStep('audio');
      expect(step.type).toBe('audio');
      if (step.type === 'audio') {
        expect(step.command).toBe('toggle_mute');
      }
    });

    it('executes audio steps during macro runs', async () => {
      const macro = {
        id: 'macro-audio-1',
        name: 'Mute and Set PA Volume',
        steps: [
          { type: 'audio' as const, command: 'set_volume' as const, volume: 0.4 },
          { type: 'audio' as const, command: 'mute' as const },
        ],
        sortOrder: 0,
      };

      const saved = await api.createMacro(macro);
      await api.runMacro(saved.id);

      const cfg = await api.getAudioConfig();
      expect(cfg.masterVolume).toBe(0.4);
      expect(cfg.isMuted).toBe(true);
    });
  });

  describe('UI Integration: ProductionIntegrationsModal Audio Tab', () => {
    it('renders Tab 9: Audio Routing with zones, sliders, and mute button', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="audio" />);

      await waitFor(() => {
        expect(screen.getByTestId('audio-tab-panel')).toBeInTheDocument();
      });

      expect(screen.getByText('Audio Routing & Multi-Zone Soundcard Output')).toBeInTheDocument();
      expect(screen.getByTestId('audio-mute-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('audio-main-device-select')).toBeInTheDocument();
      expect(screen.getByTestId('audio-cue-device-select')).toBeInTheDocument();
      expect(screen.getByTestId('audio-master-volume-slider')).toBeInTheDocument();
      expect(screen.getByTestId('audio-cue-volume-slider')).toBeInTheDocument();
      expect(screen.getByTestId('audio-devices-list')).toBeInTheDocument();
    });

    it('adjusts master volume and cue volume via sliders', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="audio" />);

      await waitFor(() => {
        expect(screen.getByTestId('audio-master-volume-slider')).toBeInTheDocument();
      });

      const masterSlider = screen.getByTestId('audio-master-volume-slider');
      fireEvent.change(masterSlider, { target: { value: '0.85' } });

      await waitFor(async () => {
        const cfg = await api.getAudioConfig();
        expect(cfg.masterVolume).toBe(0.85);
      });

      const cueSlider = screen.getByTestId('audio-cue-volume-slider');
      fireEvent.change(cueSlider, { target: { value: '0.5' } });

      await waitFor(async () => {
        const cfg = await api.getAudioConfig();
        expect(cfg.cueVolume).toBe(0.5);
      });
    });

    it('toggles master mute button and displays MUTED badge', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="audio" />);

      await waitFor(() => {
        expect(screen.getByTestId('audio-mute-toggle')).toBeInTheDocument();
      });

      const muteBtn = screen.getByTestId('audio-mute-toggle');
      fireEvent.click(muteBtn);

      await waitFor(() => {
        expect(screen.getByTestId('audio-muted-badge')).toBeInTheDocument();
      });
    });

    it('plays test chime when test buttons are clicked', async () => {
      const chimeSpy = vi.spyOn(AudioRoutingService, 'playTestChime').mockResolvedValue(undefined);

      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="audio" />);

      await waitFor(() => {
        expect(screen.getByTestId('audio-test-chime-main')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('audio-test-chime-main'));
      expect(chimeSpy).toHaveBeenCalled();

      chimeSpy.mockRestore();
    });
  });

  describe('UI Integration: MediaInspector Audio Output Override', () => {
    it('allows selecting audio output device target override for media asset', async () => {
      const mockAsset: MediaAsset = {
        id: 'asset-video-1',
        filename: 'worship-bg.mp4',
        originalFilename: 'worship-bg.mp4',
        relativePath: 'media/worship-bg.mp4',
        mimeType: 'video/mp4',
        fileSize: 10485760,
        mediaType: 'video',
        durationSeconds: 120,
        width: 1920,
        height: 1080,
        volume: 0.9,
        audioOutputDeviceId: null,
        createdAt: new Date().toISOString(),
      };

      const handleUpdate = vi.fn().mockResolvedValue(undefined);

      render(
        <MediaInspector
          asset={mockAsset}
          onUpdateAsset={handleUpdate}
        />
      );

      const select = screen.getByTestId('audio-output-device-select');
      expect(select).toBeInTheDocument();
      expect((select as HTMLSelectElement).value).toBe('');

      fireEvent.change(select, { target: { value: 'stage-iem-cue' } });
      expect((select as HTMLSelectElement).value).toBe('stage-iem-cue');

      const saveBtn = screen.getByTestId('media-inspector-save-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(handleUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            audioOutputDeviceId: 'stage-iem-cue',
          })
        );
      });
    });
  });

  describe('UI Integration: MacroManagerModal Audio Step Editor', () => {
    it('allows creating and editing an Audio Routing step in macros', async () => {
      render(<MacroManagerModal isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        expect(screen.getByTestId('macro-manager')).toBeInTheDocument();
      });

      // Add an audio step
      const addAudioBtn = screen.getByTestId('add-step-audio');
      fireEvent.click(addAudioBtn);

      await waitFor(() => {
        expect(screen.getByTestId('step-audio-command')).toBeInTheDocument();
      });

      const cmdSelect = screen.getByTestId('step-audio-command');
      fireEvent.change(cmdSelect, { target: { value: 'set_volume' } });

      await waitFor(() => {
        expect(screen.getByTestId('step-audio-volume')).toBeInTheDocument();
      });

      const volInput = screen.getByTestId('step-audio-volume');
      fireEvent.change(volInput, { target: { value: '80' } });
      expect((volInput as HTMLInputElement).value).toBe('80');
    });
  });
});
