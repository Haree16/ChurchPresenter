import { AudioDeviceInfo } from '../types';

export class AudioRoutingService {
  /**
   * Enumerate available hardware audio output devices using W3C MediaDevices API.
   */
  static async enumerateAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((d) => d.kind === 'audiooutput');

        if (outputs.length > 0) {
          return outputs.map((d, index) => ({
            id: d.deviceId || (index === 0 ? 'default' : `device-${index}`),
            name: d.label || (index === 0 ? 'Default Audio Output' : `Audio Output ${index + 1}`),
            isDefault: d.deviceId === 'default' || index === 0,
            channels: 2,
            sampleRate: 48000,
          }));
        }
      } catch (err) {
        console.warn('Unable to enumerate audio devices via navigator.mediaDevices:', err);
      }
    }

    // Default fallback devices if enumeration is unavailable or empty
    return [
      {
        id: 'default',
        name: 'Default System Audio Output',
        isDefault: true,
        channels: 2,
        sampleRate: 48000,
      },
      {
        id: 'main-sanctuary-pa',
        name: 'Sanctuary FOH PA (Line Out / USB)',
        isDefault: false,
        channels: 2,
        sampleRate: 48000,
      },
      {
        id: 'stage-iem-cue',
        name: 'Stage Cue / IEM Musician Monitor (Headphones)',
        isDefault: false,
        channels: 2,
        sampleRate: 48000,
      },
    ];
  }

  /**
   * Routes an HTMLMediaElement (audio or video tag) to a specific hardware soundcard output.
   * Utilizes the W3C Audio Output Devices API (HTMLMediaElement.setSinkId).
   */
  static async applyAudioSink(element: HTMLMediaElement | null, sinkId: string): Promise<boolean> {
    if (!element) return false;

    try {
      const targetSink = sinkId === 'default' || !sinkId ? '' : sinkId;
      if (typeof (element as any).setSinkId === 'function') {
        await (element as any).setSinkId(targetSink);
        return true;
      } else {
        console.info('HTMLMediaElement.setSinkId is not supported by current webview engine.');
        return false;
      }
    } catch (err) {
      console.warn(`Failed to set audio sink ID '${sinkId}':`, err);
      return false;
    }
  }

  /**
   * Plays a quick pleasant two-tone chime to test soundcard output destination and volume.
   */
  static async playTestChime(sinkId?: string, volume: number = 0.8): Promise<void> {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();

      // If AudioContext supports setSinkId, apply target sink
      if (sinkId && sinkId !== 'default' && typeof (ctx as any).setSinkId === 'function') {
        try {
          await (ctx as any).setSinkId(sinkId);
        } catch {
          // Fall back gracefully to default output
        }
      }

      const now = ctx.currentTime;
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.01, volume), now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      gainNode.connect(ctx.destination);

      // Play C5 tone (523.25 Hz) followed by E5 tone (659.25 Hz)
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.25);
      osc1.connect(gainNode);

      osc1.start(now);
      osc1.stop(now + 0.75);

      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          // Ignore close error
        }
      }, 900);
    } catch (err) {
      console.warn('Failed to play audio test chime:', err);
    }
  }
}
