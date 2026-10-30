import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { MediaAsset } from '../src/types';
import { MediaInspector } from '../src/components/Media/MediaInspector';
import { MediaLibraryModal } from '../src/components/Media/MediaLibraryModal';
import { AudienceView } from '../src/components/AudienceView';

describe('Phase 10.3: Media Inspector (Crop, Rotation, Volume, Trim, Loop & Thumbnails)', () => {
  const sampleVideoAsset: MediaAsset = {
    id: 'test-media-video-1',
    filename: 'worship-bg.mp4',
    originalFilename: 'worship-bg.mp4',
    relativePath: 'media/worship-bg.mp4',
    mimeType: 'video/mp4',
    fileSize: 1048576,
    mediaType: 'video',
    durationSeconds: 60.0,
    width: 1920,
    height: 1080,
    createdAt: new Date().toISOString(),
    cropTop: 0,
    cropBottom: 0,
    cropLeft: 0,
    cropRight: 0,
    rotation: 0,
    volume: 1.0,
    trimIn: 0,
    trimOut: null,
    isLooping: true,
    thumbnailPath: null,
  };

  beforeEach(async () => {
    // Ensure test asset exists in mockStore
    const existing = await api.listMediaAssets();
    if (!existing.some((m) => m.id === sampleVideoAsset.id)) {
      await api.importMediaAsset('media/worship-bg.mp4');
    }
  });

  describe('Media Asset API & Inspector Persistence', () => {
    it('persists crop, rotation, volume, trimIn/trimOut and looping settings', async () => {
      const assets = await api.listMediaAssets();
      const target = assets[0];
      expect(target).toBeTruthy();

      const updated = await api.updateMediaAsset({
        ...target,
        cropTop: 10,
        cropBottom: 10,
        cropLeft: 15,
        cropRight: 15,
        rotation: 90,
        volume: 0.5,
        trimIn: 5.0,
        trimOut: 45.0,
        isLooping: false,
        thumbnailPath: 'media/thumbnails/thumb-1.jpg',
      });

      expect(updated.cropTop).toBe(10);
      expect(updated.rotation).toBe(90);
      expect(updated.volume).toBe(0.5);
      expect(updated.trimIn).toBe(5.0);
      expect(updated.trimOut).toBe(45.0);
      expect(updated.isLooping).toBe(false);
      expect(updated.thumbnailPath).toBe('media/thumbnails/thumb-1.jpg');

      const reloaded = await api.getMediaAsset(target.id);
      expect(reloaded?.rotation).toBe(90);
      expect(reloaded?.volume).toBe(0.5);
      expect(reloaded?.cropLeft).toBe(15);
    });
  });

  describe('MediaInspector Component', () => {
    it('renders all inspector sections for a video asset', () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      render(<MediaInspector asset={sampleVideoAsset} onUpdateAsset={onUpdate} />);

      expect(screen.getByText('Media Inspector')).toBeInTheDocument();
      expect(screen.getByText('Crop (Inset %)')).toBeInTheDocument();
      expect(screen.getByText('Rotation')).toBeInTheDocument();
      expect(screen.getByText(/Volume: 100%/)).toBeInTheDocument();
      expect(screen.getByText('Trim Playback (In / Out)')).toBeInTheDocument();
      expect(screen.getByText('Video Thumbnail')).toBeInTheDocument();
      expect(screen.getByTestId('media-inspector-save-btn')).toBeInTheDocument();
    });

    it('changes rotation and calls onUpdateAsset on save', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      render(<MediaInspector asset={sampleVideoAsset} onUpdateAsset={onUpdate} />);

      // Click 90° rotation button
      const rot90Btn = screen.getByText('90°');
      fireEvent.click(rot90Btn);

      // Click Save
      const saveBtn = screen.getByTestId('media-inspector-save-btn');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            rotation: 90,
          })
        );
      });
    });

    it('resets all inspector settings to defaults', async () => {
      const customAsset: MediaAsset = {
        ...sampleVideoAsset,
        cropTop: 20,
        rotation: 180,
        volume: 0.2,
        trimIn: 10,
        isLooping: false,
      };

      const onUpdate = vi.fn().mockResolvedValue(undefined);
      render(<MediaInspector asset={customAsset} onUpdateAsset={onUpdate} />);

      const resetBtn = screen.getByText('Reset All');
      fireEvent.click(resetBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            cropTop: 0,
            cropBottom: 0,
            rotation: 0,
            volume: 1.0,
            trimIn: 0,
            trimOut: null,
            isLooping: true,
          })
        );
      });
    });
  });

  describe('MediaLibraryModal Inspector Integration', () => {
    it('toggles between Details and Inspector tabs for a selected asset', async () => {
      const onClose = vi.fn();
      render(<MediaLibraryModal isOpen={true} onClose={onClose} />);

      // Wait for assets to load
      await waitFor(() => {
        const cards = screen.getAllByTestId(/^media-asset-card-/);
        expect(cards.length).toBeGreaterThan(0);
        fireEvent.click(cards[0]);
      });

      // Preview pane should appear
      await waitFor(() => {
        expect(screen.getByTestId('media-preview-pane')).toBeInTheDocument();
        expect(screen.getByTestId('media-tab-details')).toBeInTheDocument();
        expect(screen.getByTestId('media-tab-inspector')).toBeInTheDocument();
      });

      // Switch to Inspector tab
      fireEvent.click(screen.getByTestId('media-tab-inspector'));

      await waitFor(() => {
        expect(screen.getByTestId('media-inspector-panel')).toBeInTheDocument();
      });

      // Switch back to Details tab
      fireEvent.click(screen.getByTestId('media-tab-details'));

      await waitFor(() => {
        expect(screen.getByTestId('media-present-live-btn')).toBeInTheDocument();
      });
    });

    it('renders custom video thumbnail in grid when thumbnailPath is set', async () => {
      // Seed asset with thumbnailPath
      const assetWithThumb: MediaAsset = {
        ...sampleVideoAsset,
        id: 'asset-with-thumbnail-1',
        filename: 'custom-thumb.mp4',
        originalFilename: 'custom-thumb.mp4',
        thumbnailPath: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      };
      await api.updateMediaAsset(assetWithThumb);

      render(<MediaLibraryModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        const thumbImg = screen.getByAltText('custom-thumb.mp4');
        expect(thumbImg).toBeInTheDocument();
        expect(thumbImg.getAttribute('src')).toContain('data:image/jpeg;base64');
      });
    });
  });

  describe('AudienceView Live Application', () => {
    it('applies crop and rotation styles to live background video', async () => {
      // Seed media asset with crop and rotation
      const inspectedVideo: MediaAsset = {
        id: 'audience-insp-video',
        filename: 'insp-live.mp4',
        originalFilename: 'insp-live.mp4',
        relativePath: 'media/insp-live.mp4',
        mimeType: 'video/mp4',
        fileSize: 500000,
        mediaType: 'video',
        createdAt: new Date().toISOString(),
        cropTop: 5,
        cropBottom: 5,
        cropLeft: 10,
        cropRight: 10,
        rotation: 90,
        volume: 0.8,
        trimIn: 2,
        isLooping: true,
      };
      await api.updateMediaAsset(inspectedVideo);

      // Create slide and go live
      const pres = await api.createPresentation('Insp Deck', 'Other');
      const slide = await api.createSlide(pres.id, {
        title: 'Video Slide',
        body: 'Lyrics',
        backgroundImage: 'media/insp-live.mp4',
      });
      await api.setLiveSlide(pres.id, slide.id);

      const { container } = render(<AudienceView />);

      await waitFor(() => {
        const video = container.querySelector('video');
        expect(video).toBeInTheDocument();
        expect(video?.style.transform).toBe('rotate(90deg)');
        expect(video?.style.clipPath).toBe('inset(5% 10% 5% 10%)');
      });

      // Cleanup
      await api.clearAll();
      await api.deletePresentation(pres.id);
    });
  });
});
