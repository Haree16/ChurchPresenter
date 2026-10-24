import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { BackupData } from '../src/types';

describe('Data Protection: Backup & Restore', () => {
  it('exports a valid, verified backup structure', async () => {
    const backup = await api.exportBackup();
    expect(backup.version).toBe('6.0.0');
    expect(backup.app).toBe('ChurchPresenter');
    expect(backup.exportedAt).toBeDefined();
    expect(Array.isArray(backup.presentations)).toBe(true);
    expect(Array.isArray(backup.slides)).toBe(true);
    expect(Array.isArray(backup.songs)).toBe(true);
    expect(Array.isArray(backup.themes)).toBe(true);
    expect(Array.isArray(backup.services)).toBe(true);
    expect(Array.isArray(backup.serviceItems)).toBe(true);
    expect(backup.presentations.length).toBeGreaterThan(0);
    expect(backup.slides.length).toBeGreaterThan(0);
    expect(backup.songs?.length).toBeGreaterThan(0);
    expect(backup.services?.length).toBeGreaterThan(0);
  });

  it('restores backup data in merge mode', async () => {
    const customBackup: BackupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: 'ChurchPresenter',
      presentations: [
        {
          id: 'imported-pres-1',
          title: 'Special Guest Service',
          category: 'Sermon',
          themeName: 'Default Dark',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      slides: [
        {
          id: 'imported-slide-1',
          presentationId: 'imported-pres-1',
          sortOrder: 0,
          title: 'Intro Scripture',
          body: 'Romans 8:28 - And we know that all things work together for good.',
          backgroundColor: '#0a0f1d',
          foregroundColor: '#ffffff',
          fontSize: 'large',
          textAlignment: 'center',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      settings: {},
    };

    const result = await api.importBackup(customBackup, 'merge');
    expect(result.presentationsImported).toBe(1);
    expect(result.slidesImported).toBe(1);

    const pres = await api.getPresentation('imported-pres-1');
    expect(pres).not.toBeNull();
    expect(pres?.title).toBe('Special Guest Service');

    const slides = await api.getSlides('imported-pres-1');
    expect(slides.length).toBe(1);
    expect(slides[0].body).toContain('Romans 8:28');
  });

  it('rejects corrupted or incomplete backup files with actionable errors', async () => {
    // Missing presentations
    const invalidBackup1 = {
      version: '1.0.0',
      slides: [],
    } as unknown as BackupData;

    await expect(api.importBackup(invalidBackup1, 'merge')).rejects.toThrow(
      'Invalid backup file format'
    );

    // Missing version
    const invalidBackup2 = {
      presentations: [],
      slides: [],
    } as unknown as BackupData;

    await expect(api.importBackup(invalidBackup2, 'merge')).rejects.toThrow(
      'Invalid backup file format'
    );
  });
});
