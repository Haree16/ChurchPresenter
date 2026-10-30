import React, { useState, useEffect } from 'react';
import { usePresentation } from '../hooks/usePresentation';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Header, OperatorActiveView } from './Header';
import { LibraryPanel } from './LibraryPanel';
import { SlideGrid } from './SlideGrid';
import { PreviewPanel } from './PreviewPanel';
import { SlideEditorModal } from './SlideEditorModal';
import { DisplayModal } from './DisplayModal';
import { BackupModal } from './BackupModal';
import { ShortcutsModal } from './ShortcutsModal';
import { SongLibraryView } from './Songs/SongLibraryView';
import { ServicePlannerView } from './Services/ServicePlannerView';
import { ThemeManagerModal } from './Themes/ThemeManagerModal';
import { MediaLibraryModal } from './Media/MediaLibraryModal';
import { MediaControlsBar } from './Media/MediaControlsBar';
import { TimerControlModal } from './Timers/TimerControlModal';
import { StageDisplayView } from './Stage/StageDisplayView';
import { OutputManagerModal } from './Production/OutputManagerModal';
import { LivestreamOverlayModal } from './Production/LivestreamOverlayModal';
import { ProductionIntegrationsModal } from './Production/ProductionIntegrationsModal';
import { DiagnosticsModal } from './Production/DiagnosticsModal';
import { MultiViewerModal } from './Production/MultiViewerModal';
import { SettingsModal } from './Settings/SettingsModal';
import { Slide, SlideTemplate, AudienceWindowStatus, StageWindowStatus, RemoteServerStatus, KeyBinding } from '../types';
import { cloneElements } from '../services/slideElements';
import { api } from '../services/api';
import { goToSlideNumber } from '../services/slideJump';
import { runKeyBinding } from '../services/runKeyBinding';
import { AlertTriangle, X, Sparkles, Plus, BookOpen } from 'lucide-react';

