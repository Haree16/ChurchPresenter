import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { MidiMapping } from '../src/types';

describe('Phase 5: MIDI, OSC & Unified Action Mapping', () => {
  describe('Hardware MIDI Controller Integration', () => {
    let createdMidiMapping: MidiMapping;

    it('retrieves MIDI status (offline by default)', async () => {
      const status = await api.getMidiStatus();
      expect(status).toBeDefined();
      expect(typeof status.isRunning).toBe('boolean');
      expect(Array.isArray(status.availableDevices)).toBe(true);
    });

    it('enumerates available MIDI input devices', async () => {
      const devices = await api.listMidiDevices();
      expect(Array.isArray(devices)).toBe(true);
      expect(devices.length).toBeGreaterThanOrEqual(1);
    });

    it('starts and stops MIDI listener', async () => {
      const started = await api.startMidiListener('Virtual MIDI Port');
      expect(started.isRunning).toBe(true);

      const stopped = await api.stopMidiListener();
      expect(stopped.isRunning).toBe(false);
    });

    it('lists existing pre-seeded MIDI mappings', async () => {
      const mappings = await api.listMidiMappings();
      expect(mappings.length).toBeGreaterThanOrEqual(2);
      expect(mappings.some((m) => m.actionType === 'next_slide')).toBe(true);
    });

    it('creates a new MIDI action mapping', async () => {
      createdMidiMapping = await api.createMidiMapping({
        id: '',
        name: 'Foot Pedal Advance',
        channel: 0, // Any channel
        messageType: 'control_change',
        noteOrCc: 64, // Sustain pedal
        actionType: 'next_slide',
        isEnabled: true,
        createdAt: '',
        updatedAt: '',
      });

      expect(createdMidiMapping.id).toBeDefined();
      expect(createdMidiMapping.name).toBe('Foot Pedal Advance');
      expect(createdMidiMapping.noteOrCc).toBe(64);
      expect(createdMidiMapping.actionType).toBe('next_slide');
    });

    it('updates a MIDI action mapping', async () => {
      createdMidiMapping = await api.updateMidiMapping({
        ...createdMidiMapping,
        noteOrCc: 67,
        name: 'Soft Pedal Back',
        actionType: 'previous_slide',
      });

      expect(createdMidiMapping.noteOrCc).toBe(67);
      expect(createdMidiMapping.actionType).toBe('previous_slide');
    });

    it('deletes a MIDI mapping', async () => {
      await api.deleteMidiMapping(createdMidiMapping.id);
      const mappings = await api.listMidiMappings();
      expect(mappings.some((m) => m.id === createdMidiMapping.id)).toBe(false);
    });
  });

  describe('OSC Network Protocol Control', () => {
    it('retrieves OSC configuration', async () => {
      const config = await api.getOscConfig();
      expect(config).toBeDefined();
      expect(config.listenPort).toBe(8000);
      expect(typeof config.isEnabled).toBe('boolean');
    });

    it('updates OSC listen port and enabled status', async () => {
      const config = await api.getOscConfig();
      const updated = await api.updateOscConfig({
        ...config,
        listenPort: 9000,
        isEnabled: true,
      });

      expect(updated.listenPort).toBe(9000);
      expect(updated.isEnabled).toBe(true);
    });

    it('retrieves OSC listener status and starts/stops listener', async () => {
      const status = await api.getOscStatus();
      expect(status).toBeDefined();
      expect(typeof status.isRunning).toBe('boolean');

      const started = await api.startOscListener(9000);
      expect(started.isRunning).toBe(true);
      expect(started.port).toBe(9000);

      const stopped = await api.stopOscListener();
      expect(stopped.isRunning).toBe(false);
    });
  });

  describe('Unified Action Registry & Debounce Dispatcher', () => {
    it('lists registered system actions with keyboard shortcuts', async () => {
      const actions = await api.listActionMappings();
      expect(actions.length).toBeGreaterThanOrEqual(6);

      const nextAction = actions.find((a) => a.actionName === 'next_slide');
      const blackoutAction = actions.find((a) => a.actionName === 'toggle_blackout');
      const clearAction = actions.find((a) => a.actionName === 'clear_overlay' || a.actionName === 'toggle_clear');

      expect(nextAction).toBeDefined();
      expect(nextAction?.category).toBe('presentation');
      expect(blackoutAction?.keyboardShortcut).toContain('B');
      expect(clearAction?.keyboardShortcut).toContain('F8');
    });

    it('dispatches presentation actions through unified dispatcher pipeline', async () => {
      const state = await api.dispatchAction('next_slide');
      expect(state).toBeDefined();
      expect(typeof state.currentSlideIndex).toBe('number');

      const blackoutState = await api.dispatchAction('toggle_blackout');
      expect(blackoutState).toBeDefined();
      expect(blackoutState.isBlackout).toBe(true);

      const restoredState = await api.dispatchAction('toggle_blackout');
      expect(restoredState.isBlackout).toBe(false);
    });

    it('resets action mappings to factory defaults', async () => {
      await api.resetActionMappingsToDefault();
      const actions = await api.listActionMappings();
      expect(actions.length).toBeGreaterThanOrEqual(6);
      expect(actions.every((a) => a.isEnabled)).toBe(true);
    });
  });
});
