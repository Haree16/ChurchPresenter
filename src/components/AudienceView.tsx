import React, { useState, useEffect, useRef } from 'react';
import { useLogoUrl } from '../hooks/useLogoUrl';
import { AlertBanner } from './AlertBanner';
import { PropsLayer } from './PropsLayer';
import { SlideElements } from './SlideElements';
import { composeTextShadow, layoutPadding } from '../services/slideLayout';
import { PresentationState, Theme } from '../types';
import { api } from '../services/api';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { goToSlideNumber } from '../services/slideJump';
import { mediaService, getMediaTypeFromExtension } from '../services/mediaService';

interface AudienceViewProps {
  outputId?: string;
}

export const AudienceView: React.FC<AudienceViewProps> = ({ outputId }) => {
  const [presentationState, setPresentationState] = useState<PresentationState>({
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
  });

  const [bgFailed, setBgFailed] = useState<boolean>(false);
  const [slideOpacity, setSlideOpacity] = useState<number>(1);
  const prevSlideIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Keys pressed while the output window has focus control the presentation, as in the
  // operator window: arrows/space step, a typed number plus Enter jumps to that slide.
  useKeyboardShortcuts({
    onNext: () => void api.nextSlide(),
    onPrevious: () => void api.previousSlide(),
    onToggleBlackout: () => void api.toggleBlackout(),
    onToggleLogo: () => void api.toggleLogo(),
    onClearMedia: () => void api.clearMedia(),
    onClearAll: () => void api.clearAll(),
    onCloseAudience: () => void api.closeAudienceWindow(),
    onGoToSlide: async (n) => {
      const state = await api.getPresentationState();
      await goToSlideNumber(state, n);
    },
  });

  useEffect(() => {
    // Initial fetch of current presentation state
    api.getPresentationState().then((state) => {
      setPresentationState(state);
    });

    // Subscribe to state change broadcasts from operator window
    let unsubscribe: (() => void) | undefined;
    api.subscribeStateChanges((newState) => {
      setPresentationState(newState);
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.src = '';
          videoRef.current.load();
        } catch (_) {}
      }
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current.load();
        } catch (_) {}
      }
    };
  }, []);

  const effectiveOutputId =
    outputId ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('outputId') ||
        new URLSearchParams(window.location.search).get('output') ||
        'output-audience'
      : 'output-audience');

  const screenLayer = presentationState.screenLayers?.[effectiveOutputId];
  const isLogo = screenLayer ? screenLayer.isLogo : !!presentationState.isLogo;
  const isBlackout = screenLayer ? screenLayer.isBlackout : !!presentationState.isBlackout;
  const activeProps = screenLayer ? screenLayer.activeProps : (presentationState.activeProps || []);
  const screenThemeId = screenLayer?.themeId;

  const [overrideTheme, setOverrideTheme] = useState<Theme | null>(null);

  useEffect(() => {
    if (screenThemeId) {
      api.getTheme(screenThemeId).then(setOverrideTheme).catch(() => setOverrideTheme(null));
    } else {
      setOverrideTheme(null);
    }
  }, [screenThemeId]);

  const { isLive, currentSlide, mediaPlayback } = presentationState;
  // re-read the custom logo each time the logo screen is shown
  const logoUrl = useLogoUrl(!!isLogo);
  // props and alerts show over every kind of output (slide, logo, blackout, video)
  const withAlert = (node: React.ReactElement) => (
    <>
      {node}
      {/* blackout hides props; alerts still show */}
      {!isBlackout && <PropsLayer props={activeProps} />}
      <AlertBanner alert={presentationState.alert} />
    </>
  );

  // Slide transition effect (fade under 500ms, no flash)
  useEffect(() => {
    if (currentSlide && prevSlideIdRef.current && prevSlideIdRef.current !== currentSlide.id) {
      setSlideOpacity(0.05);
      const timer = setTimeout(() => {
        setSlideOpacity(1);
      }, 50);
      prevSlideIdRef.current = currentSlide.id;
      return () => clearTimeout(timer);
    }
    if (currentSlide) {
      prevSlideIdRef.current = currentSlide.id;
    }
  }, [currentSlide?.id]);

  // Sync Video playback state with mediaPlayback
  useEffect(() => {
    if (!videoRef.current || !mediaPlayback) return;
    const v = videoRef.current;

    v.muted = !!mediaPlayback.isMuted;
    v.volume = typeof mediaPlayback.volume === 'number' ? mediaPlayback.volume : 1.0;
    v.loop = mediaPlayback.isLooping !== false;

    if (mediaPlayback.isPlaying && v.paused) {
      v.play().catch(() => {});
    } else if (!mediaPlayback.isPlaying && !v.paused) {
      v.pause();
    }
  }, [mediaPlayback]);

  // Sync Audio playback state
  useEffect(() => {
    if (!audioRef.current || !mediaPlayback || mediaPlayback.mediaType !== 'audio') return;
    const a = audioRef.current;

    a.muted = !!mediaPlayback.isMuted;
    a.volume = typeof mediaPlayback.volume === 'number' ? mediaPlayback.volume : 1.0;
    a.loop = mediaPlayback.isLooping !== false;

    if (mediaPlayback.isPlaying && a.paused) {
      a.play().catch(() => {});
    } else if (!mediaPlayback.isPlaying && !a.paused) {
      a.pause();
    }
  }, [mediaPlayback]);

  // Reset background failure status when slide or media URL changes
  useEffect(() => {
    setBgFailed(false);
  }, [currentSlide?.backgroundImage, mediaPlayback?.mediaUrl]);

  // Determine motion background video source:
  // Either from slide.backgroundImage (if it's a video file) or from active mediaPlayback of type video
  const slideBgType = currentSlide?.backgroundImage
    ? getMediaTypeFromExtension(currentSlide.backgroundImage)
    : null;

  const motionVideoUrl =
    slideBgType === 'video'
      ? mediaService.resolveMediaUrl(currentSlide?.backgroundImage)
      : mediaPlayback?.mediaType === 'video' && mediaPlayback.mediaUrl
      ? mediaPlayback.mediaUrl
      : null;

  const isFullscreenVideoMode =
    mediaPlayback?.mediaType === 'video' &&
    (!currentSlide || !currentSlide.body.trim()) &&
    mediaPlayback.mediaUrl;

  // Clear-to-logo: church logo on black, unless blackout takes priority
  if (isLogo && !isBlackout) {
    return withAlert(
      <div
        data-testid="audience-logo"
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'none',
          overflow: 'hidden',
        }}
      >
        <img
          src={logoUrl}
          alt=""
          style={{ maxWidth: '40vmin', maxHeight: '40vmin', objectFit: 'contain' }}
        />
      </div>
    );
  }

  // Render pure black screen when blackout is active or not live
  if (isBlackout || !isLive) {
    return withAlert(
      <div
        data-testid="audience-blackout"
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000000',
          cursor: 'none',
          overflow: 'hidden',
        }}
      />
    );
  }

  // Fullscreen standalone video presentation mode
  if (isFullscreenVideoMode && mediaPlayback) {
    const objectFit =
      mediaPlayback.fitMode === 'contain'
        ? 'contain'
        : mediaPlayback.fitMode === 'stretch'
        ? 'fill'
        : 'cover';

    return withAlert(
      <div
        data-testid="audience-video-fullscreen"
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000000',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'none',
        }}
      >
        <video
          ref={videoRef}
          src={mediaPlayback.mediaUrl || ''}
          autoPlay={mediaPlayback.isPlaying}
          loop={mediaPlayback.isLooping}
          muted={mediaPlayback.isMuted}
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit,
          }}
          onError={() => {
            api.logClientDiagnostic(
              'ERROR',
              'AudienceView',
              'Standalone video presentation failed to play',
              mediaPlayback.mediaUrl || undefined
            ).catch(() => {});
          }}
        />
      </div>
    );
  }

  // If no current slide and no video, show clean black
  if (!currentSlide) {
    return withAlert(
      <div
        data-testid="audience-blackout"
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000000',
          cursor: 'none',
          overflow: 'hidden',
        }}
      />
    );
  }

  // Calculate dynamic font scale relative to screen size
  const getFontSize = (size?: string) => {
    switch (size) {
      case 'small':
        return 'clamp(1.5rem, 3.5vw, 2.5rem)';
      case 'medium':
        return 'clamp(2rem, 4.5vw, 3.5rem)';
      case 'large':
        return 'clamp(2.5rem, 5.5vw, 4.5rem)';
      case 'xlarge':
        return 'clamp(3rem, 6.8vw, 5.8rem)';
      default:
        return 'clamp(2.5rem, 5.5vw, 4.5rem)';
    }
  };

  const textAlign = currentSlide.textAlignment || 'center';
  const alignItems =
    textAlign === 'center'
      ? 'center'
      : textAlign === 'right'
      ? 'flex-end'
      : 'flex-start';

  const justifyContent =
    currentSlide.verticalAlignment === 'top'
      ? 'flex-start'
      : currentSlide.verticalAlignment === 'bottom'
      ? 'flex-end'
      : 'center';

  const isImageBackground =
    currentSlide.backgroundImage && slideBgType !== 'video' && !bgFailed;

  return withAlert(
    <div
      data-testid="audience-display"
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: overrideTheme?.backgroundColor || currentSlide.backgroundColor || '#0a0f1d',
        backgroundImage: isImageBackground
          ? `url("${mediaService.resolveMediaUrl(currentSlide.backgroundImage)}")`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: overrideTheme?.textColor || currentSlide.foregroundColor || '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justifyContent,
        alignItems: alignItems,
        padding: layoutPadding(currentSlide.layout) ?? '5vw 6vw',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        cursor: 'none',
        userSelect: 'none',
      }}
    >
      {/* Background Image Preload / Error Fallback Watcher */}
      {currentSlide.backgroundImage && slideBgType !== 'video' && (
        <img
          src={mediaService.resolveMediaUrl(currentSlide.backgroundImage)}
          alt="bg-preload"
          style={{ display: 'none' }}
          onError={() => {
            setBgFailed(true);
            api.logClientDiagnostic(
              'WARN',
              'AudienceView',
              'Background image failed to load; fell back to theme background color',
              currentSlide.backgroundImage || undefined
            ).catch(() => {});
          }}
        />
      )}

      {/* Motion Background Video Behind Lyrics (Seamless Across Slide Changes) */}
      {motionVideoUrl && (
        <video
          ref={videoRef}
          data-testid="audience-motion-background"
          src={motionVideoUrl}
          autoPlay
          loop
          muted={mediaPlayback ? mediaPlayback.isMuted : true}
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
          }}
          onError={() => {
            setBgFailed(true);
            api.logClientDiagnostic(
              'WARN',
              'AudienceView',
              'Motion background video failed to load; fell back to theme background color',
              motionVideoUrl || undefined
            ).catch(() => {});
          }}
        />
      )}

      {/* Invisible Background Audio Player */}
      {mediaPlayback?.mediaType === 'audio' && mediaPlayback.mediaUrl && (
        <audio
          ref={audioRef}
          data-testid="audience-audio-player"
          src={mediaPlayback.mediaUrl}
          autoPlay={mediaPlayback.isPlaying}
          loop={mediaPlayback.isLooping}
          muted={mediaPlayback.isMuted}
          style={{ display: 'none' }}
        />
      )}

      {/* Optional Dark Scrim / Color Overlay */}
      {currentSlide.overlayColor && (
        <div
          data-testid="audience-slide-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: currentSlide.overlayColor,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Lyrics / Slide Text Overlay */}
      {(() => {
        const dualMatch = currentSlide.title?.match(/\((.+?)\s*\/\s*(.+?)\)$/);
        const dualParts =
          dualMatch && currentSlide.body?.includes('\n\n')
            ? (() => {
                const parts = currentSlide.body.split('\n\n');
                const mid = Math.ceil(parts.length / 2);
                return {
                  leftLabel: dualMatch[1],
                  leftText: parts.slice(0, mid).join('\n\n'),
                  rightLabel: dualMatch[2],
                  rightText: parts.slice(mid).join('\n\n'),
                };
              })()
            : null;

        return (
          <div
            data-testid="audience-slide-body"
            className="multilingual-text"
            style={{
              position: 'relative',
              zIndex: 2,
              width: '100%',
              textAlign: textAlign,
              fontSize: getFontSize(currentSlide.fontSize),
              fontWeight: currentSlide.fontWeight === 'normal' ? 500 : 700,
              fontFamily: currentSlide.fontFamily || 'var(--font-family)',
              lineHeight: currentSlide.lineSpacing || 1.35,
              letterSpacing: '0.015em',
              textShadow: composeTextShadow(
                currentSlide.layout,
                currentSlide.textShadow !== null && currentSlide.textShadow !== undefined
                  ? currentSlide.textShadow
                  : '0 2px 12px rgba(0, 0, 0, 0.85)'
              ),
              transition: 'opacity 250ms ease-in-out',
              opacity: slideOpacity,
            }}
          >
            {dualParts ? (
              <div
                data-testid="dual-translation-layout"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4vw',
                  width: '100%',
                  alignItems: 'start',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
                  <div
                    style={{
                      fontSize: '0.55em',
                      fontWeight: 700,
                      opacity: 0.75,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {dualParts.leftLabel}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{dualParts.leftText}</div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8vh',
                    borderLeft: '1px solid rgba(255, 255, 255, 0.2)',
                    paddingLeft: '3vw',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.55em',
                      fontWeight: 700,
                      opacity: 0.75,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {dualParts.rightLabel}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{dualParts.rightText}</div>
                </div>
              </div>
            ) : (
              currentSlide.body
            )}
          </div>
        );
      })()}

      {/* Extra text boxes, images and shapes placed on the slide */}
      <div style={{ opacity: slideOpacity, transition: 'opacity 250ms ease-in-out' }}>
        <SlideElements elements={currentSlide.layout?.elements} />
      </div>
    </div>
  );
};

export default AudienceView;
