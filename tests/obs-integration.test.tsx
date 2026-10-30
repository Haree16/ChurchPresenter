import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateStep, stepLabel, newStep, validateMacro } from '../src/services/macroSteps';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { Macro, MacroStep } from '../src/types';

describe('Phase 11.2: OBS Studio WebSocket Integration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    // Reset default OBS configuration
    await api.updateObsConfig({
      id: 'default-obs',
      isEnabled: true,
      host: '127.0.0.1',
      port: 4455,
      password: null,
      autoConnect: true,
      switchSceneOnServiceItem: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Ensure disconnected initially
    await api.obsDisconnect();
  });

  describe('OBS Configuration & State API', () => {
    it('retrieves default OBS configuration', async () => {
      const config = await api.getObsConfig();
      expect(config.isEnabled).toBe(true);
      expect(config.host).toBe('127.0.0.1');
      expect(config.port).toBe(4455);
      expect(config.autoConnect).toBe(true);
      expect(config.switchSceneOnServiceItem).toBe(false);
    });

    it('persists modified OBS settings', async () => {
      const updated = await api.updateObsConfig({
        id: 'default-obs',
        isEnabled: true,
        host: '192.168.1.150',
        port: 4455,
        password: 'studioPassword123',
        autoConnect: false,
        switchSceneOnServiceItem: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(updated.host).toBe('192.168.1.150');
      expect(updated.password).toBe('studioPassword123');
      expect(updated.autoConnect).toBe(false);
      expect(updated.switchSceneOnServiceItem).toBe(true);

      const reloaded = await api.getObsConfig();
      expect(reloaded.host).toBe('192.168.1.150');
      expect(reloaded.password).toBe('studioPassword123');
    });

    it('connects, disconnects and switches scenes', async () => {
      let status = await api.getObsStatus();
      expect(status.isConnected).toBe(false);

      status = await api.obsConnect();
      expect(status.isConnected).toBe(true);
      expect(status.isAuthenticated).toBe(true);
      expect(status.scenes).toContain('Worship Wide');

      // Switch scene
      status = await api.obsSetScene('Presentation Full');
      expect(status.currentScene).toBe('Presentation Full');

      // Disconnect
      status = await api.obsDisconnect();
      expect(status.isConnected).toBe(false);
    });

    it('toggles OBS streaming and recording', async () => {
      await api.obsConnect();

      // Start stream
      let status = await api.obsStartStream();
      expect(status.isStreaming).toBe(true);

      // Stop stream
      status = await api.obsStopStream();
      expect(status.isStreaming).toBe(false);

      // Start recording
      status = await api.obsStartRecord();
      expect(status.isRecording).toBe(true);

      // Stop recording
      status = await api.obsStopRecord();
      expect(status.isRecording).toBe(false);
    });

    it('handles OBS action dispatches via dispatchAction', async () => {
      await api.obsConnect();

      await api.dispatchAction('obs_start_stream');
      let status = await api.getObsStatus();
      expect(status.isStreaming).toBe(true);

      await api.dispatchAction('obs_stop_stream');
      status = await api.getObsStatus();
      expect(status.isStreaming).toBe(false);

      await api.dispatchAction('obs_start_record');
      status = await api.getObsStatus();
      expect(status.isRecording).toBe(true);

      await api.dispatchAction('obs_stop_record');
      status = await api.getObsStatus();
      expect(status.isRecording).toBe(false);
    });
  });

  describe('Macro Step Validation & Execution for OBS', () => {
    it('validates OBS macro steps correctly', () => {
      const validSceneStep: MacroStep = {
        type: 'obs',
        command: 'set_scene',
        sceneName: 'Sermon Pulpit',
      };
      expect(validateStep(validSceneStep)).toBeNull();

      const missingSceneStep: MacroStep = {
        type: 'obs',
        command: 'set_scene',
        sceneName: '',
      };
      expect(validateStep(missingSceneStep)).toContain('choose an OBS scene name');

      const validStreamStep: MacroStep = {
        type: 'obs',
        command: 'start_stream',
      };
      expect(validateStep(validStreamStep)).toBeNull();
    });

    it('generates correct labels and default steps for OBS', () => {
      const step = newStep('obs');
      expect(step.type).toBe('obs');
      expect(step).toEqual({ type: 'obs', command: 'set_scene', sceneName: '' });

      expect(stepLabel({ type: 'obs', command: 'set_scene', sceneName: 'Pulpit Close' })).toBe(
        'OBS: Switch scene to Pulpit Close'
      );
      expect(stepLabel({ type: 'obs', command: 'start_stream' })).toBe('OBS: Start Streaming');
      expect(stepLabel({ type: 'obs', command: 'stop_stream' })).toBe('OBS: Stop Streaming');
      expect(stepLabel({ type: 'obs', command: 'start_record' })).toBe('OBS: Start Recording');
      expect(stepLabel({ type: 'obs', command: 'stop_record' })).toBe('OBS: Stop Recording');
    });

    it('executes OBS macro step during macro run', async () => {
      await api.obsConnect();

      const macro: Macro = {
        id: 'macro-start-worship',
        name: 'Start Worship Livestream',
        steps: [
          { type: 'obs', command: 'set_scene', sceneName: 'Worship Wide' },
          { type: 'obs', command: 'start_stream' },
        ],
      };

      expect(validateMacro(macro)).toBeNull();

      const created = await api.createMacro(macro);
      await api.runMacro(created.id);

      const status = await api.getObsStatus();
      expect(status.currentScene).toBe('Worship Wide');
      expect(status.isStreaming).toBe(true);
    });
  });

  describe('Production Integrations Modal OBS Tab UI', () => {
    it('renders OBS Studio tab and switches to it', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="obs" />);

      await waitFor(() => {
        expect(screen.getByTestId('obs-panel')).toBeInTheDocument();
      });

      expect(screen.getByText('OBS Studio WebSocket v5')).toBeInTheDocument();
      expect(screen.getByTestId('obs-host-input')).toHaveValue('127.0.0.1');
      expect(screen.getByTestId('obs-port-input')).toHaveValue(4455);
      expect(screen.getByTestId('obs-connect-btn')).toBeInTheDocument();
    });

    it('connects to OBS and switches scenes via UI', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="obs" />);

      await waitFor(() => {
        expect(screen.getByTestId('obs-connect-btn')).toBeInTheDocument();
      });

      // Click connect
      fireEvent.click(screen.getByTestId('obs-connect-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('obs-disconnect-btn')).toBeInTheDocument();
      });

      expect(screen.getByTestId('obs-status-badge')).toHaveTextContent(/Connected/);

      // Select and switch scene
      const sceneSelect = screen.getByTestId('obs-scene-select');
      fireEvent.change(sceneSelect, { target: { value: 'Pulpit Close' } });

      const switchBtn = screen.getByTestId('obs-switch-scene-btn');
      fireEvent.click(switchBtn);

      await waitFor(() => {
        expect(screen.getByTestId('obs-current-scene-name')).toHaveTextContent('Pulpit Close');
      });
    });

    it('toggles stream and record from OBS tab buttons', async () => {
      render(<ProductionIntegrationsModal isOpen={true} onClose={() => {}} initialTab="obs" />);

      await waitFor(() => {
        expect(screen.getByTestId('obs-connect-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('obs-connect-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('obs-stream-toggle-btn')).toBeInTheDocument();
      });

      // Toggle stream
      const streamBtn = screen.getByTestId('obs-stream-toggle-btn');
      expect(streamBtn).toHaveTextContent('Start Streaming');
      fireEvent.click(streamBtn);

      await waitFor(() => {
        expect(screen.getByTestId('obs-stream-toggle-btn')).toHaveTextContent('Stop Streaming');
      });

      // Toggle record
      const recordBtn = screen.getByTestId('obs-record-toggle-btn');
      expect(recordBtn).toHaveTextContent('Start Recording');
      fireEvent.click(recordBtn);

      await waitFor(() => {
        expect(screen.getByTestId('obs-record-toggle-btn')).toHaveTextContent('Stop Recording');
      });
    });
  });

  describe('Macro Manager Modal OBS Step Integration UI', () => {
    it('allows adding and configuring an OBS macro step', async () => {
      render(<MacroManagerModal isOpen={true} onClose={() => {}} />);

      await waitFor(() => {
        expect(screen.getByTestId('macro-manager')).toBeInTheDocument();
      });

      // Click Add OBS Studio step button
      const addObsBtn = screen.getByTestId('add-step-obs');
      expect(addObsBtn).toBeInTheDocument();
      fireEvent.click(addObsBtn);

      await waitFor(() => {
        expect(screen.getByTestId('step-obs-command')).toBeInTheDocument();
        expect(screen.getByTestId('step-obs-scene')).toBeInTheDocument();
      });

      // Set scene name
      const sceneInput = screen.getByTestId('step-obs-scene');
      fireEvent.change(sceneInput, { target: { value: 'Pastor Message Cam' } });
      expect(sceneInput).toHaveValue('Pastor Message Cam');

      // Switch command to start stream
      const commandSelect = screen.getByTestId('step-obs-command');
      fireEvent.change(commandSelect, { target: { value: 'start_stream' } });

      // In start_stream mode, scene name input is not needed
      expect(screen.queryByTestId('step-obs-scene')).not.toBeInTheDocument();
    });
  });
});
