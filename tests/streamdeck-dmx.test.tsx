import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { StreamDeckDmxModal } from '../src/components/StreamDeckDmxModal';

describe('Phase 10.2: Stream Deck, DMX Lighting and Timecode Follow', () => {
  beforeEach(async () => {
    // Reset DMX config to default disabled
    await api.updateDmxConfig({
      id: 'default-dmx',
      isEnabled: false,
      targetIp: '127.0.0.1',
      targetPort: 6454,
      universe: 0,
      triggerOnSlideChange: false,
      slideCueChannel: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe('DMX & Stream Deck API Services', () => {
    it('provides DMX configuration that is disabled by default', async () => {
      const config = await api.getDmxConfig();
      expect(config.isEnabled).toBe(false);
      expect(config.targetPort).toBe(6454);
      expect(config.universe).toBe(0);
      expect(config.triggerOnSlideChange).toBe(false);
    });

    it('updates and persists DMX configuration', async () => {
      const current = await api.getDmxConfig();
      const updated = await api.updateDmxConfig({
        ...current,
        isEnabled: true,
        targetIp: '192.168.1.150',
        universe: 2,
        triggerOnSlideChange: true,
        slideCueChannel: 12,
      });

      expect(updated.isEnabled).toBe(true);
      expect(updated.targetIp).toBe('192.168.1.150');
      expect(updated.universe).toBe(2);
      expect(updated.triggerOnSlideChange).toBe(true);
      expect(updated.slideCueChannel).toBe(12);

      const reloaded = await api.getDmxConfig();
      expect(reloaded.targetIp).toBe('192.168.1.150');
      expect(reloaded.slideCueChannel).toBe(12);
    });

    it('validates channel range for test cue dispatch', async () => {
      await expect(api.sendDmxTestCue(1, 255)).resolves.toBeUndefined();
      await expect(api.sendDmxTestCue(512, 128)).resolves.toBeUndefined();
      await expect(api.sendDmxTestCue(0, 255)).rejects.toThrow('between 1 and 512');
      await expect(api.sendDmxTestCue(513, 255)).rejects.toThrow('between 1 and 512');
    });

    it('exports a 15-key Stream Deck layout and Companion guide', async () => {
      const profile = await api.getStreamDeckProfile();
      expect(profile.buttons.length).toBe(15);
      expect(profile.defaultOscPort).toBeGreaterThan(0);

      // Check critical OSC endpoints
      const paths = profile.buttons.map((b) => b.oscPath);
      expect(paths).toContain('/slide/next');
      expect(paths).toContain('/slide/prev');
      expect(paths).toContain('/blackout');
      expect(paths).toContain('/clear/all');
      expect(paths).toContain('/live');

      // Check Companion documentation string
      expect(profile.companionOscSummary).toContain('Bitfocus Companion');
      expect(profile.companionOscSummary).toContain('generic-osc');
    });
  });

  describe('StreamDeckDmxModal Component', () => {
    it('renders the 15-key interactive surface and button inspector', async () => {
      const onClose = vi.fn();
      render(<StreamDeckDmxModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Stream Deck 15-Key Interactive Profile')).toBeInTheDocument();
      });

      // Default selected button inspector
      expect(screen.getByText('Button Inspector')).toBeInTheDocument();
      expect(screen.getByText('/slide/prev')).toBeInTheDocument();

      // Click "NEXT SLIDE" button
      const nextBtn = screen.getByText('NEXT SLIDE');
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText('/slide/next')).toBeInTheDocument();
        expect(screen.getByText('next_slide')).toBeInTheDocument();
      });
    });

    it('switches to DMX tab, updates settings and sends test cues', async () => {
      const onClose = vi.fn();
      render(<StreamDeckDmxModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('DMX Lighting (Art-Net)')).toBeInTheDocument();
      });

      // Switch tab
      fireEvent.click(screen.getByText('DMX Lighting (Art-Net)'));

      await waitFor(() => {
        expect(screen.getByText('Art-Net DMX512 Output')).toBeInTheDocument();
        expect(screen.getByText('Live Fixture Test (Art-Net Cue Dispatch)')).toBeInTheDocument();
      });

      // Change IP address
      const ipInput = screen.getByPlaceholderText('127.0.0.1 or 255.255.255.255');
      fireEvent.change(ipInput, { target: { value: '192.168.1.200' } });

      // Save settings
      const saveBtn = screen.getByText('Save DMX Configuration');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Saved Successfully')).toBeInTheDocument();
      });

      // Test cue buttons
      const flashBtn = screen.getByText('Full Flash (255)');
      fireEvent.click(flashBtn);

      await waitFor(() => {
        expect(screen.getByText(/Art-Net packet sent/)).toBeInTheDocument();
      });

      const blackoutBtn = screen.getByText('Blackout (0)');
      fireEvent.click(blackoutBtn);

      await waitFor(() => {
        expect(screen.getByText(/Channel 1 = 0/)).toBeInTheDocument();
      });
    });

    it('switches to Timecode tab and shows DAW synchronization guidance', async () => {
      const onClose = vi.fn();
      render(<StreamDeckDmxModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Timecode Follow & MTC')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Timecode Follow & MTC'));

      await waitFor(() => {
        expect(screen.getByText('Timecode Follow (MTC / OSC SMPTE)')).toBeInTheDocument();
        expect(screen.getByText('MIDI Time Code (MTC)')).toBeInTheDocument();
        expect(screen.getByText('OSC SMPTE Timecode')).toBeInTheDocument();
      });
    });

    it('closes on Close button and top X button', async () => {
      const onClose = vi.fn();
      render(<StreamDeckDmxModal isOpen={true} onClose={onClose} />);

      await waitFor(() => {
        expect(screen.getByText('Close')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(2);
    });
  });
});
