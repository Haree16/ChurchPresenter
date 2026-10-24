import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';
import { OutputConfig } from '../src/types';

describe('Phase 5: Independent Outputs & Multi-Window Management', () => {
  let createdOutput: OutputConfig;

  it('lists pre-seeded output configurations', async () => {
    const outputs = await api.listOutputs();
    expect(outputs.length).toBeGreaterThanOrEqual(3);

    const audienceOut = outputs.find((o) => o.outputType === 'audience');
    const stageOut = outputs.find((o) => o.outputType === 'stage');
    const overlayOut = outputs.find((o) => o.outputType === 'overlay');

    expect(audienceOut).toBeDefined();
    expect(stageOut).toBeDefined();
    expect(overlayOut).toBeDefined();
    expect(audienceOut?.aspectRatio).toBe('16:9');
    expect(stageOut?.contentSource).toBe('stage_layout');
  });

  it('creates an independent presentation output with custom settings', async () => {
    createdOutput = await api.createOutput({
      id: '',
      name: 'Cry Room & Overflow TV',
      outputType: 'presentation',
      targetMonitorId: 'monitor-2',
      resolutionWidth: 1920,
      resolutionHeight: 1080,
      aspectRatio: '16:9',
      safeMarginPercent: 8.0,
      contentSource: 'live_slide',
      themeId: 'theme-default-dark',
      isEnabled: true,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    });

    expect(createdOutput.id).toBeDefined();
    expect(createdOutput.name).toBe('Cry Room & Overflow TV');
    expect(createdOutput.safeMarginPercent).toBe(8.0);
    expect(createdOutput.themeId).toBe('theme-default-dark');
  });

  it('retrieves an output configuration by ID', async () => {
    const fetched = await api.getOutput(createdOutput.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(createdOutput.id);
    expect(fetched?.name).toBe('Cry Room & Overflow TV');
    expect(fetched?.resolutionWidth).toBe(1920);
  });

  it('updates an output configuration and independent theme override', async () => {
    createdOutput = await api.updateOutput({
      ...createdOutput,
      name: 'Cry Room 4K Feed',
      resolutionWidth: 3840,
      resolutionHeight: 2160,
      safeMarginPercent: 4.0,
      themeId: 'theme-tamil-classical',
    });

    expect(createdOutput.name).toBe('Cry Room 4K Feed');
    expect(createdOutput.resolutionWidth).toBe(3840);
    expect(createdOutput.safeMarginPercent).toBe(4.0);
    expect(createdOutput.themeId).toBe('theme-tamil-classical');

    const verified = await api.getOutput(createdOutput.id);
    expect(verified?.themeId).toBe('theme-tamil-classical');
  });

  it('detects available display monitors', async () => {
    const monitors = await api.getAvailableMonitors();
    expect(monitors.length).toBeGreaterThanOrEqual(1);
    expect(monitors[0].id).toBeDefined();
    expect(monitors[0].width).toBeGreaterThan(0);
    expect(monitors[0].height).toBeGreaterThan(0);
  });

  it('reports system diagnostics across all output windows', async () => {
    const diagnostics = await api.getSystemDiagnostics();
    expect(diagnostics).toBeDefined();
    expect(diagnostics.outputs.length).toBeGreaterThanOrEqual(3);
    expect(typeof diagnostics.audienceWindowOpen).toBe('boolean');
    expect(typeof diagnostics.stageWindowOpen).toBe('boolean');
    expect(typeof diagnostics.overlayWindowOpen).toBe('boolean');
    expect(diagnostics.remoteServer).toBeDefined();
  });

  it('deletes an output configuration', async () => {
    await api.deleteOutput(createdOutput.id);
    const fetched = await api.getOutput(createdOutput.id);
    expect(fetched).toBeNull();
  });
});
