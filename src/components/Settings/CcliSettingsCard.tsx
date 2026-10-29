import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { validateLicenceNumber } from '../../services/ccliReport';

/** Settings card for the church's CCLI licence number, which goes at the top of the CCLI report. */
export const CcliSettingsCard: React.FC = () => {
  const [saved, setSaved] = useState<string>('');
  const [value, setValue] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCcliLicenceNumber()
      .then((n) => {
        setSaved(n ?? '');
        setValue(n ?? '');
      })
      .catch(() => {
        // not available in a plain browser
      });
  }, []);

  const problem = validateLicenceNumber(value);
  const changed = value.replace(/\s/g, '') !== saved;

  const save = async () => {
    setMessage(null);
    setError(null);
    try {
      const stored = await api.setCcliLicenceNumber(value);
      setSaved(stored ?? '');
      setValue(stored ?? '');
      setMessage(stored ? 'Licence number saved.' : 'Licence number removed.');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not save the licence number.');
    }
  };

  return (
    <div
      data-testid="ccli-settings-card"
      style={{ padding: '16px', backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <div>
        <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>CCLI licence number</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
          Printed at the top of the CCLI report. Songs get their own CCLI song number in the song's info.
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          data-testid="ccli-licence-input"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 1234567"
          value={value}
          maxLength={20}
          onChange={(e) => setValue(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f8fafc', fontSize: '13px', width: '180px' }}
        />
        <button
          type="button"
          data-testid="ccli-licence-save"
          disabled={!changed || !!problem}
          onClick={save}
          style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: '#0f172a', color: !changed || problem ? '#64748b' : '#f8fafc', fontSize: '12px', fontWeight: 600, cursor: !changed || problem ? 'default' : 'pointer' }}
        >
          Save
        </button>
      </div>
      {(problem || error) && value && (
        <div role="alert" data-testid="ccli-licence-error" style={{ fontSize: '12px', color: '#fca5a5' }}>
          {error || problem}
        </div>
      )}
      {message && !problem && (
        <div data-testid="ccli-licence-message" style={{ fontSize: '12px', color: '#6ee7b7' }}>
          {message}
        </div>
      )}
    </div>
  );
};
