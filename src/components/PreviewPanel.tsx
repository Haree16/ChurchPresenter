import React, { useState } from 'react';
import { PropsControl } from './PropsControl';
import { AutoAdvanceControl } from './AutoAdvanceControl';
import { LooksControl } from './LooksControl';
import { MacroControl } from './MacroControl';
import { SlideElements } from './SlideElements';
import { composeTextShadow, layoutPaddingPercent } from '../services/slideLayout';
import { AudienceAlertControl } from './AudienceAlertControl';
import { GroupTag } from './GroupTag';
import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Radio,
  Tv,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { PresentationState, AudienceWindowStatus } from '../types';
import { api } from '../services/api';

interface PreviewPanelProps {
  presentationState: PresentationState;
  audienceStatus: AudienceWindowStatus;
  onNext: () => void;
  onPrevious: () => void;
  onToggleBlackout: () => void;
  onToggleAudienceWindow: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  presentationState,
  audienceStatus,
  onNext,
  onPrevious,
  onToggleBlackout,
  onToggleAudienceWindow,
}) => {
  const { currentSlide, nextSlide, isBlackout, isLive, currentSlideIndex, totalSlides } =
    presentationState;

  const [stageCueText, setStageCueText] = useState<string>('');

  const handleSendStageCue = async () => {
    const trimmed = stageCueText.trim();
    if (trimmed) {
      await api.setStageMessage(trimmed);
      setStageCueText('');
    }
  };

  const handleClearStageCue = async () => {
    await api.setStageMessage(null);
  };

  const getFontSizePx = (size?: string) => {
    switch (size) {
      case 'small':
        return '11px';
      case 'medium':
        return '13px';
      case 'large':
        return '15px';
      case 'xlarge':
        return '18px';
      default:
        return '14px';
    }
  };

  return (
    <div
      className="preview-column"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        borderLeft: '1px solid #1e293b',
        overflowY: 'auto',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: '12px',
            color: '#cbd5e1',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Output & Controls
        </div>
        {totalSlides > 0 && isLive && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <GroupTag slide={currentSlide} />
            <span
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                backgroundColor: '#1e293b',
                padding: '2px 8px',
                borderRadius: '10px',
              }}
            >
              Slide {currentSlideIndex + 1} of {totalSlides}
            </span>
          </span>
        )}
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 1. LIVE SCREEN PREVIEW */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: isLive ? (isBlackout ? '#f87171' : '#ef4444') : '#94a3b8',
              }}
            >
              <Radio size={13} />
              <span>LIVE OUTPUT</span>
            </div>
            {isBlackout && (
              <span style={{ fontSize: '10px', color: '#f87171', fontWeight: 600 }}>
                BLACKOUT
              </span>
            )}
          </div>

          {/* 16:9 Live Canvas */}
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: '8px',
              backgroundColor: isBlackout ? '#000000' : currentSlide?.backgroundColor || '#000000',
              backgroundImage: isBlackout
                ? undefined
                : currentSlide?.backgroundImage
                ? `url("${currentSlide.backgroundImage}")`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: isBlackout ? '#ffffff' : currentSlide?.foregroundColor || '#ffffff',
              border: isLive
                ? isBlackout
                  ? '2px solid #ef4444'
                  : '2px solid #dc2626'
                : '1px solid #334155',
              boxShadow: isLive && !isBlackout ? '0 0 14px rgba(220, 38, 38, 0.35)' : 'none',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems:
                currentSlide?.textAlignment === 'center'
                  ? 'center'
                  : currentSlide?.textAlignment === 'right'
                  ? 'flex-end'
                  : 'flex-start',
              padding: layoutPaddingPercent(currentSlide?.layout) ?? '12px',
              textAlign: currentSlide?.textAlignment || 'center',
            }}
          >
            {isBlackout ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#94a3b8',
                }}
              >
                <EyeOff size={22} color="#ef4444" />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#f87171' }}>
                  Audience screen is blacked out
                </span>
                <span style={{ fontSize: '10px', color: '#64748b' }}>Press (B) to restore</span>
              </div>
            ) : isLive && currentSlide ? (
              <div
                className="multilingual-text"
                style={{
                  fontSize: getFontSizePx(currentSlide.fontSize),
                  fontWeight: 600,
                  maxHeight: '100%',
                  lineHeight: 1.35,
                  textShadow: composeTextShadow(currentSlide.layout, null),
                }}
              >
                {currentSlide.body}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                No active slide. Select a slide to go live.
              </div>
            )}
            {!isBlackout && isLive && currentSlide && (
              <SlideElements elements={currentSlide.layout?.elements} />
            )}
          </div>
        </div>

        {/* 2. NEXT SLIDE PREVIEW */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#60a5fa',
              }}
            >
              <ArrowRight size={13} />
              <span>NEXT SLIDE</span>
            </div>
            {nextSlide && (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                #{nextSlide.sortOrder + 1}
              </span>
            )}
          </div>

          {/* 16:9 Next Canvas */}
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: '8px',
              backgroundColor: nextSlide?.backgroundColor || '#0a0f1d',
              backgroundImage: nextSlide?.backgroundImage
                ? `url("${nextSlide.backgroundImage}")`
                : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              color: nextSlide?.foregroundColor || '#ffffff',
              border: '1px solid #334155',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems:
                nextSlide?.textAlignment === 'center'
                  ? 'center'
                  : nextSlide?.textAlignment === 'right'
                  ? 'flex-end'
                  : 'flex-start',
              padding: '12px',
              textAlign: nextSlide?.textAlignment || 'center',
            }}
          >
            {nextSlide ? (
              <div
                className="multilingual-text"
                style={{
                  fontSize: getFontSizePx(nextSlide.fontSize),
                  fontWeight: 600,
                  maxHeight: '100%',
                  lineHeight: 1.35,
                  opacity: 0.9,
                }}
              >
                {nextSlide.body}
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                End of presentation
              </div>
            )}
          </div>
        </div>

        {/* 3. PRESENTATION NAVIGATION CONTROLS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={onPrevious}
              disabled={!isLive || currentSlideIndex <= 0}
              title="Previous slide (Left Arrow, Up Arrow, PgUp, Backspace)"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '12px 10px',
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                border: '1px solid #334155',
                color: !isLive || currentSlideIndex <= 0 ? '#475569' : '#f8fafc',
                fontWeight: 700,
                fontSize: '13px',
                transition: 'all 0.15s ease',
              }}
            >
              <ChevronLeft size={18} />
              <span>Previous</span>
            </button>

            <button
              onClick={onNext}
              disabled={!isLive || currentSlideIndex >= totalSlides - 1}
              title="Next slide (Right Arrow, Down Arrow, PgDn, Spacebar)"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '12px 10px',
                backgroundColor:
                  !isLive || currentSlideIndex >= totalSlides - 1 ? '#1e293b' : '#2563eb',
                borderRadius: '8px',
                border:
                  !isLive || currentSlideIndex >= totalSlides - 1
                    ? '1px solid #334155'
                    : '1px solid #3b82f6',
                color: !isLive || currentSlideIndex >= totalSlides - 1 ? '#475569' : '#ffffff',
                fontWeight: 700,
                fontSize: '13px',
                boxShadow:
                  !isLive || currentSlideIndex >= totalSlides - 1
                    ? 'none'
                    : '0 4px 12px rgba(37, 99, 235, 0.4)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>Next</span>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Quick Blackout Button */}
          <button
            onClick={onToggleBlackout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              backgroundColor: isBlackout ? '#dc2626' : '#1e293b',
              borderRadius: '8px',
              border: `1px solid ${isBlackout ? '#ef4444' : '#334155'}`,
              color: isBlackout ? '#ffffff' : '#f8fafc',
              fontWeight: 700,
              fontSize: '13px',
              transition: 'all 0.15s ease',
            }}
          >
            <EyeOff size={16} />
            <span>{isBlackout ? 'Restore Presentation (B)' : 'Black Screen Output (B)'}</span>
          </button>

          {/* Open / Close Audience Window */}
          <button
            onClick={onToggleAudienceWindow}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              backgroundColor: audienceStatus.isOpen ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
              borderRadius: '8px',
              border: `1px solid ${audienceStatus.isOpen ? '#059669' : '#334155'}`,
              color: audienceStatus.isOpen ? '#34d399' : '#cbd5e1',
              fontWeight: 600,
              fontSize: '12px',
              marginTop: '4px',
            }}
          >
            <Tv size={15} />
            <span>
              {audienceStatus.isOpen ? 'Close Audience Window' : 'Open Audience Window'}
            </span>
          </button>

          <AudienceAlertControl alert={presentationState.alert} />

          <PropsControl presentationState={presentationState} />

          <LooksControl presentationState={presentationState} />

          <AutoAdvanceControl presentationState={presentationState} />

          <MacroControl presentationState={presentationState} />

          {/* Quick Stage Message Cue */}
          <div
            data-testid="stage-message-control-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '10px',
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              border: presentationState.stageMessage ? '1px solid #ef4444' : '1px solid #334155',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <MessageSquare size={12} />
                Stage Cue
              </span>
              {presentationState.stageMessage && (
                <span
                  style={{
                    fontSize: '10px',
                    color: '#f87171',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  LIVE ON STAGE
                </span>
              )}
            </div>
            {presentationState.stageMessage && (
              <div
                style={{
                  fontSize: '11px',
                  color: '#fca5a5',
                  backgroundColor: '#450a0a',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  wordBreak: 'break-word',
                }}
              >
                "{presentationState.stageMessage}"
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={stageCueText}
                onChange={(e) => setStageCueText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendStageCue();
                }}
                placeholder="Wrap up in 2 mins..."
                data-testid="input-stage-cue-operator"
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  minWidth: 0,
                }}
              />
              <button
                type="button"
                onClick={handleSendStageCue}
                data-testid="btn-send-stage-cue"
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Send
              </button>
              {presentationState.stageMessage && (
                <button
                  type="button"
                  onClick={handleClearStageCue}
                  data-testid="btn-clear-stage-cue"
                  style={{
                    padding: '6px 8px',
                    backgroundColor: '#334155',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#cbd5e1',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