export const OperatorView: React.FC = () => {
  const {
    presentations,
    selectedPresentationId,
    selectedPresentation,
    setSelectedPresentationId,
    slides,
    presentationState,
    error,
    clearError,
    createSlide,
    updateSlide,
    deleteSlide,
    duplicateSlide,
    reorderSlides,
    createPresentation,
    updatePresentation,
    deletePresentation,
    duplicatePresentation,
    goLive,
    nextSlide,
    previousSlide,
    toggleBlackout,
    toggleLogo,
    clearMedia,
    clearAll,
    refreshPresentations,
    refreshSlides,
    refreshPresentationState,
  } = usePresentation();

  // Active View Tab: 'services' | 'presentations' | 'songs' | 'themes'
  const [activeView, setActiveView] = useState<OperatorActiveView>('services');

  // Audience & Stage window status
  const [audienceStatus, setAudienceStatus] = useState<AudienceWindowStatus>({
    isOpen: false,
    monitorName: null,
    isFullscreen: false,
  });

  const [stageStatus, setStageStatus] = useState<StageWindowStatus>({
    isOpen: false,
    monitorName: null,
    isFullscreen: false,
  });

  const [remoteServerStatus, setRemoteServerStatus] = useState<RemoteServerStatus | undefined>(undefined);

  const refreshAudienceStatus = async () => {
    try {
      const status = await api.getAudienceStatus();
      // Keep the same object when nothing changed so the regular polling doesn't re-render.
      setAudienceStatus((prev) =>
        prev.isOpen === status.isOpen &&
        prev.isFullscreen === status.isFullscreen &&
        prev.monitorName === status.monitorName &&
        prev.error === status.error
          ? prev
          : status
      );
    } catch {
      // Ignore in mock/browser
    }
  };

  const refreshStageStatus = async () => {
    try {
      const status = await api.getStageStatus();
      setStageStatus(status);
    } catch {
      // Ignore in mock/browser
    }
  };

  const refreshRemoteStatus = async () => {
    try {
      const status = await api.getRemoteServerStatus();
      setRemoteServerStatus(status);
    } catch {
      // Ignore in mock/browser
    }
  };

  // First-run welcome banner state
  const [showWelcomeBanner, setShowWelcomeBanner] = useState<boolean>(false);

  useEffect(() => {
    refreshAudienceStatus();
    refreshStageStatus();
    refreshRemoteStatus();

    const interval = setInterval(() => {
      refreshRemoteStatus();
    }, 4000);
    // The audience window can be closed from outside this window (its own close button,
    // Alt+F4 or Ctrl+W), so keep the open/closed state in step with the real window.
    const audienceInterval = setInterval(refreshAudienceStatus, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(audienceInterval);
    };
  }, []);

  useEffect(() => {
    // Session Recovery: Restore last workspace state
    api.getWorkspaceState().then((ws) => {
      if (ws) {
        if (ws.activeTab && (ws.activeTab === 'services' || ws.activeTab === 'presentations' || ws.activeTab === 'songs')) {
          setActiveView(ws.activeTab);
        }
        if (ws.selectedPresentationId) {
          setSelectedPresentationId(ws.selectedPresentationId);
        }
      }
    }).catch(() => {});
  }, []);

  // Check if first-run / empty database
  useEffect(() => {
    if (presentations.length === 0) {
      setShowWelcomeBanner(true);
    } else {
      setShowWelcomeBanner(false);
    }
  }, [presentations]);

  // Modals state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [isDisplayModalOpen, setIsDisplayModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isTimerModalOpen, setIsTimerModalOpen] = useState(false);
  const [isStagePreviewOpen, setIsStagePreviewOpen] = useState(false);
  const [isOutputModalOpen, setIsOutputModalOpen] = useState(false);
  const [isMultiViewerModalOpen, setIsMultiViewerModalOpen] = useState(false);
  const [isOverlayModalOpen, setIsOverlayModalOpen] = useState(false);
  const [isIntegrationsModalOpen, setIsIntegrationsModalOpen] = useState(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Shortcuts the operator chose in Settings; reloaded whenever Settings closes.
  const [keyBindings, setKeyBindings] = useState<KeyBinding[]>([]);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  useEffect(() => {
    if (isSettingsModalOpen) return;
    let cancelled = false;
    api
      .listKeyBindings()
      .then((list) => {
        if (!cancelled) setKeyBindings(list);
      })
      .catch(() => {
        // Not available in a plain browser; the built-in keys keep working.
      });
    return () => {
      cancelled = true;
    };
  }, [isSettingsModalOpen]);

  // Auto-save workspace state on view or selection changes
  useEffect(() => {
    api.saveWorkspaceState({
      id: 'current_workspace',
      selectedServiceId: presentationState.currentServiceId || null,
      selectedPresentationId: selectedPresentationId || null,
      selectedItemId: presentationState.currentItemId || null,
      selectedSlideIndex: presentationState.currentSlideIndex || 0,
      activeTab: activeView,
      lastSavedAt: new Date().toISOString(),
    }).catch(() => {});
  }, [activeView, selectedPresentationId, presentationState.currentServiceId, presentationState.currentItemId]);

  // Global Keyboard Navigation
  const anyModalOpen =
    isEditorOpen ||
    isDisplayModalOpen ||
    isBackupModalOpen ||
    isShortcutsModalOpen ||
    isMediaModalOpen ||
    isThemeModalOpen ||
    isTimerModalOpen ||
    isStagePreviewOpen ||
    isOutputModalOpen ||
    isMultiViewerModalOpen ||
    isOverlayModalOpen ||
    isIntegrationsModalOpen ||
    isDiagnosticsModalOpen ||
    isSettingsModalOpen;

  useKeyboardShortcuts({
    onNext: nextSlide,
    onPrevious: previousSlide,
    onToggleBlackout: toggleBlackout,
    onToggleLogo: toggleLogo,
    onClearMedia: clearMedia,
    onClearAll: clearAll,
    onCloseAudience: () => {
      if (audienceStatus.isOpen) void handleToggleAudienceWindow();
    },
    onGoToSlide: async (n) => {
      const state = await api.getPresentationState();
      if (await goToSlideNumber(state, n)) await refreshPresentationState();
    },
    bindings: keyBindings,
    onBinding: async (binding) => {
      try {
        setShortcutError(null);
        await runKeyBinding(binding);
        await refreshPresentationState();
      } catch (err: any) {
        setShortcutError(`Shortcut ${binding.combo}: ${typeof err === 'string' ? err : err?.message || 'could not run.'}`);
      }
    },
    onEscape: () => {
      // Dismiss any open modal on Escape
      if (isEditorOpen) setIsEditorOpen(false);
      else if (isDisplayModalOpen) setIsDisplayModalOpen(false);
      else if (isBackupModalOpen) setIsBackupModalOpen(false);
      else if (isShortcutsModalOpen) setIsShortcutsModalOpen(false);
      else if (isMediaModalOpen) setIsMediaModalOpen(false);
      else if (isThemeModalOpen) setIsThemeModalOpen(false);
      else if (isTimerModalOpen) setIsTimerModalOpen(false);
      else if (isStagePreviewOpen) setIsStagePreviewOpen(false);
      else if (isOutputModalOpen) setIsOutputModalOpen(false);
      else if (isOverlayModalOpen) setIsOverlayModalOpen(false);
      else if (isIntegrationsModalOpen) setIsIntegrationsModalOpen(false);
      else if (isDiagnosticsModalOpen) setIsDiagnosticsModalOpen(false);
      else if (isSettingsModalOpen) setIsSettingsModalOpen(false);
      else if (activeView === 'themes') setActiveView('presentations');
    },
    enabled: !anyModalOpen && activeView === 'presentations',
  });

  const handleEditSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setIsEditorOpen(true);
  };

  const handleAddSlide = async () => {
    if (!selectedPresentationId) return;
    const newSlide = await createSlide({
      title: `Slide ${slides.length + 1}`,
      body: '',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
    });
    if (newSlide) {
      setEditingSlide(newSlide);
      setIsEditorOpen(true);
    }
  };

  const handleAddSlideFromTemplate = async (template: SlideTemplate) => {
    if (!selectedPresentationId) return;
    const newSlide = await createSlide({
      title: template.name || `Slide ${slides.length + 1}`,
      body: '',
      backgroundColor: template.backgroundColor || '#0a0f1d',
      foregroundColor: template.foregroundColor || '#ffffff',
      fontSize: template.fontSize || 'large',
      textAlignment: template.textAlignment || 'center',
      backgroundImage: template.backgroundImage || null,
      layout: template.layout
        ? {
            ...template.layout,
            elements: cloneElements(template.layout.elements),
          }
        : undefined,
    });
    if (newSlide) {
      setEditingSlide(newSlide);
      setIsEditorOpen(true);
    }
  };

  const handleToggleAudienceWindow = async () => {
    if (audienceStatus.isOpen) {
      await api.closeAudienceWindow();
    } else {
      await api.openAudienceWindow(undefined, true);
    }
    await refreshAudienceStatus();
  };

  const handleSlidesGenerated = async (presentationId: string) => {
    await refreshPresentations();
    setSelectedPresentationId(presentationId);
    await refreshSlides(presentationId);
    setActiveView('presentations');
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <Header
        presentationState={presentationState}
        audienceStatus={audienceStatus}
        stageStatus={stageStatus}
        remoteServerStatus={remoteServerStatus}
        activeView={activeView}
        onChangeView={(view) => {
          if (view === 'themes') {
            setIsThemeModalOpen(true);
          } else {
            setActiveView(view);
          }
        }}
        onOpenDisplayModal={() => setIsDisplayModalOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsModalOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenMediaModal={() => setIsMediaModalOpen(true)}
        onOpenTimerModal={() => setIsTimerModalOpen(true)}
        onOpenStageModal={() => setIsStagePreviewOpen(true)}
        onOpenOutputModal={() => setIsOutputModalOpen(true)}
        onOpenMultiViewerModal={() => setIsMultiViewerModalOpen(true)}
        onOpenOverlayModal={() => setIsOverlayModalOpen(true)}
        onOpenIntegrationsModal={() => setIsIntegrationsModalOpen(true)}
        onOpenDiagnosticsModal={() => setIsDiagnosticsModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onToggleBlackout={toggleBlackout}
        onToggleLogo={toggleLogo}
        onClearMedia={clearMedia}
        onClearAll={clearAll}
      />

      {/* Live Media Controls Bar (when media is active) */}
      <MediaControlsBar
        mediaPlayback={presentationState.mediaPlayback}
        onUpdatePlayback={async () => {
          await refreshPresentationState();
        }}
      />

      {/* Global Error Banner */}
      {(error || shortcutError) && (
        <div
          style={{
            backgroundColor: '#ef4444',
            color: '#ffffff',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{shortcutError || error}</span>
          </div>
          <button
            onClick={() => {
              clearError();
              setShortcutError(null);
            }}
            style={{ color: '#ffffff' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* First-Run Welcome Banner */}
      {showWelcomeBanner && (
        <div
          data-testid="welcome-banner"
          style={{
            backgroundColor: '#1e3a8a',
            color: '#f8fafc',
            padding: '12px 20px',
            fontSize: '13px',
            borderBottom: '1px solid #3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={18} color="#60a5fa" />
            <div>
              <strong style={{ color: '#ffffff' }}>Welcome to Church Presenter!</strong>
              <span style={{ color: '#bfdbfe', marginLeft: '6px' }}>
                Prepare your first service order, worship songs, or offline scriptures to begin presenting live.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setActiveView('services')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              <span>Go to Services</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('songs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                color: '#93c5fd',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <BookOpen size={14} />
              <span>Song Library</span>
            </button>
            <button
              type="button"
              onClick={() => setShowWelcomeBanner(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#93c5fd',
                cursor: 'pointer',
                padding: '4px',
              }}
              title="Dismiss Welcome Banner"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace View */}
      {activeView === 'services' ? (
        <ServicePlannerView
          presentationState={presentationState}
          audienceStatus={audienceStatus}
          onRefreshPresentationState={async () => {
            await refreshPresentationState();
          }}
          onToggleBlackout={toggleBlackout}
          onToggleAudienceWindow={handleToggleAudienceWindow}
        />
      ) : activeView === 'presentations' ? (
        <div className="workspace-layout">
          {/* Left Column: Presentation Library */}
          <LibraryPanel
            presentations={presentations}
            selectedPresentationId={selectedPresentationId}
            onSelectPresentation={setSelectedPresentationId}
            onCreatePresentation={createPresentation}
            onUpdatePresentation={updatePresentation}
            onDuplicatePresentation={duplicatePresentation}
            onDeletePresentation={deletePresentation}
          />

          {/* Center Column: Slide Cards / Active Presentation */}
          <SlideGrid
            presentation={selectedPresentation}
            slides={slides}
            presentationState={presentationState}
            onGoLive={goLive}
            onEditSlide={handleEditSlide}
            onAddSlide={handleAddSlide}
            onAddSlideFromTemplate={handleAddSlideFromTemplate}
            onDuplicateSlide={duplicateSlide}
            onDeleteSlide={deleteSlide}
            onReorderSlides={reorderSlides}
          />

          {/* Right Column: LIVE & NEXT Previews and Presentation Controls */}
          <PreviewPanel
            presentationState={presentationState}
            audienceStatus={audienceStatus}
            onNext={nextSlide}
            onPrevious={previousSlide}
            onToggleBlackout={toggleBlackout}
            onToggleAudienceWindow={handleToggleAudienceWindow}
          />
        </div>
      ) : (
        /* Songs Library View */
        <SongLibraryView
          presentations={presentations}
          currentPresentationId={selectedPresentationId}
          onSlidesGenerated={handleSlidesGenerated}
        />
      )}

      {/* Slide Editor Modal */}
      <SlideEditorModal
        slide={editingSlide}
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingSlide(null);
        }}
        onSave={async (id, data) => {
          const updated = await updateSlide(id, data);
          return updated;
        }}
      />

      {/* Display & Monitor Manager Modal */}
      <DisplayModal
        isOpen={isDisplayModalOpen}
        onClose={() => setIsDisplayModalOpen(false)}
        audienceStatus={audienceStatus}
        onRefreshAudienceStatus={refreshAudienceStatus}
      />

      {/* Local Data Backup & Restore Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onDataRestored={() => {
          refreshPresentations();
          if (selectedPresentationId) {
            refreshSlides(selectedPresentationId);
          }
        }}
      />

      {/* Keyboard Shortcuts Guide Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {/* Themes Manager Modal */}
      <ThemeManagerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      {/* Media Backgrounds Library Modal */}
      <MediaLibraryModal
        isOpen={isMediaModalOpen}
        onClose={() => setIsMediaModalOpen(false)}
      />

      {/* Timer Control Modal */}
      <TimerControlModal
        isOpen={isTimerModalOpen}
        onClose={() => setIsTimerModalOpen(false)}
        currentTimerState={presentationState.timerState}
        onTimerStateChange={async () => {
          await refreshPresentationState();
        }}
      />

      {/* Stage / Confidence Display Preview Modal */}
      {isStagePreviewOpen && (
        <div
          data-testid="stage-preview-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              backgroundColor: '#0f172a',
              borderBottom: '1px solid #1e293b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1rem' }}>
                Stage Display Preview (Confidence Monitor)
              </span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {stageStatus.isOpen
                  ? `Native Window: Active on ${stageStatus.monitorName || 'Display'}`
                  : 'Safe Preview Mode (Windowed)'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                data-testid="stage-toggle-window-btn"
                onClick={async () => {
                  if (stageStatus.isOpen) {
                    await api.closeStageWindow();
                  } else {
                    await api.openStageWindow(undefined, false);
                  }
                  await refreshStageStatus();
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: stageStatus.isOpen ? '#7f1d1d' : '#2563eb',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {stageStatus.isOpen ? 'Close Native Stage Window' : 'Launch Native Stage Window'}
              </button>
              <button
                onClick={() => setIsStagePreviewOpen(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#334155',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <StageDisplayView previewMode onClose={() => setIsStagePreviewOpen(false)} />
          </div>
        </div>
      )}

      {/* Phase 5: Independent Output Manager Modal */}
      <OutputManagerModal
        isOpen={isOutputModalOpen}
        onClose={() => setIsOutputModalOpen(false)}
      />

      {/* Phase 9.3: Broadcast Multi-Viewer Production Monitor Modal */}
      <MultiViewerModal
        isOpen={isMultiViewerModalOpen}
        onClose={() => setIsMultiViewerModalOpen(false)}
        presentationState={presentationState}
      />

      {/* Phase 5: Livestream & OBS Transparent Overlay Modal */}
      <LivestreamOverlayModal
        isOpen={isOverlayModalOpen}
        onClose={() => setIsOverlayModalOpen(false)}
      />

      {/* Phase 5: Remote Control, MIDI, OSC & Action Registry Modal */}
      <ProductionIntegrationsModal
        isOpen={isIntegrationsModalOpen}
        onClose={() => setIsIntegrationsModalOpen(false)}
      />

      {/* Phase 5: System Diagnostics & Health Modal */}
      <DiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
      />

      {/* Phase 6: Application Settings & Release Diagnostics Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
      />
    </div>
  );
};
