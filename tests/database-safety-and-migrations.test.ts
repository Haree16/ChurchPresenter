import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { WorkspaceState, AppDiagnosticFilter } from '../src/types';

describe('Phase 6.2 — Database Safety, Migrations & Workspace State', () => {
  beforeEach(async () => {
    await api.clearDiagnosticsLog();
  });

  it('verifies startup database integrity check returns ok', async () => {
    const results = await api.verifyDatabaseIntegrity();
    expect(results).toBeDefined();
    expect(results).toContain('ok');
  });

  it('persists and restores workspace state correctly', async () => {
    const initial = await api.getWorkspaceState();
    expect(initial).toBeDefined();
    expect(initial?.id).toBe('current_workspace');

    const updatedState: WorkspaceState = {
      id: 'current_workspace',
      selectedServiceId: 'srv-sunday-morning',
      selectedPresentationId: 'seed-pres-amazing-grace',
      selectedItemId: 'item-srv-02',
      selectedSlideIndex: 3,
      activeTab: 'services',
      lastSavedAt: new Date().toISOString(),
    };

    await api.saveWorkspaceState(updatedState);

    const loaded = await api.getWorkspaceState();
    expect(loaded).toBeDefined();
    expect(loaded?.selectedServiceId).toBe('srv-sunday-morning');
    expect(loaded?.selectedPresentationId).toBe('seed-pres-amazing-grace');
    expect(loaded?.selectedItemId).toBe('item-srv-02');
    expect(loaded?.selectedSlideIndex).toBe(3);
    expect(loaded?.activeTab).toBe('services');
  });

  it('records, filters, and clears diagnostic log entries', async () => {
    await api.logClientDiagnostic(
      'INFO',
      'DisplayManager',
      'Display outputs synchronized',
      JSON.stringify({ monitors: 2 })
    );
    await api.logClientDiagnostic(
      'WARN',
      'MediaEngine',
      'Video buffer below threshold',
      JSON.stringify({ bufferMs: 120 })
    );
    await api.logClientDiagnostic(
      'ERROR',
      'MidiService',
      'Hardware port disconnected unexpectedly',
      undefined
    );

    // List all
    const all = await api.getDiagnosticsLog();
    expect(all.length).toBeGreaterThanOrEqual(3);

    // Filter by ERROR level
    const errorFilter: AppDiagnosticFilter = { level: 'ERROR' };
    const errorsOnly = await api.getDiagnosticsLog(errorFilter);
    expect(errorsOnly.length).toBe(1);
    expect(errorsOnly[0].component).toBe('MidiService');
    expect(errorsOnly[0].level).toBe('ERROR');

    // Filter by component
    const mediaFilter: AppDiagnosticFilter = { component: 'MediaEngine' };
    const mediaOnly = await api.getDiagnosticsLog(mediaFilter);
    expect(mediaOnly.length).toBe(1);
    expect(mediaOnly[0].level).toBe('WARN');

    // Clear diagnostics
    const cleared = await api.clearDiagnosticsLog();
    expect(cleared).toBeGreaterThanOrEqual(3);

    const afterClear = await api.getDiagnosticsLog();
    expect(afterClear.length).toBe(0);
  });

  it('provides comprehensive application information for settings and release diagnostics', async () => {
    const info = await api.getAppInfo();
    expect(info).toBeDefined();
    expect(info.name).toBe('Church Presenter');
    expect(info.version).toBe('1.0.0');
    expect(info.databaseIntegrity).toBe(true);
    expect(info.databasePath).toContain('church_presenter.db');
    expect(info.mediaDir).toContain('media');
    expect(info.totalServices).toBeGreaterThanOrEqual(1);
    expect(info.totalSongs).toBeGreaterThanOrEqual(1);
  });

  it('exports version 6.0.0 backups and handles backward compatibility', async () => {
    const backup = await api.exportBackup();
    expect(backup.version).toBe('6.0.0');
    expect(backup.app).toBe('ChurchPresenter');
    expect(backup.presentations.length).toBeGreaterThan(0);
    expect(backup.songs?.length).toBeGreaterThan(0);
    expect(backup.services?.length).toBeGreaterThan(0);
    expect(backup.workspaceState).toBeDefined();

    // Re-import
    const result = await api.importBackup(backup, 'merge');
    expect(result).toBeDefined();
  });
});
