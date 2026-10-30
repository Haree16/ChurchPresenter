import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { StageLayoutEditor } from '../src/components/Stage/StageLayoutEditor';
import { StageDisplayView } from '../src/components/Stage/StageDisplayView';
import { MultiViewerModal } from '../src/components/Production/MultiViewerModal';
import { PresentationState, StageConfig } from '../src/types';

afterEach(async () => {
  await api.clearAll();
  // Clean up any custom stage configs created during test
  const configs = await api.listStageConfigs();
  for (const c of configs) {
    if (c.id !== 'default-stage') {
      await api.deleteStageConfig(c.id).catch(() => {});
    }
  }
});

const sampleState: PresentationState = {
  currentPresentationId: 'pres-1',
  currentSlideId: 's1',
  currentSlideIndex: 0,
  totalSlides: 3,
  currentSlide: {
    id: 's1',
    presentationId: 'pres-1',
    sortOrder: 0,
    title: 'Grace Greater Than Our Sin',
    body: 'Marvelous grace of our loving Lord\nGrace that exceeds our sin and our guilt',
    backgroundColor: '#0f172a',
    foregroundColor: '#ffffff',
    fontSize: 'large',
    textAlignment: 'center',
    createdAt: '',
    updatedAt: '',
  },
  nextSlide: {
    id: 's2',
    presentationId: 'pres-1',
    sortOrder: 1,
    title: 'Verse 2',
    body: 'Sin and despair, like the sea waves cold\nThreaten the soul with infinite loss',
    backgroundColor: '#0f172a',
    foregroundColor: '#ffffff',
    fontSize: 'large',
    textAlignment: 'center',
    createdAt: '',
    updatedAt: '',
  },
  isBlackout: false,
  isLive: true,
  stageMessage: 'Pastor please conclude in 5 min',
};

