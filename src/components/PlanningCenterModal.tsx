import React, { useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle2, AlertCircle, Link2, ExternalLink, Calendar, Music, ListFilter } from 'lucide-react';
import { api } from '../services/api';
import { PlanningCenterStatus, PcoServiceType, PcoPlan, PcoPlanDetail, PcoImportResult } from '../types';

interface PlanningCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServiceImported?: (serviceId: string) => void;
}

export const PlanningCenterModal: React.FC<PlanningCenterModalProps> = ({
  isOpen,
  onClose,
  onServiceImported,
}) => {
  const [tab, setTab] = useState<'plans' | 'account'>('plans');
  const [status, setStatus] = useState<PlanningCenterStatus | null>(null);
  const [appId, setAppId] = useState('');
  const [secret, setSecret] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plans browsing
  const [serviceTypes, setServiceTypes] = useState<PcoServiceType[]>([]);
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState<string>('');
  const [plans, setPlans] = useState<PcoPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [planDetail, setPlanDetail] = useState<PcoPlanDetail | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<PcoImportResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setImportResult(null);
      void loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const s = await api.getPlanningCenterStatus();
      setStatus(s);
      if (s.isConnected) {
        setTab('plans');
        await loadServiceTypes();
      } else {
        setTab('account');
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to get Planning Center status.');
    }
  };

  const loadServiceTypes = async () => {
    try {
      const types = await api.listPlanningCenterServiceTypes();
      setServiceTypes(types);
      if (types.length > 0) {
        setSelectedServiceTypeId(types[0].id);
        await loadPlansForServiceType(types[0].id);
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to list service types.');
    }
  };

  const loadPlansForServiceType = async (stId: string) => {
    setLoadingPlans(true);
    setError(null);
    setSelectedPlanId('');
    setPlanDetail(null);
    try {
      const p = await api.listPlanningCenterPlans(stId);
      setPlans(p);
      if (p.length > 0) {
        setSelectedPlanId(p[0].id);
        await loadPlanDetails(stId, p[0].id);
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to load plans.');
    } finally {
      setLoadingPlans(false);
    }
  };

  const loadPlanDetails = async (stId: string, pId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await api.getPlanningCenterPlanDetails(stId, pId);
      setPlanDetail(detail);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to load plan details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId.trim() || !secret.trim()) {
      setError('Please provide both Application ID and Secret.');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const s = await api.savePlanningCenterCredentials(appId, secret);
      setStatus(s);
      setAppId('');
      setSecret('');
      setTab('plans');
      await loadServiceTypes();
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Could not connect to Planning Center.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Planning Center? Your saved services and local songs will not be deleted.')) return;
    try {
      await api.disconnectPlanningCenter();
      setStatus({ isConnected: false });
      setPlans([]);
      setPlanDetail(null);
      setTab('account');
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to disconnect.');
    }
  };

  const handleImport = async () => {
    if (!selectedServiceTypeId || !selectedPlanId) return;
    setImporting(true);
    setError(null);
    try {
      const result = await api.importPlanningCenterPlan(selectedServiceTypeId, selectedPlanId);
      setImportResult(result);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || 'Failed to import plan.');
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Planning Center Services"
      data-testid="planning-center-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.75)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 'min(760px, 94vw)',
          maxHeight: '88vh',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0284c7',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link2 size={20} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Planning Center Services</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1e293b',
            backgroundColor: '#1e293b',
            padding: '0 18px',
            gap: '8px',
          }}
        >
          <button
            type="button"
            data-testid="pco-tab-plans"
            disabled={!status?.isConnected}
            onClick={() => setTab('plans')}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: tab === 'plans' ? '2px solid #38bdf8' : '2px solid transparent',
              color: tab === 'plans' ? '#38bdf8' : status?.isConnected ? '#94a3b8' : '#475569',
              fontWeight: 600,
              fontSize: '13px',
              cursor: status?.isConnected ? 'pointer' : 'not-allowed',
            }}
          >
            Plans & Order of Service
          </button>
          <button
            type="button"
            data-testid="pco-tab-account"
            onClick={() => setTab('account')}
            style={{
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderBottom: tab === 'account' ? '2px solid #38bdf8' : '2px solid transparent',
              color: tab === 'account' ? '#38bdf8' : '#94a3b8',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Connection & Credentials
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            data-testid="pco-error"
            style={{
              margin: '12px 18px 0',
              padding: '10px 12px',
              backgroundColor: '#451a1a',
              border: '1px solid #b91c1c',
              borderRadius: '6px',
              color: '#fca5a5',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
          {tab === 'account' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {status?.isConnected ? (
                <div
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4ade80' }}>
                    <CheckCircle2 size={18} />
                    <strong style={{ fontSize: '14px' }}>Connected to Planning Center</strong>
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                    <strong>Organization:</strong> {status.organizationName || 'Connected Organization'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    <strong>Application ID:</strong> <code>{status.appIdMasked || '••••••••'}</code>
                  </div>
                  {status.lastSyncedAt && (
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid #334155', paddingTop: '12px', marginTop: '4px' }}>
                    <button
                      type="button"
                      data-testid="pco-disconnect-btn"
                      onClick={handleDisconnect}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#7f1d1d',
                        color: '#fecaca',
                        border: '1px solid #991b1b',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect Account
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleConnect}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 6px', fontSize: '14px', color: '#f8fafc' }}>
                      Connect Planning Center Personal Access Token
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                      Generate a Personal Access Token in your Planning Center account to import services and match songs.
                      Credentials are stored locally in SQLite and are never uploaded or included in database backups.
                    </p>
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>Application ID</span>
                    <input
                      data-testid="pco-app-id"
                      type="text"
                      required
                      placeholder="e.g. c0373df8... or test_demo"
                      value={appId}
                      onChange={(e) => setAppId(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '13px',
                      }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>Secret</span>
                    <input
                      data-testid="pco-secret"
                      type="password"
                      required
                      placeholder="e.g. 8f4b029a..."
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '13px',
                      }}
                    />
                  </label>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px' }}>
                    <a
                      href="https://api.planningcenteronline.com/oauth/applications"
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '12px',
                        color: '#38bdf8',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      Get token from Planning Center <ExternalLink size={12} />
                    </a>

                    <button
                      type="submit"
                      data-testid="pco-connect-btn"
                      disabled={connecting}
                      style={{
                        padding: '8px 18px',
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: connecting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {connecting ? 'Testing connection…' : 'Connect Account'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Select Service Type & Plan */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  backgroundColor: '#1e293b',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                    Service Type
                  </span>
                  <select
                    data-testid="pco-service-type-select"
                    value={selectedServiceTypeId}
                    onChange={(e) => {
                      setSelectedServiceTypeId(e.target.value);
                      void loadPlansForServiceType(e.target.value);
                    }}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  >
                    {serviceTypes.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                    Plan / Date
                  </span>
                  <select
                    data-testid="pco-plan-select"
                    value={selectedPlanId}
                    disabled={loadingPlans || plans.length === 0}
                    onChange={(e) => {
                      setSelectedPlanId(e.target.value);
                      void loadPlanDetails(selectedServiceTypeId, e.target.value);
                    }}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.dates} {p.title ? `- ${p.title}` : ''} {p.seriesTitle ? `(${p.seriesTitle})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Import Result Alert */}
              {importResult && (
                <div
                  data-testid="pco-import-success"
                  style={{
                    backgroundColor: '#14532d',
                    border: '1px solid #16a34a',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#4ade80' }}>
                      Service Imported Successfully!
                    </div>
                    <div style={{ fontSize: '12px', color: '#bbf7d0', marginTop: '2px' }}>
                      “{importResult.serviceTitle}” ({importResult.totalItemsCount} total items, {importResult.matchedSongsCount} songs matched to library, {importResult.placeholderSongsCount} placeholders).
                    </div>
                  </div>
                  {onServiceImported && (
                    <button
                      type="button"
                      data-testid="pco-open-service-btn"
                      onClick={() => {
                        onServiceImported(importResult.serviceId);
                        onClose();
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Open Service
                    </button>
                  )}
                </div>
              )}

              {/* Plan Items Preview */}
              <div
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ fontSize: '13px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ListFilter size={14} /> Plan Order ({planDetail?.items.length || 0} items)
                  </strong>
                  <button
                    type="button"
                    onClick={() => loadPlanDetails(selectedServiceTypeId, selectedPlanId)}
                    disabled={loadingDetail || !selectedPlanId}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#38bdf8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                    }}
                  >
                    <RefreshCw size={12} className={loadingDetail ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>

                <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {loadingDetail ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                      Loading plan items…
                    </div>
                  ) : !planDetail || planDetail.items.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                      No items found in this plan.
                    </div>
                  ) : (
                    planDetail.items.map((it) => (
                      <div
                        key={it.id}
                        data-testid="pco-item-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 10px',
                          backgroundColor: it.itemType === 'header' ? '#0f172a' : '#1e293b',
                          borderRadius: '6px',
                          fontSize: '12px',
                          border: it.itemType === 'header' ? '1px dashed #334155' : '1px solid #334155',
                        }}
                      >
                        <span style={{ fontSize: '11px', color: '#64748b', width: '20px' }}>{it.sequence}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {it.itemType === 'song' && <Music size={12} style={{ color: '#38bdf8' }} />}
                            <strong style={{ color: it.itemType === 'header' ? '#38bdf8' : '#f8fafc' }}>
                              {it.title}
                            </strong>
                            {it.itemType === 'song' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  backgroundColor: '#0369a1',
                                  color: '#e0f2fe',
                                }}
                              >
                                Song {it.ccliNumber ? `(CCLI #${it.ccliNumber})` : ''}
                              </span>
                            )}
                            {it.itemType === 'header' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  backgroundColor: '#334155',
                                  color: '#94a3b8',
                                }}
                              >
                                Header
                              </span>
                            )}
                          </div>
                          {it.description && (
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
                              {it.description}
                            </div>
                          )}
                        </div>
                        {it.length && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            {Math.floor(it.length / 60)}m {it.length % 60 ? `${it.length % 60}s` : ''}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  data-testid="pco-import-btn"
                  onClick={handleImport}
                  disabled={importing || !planDetail || planDetail.items.length === 0}
                  style={{
                    padding: '8px 18px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: importing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Calendar size={14} />
                  {importing ? 'Importing…' : 'Import as Service'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
