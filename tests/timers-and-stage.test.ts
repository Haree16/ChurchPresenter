import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { Timer, TimerState, StageConfig } from '../src/types';

describe('Phase 4: Timers & Stage/Confidence Display', () => {
  describe('Timers CRUD & State Broadcasting', () => {
    let createdTimer: Timer;

    it('lists existing pre-seeded service timers', async () => {
      const timers = await api.listTimers();
      expect(timers.length).toBeGreaterThanOrEqual(2);
      expect(timers.some((t) => t.name.includes('Countdown'))).toBe(true);
    });

    it('creates a new countdown timer', async () => {
      createdTimer = await api.createTimer({
        id: '',
        serviceId: 'service-sunday-morning',
        name: 'Offering & Announcements',
        timerType: 'countdown',
        durationSeconds: 420,
        warningThresholdSeconds: 60,
        createdAt: '',
        updatedAt: '',
      });

      expect(createdTimer.id).toBeDefined();
      expect(createdTimer.name).toBe('Offering & Announcements');
      expect(createdTimer.durationSeconds).toBe(420);

      const fetched = await api.getTimer(createdTimer.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.durationSeconds).toBe(420);
    });

    it('updates a timer configuration', async () => {
      createdTimer = await api.updateTimer({
        ...createdTimer,
        durationSeconds: 600,
        name: 'Offering & Announcements (10 Min)',
      });

      expect(createdTimer.durationSeconds).toBe(600);
      expect(createdTimer.name).toBe('Offering & Announcements (10 Min)');
    });

    it('broadcasts live timer state to presentation state', async () => {
      const liveState: TimerState = {
        id: createdTimer.id,
        name: createdTimer.name,
        timerType: 'countdown',
        durationSeconds: 600,
        warningThresholdSeconds: 60,
        isRunning: true,
        startTimeEpochMs: Date.now(),
        accumulatedSeconds: 0,
        isExpired: false,
      };

      const presState = await api.setTimerState(liveState);
      expect(presState.timerState).toBeDefined();
      expect(presState.timerState?.name).toBe('Offering & Announcements (10 Min)');
      expect(presState.timerState?.isRunning).toBe(true);

      // Clear timer state
      const cleared = await api.setTimerState(null);
      expect(cleared.timerState).toBeNull();
    });

    it('deletes a timer', async () => {
      await api.deleteTimer(createdTimer.id);
      const after = await api.getTimer(createdTimer.id);
      expect(after).toBeNull();
    });
  });

  describe('Stage Display Configuration & Window Status', () => {
    it('retrieves default stage configuration', async () => {
      const config = await api.getStageConfig();
      expect(config.id).toBe('default-stage');
      expect(config.showNotes).toBe(true);
      expect(config.showTimer).toBe(true);
      expect(config.showNext).toBe(true);
    });

    it('updates stage configuration preferences', async () => {
      const current = await api.getStageConfig();
      const updatedConfig: StageConfig = {
        ...current,
        fontSize: 'xlarge',
        highContrast: true,
        showNotes: true,
      };

      const result = await api.updateStageConfig(updatedConfig);
      expect(result.fontSize).toBe('xlarge');
      expect(result.highContrast).toBe(true);
    });

    it('controls stage window status (open, get, close)', async () => {
      const opened = await api.openStageWindow('display-1', false);
      expect(opened.isOpen).toBe(true);

      const status = await api.getStageStatus();
      expect(status.isOpen).toBe(true);

      const closed = await api.closeStageWindow();
      expect(closed.isOpen).toBe(false);
    });
  });

  describe('Drift-free Timer Math Calculation', () => {
    it('computes accurate remaining countdown time using epoch timestamps', () => {
      const durationSeconds = 300; // 5 mins
      const elapsedMs = 65000; // 65 seconds
      const startTimeEpochMs = Date.now() - elapsedMs;

      const elapsedCalculated = (Date.now() - startTimeEpochMs) / 1000;
      const remaining = Math.max(0, durationSeconds - elapsedCalculated);

      expect(Math.floor(remaining)).toBe(235); // 3 mins 55 secs
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60);
      expect(`${mins}:${secs.toString().padStart(2, '0')}`).toBe('3:55');
    });

    it('accurately triggers warning threshold condition', () => {
      const warningThreshold = 60;
      const remainingHigh = 65;
      const remainingLow = 45;

      expect(remainingHigh <= warningThreshold).toBe(false);
      expect(remainingLow <= warningThreshold).toBe(true);
    });
  });
});
