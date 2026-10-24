import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';

describe('Phase 2: Presentation Themes & Built-in Protection', () => {
  it('loads built-in themes including Tamil Classical and Modern Scripture', async () => {
    const themes = await api.listThemes();
    expect(themes.length).toBeGreaterThanOrEqual(4);

    const builtIns = themes.filter((t) => t.isBuiltIn);
    expect(builtIns.length).toBeGreaterThanOrEqual(4);

    const tamilClassical = themes.find((t) => t.id === 'theme-tamil-classical');
    expect(tamilClassical).toBeDefined();
    expect(tamilClassical?.isBuiltIn).toBe(true);
    expect(tamilClassical?.fontFamily).toContain('Noto Sans Tamil');

    const defaultDark = themes.find((t) => t.id === 'theme-default-dark');
    expect(defaultDark).toBeDefined();
    expect(defaultDark?.isBuiltIn).toBe(true);
  });

  it('strictly protects built-in themes from deletion', async () => {
    await expect(api.deleteTheme('theme-default-dark')).rejects.toThrow(
      /Cannot delete built-in theme/i
    );
    await expect(api.deleteTheme('theme-tamil-classical')).rejects.toThrow(
      /Cannot delete built-in theme/i
    );
  });

  it('creates, updates, and deletes custom presentation themes', async () => {
    const newTheme = await api.createTheme({
      name: 'Youth Service Neon',
      backgroundColor: '#050510',
      textColor: '#38bdf8',
      fontSize: 'xlarge',
      textAlignment: 'center',
      verticalAlignment: 'center',
      lineSpacing: 1.5,
      textMargin: 32,
      textShadow: '0 0 12px rgba(56, 189, 248, 0.6)',
      overlayColor: 'rgba(0, 0, 0, 0.3)',
    });

    expect(newTheme.id).toBeDefined();
    expect(newTheme.isBuiltIn).toBe(false);
    expect(newTheme.name).toBe('Youth Service Neon');

    // Update
    const updated = await api.updateTheme({
      ...newTheme,
      textColor: '#a855f7',
    });
    expect(updated.textColor).toBe('#a855f7');

    // Duplicate
    const duplicated = await api.duplicateTheme(newTheme.id);
    expect(duplicated.name).toContain('(Copy)');
    expect(duplicated.isBuiltIn).toBe(false);

    // Delete custom theme
    await api.deleteTheme(newTheme.id);
    const lookup = await api.getTheme(newTheme.id);
    expect(lookup).toBeNull();

    // Clean up duplicate
    await api.deleteTheme(duplicated.id);
  });
});
