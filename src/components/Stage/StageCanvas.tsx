import React, { useRef } from 'react';
import { PresentationState, StagePanel } from '../../types';
import { GroupTag } from '../GroupTag';
import { useElementHeight } from '../SlideElements';
import { defaultFontPct } from '../../services/stageLayouts';

export interface StageTimerView {
  display: string;
  isWarning: boolean;
  isExpired: boolean;
}

interface StageCanvasProps {
  panels: StagePanel[];
  state: PresentationState;
  /** Formatted clock text. */
  clock: string;
  timer: StageTimerView;
  highContrast: boolean;
  /** Override the measured canvas height (px); used by tests. */
  heightPx?: number;
  /** Editing: panels can be selected and dragged. */
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onPanelPointerDown?: (id: string, e: React.PointerEvent) => void;
}

/**
 * Draws a stage layout: panels placed in percent of the screen, text sized as a percentage of the
 * screen height. Used by the live stage window and by the layout editor's preview.
 */
export const StageCanvas = React.forwardRef<HTMLDivElement, StageCanvasProps>(function StageCanvas(
  { panels, state, clock, timer, highContrast, heightPx, interactive = false, selectedId, onSelect, onPanelPointerDown },
  forwardedRef
) {
  const innerRef = useRef<HTMLDivElement>(null);
  const measured = useElementHeight(innerRef);
  const height = heightPx ?? measured;

  const bg = highContrast ? '#000000' : '#0a0e17';
  const text = highContrast ? '#ffffff' : '#f1f5f9';
  const dim = highContrast ? '#94a3b8' : '#64748b';
  const accent = timer.isExpired ? '#ef4444' : timer.isWarning ? '#eab308' : '#38bdf8';
  const { currentSlide, nextSlide, isBlackout, isLive, stageMessage, timerState } = state;

  const px = (kind: StagePanel['kind'], pct: number | null | undefined) => {
    const p = pct ?? defaultFontPct(kind);
    return height > 0 ? `${(p / 100) * height}px` : `${p}vh`;
  };

  const label = (t: string, color: string): React.ReactNode => (
    <div style={{ fontSize: '0.45em', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color, marginBottom: '0.3em', display: 'flex', gap: '0.6em', alignItems: 'center' }}>
      {t}
    </div>
  );

  const content = (p: StagePanel): React.ReactNode => {
    switch (p.kind) {
      case 'current':
        return (
          <>
            {label('Current slide', '#38bdf8')}
            <div className="multilingual-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: 700, lineHeight: 1.3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden', color: isBlackout ? dim : text }}>
              {isBlackout ? '[ SCREEN BLACKOUT ACTIVE ]' : !isLive || !currentSlide ? '[ NO LIVE SLIDE SELECTED ]' : currentSlide.body}
            </div>
          </>
        );
      case 'next':
        return (
          <>
            {label('Next slide', dim)}
            <div className="multilingual-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: 600, lineHeight: 1.3, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'hidden', color: dim }}>
              {nextSlide ? nextSlide.body : '[ End of Presentation / Item ]'}
            </div>
          </>
        );
      case 'clock':
        return (
          <div data-testid="stage-panel-clock-text" style={{ margin: 'auto', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {clock}
          </div>
        );
      case 'timer':
        return timerState ? (
          <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', color: accent }}>
            <span style={{ fontSize: '0.4em', color: dim, textTransform: 'uppercase' }}>{timerState.name}</span>
            <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{timer.display}</span>
            {timer.isExpired && <span style={{ fontSize: '0.4em', fontWeight: 800 }}>TIME UP</span>}
          </div>
        ) : (
          <div style={{ margin: 'auto', color: dim, fontWeight: 700 }}>--:--</div>
        );
      case 'message':
        return stageMessage ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: '#dc2626', color: '#fff', borderRadius: '0.2em', wordBreak: 'break-word', overflow: 'hidden' }}>
            {stageMessage}
          </div>
        ) : null;
      case 'status':
        return (
          <div style={{ margin: 'auto 0', display: 'flex', alignItems: 'center', gap: '0.6em', fontWeight: 700 }}>
            <span style={{ width: '0.7em', height: '0.7em', borderRadius: '50%', backgroundColor: isBlackout ? '#ef4444' : isLive ? '#22c55e' : '#64748b' }} />
            <span>{isBlackout ? 'BLACKOUT' : isLive ? 'LIVE' : 'STANDBY'}</span>
            {currentSlide && (
              <span style={{ color: dim, fontWeight: 600 }}>
                {state.currentSlideIndex + 1}/{state.totalSlides}
              </span>
            )}
            <GroupTag slide={currentSlide} />
          </div>
        );
      case 'notes':
        return (
          <div style={{ margin: 'auto 0', color: '#e0e7ff', fontWeight: 500 }}>
            {currentSlide?.title ? `Section: ${currentSlide.title}. ` : ''}
            {state.currentItemId ? 'Keep tempo steady. Watch pastor for cues.' : 'Stage display connected and ready.'}
          </div>
        );
    }
  };

  return (
    <div
      ref={(el) => {
        (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (typeof forwardedRef === 'function') forwardedRef(el);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      data-testid="stage-canvas"
      style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: bg, color: text, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden', userSelect: 'none' }}
    >
      {panels.map((p) => {
        const selected = interactive && selectedId === p.id;
        const isMessage = p.kind === 'message';
        return (
          <div
            key={p.id}
            data-testid={`stage-panel-${p.kind}`}
            data-panel-kind={p.kind}
            onClick={interactive ? () => onSelect?.(p.id) : undefined}
            onPointerDown={
              interactive
                ? (e) => {
                    onSelect?.(p.id);
                    onPanelPointerDown?.(p.id, e);
                  }
                : undefined
            }
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.w}%`,
              height: `${p.h}%`,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              padding: isMessage ? 0 : '0.3em 0.6em',
              fontSize: px(p.kind, p.fontSizePct),
              backgroundColor: isMessage ? 'transparent' : highContrast ? '#05080f' : '#0b1220',
              border: selected ? '2px solid #38bdf8' : interactive ? '1px dashed #334155' : isMessage ? 'none' : '1px solid #1e293b',
              borderRadius: '0.25em',
              overflow: 'hidden',
              cursor: interactive ? 'move' : undefined,
              touchAction: interactive ? 'none' : undefined,
            }}
          >
            {content(p)}
          </div>
        );
      })}
    </div>
  );
});
