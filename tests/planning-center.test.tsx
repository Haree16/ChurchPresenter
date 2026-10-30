import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { PlanningCenterModal } from '../src/components/PlanningCenterModal';

describe('Phase 10.1: Planning Center Services Integration', () => {
  it('handles connection lifecycle: connect, masked credentials, and disconnect', async () => {
    await api.disconnectPlanningCenter();

    // 1. Initially disconnected
    const initial = await api.getPlanningCenterStatus();
    expect(initial.isConnected).toBe(false);

    // 2. Rejects empty credentials
    await expect(api.savePlanningCenterCredentials('', '')).rejects.toThrow(/required/);

    // 3. Connects with test credentials
    const connected = await api.savePlanningCenterCredentials('test_app_id_9999', 'secret_key');
    expect(connected.isConnected).toBe(true);
    expect(connected.organizationName).toBe('Grace Community Church');
    expect(connected.appIdMasked).toContain('••••');

    // 4. Disconnects cleanly
    await api.disconnectPlanningCenter();
    const after = await api.getPlanningCenterStatus();
    expect(after.isConnected).toBe(false);
  });

  it('lists service types, plans, and detailed items', async () => {
    await api.savePlanningCenterCredentials('test_demo', 'secret');

    // Service types
    const types = await api.listPlanningCenterServiceTypes();
    expect(types.length).toBeGreaterThan(0);
    expect(types[0].name).toBe('Sunday Morning Service');

    // Plans for service type
    const plans = await api.listPlanningCenterPlans(types[0].id);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0].title).toBe('Sunday Worship');
    expect(plans[0].dates).toContain('Nov 1');

    // Plan items breakdown
    const details = await api.getPlanningCenterPlanDetails(types[0].id, plans[0].id);
    expect(details.plan.id).toBe(plans[0].id);
    expect(details.items.length).toBe(4);

    const songItem = details.items.find((i) => i.itemType === 'song');
    expect(songItem).toBeTruthy();
    expect(songItem?.title).toBe('Way Maker');
    expect(songItem?.ccliNumber).toBe('7115744');

    const headerItem = details.items.find((i) => i.itemType === 'header');
    expect(headerItem).toBeTruthy();
    expect(headerItem?.title).toBe('Praise & Worship');

    await api.disconnectPlanningCenter();
  });

  it('imports a Planning Center plan into a Church Presenter service', async () => {
    await api.savePlanningCenterCredentials('test_demo', 'secret');
    const types = await api.listPlanningCenterServiceTypes();
    const plans = await api.listPlanningCenterPlans(types[0].id);

    // Pre-seed a matching song in the library with CCLI number 7115744
    const existingSong = await api.createSong({
      title: 'Way Maker',
      ccliNumber: '7115744',
      author: 'Sinach',
    });

    const result = await api.importPlanningCenterPlan(types[0].id, plans[0].id);
    expect(result.serviceId).toBeTruthy();
    expect(result.totalItemsCount).toBe(4);
    expect(result.matchedSongsCount).toBe(1);

    // Verify service in library
    const serviceWithItems = await api.getServiceWithItems(result.serviceId);
    expect(serviceWithItems).toBeTruthy();
    expect(serviceWithItems?.items.length).toBe(4);

    // Clean up
    await api.deleteService(result.serviceId);
    await api.deleteSong(existingSong.id);
    await api.disconnectPlanningCenter();
  });

  describe('PlanningCenterModal UI', () => {
    it('connects via credentials form and displays plans', async () => {
      await api.disconnectPlanningCenter();
      const onClose = vi.fn();
      const onServiceImported = vi.fn();

      render(
        <PlanningCenterModal
          isOpen={true}
          onClose={onClose}
          onServiceImported={onServiceImported}
        />
      );

      // Verify connection tab inputs
      await waitFor(() => {
        expect(screen.getByTestId('pco-app-id')).toBeTruthy();
        expect(screen.getByTestId('pco-secret')).toBeTruthy();
      });

      fireEvent.change(screen.getByTestId('pco-app-id'), { target: { value: 'test_app_key' } });
      fireEvent.change(screen.getByTestId('pco-secret'), { target: { value: 'test_secret_val' } });
      fireEvent.click(screen.getByTestId('pco-connect-btn'));

      // Transitions to Plans tab automatically upon success
      await waitFor(() => {
        expect(screen.getByTestId('pco-service-type-select')).toBeTruthy();
        expect(screen.getByTestId('pco-plan-select')).toBeTruthy();
      });

      // Shows items breakdown
      await waitFor(() => {
        const rows = screen.getAllByTestId('pco-item-row');
        expect(rows.length).toBeGreaterThan(0);
        expect(screen.getByText('Way Maker')).toBeTruthy();
      });

      // Import as service
      const importBtn = screen.getByTestId('pco-import-btn');
      fireEvent.click(importBtn);

      await waitFor(() => {
        expect(screen.getByTestId('pco-import-success')).toBeTruthy();
      });

      const openBtn = screen.getByTestId('pco-open-service-btn');
      fireEvent.click(openBtn);
      expect(onServiceImported).toHaveBeenCalled();

      await api.disconnectPlanningCenter();
    });
  });
});