describe('Phase 9.3: Per-Screen Stage Layouts & Multi-Viewer Panel', () => {
  it('manages per-screen stage configurations in API with default fallback', async () => {
    // 1. Initial state has default-stage
    const defaultCfg = await api.getStageConfig();
    expect(defaultCfg.id).toBe('default-stage');

    // 2. Querying a non-existent screen ID returns default-stage fallback
    const fallbackCfg = await api.getStageConfig('output-stage-choir');
    expect(fallbackCfg.id).toBe('default-stage');

    // 3. Create a customized stage configuration for pastor confidence monitor
    const pastorCfg: StageConfig = {
      id: 'output-stage-pastor',
      fontSize: 'large',
      showNotes: true,
      showTimer: true,
      showNext: true,
      highContrast: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      panels: [
        {
          id: 'panel-cur',
          kind: 'current',
          x: 0,
          y: 0,
          w: 60,
          h: 70,
          fontSizePct: 5,
        },
        {
          id: 'panel-next',
          kind: 'next',
          x: 60,
          y: 0,
          w: 40,
          h: 70,
          fontSizePct: 3.5,
        },
        {
          id: 'panel-multi',
          kind: 'multiviewer',
          x: 0,
          y: 70,
          w: 50,
          h: 30,
          fontSizePct: 3,
        },
      ],
    };

    const saved = await api.updateStageConfig(pastorCfg);
    expect(saved.id).toBe('output-stage-pastor');

    // 4. listStageConfigs contains both default and pastor
    const all = await api.listStageConfigs();
    expect(all.some((c) => c.id === 'default-stage')).toBe(true);
    expect(all.some((c) => c.id === 'output-stage-pastor')).toBe(true);

    // 5. Querying pastor screen ID now returns its specific layout
    const retrievedPastor = await api.getStageConfig('output-stage-pastor');
    expect(retrievedPastor.id).toBe('output-stage-pastor');
    expect(retrievedPastor.panels!.some((p) => p.kind === 'multiviewer')).toBe(true);

    // 6. Delete pastor layout -> fallback to default-stage works again
    await api.deleteStageConfig('output-stage-pastor');
    const postDeleteFallback = await api.getStageConfig('output-stage-pastor');
    expect(postDeleteFallback.id).toBe('default-stage');

    // 7. Cannot delete default-stage
    await expect(api.deleteStageConfig('default-stage')).rejects.toThrow('Cannot delete default-stage layout');
  });

  it('StageLayoutEditor allows switching target screen and saving screen-specific layout', async () => {
    // Add a custom stage output to outputs list
    await api.createOutput({
      id: 'output-stage-musicians',
      name: 'Musicians Stage Display',
      outputType: 'stage',
      targetMonitorId: null,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      aspectRatio: '16:9',
      safeMarginPercent: 4.0,
      contentSource: 'stage_layout',
      themeId: null,
      isEnabled: true,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const onSavedSpy = vi.fn();
    const onCloseSpy = vi.fn();

    render(
      <StageLayoutEditor
        isOpen={true}
        onClose={onCloseSpy}
        onSaved={onSavedSpy}
      />
    );

    // Verify screen target selector exists
    await waitFor(() => {
      expect(screen.getByTestId('stage-screen-select')).toBeTruthy();
    });

    const select = screen.getByTestId('stage-screen-select') as HTMLSelectElement;
    expect(select.value).toBe('default-stage');

    // Change target to the Musicians Stage Display
    fireEvent.change(select, { target: { value: 'output-stage-musicians' } });
    expect(select.value).toBe('output-stage-musicians');

    // Add multiviewer panel
    const addMultiViewerBtn = screen.getByTestId('add-panel-multiviewer');
    fireEvent.click(addMultiViewerBtn);

    // Save layout for musicians screen
    const saveBtn = screen.getByTestId('stage-layout-save');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSavedSpy).toHaveBeenCalled();
      const savedConfig: StageConfig = onSavedSpy.mock.calls[0][0];
      expect(savedConfig.id).toBe('output-stage-musicians');
      expect(savedConfig.panels?.some((p) => p.kind === 'multiviewer')).toBe(true);
    });

    // Verify it persisted in api
    const persisted = await api.getStageConfig('output-stage-musicians');
    expect(persisted.id).toBe('output-stage-musicians');
    expect(persisted.panels?.some((p) => p.kind === 'multiviewer')).toBe(true);
  });

  it('StageDisplayView renders using screen-specific outputId layout', async () => {
    // Configure special layout for vocalist confidence monitor
    await api.updateStageConfig({
      id: 'output-stage-vocalist',
      fontSize: 'large',
      showNotes: true,
      showTimer: true,
      showNext: true,
      highContrast: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      panels: [
        {
          id: 'vocalist-cur',
          kind: 'current',
          x: 5,
          y: 5,
          w: 90,
          h: 40,
          fontSizePct: 6,
        },
        {
          id: 'vocalist-msg',
          kind: 'message',
          x: 5,
          y: 50,
          w: 90,
          h: 40,
          fontSizePct: 4,
        },
      ],
    });

    // Populate live presentation
    const pres = await api.createPresentation('Sunday Set', 'Worship');
    const s1 = await api.createSlide(pres.id, {
      title: 'Current Song',
      body: 'How great is our God, sing with me',
    });
    await api.setLiveSlide(pres.id, s1.id);
    await api.setStageMessage('Key of G major');

    render(
      <StageDisplayView
        previewMode={true}
        outputId="output-stage-vocalist"
      />
    );

    // Verify vocalist floor monitor displays current slide lyrics and message
    await waitFor(() => {
      expect(screen.getByText(/How great is our God/i)).toBeTruthy();
      expect(screen.getByText(/Key of G major/i)).toBeTruthy();
    });
  });

  it('MultiViewerModal displays output tiles and updates primary focus output', async () => {
    const onClose = vi.fn();
    render(
      <MultiViewerModal
        isOpen={true}
        onClose={onClose}
        presentationState={sampleState}
      />
    );

    // Multi-viewer header
    await waitFor(() => {
      expect(screen.getByText('MULTI-VIEWER PRODUCTION MONITOR')).toBeTruthy();
      expect(screen.getByText('BROADCAST LIVE')).toBeTruthy();
    });

    // Verify audience and stage tiles are rendered
    await waitFor(() => {
      expect(screen.getByTestId('multiviewer-tile-output-audience')).toBeTruthy();
      expect(screen.getByTestId('multiviewer-tile-output-stage')).toBeTruthy();
    });

    // Audience preview shows live slide title and body
    const audTile = screen.getByTestId('multiviewer-tile-output-audience');
    expect(audTile.textContent).toContain('Marvelous grace of our loving Lord');

    // Toggle primary focus to stage output
    const stageFollowBtn = screen.getByTestId('multiviewer-set-primary-output-stage');
    fireEvent.click(stageFollowBtn);

    // Primary indicator updates
    expect(screen.getByTestId('multiviewer-set-primary-output-stage').textContent).toBe('Primary');

    // Close button works
    const closeBtn = screen.getByTestId('multiviewer-close-btn');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
