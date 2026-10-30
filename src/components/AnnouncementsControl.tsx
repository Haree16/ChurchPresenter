import React, { useCallback, useEffect, useState } from 'react';
import { Volume2, Play, ChevronLeft, ChevronRight, X, Repeat, Clock, Tv } from 'lucide-react';
import { api } from '../services/api';
import { OutputConfig, Presentation, PresentationState } from '../types';

interface AnnouncementsControlProps {
  presentationState: PresentationState;
}

export const AnnouncementsControl: React.FC<AnnouncementsControlProps> = ({ presentationState }) => {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [outputs, setOutputs] = useState<OutputConfig[]>([]);
  const [selectedPresId, setSelectedPresId] = useState<string>('');
  const [selectedOutputIds, setSelectedOutputIds] = useState<string[]>([]);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(8);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const ann = presentationState.announcements;

  const refreshData = useCallback(async () => {
    try {
      const [presList, outList] = await Promise.all([
        api.listPresentations(),
        api.listOutputs().catch(() => []),
      ]);
      setPresentations(presList);
      setOutputs(outList);
      if (!selectedPresId && presList.length > 0) {
        setSelectedPresId(presList[0].id);
      }
      if (selectedOutputIds.length === 0 && outList.length > 0) {
        // default select stage or first non-audience output if available, else all
        const foyerOrStage = outList.filter((o) => o.outputType !== 'audience').map((o) => o.id);
        setSelectedOutputIds(foyerOrStage.length > 0 ? foyerOrStage : [outList[0].id]);
      }
    } catch {
      // ignore
    }
  }, [selectedPresId, selectedOutputIds.length]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleStart = async () => {
    if (!selectedPresId) return;
    setError(null);
    try {
      await api.setAnnouncementsPresentation(
        selectedPresId,
        selectedOutputIds,
        intervalSeconds,
        isLooping
      );
    } catch (e) {
      setError((e as Error)?.message || 'Failed to start announcements.');
    }
  };

  const handleNext = async () => {
    setError(null);
    try {
      await api.nextAnnouncementsSlide();
    } catch (e) {
      setError((e as Error)?.message || 'Failed to advance slide.');
    }
  };

  const handlePrevious = async () => {
    setError(null);
    try {
      await api.previousAnnouncementsSlide();
    } catch (e) {
      setError((e as Error)?.message || 'Failed to go to previous slide.');
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await api.clearAnnouncements();
    } catch (e) {
      setError((e as Error)?.message || 'Failed to clear announcements.');
    }
  };

  const toggleOutput = (outId: string) => {
    if (selectedOutputIds.includes(outId)) {
      setSelectedOutputIds(selectedOutputIds.filter((id) => id !== outId));
    } else {
      setSelectedOutputIds([...selectedOutputIds, outId]);
    }
  };

  return (
    <div
      data-testid="announcements-control"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px',
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        marginTop: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <Volume2 size={13} color="#38bdf8" />
          Announcements Layer
        </span>
        {ann?.isLive && (
          <span
            data-testid="announcements-live-badge"
            style={{
              fontSize: '10px',
              fontWeight: 700,
              backgroundColor: '#0284c7',
              color: '#ffffff',
              padding: '2px 6px',
              borderRadius: '4px',
              letterSpacing: '0.5px',
            }}
          >
            ACTIVE LOOP
          </span>
        )}
      </div>

      {/* Live Slot View if Active */}
      {ann?.isLive && ann.currentSlide ? (
        <div
          data-testid="announcements-live-slot"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            padding: '8px',
            backgroundColor: '#0f172a',
            borderRadius: '6px',
            border: '1px solid #0284c7',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
              Slide {ann.slideIndex + 1} of {ann.totalSlides}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                data-testid="announcements-prev"
                onClick={handlePrevious}
                title="Previous announcements slide"
                style={{
                  padding: '3px 6px',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                data-testid="announcements-next"
                onClick={handleNext}
                title="Next announcements slide"
                style={{
                  padding: '3px 6px',
                  backgroundColor: '#1e293b',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                data-testid="announcements-clear"
                onClick={handleClear}
                title="Clear announcements layer"
                style={{
                  padding: '3px 6px',
                  backgroundColor: '#7f1d1d',
                  color: '#fca5a5',
                  border: '1px solid #991b1b',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div
            style={{
              padding: '6px',
              backgroundColor: '#1e293b',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#cbd5e1',
              maxHeight: '40px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ann.currentSlide.body || ann.currentSlide.title || '(Blank slide)'}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#64748b' }}>
            <span>
              {ann.autoAdvanceSeconds ? `Looping every ${ann.autoAdvanceSeconds}s` : 'Manual loop'}
            </span>
            <span>
              {ann.targetOutputIds && ann.targetOutputIds.length > 0
                ? `${ann.targetOutputIds.length} output(s)`
                : 'All outputs'}
            </span>
          </div>
        </div>
      ) : (
        /* Configuration & Start Panel */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              data-testid="announcements-select-presentation"
              value={selectedPresId}
              onChange={(e) => setSelectedPresId(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '4px 6px',
                fontSize: '11px',
              }}
            >
              {presentations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="announcements-start-btn"
              disabled={!selectedPresId}
              onClick={handleStart}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: selectedPresId ? 'pointer' : 'default',
              }}
            >
              <Play size={11} />
              Start Loop
            </button>
          </div>

          {/* Options: Auto-Advance Interval & Loop */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#cbd5e1' }}>
              <Clock size={11} color="#94a3b8" />
              <span>Interval:</span>
              <input
                type="number"
                data-testid="announcements-interval-input"
                min={1}
                max={300}
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: '42px',
                  backgroundColor: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '11px',
                  textAlign: 'center',
                }}
              />
              <span>sec</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer' }}>
              <input
                type="checkbox"
                data-testid="announcements-loop-checkbox"
                checked={isLooping}
                onChange={(e) => setIsLooping(e.target.checked)}
              />
              <Repeat size={11} />
              Loop at end
            </label>
          </div>

          {/* Target Outputs Checkboxes */}
          {outputs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Tv size={10} />
                Target Outputs:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {outputs.map((out) => {
                  const checked = selectedOutputIds.includes(out.id);
                  return (
                    <button
                      key={out.id}
                      type="button"
                      data-testid={`announcements-output-${out.id}`}
                      onClick={() => toggleOutput(out.id)}
                      style={{
                        padding: '2px 6px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        border: `1px solid ${checked ? '#38bdf8' : '#334155'}`,
                        backgroundColor: checked ? '#0369a1' : '#0f172a',
                        color: checked ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer',
                      }}
                    >
                      {out.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div role="alert" data-testid="announcements-error" style={{ fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </div>
      )}
    </div>
  );
};
