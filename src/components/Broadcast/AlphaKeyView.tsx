import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import {
  AlphaKeyConfig,
  LivestreamOverlayConfig,
  PresentationState,
} from '../../types';

export interface AlphaKeyViewProps {
  role?: 'fill' | 'key' | 'combined';
}

export const AlphaKeyView: React.FC<AlphaKeyViewProps> = ({ role: propRole }) => {
  const [presState, setPresState] = useState<PresentationState | null>(null);
  const [alphaConfig, setAlphaConfig] = useState<AlphaKeyConfig>({
    id: 'default-alpha-key',
    isEnabled: true,
    isActive: true,
    mode: 'dual_window',
    contentSource: 'overlay',
    fillMonitorId: null,
    keyMonitorId: null,
    combinedMonitorId: null,
    premultiplied: true,
    keyGain: 1.0,
    keyInvert: false,
    keyClipPercent: 0.0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [overlayConfig, setOverlayConfig] = useState<LivestreamOverlayConfig>({
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

  // Determine active role from prop or query param
  const activeRole: 'fill' | 'key' | 'combined' = useMemo(() => {
    if (propRole) return propRole;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const w = params.get('window');
      if (w === 'alpha_key' || window.location.hash.includes('alpha_key')) return 'key';
      if (w === 'alpha_combined' || window.location.hash.includes('alpha_combined')) return 'combined';
      if (w === 'alpha_fill' || window.location.hash.includes('alpha_fill')) return 'fill';
    }
    return 'fill';
  }, [propRole]);

  useEffect(() => {
    // If fill mode without premultiplication, ensure root is transparent
    if (typeof document !== 'undefined') {
      if (activeRole === 'fill' && !alphaConfig.premultiplied) {
        document.documentElement.style.background = 'transparent';
        document.body.style.background = 'transparent';
      } else {
        document.documentElement.style.background = '#000000';
        document.body.style.background = '#000000';
      }
    }

    api.getPresentationState().then(setPresState).catch(console.error);
    api.getAlphaKeyConfig().then(setAlphaConfig).catch(console.error);
    api.getOverlayConfig().then(setOverlayConfig).catch(console.error);

    let unlistenPres: (() => void) | undefined;
    api.subscribeStateChanges((state: PresentationState) => {
      setPresState(state);
    }).then((un) => {
      unlistenPres = un;
    });

    const unlistenAlpha = api.onAlphaKeyConfigUpdated((cfg) => {
      setAlphaConfig(cfg);
    });

    return () => {
      if (unlistenPres) unlistenPres();
      if (unlistenAlpha) unlistenAlpha();
    };
  }, [activeRole, alphaConfig.premultiplied]);

  const isLive = presState?.isLive && !presState.isBlackout && alphaConfig.isActive && alphaConfig.isEnabled;
  const slide = presState?.currentSlide;

  // Render content node for either 'fill' or 'key' channel
  const renderChannelContent = (channel: 'fill' | 'key') => {
    const isKeyChannel = channel === 'key';
    const isInverted = isKeyChannel && alphaConfig.keyInvert;

    // Background color:
    // For Key: Black (or White if inverted)
    // For Fill: Transparent (or Black if premultiplied)
    const bgColor = isKeyChannel
      ? (isInverted ? '#ffffff' : '#000000')
      : (alphaConfig.premultiplied ? '#000000' : 'transparent');

    const textColor = isKeyChannel
      ? (isInverted ? '#000000' : '#ffffff')
      : overlayConfig.textColor;

    const textShadow = isKeyChannel
      ? (isInverted ? '2px 2px 4px rgba(255,255,255,0.85)' : '2px 2px 4px rgba(255,255,255,0.85)')
      : overlayConfig.textShadow;

    const badgeBg = isKeyChannel
      ? (isInverted ? '#000000' : '#ffffff')
      : 'rgba(59, 130, 246, 0.9)';

    const badgeTextColor = isKeyChannel
      ? (isInverted ? '#ffffff' : '#000000')
      : '#ffffff';

    const cardBg = isKeyChannel
      ? (isInverted ? 'rgba(0, 0, 0, 0.95)' : 'rgba(255, 255, 255, 0.95)')
      : 'rgba(15, 23, 42, 0.88)';

    const keyFilter = isKeyChannel && alphaConfig.keyGain !== 1.0
      ? `contrast(${alphaConfig.keyGain * 100}%)`
      : undefined;

    if (!isLive || !slide) {
      return (
        <div
          data-testid={`alpha-${channel}-inactive`}
          className="w-full h-full"
          style={{ backgroundColor: bgColor }}
        />
      );
    }

    const isLowerThird = overlayConfig.layoutMode === 'lower_third';

    // Content: Either lower third layout or audience slide layout
    if (alphaConfig.contentSource === 'overlay') {
      return (
        <div
          data-testid={`alpha-${channel}-container`}
          className="w-full h-full flex flex-col justify-end overflow-hidden relative"
          style={{
            backgroundColor: bgColor,
            paddingLeft: `${overlayConfig.safeMarginHorizontalPct}vw`,
            paddingRight: `${overlayConfig.safeMarginHorizontalPct}vw`,
            paddingBottom: `${overlayConfig.safeMarginVerticalPct}vh`,
            paddingTop: isLowerThird ? 0 : `${overlayConfig.safeMarginVerticalPct}vh`,
            justifyContent: isLowerThird ? 'flex-end' : 'center',
            filter: keyFilter,
          }}
        >
          <div
            data-testid={`alpha-${channel}-card`}
            className="w-full rounded-2xl p-6 transition-all duration-300"
            style={{
              backgroundColor: cardBg,
              border: isKeyChannel
                ? (isInverted ? '2px solid #000000' : '2px solid #ffffff')
                : '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: isKeyChannel
                ? '0 10px 25px rgba(255, 255, 255, 0.3)'
                : '0 10px 25px rgba(0, 0, 0, 0.5)',
            }}
          >
            {overlayConfig.showSpeakerLabel && slide.title && (
              <div className="mb-2">
                <span
                  data-testid={`alpha-${channel}-badge`}
                  className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block"
                  style={{
                    backgroundColor: badgeBg,
                    color: badgeTextColor,
                  }}
                >
                  {slide.title}
                </span>
              </div>
            )}
            <div
              data-testid={`alpha-${channel}-text`}
              style={{
                fontFamily: overlayConfig.fontFamily,
                fontSize: `${overlayConfig.fontSizePx}px`,
                color: textColor,
                textShadow: textShadow,
                textAlign: overlayConfig.textAlignment,
                fontWeight: 600,
                lineHeight: 1.3,
                whiteSpace: 'pre-line',
              }}
            >
              {slide.body || slide.title || ''}
            </div>
          </div>
        </div>
      );
    }

    // Audience slide presentation layout
    return (
      <div
        data-testid={`alpha-${channel}-container`}
        className="w-full h-full flex flex-col items-center justify-center p-12 overflow-hidden relative"
        style={{
          backgroundColor: bgColor,
          filter: keyFilter,
        }}
      >
        {slide.title && (
          <h1
            data-testid={`alpha-${channel}-title`}
            className="text-4xl font-bold mb-6 text-center"
            style={{
              color: textColor,
              textShadow: textShadow,
            }}
          >
            {slide.title}
          </h1>
        )}
        <div
          data-testid={`alpha-${channel}-text`}
          className="text-3xl text-center leading-relaxed"
          style={{
            color: textColor,
            textShadow: textShadow,
            whiteSpace: 'pre-line',
          }}
        >
          {slide.body || ''}
        </div>
      </div>
    );
  };

  if (activeRole === 'fill') {
    return (
      <div
        data-testid="alpha-fill-window"
        className="w-screen h-screen overflow-hidden"
      >
        {renderChannelContent('fill')}
      </div>
    );
  }

  if (activeRole === 'key') {
    return (
      <div
        data-testid="alpha-key-window"
        className="w-screen h-screen overflow-hidden"
      >
        {renderChannelContent('key')}
      </div>
    );
  }

  // Combined mode: Side-by-Side (Horizontal) or Stacked (Vertical)
  const isStacked = alphaConfig.mode === 'stacked';

  return (
    <div
      data-testid="alpha-combined-window"
      className={`w-screen h-screen overflow-hidden flex ${
        isStacked ? 'flex-col' : 'flex-row'
      }`}
    >
      <div
        data-testid="alpha-combined-fill"
        className="relative overflow-hidden"
        style={{
          width: isStacked ? '100%' : '50%',
          height: isStacked ? '50%' : '100%',
          borderRight: isStacked ? undefined : '1px solid #334155',
          borderBottom: isStacked ? '1px solid #334155' : undefined,
        }}
      >
        <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-blue-600/80 text-white text-[10px] font-mono tracking-wider uppercase">
          Fill Channel
        </div>
        {renderChannelContent('fill')}
      </div>

      <div
        data-testid="alpha-combined-key"
        className="relative overflow-hidden"
        style={{
          width: isStacked ? '100%' : '50%',
          height: isStacked ? '50%' : '100%',
        }}
      >
        <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 text-[10px] font-mono tracking-wider uppercase border border-slate-700">
          Key Matte Channel
        </div>
        {renderChannelContent('key')}
      </div>
    </div>
  );
};
