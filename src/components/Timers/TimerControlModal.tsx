import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  EyeOff,
} from 'lucide-react';
import { Timer, TimerState } from '../../types';
import { api } from '../../services/api';

interface TimerControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTimerState?: TimerState | null;
  onTimerStateChange?: (state: TimerState | null) => void;
}

export const TimerControlModal: React.FC<TimerControlModalProps> = ({
  isOpen,
  onClose,
  currentTimerState,
  onTimerStateChange,
}) => {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [selectedTimerId, setSelectedTimerId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTimer, setEditTimer] = useState<Partial<Timer>>({
    name: '',
    timerType: 'countdown',
    durationSeconds: 300,
    warningThresholdSeconds: 60,
  });

  const [activeTimerState, setActiveTimerState] = useState<TimerState | null>(
    currentTimerState || null
  );

  const [displayTime, setDisplayTime] = useState<string>('00:00');
  const [isWarning, setIsWarning] = useState<boolean>(false);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  const refreshTimers = async () => {
    try {
      const list = await api.listTimers();
      setTimers(list);
      if (list.length > 0 && !selectedTimerId) {
        setSelectedTimerId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load timers:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshTimers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentTimerState !== undefined) {
      setActiveTimerState(currentTimerState);
    }
  }, [currentTimerState]);

  // Drift-free real-time interval timer
  useEffect(() => {
    if (!activeTimerState) {
      setDisplayTime('00:00');
      setIsWarning(false);
      setIsExpired(false);
      return;
    }

    const calculateTimer = () => {
      let currentSeconds = activeTimerState.accumulatedSeconds || 0;
      if (activeTimerState.isRunning && activeTimerState.startTimeEpochMs) {
        const elapsedSinceStart = (Date.now() - activeTimerState.startTimeEpochMs) / 1000;
        currentSeconds += elapsedSinceStart;
      }

      if (activeTimerState.timerType === 'countdown') {
        const remaining = Math.max(0, activeTimerState.durationSeconds - currentSeconds);
        const mins = Math.floor(remaining / 60);
        const secs = Math.floor(remaining % 60);
        setDisplayTime(`${mins}:${secs.toString().padStart(2, '0')}`);

        setIsWarning(remaining <= activeTimerState.warningThresholdSeconds && remaining > 0);
        setIsExpired(remaining <= 0);
      } else {
        const mins = Math.floor(currentSeconds / 60);
        const secs = Math.floor(currentSeconds % 60);
        setDisplayTime(`${mins}:${secs.toString().padStart(2, '0')}`);

        setIsWarning(
          activeTimerState.warningThresholdSeconds > 0 &&
            currentSeconds >= activeTimerState.warningThresholdSeconds
        );
        setIsExpired(false);
      }
    };

    calculateTimer();
    const interval = setInterval(calculateTimer, 250);
    return () => clearInterval(interval);
  }, [activeTimerState]);

  const broadcastTimer = async (state: TimerState | null) => {
    setActiveTimerState(state);
    try {
      await api.setTimerState(state);
      if (onTimerStateChange) onTimerStateChange(state);
    } catch (err) {
      console.error('Failed to broadcast timer state:', err);
    }
  };

  const handleStartTimer = (timer: Timer) => {
    const newState: TimerState = {
      id: timer.id,
      name: timer.name,
      timerType: timer.timerType,
      durationSeconds: timer.durationSeconds,
      warningThresholdSeconds: timer.warningThresholdSeconds,
      isRunning: true,
      startTimeEpochMs: Date.now(),
      accumulatedSeconds: 0,
      isExpired: false,
    };
    broadcastTimer(newState);
  };

  const handleToggleRunning = () => {
    if (!activeTimerState) return;

    if (activeTimerState.isRunning) {
      // Pause: accumulate elapsed time
      const elapsed = activeTimerState.startTimeEpochMs
        ? (Date.now() - activeTimerState.startTimeEpochMs) / 1000
        : 0;
      broadcastTimer({
        ...activeTimerState,
        isRunning: false,
        startTimeEpochMs: null,
        accumulatedSeconds: activeTimerState.accumulatedSeconds + elapsed,
      });
    } else {
      // Resume
      broadcastTimer({
        ...activeTimerState,
        isRunning: true,
        startTimeEpochMs: Date.now(),
      });
    }
  };

  const handleResetTimer = () => {
    if (!activeTimerState) return;
    broadcastTimer({
      ...activeTimerState,
      isRunning: false,
      startTimeEpochMs: null,
      accumulatedSeconds: 0,
      isExpired: false,
    });
  };

  const handleStopAndClear = () => {
    broadcastTimer(null);
  };

  const handleSaveTimer = async () => {
    if (!editTimer.name?.trim()) return;

    try {
      if (editTimer.id) {
        await api.updateTimer(editTimer as Timer);
      } else {
        await api.createTimer({
          id: '',
          serviceId: null,
          name: editTimer.name.trim(),
          timerType: editTimer.timerType || 'countdown',
          durationSeconds: editTimer.durationSeconds || 300,
          warningThresholdSeconds: editTimer.warningThresholdSeconds || 60,
          createdAt: '',
          updatedAt: '',
        });
      }
      setIsEditing(false);
      await refreshTimers();
    } catch (err: any) {
      alert(err?.message || 'Failed to save timer');
    }
  };

  const handleDeleteTimer = async (id: string) => {
    if (!window.confirm('Delete this saved timer?')) return;
    try {
      await api.deleteTimer(id);
      if (activeTimerState?.id === id) {
        broadcastTimer(null);
      }
      await refreshTimers();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete timer');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="timer-control-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '740px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          backgroundColor: '#090d16',
          borderRadius: '12px',
          border: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#0f172a',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={20} style={{ color: '#38bdf8' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', fontWeight: 600 }}>
              Presentation & Stage Timers
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Live Active Timer Bar */}
        <div
          data-testid="live-timer-hero-bar"
          style={{
            padding: '20px',
            backgroundColor: isExpired ? '#450a0a' : isWarning ? '#422006' : '#070b14',
            borderBottom: '2px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>
              Active Stage Timer:
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              {activeTimerState ? activeTimerState.name : 'No Active Timer'}
            </span>
            {activeTimerState && (
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>
                Mode: {activeTimerState.timerType}
              </span>
            )}
          </div>

          <div
            data-testid="live-timer-digits"
            style={{
              fontSize: '3.2rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.05em',
              color: isExpired ? '#ef4444' : isWarning ? '#eab308' : '#38bdf8',
            }}
          >
            {displayTime}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeTimerState ? (
              <>
                <button
                  data-testid="timer-play-pause-btn"
                  onClick={handleToggleRunning}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: activeTimerState.isRunning ? '#eab308' : '#22c55e',
                    color: '#000',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {activeTimerState.isRunning ? <Pause size={16} /> : <Play size={16} />}
                  {activeTimerState.isRunning ? 'Pause' : 'Resume'}
                </button>

                <button
                  data-testid="timer-reset-btn"
                  onClick={handleResetTimer}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                  }}
                  title="Reset timer to beginning"
                >
                  <RotateCcw size={16} />
                </button>

                <button
                  data-testid="timer-clear-btn"
                  onClick={handleStopAndClear}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #7f1d1d',
                    backgroundColor: '#450a0a',
                    color: '#fca5a5',
                    cursor: 'pointer',
                  }}
                  title="Remove timer from stage"
                >
                  <EyeOff size={16} />
                </button>
              </>
            ) : (
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Select a timer below to start
              </span>
            )}
          </div>
        </div>

        {/* Timers List & Editor */}
        <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>Preset Timers</h3>
            <button
              onClick={() => {
                setEditTimer({
                  name: 'New Countdown',
                  timerType: 'countdown',
                  durationSeconds: 300,
                  warningThresholdSeconds: 60,
                });
                setIsEditing(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} /> Add Timer
            </button>
          </div>

          {/* Form for creating/editing */}
          {isEditing && (
            <div
              style={{
                backgroundColor: '#1e293b',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Timer Name
                  </label>
                  <input
                    type="text"
                    value={editTimer.name || ''}
                    onChange={(e) => setEditTimer({ ...editTimer, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ width: '150px' }}>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Type
                  </label>
                  <select
                    value={editTimer.timerType}
                    onChange={(e) =>
                      setEditTimer({ ...editTimer, timerType: e.target.value as any })
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="countdown">Countdown</option>
                    <option value="elapsed">Elapsed (Count-up)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={Math.round((editTimer.durationSeconds || 300) / 60)}
                    onChange={(e) =>
                      setEditTimer({
                        ...editTimer,
                        durationSeconds: Math.max(1, parseInt(e.target.value) || 1) * 60,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                    Warning Alert (Seconds before end)
                  </label>
                  <input
                    type="number"
                    min="5"
                    value={editTimer.warningThresholdSeconds || 60}
                    onChange={(e) =>
                      setEditTimer({
                        ...editTimer,
                        warningThresholdSeconds: parseInt(e.target.value) || 60,
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={() => setIsEditing(false)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#334155',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTimer}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#10b981',
                    color: '#000',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save Timer
                </button>
              </div>
            </div>
          )}

          {/* Timers Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {timers.map((t) => {
              const isCurrent = activeTimerState?.id === t.id;
              return (
                <div
                  key={t.id}
                  data-testid={`timer-item-${t.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: isCurrent ? '#1e293b' : '#0f172a',
                    border: isCurrent ? '2px solid #38bdf8' : '1px solid #1e293b',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Clock size={20} style={{ color: isCurrent ? '#38bdf8' : '#64748b' }} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {t.timerType === 'countdown'
                          ? `Countdown: ${Math.round(t.durationSeconds / 60)} min`
                          : 'Elapsed Timer'}{' '}
                        • Warning: {t.warningThresholdSeconds}s
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      data-testid={`start-timer-btn-${t.id}`}
                      onClick={() => handleStartTimer(t)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#0284c7',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Play size={14} /> Start Live
                    </button>

                    <button
                      onClick={() => {
                        setEditTimer(t);
                        setIsEditing(true);
                      }}
                      style={{
                        padding: '6px',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                      }}
                      title="Edit timer settings"
                    >
                      <Edit2 size={16} />
                    </button>

                    <button
                      onClick={() => handleDeleteTimer(t.id)}
                      style={{
                        padding: '6px',
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                      }}
                      title="Delete timer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
export default TimerControlModal;
