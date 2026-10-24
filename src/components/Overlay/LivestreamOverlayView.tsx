import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { LivestreamOverlayConfig, PresentationState } from '../../types';

export const LivestreamOverlayView: React.FC = () => {
  const [presState, setPresState] = useState<PresentationState | null>(null);
  const [config, setConfig] = useState<LivestreamOverlayConfig>({
    id: 'default-overlay',
    layoutMode: 'lower_third',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSizePx: 42,
    textColor: '#ffffff',
    textShadow: '2px 2px 4px rgba(0,0,0,0.85)',
    textAlignment: 'center',
    safeMarginHorizontalPct: 5.0,
    safeMarginVerticalPct: 6.0,
    showSpeakerLabel: true,
    showReference: true,
    isCleared: false,
    authToken: '',
    createdAt: '',
    updatedAt: '',
  });

  useEffect(() => {
    // Force transparency on body & root
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    // Initial state and config
    api.getPresentationState().then(setPresState).catch(console.error);
    api.getOverlayConfig().then(setConfig).catch(console.error);

    // Listen to live state updates
    let unlistenPres: (() => void) | undefined;
    api.subscribeStateChanges((state: PresentationState) => {
      setPresState(state);
    }).then((un: () => void) => {
      unlistenPres = un;
    });

    // Listen to config updates if in Tauri
    let unlistenConfig: (() => void) | undefined;
    let unlistenClear: (() => void) | undefined;

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<LivestreamOverlayConfig>('overlay:config-updated', (ev) => {
          setConfig(ev.payload);
        }).then((un) => {
          unlistenConfig = un;
        });

        listen<boolean>('overlay:cleared', (ev) => {
          setConfig((prev) => ({ ...prev, isCleared: ev.payload }));
        }).then((un) => {
          unlistenClear = un;
        });
      });
    }

    return () => {
      if (unlistenPres) unlistenPres();
      if (unlistenConfig) unlistenConfig();
      if (unlistenClear) unlistenClear();
    };
  }, []);

  const isVisible =
    presState?.isLive &&
    !presState.isBlackout &&
    !config.isCleared &&
    !!presState.currentSlide;

  if (!isVisible || !presState?.currentSlide) {
    return (
      <div
        data-testid="overlay-container"
        className="w-screen h-screen bg-transparent pointer-events-none"
      />
    );
  }

  const slide = presState.currentSlide;
  const isLowerThird = config.layoutMode === 'lower_third';

  return (
    <div
      data-testid="overlay-container"
      className="w-screen h-screen bg-transparent pointer-events-none flex flex-col justify-end overflow-hidden"
      style={{
        paddingLeft: `${config.safeMarginHorizontalPct}vw`,
        paddingRight: `${config.safeMarginHorizontalPct}vw`,
        paddingBottom: `${config.safeMarginVerticalPct}vh`,
        paddingTop: isLowerThird ? 0 : `${config.safeMarginVerticalPct}vh`,
        justifyContent: isLowerThird ? 'flex-end' : 'center',
      }}
    >
      <div
        data-testid="overlay-card"
        className={`transition-all duration-300 ease-in-out ${
          isLowerThird
            ? 'bg-slate-950/80 backdrop-blur-md border-l-4 border-blue-500 rounded-xl px-8 py-5 shadow-2xl max-w-5xl mx-auto w-full'
            : 'bg-transparent text-center max-w-6xl mx-auto w-full'
        }`}
      >
        {config.showSpeakerLabel && slide.title && (
          <div
            data-testid="overlay-title"
            className="text-blue-300 font-bold uppercase tracking-wider text-sm mb-1.5"
            style={{ textAlign: config.textAlignment }}
          >
            {slide.title}
          </div>
        )}
        <div
          data-testid="overlay-text"
          className="font-semibold leading-relaxed whitespace-pre-wrap drop-shadow-md"
          style={{
            fontFamily: config.fontFamily,
            fontSize: `${config.fontSizePx}px`,
            color: config.textColor,
            textShadow: config.textShadow,
            textAlign: config.textAlignment,
          }}
        >
          {slide.body || slide.title}
        </div>
      </div>
    </div>
  );
};
