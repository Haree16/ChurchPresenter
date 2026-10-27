import React, { useState, useCallback } from 'react';
import {
  Plus,
  Edit3,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Radio,
} from 'lucide-react';
import { Slide, Presentation, PresentationState } from '../types';
import { readableTextColor } from '../services/sectionColors';
import { composeTextShadow, layoutPaddingPercent } from '../services/slideLayout';

interface SlideCardProps {
  slide: Slide;
  index: number;
  totalSlides: number;
  isLive: boolean;
  isNext: boolean;
  isConfirmingDelete: boolean;
  onGoLive: (slideId: string) => void;
  onEditSlide: (slide: Slide) => void;
  onDuplicateSlide: (slideId: string) => void;
  onRequestDelete: (slideId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (slideId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

export const SlideCard = React.memo<SlideCardProps>(({
  slide,
  index,
  totalSlides,
  isLive,
  isNext,
  isConfirmingDelete,
  onGoLive,
  onEditSlide,
  onDuplicateSlide,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onMoveUp,
  onMoveDown,
}) => {
  return (
    <div
      onClick={() => onGoLive(slide.id)}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '8px',
        backgroundColor: '#0f172a',
        border: isLive
          ? '2px solid #ef4444'
          : isNext
          ? '2px solid #3b82f6'
          : '1px solid #334155',
        boxShadow: isLive
          ? '0 0 16px rgba(239, 68, 68, 0.4)'
          : isNext
          ? '0 0 10px rgba(59, 130, 246, 0.25)'
          : 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Status Badges Overlay */}
      {isLive && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            left: '6px',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            backgroundColor: '#dc2626',
            color: '#ffffff',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.05em',
          }}
        >
          <Radio size={11} />
          LIVE
        </div>
      )}
      {!isLive && isNext && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            left: '6px',
            zIndex: 2,
            padding: '2px 8px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 700,
          }}
        >
          NEXT
        </div>
      )}

      {/* 16:9 Slide Preview Thumbnail */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          backgroundColor: slide.backgroundColor || '#0a0f1d',
          color: slide.foregroundColor || '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems:
            slide.textAlignment === 'center'
              ? 'center'
              : slide.textAlignment === 'right'
              ? 'flex-end'
              : 'flex-start',
          justifyContent: 'center',
          padding: layoutPaddingPercent(slide.layout) ?? '12px',
          textAlign: slide.textAlignment,
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div
          className="multilingual-text"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            lineHeight: 1.35,
            maxHeight: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            textShadow: composeTextShadow(slide.layout, null),
          }}
        >
          {slide.body || (
            <span style={{ color: '#64748b', fontStyle: 'italic' }}>[Empty Slide]</span>
          )}
        </div>
      </div>

      {/* Song group tag (Verse 1, Chorus, ...) */}
      {slide.groupLabel && slide.groupColor && (
        <div
          data-testid="slide-group-tag"
          title={slide.groupLabel}
          style={{
            padding: '2px 10px',
            backgroundColor: slide.groupColor,
            color: readableTextColor(slide.groupColor),
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {slide.groupLabel}
        </div>
      )}

      {/* Card Footer: Slide Index, Title, and Action Buttons */}
      <div
        style={{
          padding: '8px 10px',
          backgroundColor: '#1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: isLive ? '#f87171' : isNext ? '#60a5fa' : '#94a3b8',
            }}
          >
            #{index + 1}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#f8fafc',
              maxWidth: '110px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slide.title || `Slide ${index + 1}`}
          </span>
        </div>

        {/* Slide Action Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            title="Move slide up"
            style={{
              padding: '3px',
              color: index === 0 ? '#475569' : '#cbd5e1',
            }}
          >
            <ArrowUp size={13} />
          </button>
          <button
            onClick={() => onMoveDown(index)}
            disabled={index === totalSlides - 1}
            title="Move slide down"
            style={{
              padding: '3px',
              color: index === totalSlides - 1 ? '#475569' : '#cbd5e1',
            }}
          >
            <ArrowDown size={13} />
          </button>
          <button
            onClick={() => onEditSlide(slide)}
            title="Edit slide text & style"
            style={{ padding: '3px', color: '#cbd5e1' }}
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={() => onDuplicateSlide(slide.id)}
            title="Duplicate slide"
            style={{ padding: '3px', color: '#cbd5e1' }}
          >
            <Copy size={13} />
          </button>
          <button
            onClick={() => onRequestDelete(slide.id)}
            title="Delete slide"
            style={{ padding: '3px', color: '#f87171' }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Destructive Delete Confirmation Overlay */}
      {isConfirmingDelete && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '8px 10px',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderTop: '1px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
          }}
        >
          <span style={{ color: '#fca5a5', fontWeight: 600 }}>Delete slide?</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={onCancelDelete}
              style={{
                padding: '2px 6px',
                backgroundColor: '#334155',
                borderRadius: '3px',
                color: '#ffffff',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirmDelete(slide.id)}
              style={{
                padding: '2px 6px',
                backgroundColor: '#dc2626',
                borderRadius: '3px',
                color: '#ffffff',
                fontWeight: 600,
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

SlideCard.displayName = 'SlideCard';

interface SlideGridProps {
  presentation: Presentation | null;
  slides: Slide[];
  presentationState: PresentationState;
  onGoLive: (slideId: string) => void;
  onEditSlide: (slide: Slide) => void;
  onAddSlide: () => void;
  onDuplicateSlide: (slideId: string) => void;
  onDeleteSlide: (slideId: string) => void;
  onReorderSlides: (slideIds: string[]) => void;
}

export const SlideGrid: React.FC<SlideGridProps> = ({
  presentation,
  slides,
  presentationState,
  onGoLive,
  onEditSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onReorderSlides,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const newIds = slides.map((s) => s.id);
      const temp = newIds[index];
      newIds[index] = newIds[index - 1];
      newIds[index - 1] = temp;
      onReorderSlides(newIds);
    },
    [slides, onReorderSlides]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= slides.length - 1) return;
      const newIds = slides.map((s) => s.id);
      const temp = newIds[index];
      newIds[index] = newIds[index + 1];
      newIds[index + 1] = temp;
      onReorderSlides(newIds);
    },
    [slides, onReorderSlides]
  );

  const handleRequestDelete = useCallback((slideId: string) => {
    setDeleteConfirmId(slideId);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmId(null);
  }, []);

  const handleConfirmDelete = useCallback(
    (slideId: string) => {
      onDeleteSlide(slideId);
      setDeleteConfirmId(null);
    },
    [onDeleteSlide]
  );

  if (!presentation) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#0a0f1d',
          color: '#64748b',
          gap: '12px',
        }}
      >
        <Layers size={40} strokeWidth={1.5} />
        <div style={{ fontSize: '15px', fontWeight: 500 }}>No presentation selected</div>
        <div style={{ fontSize: '12px' }}>Choose a presentation from the library to view slides</div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0a0f1d',
        overflow: 'hidden',
      }}
    >
      {/* Presentation Header Bar */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#090d16',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            {presentation.title}
          </h2>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
            Category: <strong style={{ color: '#60a5fa' }}>{presentation.category}</strong> •{' '}
            {slides.length} slide{slides.length === 1 ? '' : 's'}
          </div>
        </div>

        <button
          onClick={onAddSlide}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: '#2563eb',
            borderRadius: '6px',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          <Plus size={15} />
          <span>Add Slide</span>
        </button>
      </div>

      {/* Slides Grid View */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
          alignContent: 'start',
        }}
      >
        {slides.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '48px 16px',
              textAlign: 'center',
              color: '#64748b',
              backgroundColor: '#0f172a',
              borderRadius: '8px',
              border: '1px dashed #334155',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8', marginBottom: '8px' }}>
              No slides in this presentation yet
            </div>
            <button
              onClick={onAddSlide}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#2563eb',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Plus size={14} />
              <span>Create First Slide</span>
            </button>
          </div>
        ) : (
          slides.map((slide, index) => {
            const isLive =
              presentationState.isLive &&
              presentationState.currentPresentationId === presentation.id &&
              presentationState.currentSlideId === slide.id;

            const isNext =
              presentationState.isLive &&
              presentationState.nextSlide?.id === slide.id;

            const isConfirmingDelete = deleteConfirmId === slide.id;

            return (
              <SlideCard
                key={slide.id}
                slide={slide}
                index={index}
                totalSlides={slides.length}
                isLive={isLive}
                isNext={isNext}
                isConfirmingDelete={isConfirmingDelete}
                onGoLive={onGoLive}
                onEditSlide={onEditSlide}
                onDuplicateSlide={onDuplicateSlide}
                onRequestDelete={handleRequestDelete}
                onCancelDelete={handleCancelDelete}
                onConfirmDelete={handleConfirmDelete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
