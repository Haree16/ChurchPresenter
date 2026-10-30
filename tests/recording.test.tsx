import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { RecordingModal } from '../src/components/Broadcast/RecordingModal';
import { Header } from '../src/components/Header';
import { PresentationState, AudienceWindowStatus } from '../src/types';

describe('Phase 11.1: Audience Output Recording', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();

    // Reset default recording configuration
    await api.updateRecordingConfig({
      outputDirectory: null,
      containerFormat: 'webm',
      resolution: '1080p',
      videoBitrate: 5_000_000,
      frameRate: 30,
      includeAudio: true,
    });

    // Make sure recording is stopped
    const st = await api.getRecordingStatus();
    if (st.isRecording) {
      try {
        await api.stopRecording();
      } catch {}
    }
  });

  describe('Recording Config & Storage API', () => {
    it('retrieves default recording configuration', async () => {
      const config = await api.getRecordingConfig();
      expect(config.containerFormat).toBe('webm');
      expect(config.resolution).toBe('1080p');
      expect(config.videoBitrate).toBe(5_000_000);
      expect(config.frameRate).toBe(30);
      expect(config.includeAudio).toBe(true);
    });

    it('persists modified recording settings', async () => {
      const updated = await api.updateRecordingConfig({
        outputDirectory: '/custom/church/recordings',
        containerFormat: 'mp4',
        resolution: '4k',
        videoBitrate: 16_000_000,
        frameRate: 60,
        includeAudio: false,
      });

      expect(updated.containerFormat).toBe('mp4');
      expect(updated.resolution).toBe('4k');
      expect(updated.videoBitrate).toBe(16_000_000);
      expect(updated.frameRate).toBe(60);
      expect(updated.includeAudio).toBe(false);
      expect(updated.outputDirectory).toBe('/custom/church/recordings');

      const reloaded = await api.getRecordingConfig();
      expect(reloaded.outputDirectory).toBe('/custom/church/recordings');
      expect(reloaded.containerFormat).toBe('mp4');
    });
  });

  describe('Recording Lifecycle & Chunk Streaming API', () => {
    it('starts, appends chunks, pauses, resumes and stops recording session', async () => {
      const sessionId = 'session-worship-001';
      const started = await api.startRecording(sessionId, 'Sunday-Morning.webm');

      expect(started.isRecording).toBe(true);
      expect(started.isPaused).toBe(false);
      expect(started.sessionId).toBe(sessionId);

      // Append chunks
      const chunk1 = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      await api.appendRecordingChunk(sessionId, chunk1);

      let status = await api.getRecordingStatus();
      expect(status.currentFileSizeBytes).toBe(4);
      expect(status.totalFramesRecorded).toBe(1);

      // Pause
      const paused = await api.pauseRecording();
      expect(paused.isPaused).toBe(true);

      // Resume
      const resumed = await api.resumeRecording();
      expect(resumed.isPaused).toBe(false);

      // Stop recording
      const recorded = await api.stopRecording(sessionId);
      expect(recorded.filename).toContain('Sunday-Morning.webm');
      expect(recorded.durationSeconds).toBeGreaterThanOrEqual(1);

      // Check status is now idle
      const idle = await api.getRecordingStatus();
      expect(idle.isRecording).toBe(false);

      // Verify file appears in list
      const list = await api.listRecordings();
      expect(list.some((f) => f.filename === recorded.filename)).toBe(true);

      // Delete file
      await api.deleteRecording(recorded.filename);
      const afterDelete = await api.listRecordings();
      expect(afterDelete.some((f) => f.filename === recorded.filename)).toBe(false);
    });
  });

  describe('Recording Action Dispatch Integration', () => {
    it('handles start_recording, stop_recording and toggle_recording actions', async () => {
      // Toggle recording ON
      await api.dispatchAction('toggle_recording');
      let status = await api.getRecordingStatus();
      expect(status.isRecording).toBe(true);

      // Toggle recording OFF
      await api.dispatchAction('toggle_recording');
      status = await api.getRecordingStatus();
      expect(status.isRecording).toBe(false);

      // Explicit start
      await api.dispatchAction('start_recording');
      status = await api.getRecordingStatus();
      expect(status.isRecording).toBe(true);

      // Explicit stop
      await api.dispatchAction('stop_recording');
      status = await api.getRecordingStatus();
      expect(status.isRecording).toBe(false);
    });
  });

  describe('RecordingModal UI', () => {
    it('renders standby state, settings dropdowns and starts recording on click', async () => {
      render(<RecordingModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Audience Output Recording/i)).toBeInTheDocument();
      });

      expect(screen.getByTestId('recording-status-badge')).toHaveTextContent(/RECORDER STANDBY/i);
      expect(screen.getByTestId('start-recording-btn')).toBeInTheDocument();

      // Change format to MP4
      const formatSelect = screen.getByTestId('recording-format-select') as HTMLSelectElement;
      fireEvent.change(formatSelect, { target: { value: 'mp4' } });

      await waitFor(async () => {
        const cfg = await api.getRecordingConfig();
        expect(cfg.containerFormat).toBe('mp4');
      });

      // Start Recording
      const startBtn = screen.getByTestId('start-recording-btn');
      fireEvent.click(startBtn);

      await waitFor(() => {
        expect(screen.getByTestId('stop-recording-btn')).toBeInTheDocument();
      });

      expect(screen.getByTestId('recording-status-badge')).toHaveTextContent(/RECORDING LIVE/i);

      // Pause Recording
      const pauseBtn = screen.getByTestId('pause-recording-btn');
      fireEvent.click(pauseBtn);

      await waitFor(() => {
        expect(screen.getByTestId('recording-status-badge')).toHaveTextContent(/RECORDING PAUSED/i);
      });

      // Resume Recording
      fireEvent.click(pauseBtn);
      await waitFor(() => {
        expect(screen.getByTestId('recording-status-badge')).toHaveTextContent(/RECORDING LIVE/i);
      });

      // Stop Recording
      const stopBtn = screen.getByTestId('stop-recording-btn');
      fireEvent.click(stopBtn);

      await waitFor(() => {
        expect(screen.getByTestId('start-recording-btn')).toBeInTheDocument();
      });
    });
  });

  describe('Header Recording Status Indicator', () => {
    const dummyState: PresentationState = {
      currentPresentationId: null,
      currentSlideId: null,
      currentSlideIndex: 0,
      totalSlides: 0,
      currentSlide: null,
      nextSlide: null,
      isBlackout: false,
      isLogo: false,
      isLive: false,
      mediaPlayback: null,
    };

    const dummyAudience: AudienceWindowStatus = {
      isOpen: false,
      monitorName: null,
      isFullscreen: false,
    };

    it('renders Record button in idle mode and triggers onOpenRecordingModal', () => {
      const onOpenRecordingModal = vi.fn();
      render(
        <Header
          presentationState={dummyState}
          audienceStatus={dummyAudience}
          activeView="presentations"
          onChangeView={vi.fn()}
          onOpenDisplayModal={vi.fn()}
          onOpenShortcutsModal={vi.fn()}
          onOpenBackupModal={vi.fn()}
          onOpenMediaModal={vi.fn()}
          onOpenTimerModal={vi.fn()}
          onOpenStageModal={vi.fn()}
          onOpenRecordingModal={onOpenRecordingModal}
          onToggleBlackout={vi.fn()}
        />
      );

      const recordBtn = screen.getByTestId('header-recording-btn');
      expect(recordBtn).toHaveTextContent(/Record/i);
      fireEvent.click(recordBtn);
      expect(onOpenRecordingModal).toHaveBeenCalled();
    });

    it('renders red REC pill with elapsed time when recording is active', () => {
      render(
        <Header
          presentationState={dummyState}
          audienceStatus={dummyAudience}
          recordingStatus={{
            isRecording: true,
            isPaused: false,
            sessionId: 'rec-test',
            startedAt: '2026-10-30T10:00:00Z',
            elapsedSeconds: 275, // 04:35
            currentFilePath: '/videos/service.webm',
            currentFileSizeBytes: 1048576,
            totalFramesRecorded: 130,
            outputDirectory: '/videos',
          }}
          activeView="presentations"
          onChangeView={vi.fn()}
          onOpenDisplayModal={vi.fn()}
          onOpenShortcutsModal={vi.fn()}
          onOpenBackupModal={vi.fn()}
          onOpenMediaModal={vi.fn()}
          onOpenTimerModal={vi.fn()}
          onOpenStageModal={vi.fn()}
          onOpenRecordingModal={vi.fn()}
          onToggleBlackout={vi.fn()}
        />
      );

      const recordBtn = screen.getByTestId('header-recording-btn');
      expect(recordBtn).toHaveTextContent(/REC 04:35/i);
    });
  });
});
