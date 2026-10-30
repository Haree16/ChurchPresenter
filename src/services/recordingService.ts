import { api } from './api';
import { RecordingStatus, RecordedFile } from '../types';

export class RecordingCoordinator {
  private mediaRecorder: MediaRecorder | null = null;
  private currentStream: MediaStream | null = null;
  private currentSessionId: string | null = null;
  private chunkIntervalMs = 1000;

  public async startCapture(
    targetElement?: HTMLElement | HTMLCanvasElement | null,
    customFilename?: string
  ): Promise<RecordingStatus> {
    const config = await api.getRecordingConfig();
    const sessionId = `rec-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.currentSessionId = sessionId;

    // Start native backend recording session
    const status = await api.startRecording(sessionId, customFilename);

    try {
      let stream: MediaStream | null = null;

      if (targetElement instanceof HTMLCanvasElement && typeof targetElement.captureStream === 'function') {
        stream = targetElement.captureStream(config.frameRate || 30);
      } else if (typeof (navigator.mediaDevices as any)?.getDisplayMedia === 'function') {
        // Fallback display capture if supported
        try {
          stream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: {
              frameRate: config.frameRate || 30,
            },
            audio: config.includeAudio,
          });
        } catch {
          // User cancelled or sandbox restricted
        }
      }

      if (stream && typeof MediaRecorder !== 'undefined') {
        this.currentStream = stream;
        const mimeType = this.pickSupportedMimeType(config.containerFormat);
        const options: MediaRecorderOptions = {
          videoBitsPerSecond: config.videoBitrate || 5_000_000,
        };
        if (mimeType) {
          options.mimeType = mimeType;
        }

        const recorder = new MediaRecorder(stream, options);
        this.mediaRecorder = recorder;

        recorder.ondataavailable = async (event: BlobEvent) => {
          if (event.data && event.data.size > 0 && this.currentSessionId === sessionId) {
            try {
              const buffer = await event.data.arrayBuffer();
              await api.appendRecordingChunk(sessionId, new Uint8Array(buffer));
            } catch (err) {
              console.error('Failed to append recording chunk:', err);
            }
          }
        };

        recorder.start(this.chunkIntervalMs);
      }
    } catch (err) {
      console.warn('Frontend media stream capture not available; backend recording session active.', err);
    }

    return status;
  }

  public async pauseCapture(): Promise<RecordingStatus> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.pause();
      } catch {}
    }
    return await api.pauseRecording();
  }

  public async resumeCapture(): Promise<RecordingStatus> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      try {
        this.mediaRecorder.resume();
      } catch {}
    }
    return await api.resumeRecording();
  }

  public async stopCapture(): Promise<RecordedFile> {
    const sessionId = this.currentSessionId;
    this.currentSessionId = null;

    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch {}
      this.mediaRecorder = null;
    }

    if (this.currentStream) {
      try {
        this.currentStream.getTracks().forEach((t) => t.stop());
      } catch {}
      this.currentStream = null;
    }

    return await api.stopRecording(sessionId || undefined);
  }

  public pickSupportedMimeType(format: string): string | undefined {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return undefined;
    }

    if (format === 'mp4') {
      const candidates = [
        'video/mp4;codecs=avc1',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) return t;
      }
    } else {
      const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) return t;
      }
    }
    return undefined;
  }
}

export const recordingService = new RecordingCoordinator();
