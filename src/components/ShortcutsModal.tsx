import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutList = [
    {
      action: 'Next Slide',
      keys: ['Right Arrow', 'Down Arrow', 'Page Down', 'Spacebar'],
      description: 'Advance live presentation to the next slide in sequence.',
    },
    {
      action: 'Previous Slide',
      keys: ['Left Arrow', 'Up Arrow', 'Page Up', 'Backspace'],
      description: 'Return live presentation to the preceding slide.',
    },
    {
      action: 'Black Screen (Toggle)',
      keys: ['B'],
      description: 'Instant blackout: hides slide content on audience screen without changing the active slide.',
    },
    {
      action: 'Clear to Logo (Toggle)',
      keys: ['L'],
      description: 'Shows the church logo on the audience screen; going live with any slide clears it.',
    },
    {
      action: 'Clear Media',
      keys: ['M'],
      description: 'Stops media on the audience screen; the slide stays as it is.',
    },
    {
      action: 'Clear All',
      keys: ['C'],
      description: 'Blanks the output: clears the slide, media, logo and blackout. The selected slide is kept so you can go live again.',
    },
    {
      action: 'Direct Slide Jump',
      keys: ['Click on any slide card'],
      description: 'Immediately presents the clicked slide to the audience.',
    },
    {
      action: 'Safe Typing Protection',
      keys: ['Auto'],
      description: 'Keyboard shortcuts are automatically suppressed whenever you are typing in slide edit fields.',
    },
    {
      action: 'Dismiss Dialog / Modal',
      keys: ['Escape'],
      description: 'Closes any active modal or dialog window.',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#0f172a',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#090d16',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={18} color="#3b82f6" />
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc' }}>
              Keyboard Shortcuts Guide
            </span>
          </div>
          <button onClick={onClose} style={{ color: '#94a3b8', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {shortcutList.map((item) => (
            <div
              key={item.action}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>
                  {item.action}
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {item.keys.map((k) => (
                    <span
                      key={k}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #475569',
                        color: '#93c5fd',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                {item.description}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#090d16',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
