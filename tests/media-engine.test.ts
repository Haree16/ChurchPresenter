import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import {
  mediaService,
  getMediaTypeFromExtension,
  isSupportedMedia,
  formatFileSize,
  formatMediaDuration,
} from '../src/services/mediaService';
import { MediaAsset, MediaPlaybackState } from '../src/types';

describe('Phase 4: Media Engine & Subsystem', () => {
  describe('File Format Detection & Validation', () => {
    it('correctly classifies image formats', () => {
      expect(getMediaTypeFromExtension('background.jpg')).toBe('image');
      expect(getMediaTypeFromExtension('slide.jpeg')).toBe('image');
      expect(getMediaTypeFromExtension('texture.png')).toBe('image');
      expect(getMediaTypeFromExtension('photo.webp')).toBe('image');
      expect(isSupportedMedia('bg.png')).toBe(true);
    });

    it('correctly classifies video formats', () => {
      expect(getMediaTypeFromExtension('loop_motion.mp4')).toBe('video');
      expect(getMediaTypeFromExtension('clouds.webm')).toBe('video');
      expect(isSupportedMedia('loop_motion.mp4')).toBe(true);
    });

    it('correctly classifies audio formats', () => {
      expect(getMediaTypeFromExtension('prelude.mp3')).toBe('audio');
      expect(getMediaTypeFromExtension('chimes.wav')).toBe('audio');
      expect(getMediaTypeFromExtension('ambience.ogg')).toBe('audio');
      expect(isSupportedMedia('prelude.mp3')).toBe(true);
    });

    it('rejects unsupported file formats', () => {
      expect(getMediaTypeFromExtension('document.pdf')).toBeNull();
      expect(getMediaTypeFromExtension('presentation.pptx')).toBeNull();
      expect(getMediaTypeFromExtension('virus.exe')).toBeNull();
      expect(isSupportedMedia('file.unknown')).toBe(false);
    });

    it('formats file sizes accurately', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(5242880)).toBe('5 MB');
    });

    it('formats media durations into mm:ss accurately', () => {
      expect(formatMediaDuration(0)).toBe('0:00');
      expect(formatMediaDuration(45)).toBe('0:45');
      expect(formatMediaDuration(75)).toBe('1:15');
      expect(formatMediaDuration(3600)).toBe('60:00');
      expect(formatMediaDuration(215)).toBe('3:35');
    });

    it('resolves safe media URLs for local webview', () => {
      expect(mediaService.resolveMediaUrl('media/sample.mp4')).toBe('/media/sample.mp4');
      expect(mediaService.resolveMediaUrl('/media/sample.mp4')).toBe('/media/sample.mp4');
      expect(mediaService.resolveMediaUrl('http://localhost:3000/media/bg.jpg')).toBe(
        'http://localhost:3000/media/bg.jpg'
      );
    });
  });

  describe('Media Library CRUD & Usage Protection', () => {
    let importedAsset: MediaAsset;

    it('lists existing pre-seeded media assets', async () => {
      const assets = await api.listMediaAssets();
      expect(assets.length).toBeGreaterThanOrEqual(2);
      expect(assets.some((a) => a.mediaType === 'video')).toBe(true);
      expect(assets.some((a) => a.mediaType === 'image')).toBe(true);
    });

    it('imports new video media asset with metadata', async () => {
      importedAsset = await api.importMediaAsset('/home/church/videos/worship_particles.mp4');
      expect(importedAsset.id).toBeDefined();
      expect(importedAsset.mediaType).toBe('video');
      expect(importedAsset.mimeType).toBe('video/mp4');
      expect(importedAsset.originalFilename).toBe('worship_particles.mp4');

      const fetched = await api.getMediaAsset(importedAsset.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.mediaType).toBe('video');
    });

    it('imports new audio asset with metadata', async () => {
      const audioAsset = await api.importMediaAsset('/home/church/audio/pre_service_chimes.mp3');
      expect(audioAsset.mediaType).toBe('audio');
      expect(audioAsset.mimeType).toBe('audio/mpeg');
      expect(audioAsset.originalFilename).toBe('pre_service_chimes.mp3');
    });

    it('checks media asset usage to prevent accidental deletion', async () => {
      // Test asset not used anywhere has 0 usage
      const usage = await api.checkMediaAssetUsage(importedAsset.id);
      expect(usage).toBe(0);
    });

    it('deletes media asset from library', async () => {
      await api.deleteMediaAsset(importedAsset.id);
      const after = await api.getMediaAsset(importedAsset.id);
      expect(after).toBeNull();
    });
  });

  describe('Live Media Playback State Synchronization', () => {
    it('sets and updates live media playback state in presentation', async () => {
      const playback: MediaPlaybackState = {
        mediaId: 'media-bg-stars',
        mediaUrl: '/media/stars-motion.mp4',
        mediaType: 'video',
        isPlaying: true,
        isMuted: false,
        volume: 0.8,
        isLooping: true,
        currentTime: 12.5,
        duration: 30.0,
        fitMode: 'cover',
        error: null,
      };

      const updatedPresState = await api.setMediaPlayback(playback);
      expect(updatedPresState.mediaPlayback).toBeDefined();
      expect(updatedPresState.mediaPlayback?.isPlaying).toBe(true);
      expect(updatedPresState.mediaPlayback?.volume).toBe(0.8);
      expect(updatedPresState.mediaPlayback?.fitMode).toBe('cover');

      // Clear media playback
      const cleared = await api.setMediaPlayback(null);
      expect(cleared.mediaPlayback).toBeNull();
    });
  });
});
