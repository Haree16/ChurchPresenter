import React, { useEffect, useState } from 'react';
import { AudienceAlert } from '../types';

export const MAX_ALERT_CHARS = 200;

export function isAlertActive(alert: AudienceAlert | null | undefined, nowMs: number): boolean {
  return !!alert && (alert.expiresAtMs == null || nowMs < alert.expiresAtMs);
}

/** The alert while it is active; becomes null by itself when it expires. */
export function useActiveAlert(alert: AudienceAlert | null | undefined): AudienceAlert | null {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!alert || alert.expiresAtMs == null) return;
    const remaining = alert.expiresAtMs - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining + 20);
    return () => clearTimeout(timer);
  }, [alert?.id, alert?.expiresAtMs]);

  return alert && isAlertActive(alert, now) ? alert : null;
}

interface AlertBannerProps {
  alert: AudienceAlert | null | undefined;
}

/** Banner over the audience output, e.g. a nursery call. Shown above slides, logo and blackout. */
export const AlertBanner: React.FC<AlertBannerProps> = ({ alert }) => {
  const active = useActiveAlert(alert);
  if (!active) return null;
  return (
    <div
      role="alert"
      data-testid="audience-alert"
      className="multilingual-text"
      style={{
        position: 'fixed',
        left: '5vw',
        right: '5vw',
        bottom: '6vh',
        zIndex: 1000,
        padding: '2.2vh 3vw',
        borderRadius: '1.5vh',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        border: '0.5vh solid #f59e0b',
        color: '#ffffff',
        fontSize: '5vh',
        fontWeight: 800,
        lineHeight: 1.25,
        textAlign: 'center',
        boxShadow: '0 1vh 4vh rgba(0,0,0,0.6)',
        wordBreak: 'break-word',
        pointerEvents: 'none',
      }}
    >
      {active.message}
    </div>
  );
};
