import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { EdgeBlendOverlay, buildGammaGradientStops } from '../src/components/Broadcast/EdgeBlendOverlay';
import { OutputManagerModal } from '../src/components/Production/OutputManagerModal';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { validateStep, stepLabel, newStep } from '../src/services/macroSteps';

describe('Phase 11.6: Edge Blending (Multi-Projector Panoramic Displays)', () => {
  beforeEach(async () => {
    // Reset default audience output edge blend configuration
    await api.updateOutputEdgeBlend(
      'output-audience',
      false,
      'none',
      0,
      2.2,
      0.0,
      false
    );
  });

  describe('Gamma Gradient Mathematics & EdgeBlendOverlay Component', () => {
    it('generates mathematically valid gamma gradient stops', () => {
      const gradientToBlack = buildGammaGradientStops(2.2, 'to_black', 10);
      expect(gradientToBlack).toContain('rgba(0, 0, 0, 0.0000) 0.0%');
      expect(gradientToBlack).toContain('rgba(0, 0, 0, 1.0000) 100.0%');

      const gradientFromBlack = buildGammaGradientStops(2.2, 'from_black', 10);
      expect(gradientFromBlack).toContain('rgba(0, 0, 0, 1.0000) 0.0%');
      expect(gradientFromBlack).toContain('rgba(0, 0, 0, 0.0000) 100.0%');
    });

    it('renders null when disabled and test pattern is off', () => {
      const { container } = render(
        <EdgeBlendOverlay enabled={false} showTestPattern={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders right edge blend mask with overlap width', () => {
      render(
        <EdgeBlendOverlay
          enabled={true}
          edge="right"
          overlapPixels={240}
          gamma={2.2}
        />
      );

      const overlay = screen.getByTestId('edge-blend-overlay');
      expect(overlay).toBeInTheDocument();

      const rightZone = screen.getByTestId('blend-zone-right');
      expect(rightZone).toBeInTheDocument();
      expect(rightZone).toHaveStyle({ width: '240px' });
      expect(screen.queryByTestId('blend-zone-left')).toBeNull();
    });

    it('renders both horizontal blend masks when configured', () => {
      render(
        <EdgeBlendOverlay
          enabled={true}
          edge="both_horizontal"
          overlapPixels={180}
          gamma={2.4}
        />
      );

      expect(screen.getByTestId('blend-zone-left')).toHaveStyle({ width: '180px' });
      expect(screen.getByTestId('blend-zone-right')).toHaveStyle({ width: '180px' });
    });

    it('renders black level lift compensation tint', () => {
      render(
        <EdgeBlendOverlay
          enabled={true}
          edge="right"
          overlapPixels={200}
          blackLevelLift={0.03}
        />
      );

      const lift = screen.getByTestId('blend-black-lift');
      expect(lift).toBeInTheDocument();
    });

    it('renders alignment test pattern with crosshair, ramp, and boundary markers', () => {
      render(
        <EdgeBlendOverlay
          enabled={true}
          edge="right"
          overlapPixels={300}
          showTestPattern={true}
        />
      );

      expect(screen.getByTestId('edge-blend-test-pattern')).toBeInTheDocument();
      expect(screen.getByTestId('calibration-grayscale-ramp')).toBeInTheDocument();
      expect(screen.getByTestId('marker-right-overlap')).toBeInTheDocument();
      expect(screen.getByText(/EDGE BLEND ALIGNMENT TEST PATTERN/i)).toBeInTheDocument();
    });
  });

  describe('Edge Blend API & Mock Store', () => {
    it('updates output edge blend properties', async () => {
      const updated = await api.updateOutputEdgeBlend(
        'output-audience',
        true,
        'right',
        250,
        2.4,
        0.02,
        false
      );

      expect(updated.edgeBlendEnabled).toBe(true);
      expect(updated.edgeBlendEdge).toBe('right');
      expect(updated.edgeBlendOverlapPixels).toBe(250);
      expect(updated.edgeBlendGamma).toBe(2.4);
      expect(updated.edgeBlendBlackLevelLift).toBe(0.02);
      expect(updated.edgeBlendTestPattern).toBe(false);
    });

    it('toggles edge blend state on an output', async () => {
      let out = await api.toggleOutputEdgeBlend('output-audience');
      expect(out.edgeBlendEnabled).toBe(true);

      out = await api.toggleOutputEdgeBlend('output-audience');
      expect(out.edgeBlendEnabled).toBe(false);
    });

    it('toggles edge blend test pattern', async () => {
      let out = await api.toggleOutputEdgeBlendTestPattern('output-audience');
      expect(out.edgeBlendTestPattern).toBe(true);

      out = await api.toggleOutputEdgeBlendTestPattern('output-audience');
      expect(out.edgeBlendTestPattern).toBe(false);
    });
  });

  describe('Action Registry & Macro Integration', () => {
    it('dispatches edge blend actions through unified action registry', async () => {
      await api.dispatchAction('toggle_edge_blend');
      let out = await api.getOutput('output-audience');
      expect(out?.edgeBlendEnabled).toBe(true);

      await api.dispatchAction('toggle_edge_blend_test_pattern');
      out = await api.getOutput('output-audience');
      expect(out?.edgeBlendTestPattern).toBe(true);
    });

    it('validates and formats edge blend macro steps', () => {
      const step = newStep('edge_blend');
      expect(step.type).toBe('edge_blend');
      expect((step as any).command).toBe('toggle');

      expect(validateStep({ type: 'edge_blend', command: 'enable' })).toBeNull();
      expect(validateStep({ type: 'edge_blend', command: 'disable' })).toBeNull();
      expect(validateStep({ type: 'edge_blend', command: 'toggle' })).toBeNull();
      expect(validateStep({ type: 'edge_blend', command: 'test_pattern' })).toBeNull();

      expect(stepLabel({ type: 'edge_blend', command: 'enable' })).toBe('Edge Blend: Enable Overlap');
      expect(stepLabel({ type: 'edge_blend', command: 'disable' })).toBe('Edge Blend: Disable Overlap');
      expect(stepLabel({ type: 'edge_blend', command: 'toggle' })).toBe('Edge Blend: Toggle Overlap');
      expect(stepLabel({ type: 'edge_blend', command: 'test_pattern' })).toBe('Edge Blend: Toggle Test Pattern');
    });

    it('executes edge blend macro step', async () => {
      const macro = await api.createMacro({
        id: 'macro-blend-1',
        name: 'Enable Sanctuary Blend',
        steps: [{ type: 'edge_blend', command: 'enable', outputId: 'output-audience' }],
        createdAt: '',
        updatedAt: '',
      });

      await api.runMacro(macro.id);
      const out = await api.getOutput('output-audience');
      expect(out?.edgeBlendEnabled).toBe(true);
      expect(out?.edgeBlendOverlapPixels).toBe(200);
    });
  });

  describe('Macro Manager Modal UI', () => {
    it('allows adding and configuring edge blend step in macro editor', async () => {
      render(<MacroManagerModal isOpen={true} onClose={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('macro-manager')).toBeInTheDocument());

      const addBtn = screen.getByTestId('add-step-edge_blend');
      expect(addBtn).toBeInTheDocument();
      fireEvent.click(addBtn);

      await waitFor(() => {
        expect(screen.getByTestId('step-edge-blend-command')).toBeInTheDocument();
      });

      const commandSelect = screen.getByTestId('step-edge-blend-command') as HTMLSelectElement;
      fireEvent.change(commandSelect, { target: { value: 'enable' } });
      expect(commandSelect.value).toBe('enable');
    });
  });

  describe('Output Manager Modal UI', () => {
    it('edits edge blending parameters and toggles test pattern', async () => {
      render(<OutputManagerModal isOpen={true} onClose={() => {}} />);

      // Check edge blend status card on initially selected output
      await waitFor(() => {
        expect(screen.getByTestId('edge-blend-status-card')).toBeInTheDocument();
      });

      // Test pattern button
      const patternBtn = screen.getByTestId('btn-toggle-test-pattern');
      fireEvent.click(patternBtn);

      await waitFor(async () => {
        const out = await api.getOutput('output-audience');
        expect(out?.edgeBlendTestPattern).toBe(true);
      });

      // Click Edit
      fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('edge-blend-edit-section')).toBeInTheDocument();
      });

      // Toggle enable edge blend
      const enableToggle = screen.getByTestId('toggle-edge-blend-enabled') as HTMLInputElement;
      expect(enableToggle.checked).toBe(false);
      fireEvent.click(enableToggle);

      // Blend edge select
      const edgeSelect = screen.getByTestId('select-edge-blend-edge') as HTMLSelectElement;
      fireEvent.change(edgeSelect, { target: { value: 'right' } });

      // Overlap slider
      const overlapSlider = screen.getByTestId('slider-edge-blend-overlap') as HTMLInputElement;
      fireEvent.change(overlapSlider, { target: { value: '280' } });

      // Gamma slider
      const gammaSlider = screen.getByTestId('slider-edge-blend-gamma') as HTMLInputElement;
      fireEvent.change(gammaSlider, { target: { value: '2.4' } });

      // Black lift slider
      const liftSlider = screen.getByTestId('slider-edge-blend-black-lift') as HTMLInputElement;
      fireEvent.change(liftSlider, { target: { value: '0.04' } });

      // Save form
      fireEvent.click(screen.getByRole('button', { name: /Save Configuration/i }));

      await waitFor(async () => {
        const saved = await api.getOutput('output-audience');
        expect(saved?.edgeBlendEnabled).toBe(true);
        expect(saved?.edgeBlendEdge).toBe('right');
        expect(saved?.edgeBlendOverlapPixels).toBe(280);
        expect(saved?.edgeBlendGamma).toBe(2.4);
        expect(saved?.edgeBlendBlackLevelLift).toBe(0.04);
      });
    });
  });
});
