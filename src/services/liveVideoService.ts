import { CameraDeviceInfo, LiveVideoConfig } from '../types';

export class LiveVideoService {
  private activeStream: MediaStream | null = null;
  private listeners: Set<(stream: MediaStream | null) => void> = new Set();
  private isAcquiring: boolean = false;

  /**
   * Enumerate all connected video input / capture devices.
   */
  public async enumerateDevices(): Promise<CameraDeviceInfo[]> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        if (videoDevices.length > 0) {
          return videoDevices.map((d, index) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${index + 1}`,
            isDefault: index === 0,
          }));
        }
      } catch (err) {
        console.warn('LiveVideoService: enumerateDevices failed:', err);
      }
    }

    // Default fallback devices
    return [
      {
        deviceId: 'default-cam',
        label: 'Default Capture Card / Webcam',
        isDefault: true,
      },
      {
        deviceId: 'obs-cam',
        label: 'OBS Virtual Camera',
        isDefault: false,
      },
    ];
  }

  /**
   * Request and start capturing from the chosen camera device.
   */
  public async startCapture(config: LiveVideoConfig): Promise<MediaStream | null> {
    if (this.isAcquiring) return this.activeStream;
    this.isAcquiring = true;

    try {
      this.stopCapture();

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        // Headless / mock environment
        return null;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: config.selectedDeviceId ? { exact: config.selectedDeviceId } : undefined,
          width:
            config.resolution === '4k'
              ? { ideal: 3840 }
              : config.resolution === '720p'
              ? { ideal: 1280 }
              : { ideal: 1920 },
          height:
            config.resolution === '4k'
              ? { ideal: 2160 }
              : config.resolution === '720p'
              ? { ideal: 720 }
              : { ideal: 1080 },
          frameRate: { ideal: config.frameRate || 30 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.activeStream = stream;

      // Handle track stop (e.g. device unplugged)
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          this.activeStream = null;
          this.notifyListeners(null);
        };
      });

      this.notifyListeners(stream);
      return stream;
    } catch (err) {
      console.error('LiveVideoService: startCapture failed:', err);
      this.activeStream = null;
      this.notifyListeners(null);
      throw err;
    } finally {
      this.isAcquiring = false;
    }
  }

  /**
   * Stop all active camera tracks and clean up resources.
   */
  public stopCapture(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.activeStream = null;
      this.notifyListeners(null);
    }
  }

  public getActiveStream(): MediaStream | null {
    return this.activeStream;
  }

  public onStreamChange(callback: (stream: MediaStream | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.activeStream);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(stream: MediaStream | null): void {
    for (const listener of this.listeners) {
      try {
        listener(stream);
      } catch (err) {
        console.error('LiveVideoService: Listener error:', err);
      }
    }
  }
}

export const liveVideoService = new LiveVideoService();
