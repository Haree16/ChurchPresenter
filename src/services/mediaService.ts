import { MediaAsset, MediaPlaybackState } from '../types';
import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'webm'];
export const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg'];

export const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS,
  ...SUPPORTED_AUDIO_EXTENSIONS,
];

export function getMediaTypeFromExtension(
  filenameOrExt: string
): 'image' | 'video' | 'audio' | null {
  const ext = filenameOrExt.includes('.')
    ? filenameOrExt.split('.').pop()?.toLowerCase() || ''
    : filenameOrExt.toLowerCase();

  if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return null;
}

export function isSupportedMedia(filename: string): boolean {
  return getMediaTypeFromExtension(filename) !== null;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatMediaDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export class MediaService {
  private static instance: MediaService;
  private preloadedMedia: Set<string> = new Set();
  private failedMedia: Set<string> = new Set();
  private appDataDir: string | null = null;

  private constructor() {}

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  public setAppDataDir(dir: string): void {
    this.appDataDir = dir;
  }

  public getAppDataDir(): string | null {
    return this.appDataDir;
  }

  /**
   * Resolves a media file path to a URL suitable for HTML5 elements (<video>, <img>, <audio>).
   */
  public resolveMediaUrl(pathOrRelative: string | null | undefined): string {
    if (!pathOrRelative) return '';
    if (pathOrRelative.startsWith('http://') || pathOrRelative.startsWith('https://')) {
      return pathOrRelative;
    }
    if (pathOrRelative.startsWith('data:')) {
      return pathOrRelative;
    }
    if (
      pathOrRelative.startsWith('asset://') ||
      pathOrRelative.startsWith('tauri://') ||
      pathOrRelative.startsWith('http://asset.localhost') ||
      pathOrRelative.startsWith('https://asset.localhost')
    ) {
      return pathOrRelative;
    }

    // In native Tauri desktop app runtime, resolve relative media to asset:// protocol
    if (typeof window !== 'undefined' && isTauri()) {
      const cleaned = pathOrRelative.replace(/^(\/|\\)+/, '');
      const fullPath = this.appDataDir ? `${this.appDataDir}/${cleaned}` : cleaned;
      try {
        return convertFileSrc(fullPath);
      } catch {
        return fullPath;
      }
    }

    // In browser/test or local webview mode:
    return pathOrRelative.startsWith('/') ? pathOrRelative : `/${pathOrRelative}`;
  }

  /**
   * Preload an image in the background to ensure instantaneous display.
   */
  public preloadImage(url: string): Promise<boolean> {
    if (!url || this.preloadedMedia.has(url)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.preloadedMedia.add(url);
        resolve(true);
      };
      img.onerror = () => {
        this.failedMedia.add(url);
        resolve(false);
      };
      img.src = url;
    });
  }

  /**
   * Preload a video/audio asset metadata.
   */
  public preloadMedia(url: string, type: 'video' | 'audio'): Promise<boolean> {
    if (!url || this.preloadedMedia.has(url)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const el = document.createElement(type);
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        this.preloadedMedia.add(url);
        resolve(true);
      };
      el.onerror = () => {
        this.failedMedia.add(url);
        resolve(false);
      };
      el.src = url;
    });
  }

  public hasFailed(url: string): boolean {
    return this.failedMedia.has(url);
  }

  public markFailed(url: string): void {
    this.failedMedia.add(url);
  }

  public clearFailed(url: string): void {
    this.failedMedia.delete(url);
  }

  public createInitialPlaybackState(asset?: MediaAsset | null): MediaPlaybackState {
    if (!asset) {
      return {
        mediaId: null,
        mediaUrl: null,
        mediaType: null,
        isPlaying: false,
        isMuted: false,
        volume: 1.0,
        isLooping: true,
        currentTime: 0,
        duration: 0,
        fitMode: 'cover',
        error: null,
      };
    }

    return {
      mediaId: asset.id,
      mediaUrl: this.resolveMediaUrl(asset.relativePath),
      mediaType: asset.mediaType,
      isPlaying: false,
      isMuted: false,
      volume: 1.0,
      isLooping: true,
      currentTime: 0,
      duration: asset.durationSeconds || 0,
      fitMode: 'cover',
      error: null,
    };
  }
}

export const mediaService = MediaService.getInstance();
