import React, { useState, useEffect } from 'react';
import { PresentationState, StageConfig, TimerState } from '../../types';
import { api } from '../../services/api';

interface StageDisplayViewProps {
  previewMode?: boolean;
  onClose?: () => void;
}

export const StageDisplayView: React.FC<StageDisplayViewProps> = ({
  previewMode = false,
  onClose,
}) => {
  const [presentationState, setPresentationState] = useState<PresentationState>({
    currentPresentationId: null,
    currentSlideId: null,
    currentSlideIndex: 0,
    totalSlides: 0,
    currentSlide: null,
    nextSlide: null,
    isBlackout: false,
    isLive: false,
  });

  const [stageConfig, setStageConfig] = useState<StageConfig>({
    id: 'default-stage',
    fontSize: 'large',
    showNotes: true,
    showTimer: true,
    showNext: true,
    highContrast: true,
    createdAt: '',
    updatedAt: '',
  });

  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [computedTimerDisplay, setComputedTimerDisplay] = useState<string>('00:00');
  const [isWarning, setIsWarning] = useState<boolean>(false);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // 1. Initial State and Subscriptions
  useEffect(() => {
    api.getPresentationState().then((state) => {
      setPresentationState(state);
    });

    api.getStageConfig().then((cfg) => {
      if (cfg) setStageConfig(cfg);
    });

    let unsubscribe: (() => void) | undefined;
    api.subscribeStateChanges((newState) => {
      setPresentationState(newState);
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // 2. Real-time Clock (1s interval)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3. Drift-free Timer Calculation
  useEffect(() => {
    const timerState: TimerState | null | undefined = presentationState.timerState;
    if (!timerState) {
      setComputedTimerDisplay('00:00');
      setIsWarning(false);
      setIsExpired(false);
      return;
    }

    const updateTimer = () => {
      let currentSeconds = timerState.accumulatedSeconds || 0;
      if (timerState.isRunning && timerState.startTimeEpochMs) {
        const elapsedSinceStart = (Date.now() - timerState.startTimeEpochMs) / 1000;
        currentSeconds += elapsedSinceStart;
      }

      if (timerState.timerType === 'countdown') {
        const remaining = Math.max(0, timerState.durationSeconds - currentSeconds);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        setComputedTimerDisplay(`${mins}:${secs.toString().padStart(2, '0')}`);

        setIsWarning(remaining <= timerState.warningThresholdSeconds && remaining > 0);
        setIsExpired(remaining <= 0);
      } else {
        // Elapsed timer
        const mins = Math.floor(currentSeconds / 60);
        const secs = Math.floor(currentSeconds % 60);
        setComputedTimerDisplay(`${mins}:${secs.toString().padStart(2, '0')}`);

        setIsWarning(
          timerState.warningThresholdSeconds > 0 &&
            currentSeconds >= timerState.warningThresholdSeconds
        );
        setIsExpired(false);
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 200);
    return () => clearInterval(timerInterval);
  }, [presentationState.timerState]);

  const { currentSlide, nextSlide, isBlackout, isLive } = presentationState;

  // Font size mapping for high readability
  const getFontSizeStyle = (size: string) => {
    switch (size) {
      case 'small':
        return { current: 'clamp(1.4rem, 2.5vw, 2.2rem)', next: 'clamp(1.1rem, 1.8vw, 1.6rem)' };
      case 'medium':
        return { current: 'clamp(1.8rem, 3.5vw, 3rem)', next: 'clamp(1.3rem, 2.2vw, 2rem)' };
      case 'xlarge':
        return { current: 'clamp(2.8rem, 5.5vw, 4.8rem)', next: 'clamp(1.8rem, 3vw, 2.8rem)' };
      case 'large':
      default:
        return { current: 'clamp(2.2rem, 4.2vw, 3.8rem)', next: 'clamp(1.5rem, 2.5vw, 2.4rem)' };
    }
  };

  const fontSizes = getFontSizeStyle(stageConfig.fontSize);

  // Background and text contrast
  const bg = stageConfig.highContrast ? '#000000' : '#0a0e17';
  const textColor = stageConfig.highContrast ? '#ffffff' : '#f1f5f9';
  const nextTextColor = stageConfig.highContrast ? '#94a3b8' : '#64748b';
  const accentColor = isExpired ? '#ef4444' : isWarning ? '#eab308' : '#38bdf8';

  return (
    <div
      data-testid="stage-display-view"
      style={{
        width: '100%',
        height: '100%',
        minHeight: previewMode ? '480px' : '100vh',
        backgroundColor: bg,
        color: textColor,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Top Status & Confidence Bar */}
      <div
        data-testid="stage-status-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '2px solid #1e293b',
          backgroundColor: '#0f172a',
          fontSize: '1.1rem',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: isBlackout ? '#ef4444' : isLive ? '#22c55e' : '#64748b',
              boxShadow: isLive ? '0 0 10px #22c55e' : 'none',
            }}
          />
          <span>{isBlackout ? 'BLACKOUT' : isLive ? 'LIVE' : 'STANDBY'}</span>

          {currentSlide && (
            <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
              Slide {presentationState.currentSlideIndex + 1} of {presentationState.totalSlides}
            </span>
          )}
        </div>

        {/* Prominent Live Timer */}
        {stageConfig.showTimer && presentationState.timerState && (
          <div
            data-testid="stage-timer-display"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '4px 16px',
              borderRadius: '8px',
              backgroundColor: isExpired ? '#7f1d1d' : isWarning ? '#713f12' : '#1e293b',
              border: `2px solid ${accentColor}`,
            }}
          >
            <span style={{ fontSize: '0.9rem', color: '#cbd5e1', textTransform: 'uppercase' }}>
              {presentationState.timerState.name}:
            </span>
            <span
              style={{
                fontSize: '1.6rem',
                fontWeight: 800,
                color: accentColor,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.05em',
              }}
            >
              {computedTimerDisplay}
            </span>
            {isExpired && (
              <span style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: 700 }}>
                TIME UP
              </span>
            )}
          </div>
        )}

        {/* Clock & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            data-testid="stage-clock"
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#f8fafc',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {currentTimeStr}
          </div>

          {previewMode && onClose && (
            <button
              onClick={onClose}
              style={{
                background: '#334155',
                border: 'none',
                color: '#fff',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Close Preview
            </button>
          )}
        </div>
      </div>

      {/* Main Slide Content Area */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: stageConfig.showNext ? '1.3fr 1fr' : '1fr',
          gap: '20px',
          padding: '24px',
          overflow: 'hidden',
        }}
      >
        {/* CURRENT SLIDE (CONFIDENCE VIEW) */}
        <div
          data-testid="stage-current-slide"
          style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#090d16',
            borderRadius: '12px',
            border: '2px solid #38bdf8',
            padding: '20px 24px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #1e293b',
              paddingBottom: '10px',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                fontSize: '0.9rem',
                fontWeight: 800,
                color: '#38bdf8',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              ● CURRENT SLIDE (AUDIENCE IS SEEING)
            </span>
            {currentSlide?.title && (
              <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 600 }}>
                {currentSlide.title}
              </span>
            )}
          </div>

          <div
            className="multilingual-text"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: currentSlide?.textAlignment === 'left' ? 'flex-start' : 'center',
              textAlign: (currentSlide?.textAlignment as any) || 'center',
              fontSize: fontSizes.current,
              fontWeight: 700,
              lineHeight: 1.35,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowY: 'auto',
              color: isBlackout ? '#64748b' : textColor,
            }}
          >
            {isBlackout
              ? '[ SCREEN BLACKOUT ACTIVE ]'
              : !isLive || !currentSlide
              ? '[ NO LIVE SLIDE SELECTED ]'
              : currentSlide.body}
          </div>
        </div>

        {/* NEXT SLIDE PREVIEW (FOR WORSHIP LEADER / PREACHER) */}
        {stageConfig.showNext && (
          <div
            data-testid="stage-next-slide"
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#040711',
              borderRadius: '12px',
              border: '2px solid #334155',
              padding: '20px 24px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #1e293b',
                paddingBottom: '10px',
                marginBottom: '16px',
              }}
            >
              <span
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: '#94a3b8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                NEXT SLIDE (COMING UP)
              </span>
              {nextSlide?.title && (
                <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
                  {nextSlide.title}
                </span>
              )}
            </div>

            <div
              className="multilingual-text"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: nextSlide?.textAlignment === 'left' ? 'flex-start' : 'center',
                textAlign: (nextSlide?.textAlignment as any) || 'center',
                fontSize: fontSizes.next,
                fontWeight: 600,
                lineHeight: 1.35,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowY: 'auto',
                color: nextTextColor,
                opacity: 0.9,
              }}
            >
              {nextSlide ? nextSlide.body : '[ End of Presentation / Item ]'}
            </div>
          </div>
        )}
      </div>

      {/* Operator Notes & Cues (Private to Stage & Operator) */}
      {stageConfig.showNotes && (
        <div
          data-testid="stage-notes-panel"
          style={{
            margin: '0 24px 20px 24px',
            padding: '12px 20px',
            backgroundColor: '#1e1b4b',
            border: '1px solid #4338ca',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 800,
              color: '#a5b4fc',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            STAGE CUE / NOTES:
          </span>
          <span style={{ color: '#e0e7ff', fontSize: '1.05rem', fontWeight: 500 }}>
            {currentSlide?.title ? `Section: ${currentSlide.title}. ` : ''}
            {presentationState.currentItemId
              ? `Keep tempo steady. Watch pastor for cues.`
              : 'Stage display connected and ready.'}
          </span>
        </div>
      )}
    </div>
  );
};
export default StageDisplayView;
