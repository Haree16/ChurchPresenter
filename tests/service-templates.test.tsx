import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { defaultServiceTitle, isSlot, slotTitle, validateServiceTitle, validateTemplateName } from '../src/services/serviceTemplates';
import { SaveServiceTemplateDialog, ServiceTemplatesModal } from '../src/components/Services/ServiceTemplatesModal';
import { ServicePlannerView } from '../src/components/Services/ServicePlannerView';
import { PlaylistItem, Service, Slide } from '../src/types';

const slide = (title: string, body: string): Slide => ({
  id: '', presentationId: '', sortOrder: 0, title, body, backgroundColor: '#102030', foregroundColor: '#ffffff',
  fontSize: 'large', textAlignment: 'center', createdAt: '', updatedAt: '',
} as Slide);

const createdServices: string[] = [];
afterEach(async () => {
  for (const t of await api.listServiceTemplates()) await api.deleteServiceTemplate(t.id);
  for (const id of createdServices.splice(0)) await api.deleteService(id);
});

/** Welcome, a song, a sermon, scripture and a closing divider. */
async function sampleService(title = 'Last Sunday'): Promise<{ service: Service; items: PlaylistItem[] }> {
  const service = await api.createService({ title, serviceDate: '2026-03-01' });
  createdServices.push(service.id);
  const song = (await api.listSongs())[0];
  const items = [
    await api.addServiceItem({ serviceId: service.id, itemType: 'announcement', title: 'Welcome', durationSeconds: 120 }, [slide('Welcome', 'Good morning')]),
    await api.addServiceItem({ serviceId: service.id, itemType: 'song', title: song.title, sourceId: song.id }, [slide('v1', 'line one'), slide('v2', 'line two')]),
    await api.addServiceItem({ serviceId: service.id, itemType: 'sermon', title: 'Sermon' }, [slide('Title', 'The sermon')]),
    await api.addServiceItem({ serviceId: service.id, itemType: 'bible', title: 'John 3' }, [slide('John 3:16', 'For God so loved')]),
    await api.addServiceItem({ serviceId: service.id, itemType: 'divider', title: 'Closing' }),
  ];
  return { service, items };
}
const itemTypes = async (serviceId: string) => (await api.getServiceItems(serviceId)).map((i) => `${i.itemType}:${i.title}`);

describe('template rules', () => {
  it('checks names and titles', () => {
    expect(validateTemplateName('Sunday')).toBeNull();
    expect(validateTemplateName('  ')).toMatch(/name/);
    expect(validateTemplateName('n'.repeat(61))).toMatch(/too long/);
    expect(validateServiceTitle('Service')).toBeNull();
    expect(validateServiceTitle(' ')).toMatch(/title/);
    expect(validateServiceTitle('t'.repeat(101))).toMatch(/too long/);
  });

  it('knows which items can be left as slots', () => {
    expect(isSlot('song')).toBe(true);
    expect(isSlot('bible')).toBe(true);
    for (const other of ['sermon', 'announcement', 'text', 'image', 'divider', 'timer']) expect(isSlot(other)).toBe(false);
    expect(slotTitle('song')).toBe('Worship song');
    expect(slotTitle('bible')).toBe('Scripture reading');
    expect(defaultServiceTitle('Sunday', '2026-03-08')).toBe('Sunday 2026-03-08');
    expect(defaultServiceTitle('Sunday', '')).toBe('Sunday');
  });
});

describe('templates (browser store)', () => {
  it('saves a service and lists it with its item and slot counts', async () => {
    const { service } = await sampleService();
    expect(await api.listServiceTemplates()).toEqual([]);
    const t = await api.saveServiceAsTemplate(service.id, '  Sunday Morning ');
    expect(t).toMatchObject({ name: 'Sunday Morning', itemCount: 5, slotCount: 2 });
    expect((await api.listServiceTemplates()).map((x) => x.id)).toEqual([t.id]);
  });

  it('refuses a bad name, a missing service and a service with no items', async () => {
    const { service } = await sampleService();
    await expect(api.saveServiceAsTemplate(service.id, ' ')).rejects.toThrow(/name/);
    await expect(api.saveServiceAsTemplate('ghost', 'x')).rejects.toThrow(/no longer exists/);
    const empty = await api.createService({ title: 'Empty' });
    createdServices.push(empty.id);
    await expect(api.saveServiceAsTemplate(empty.id, 'x')).rejects.toThrow(/no items/);
    expect(await api.listServiceTemplates()).toEqual([]);
  });

  it('starts a new service with songs and scripture as empty slots by default', async () => {
    const { service } = await sampleService();
    const t = await api.saveServiceAsTemplate(service.id, 'Sunday');
    const made = await api.createServiceFromTemplate(t.id, ' Next Sunday ', '2026-03-08', false);
    createdServices.push(made.id);
    expect(made).toMatchObject({ title: 'Next Sunday', serviceDate: '2026-03-08' });
    expect(made.id).not.toBe(service.id);
    expect(await itemTypes(made.id)).toEqual(['announcement:Welcome', 'divider:Worship song', 'sermon:Sermon', 'divider:Scripture reading', 'divider:Closing']);
    const items = await api.getServiceItems(made.id);
    expect((await api.getServiceItemSlides(items[0].id))[0].body).toBe('Good morning');
    expect(await api.getServiceItemSlides(items[1].id)).toHaveLength(0);
    expect(items[1].sourceId ?? null).toBeNull();
    expect(items[0].durationSeconds).toBe(120);
  });

  it('can keep the songs and scripture with their slides and song link', async () => {
    const { service, items: original } = await sampleService();
    const t = await api.saveServiceAsTemplate(service.id, 'Sunday');
    const made = await api.createServiceFromTemplate(t.id, 'Copy', null, true);
    createdServices.push(made.id);
    expect((await itemTypes(made.id)).map((x) => x.split(':')[0])).toEqual(['announcement', 'song', 'sermon', 'bible', 'divider']);
    const items = await api.getServiceItems(made.id);
    expect(items[1].sourceId).toBe(original[1].sourceId);
    expect(await api.getServiceItemSlides(items[1].id)).toHaveLength(2);
  });

  it('shares nothing with the original or with other services made from it', async () => {
    const { service } = await sampleService();
    const t = await api.saveServiceAsTemplate(service.id, 'Sunday');
    const a = await api.createServiceFromTemplate(t.id, 'A', null, true);
    const b = await api.createServiceFromTemplate(t.id, 'B', null, true);
    createdServices.push(a.id, b.id);
    const slideIds = async (id: string) => (await api.getServiceItemSlides((await api.getServiceItems(id))[0].id)).map((s) => s.id);
    expect(await slideIds(a.id)).not.toEqual(await slideIds(b.id));
    await api.deleteService(service.id);
    createdServices.splice(createdServices.indexOf(service.id), 1);
    const c = await api.createServiceFromTemplate(t.id, 'C', null, true); // the template outlives the service it came from
    createdServices.push(c.id);
    expect(await api.getServiceItems(c.id)).toHaveLength(5);
  });

  it('makes no service for a bad title or a missing template', async () => {
    const { service } = await sampleService();
    const t = await api.saveServiceAsTemplate(service.id, 'Sunday');
    const before = (await api.listServices()).length;
    await expect(api.createServiceFromTemplate(t.id, '  ', null, false)).rejects.toThrow(/title/);
    await expect(api.createServiceFromTemplate('ghost', 'x', null, false)).rejects.toThrow(/no longer exists/);
    expect((await api.listServices()).length).toBe(before);
    await api.deleteServiceTemplate(t.id);
    await api.deleteServiceTemplate('ghost');
    expect(await api.listServiceTemplates()).toEqual([]);
  });
});

describe('ServiceTemplatesModal', () => {
  it('says so when there are no templates', async () => {
    render(<ServiceTemplatesModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(await screen.findByTestId('templates-empty')).toBeTruthy();
  });

  it('makes a service from the chosen template, with slots by default', async () => {
    const { service } = await sampleService();
    await api.saveServiceAsTemplate(service.id, 'Sunday Morning');
    const onCreated = vi.fn();
    const onClose = vi.fn();
    render(<ServiceTemplatesModal isOpen onClose={onClose} onCreated={onCreated} />);

    const choice = await screen.findByTestId('template-choice');
    expect(choice.textContent).toContain('5 items');
    expect(choice.textContent).toContain('2 for songs or scripture');
    expect(screen.queryByTestId('template-form')).toBeNull();
    fireEvent.click(choice);
    expect((screen.getByTestId('template-title') as HTMLInputElement).value).toBe('Sunday Morning');
    expect((screen.getByTestId('template-keep') as HTMLInputElement).checked).toBe(false);

    fireEvent.change(screen.getByTestId('template-date'), { target: { value: '2026-03-08' } });
    expect((screen.getByTestId('template-title') as HTMLInputElement).value).toBe('Sunday Morning 2026-03-08'); // follows the date
    fireEvent.click(screen.getByTestId('template-create'));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const made: Service = onCreated.mock.calls[0][0];
    createdServices.push(made.id);
    expect(made).toMatchObject({ title: 'Sunday Morning 2026-03-08', serviceDate: '2026-03-08' });
    expect(await itemTypes(made.id)).toContain('divider:Worship song');
  });

  it('keeps a title the user typed when the date changes, and can keep the songs', async () => {
    const { service } = await sampleService();
    await api.saveServiceAsTemplate(service.id, 'Sunday');
    const onCreated = vi.fn();
    render(<ServiceTemplatesModal isOpen onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.click(await screen.findByTestId('template-choice'));
    fireEvent.change(screen.getByTestId('template-title'), { target: { value: 'Easter Service' } });
    fireEvent.change(screen.getByTestId('template-date'), { target: { value: '2026-04-05' } });
    expect((screen.getByTestId('template-title') as HTMLInputElement).value).toBe('Easter Service');
    fireEvent.click(screen.getByTestId('template-keep'));
    fireEvent.click(screen.getByTestId('template-create'));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const made: Service = onCreated.mock.calls[0][0];
    createdServices.push(made.id);
    expect(made.title).toBe('Easter Service');
    expect((await itemTypes(made.id)).some((x) => x.startsWith('song:'))).toBe(true);
  });

  it('will not create without a title, and deletes a template', async () => {
    const { service } = await sampleService();
    await api.saveServiceAsTemplate(service.id, 'Sunday');
    render(<ServiceTemplatesModal isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('template-choice'));
    fireEvent.change(screen.getByTestId('template-title'), { target: { value: '   ' } });
    expect((screen.getByTestId('template-create') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Delete template Sunday'));
    await screen.findByTestId('templates-empty');
    expect(screen.queryByTestId('template-form')).toBeNull();
  });
});

describe('SaveServiceTemplateDialog', () => {
  it('suggests the service name and saves', async () => {
    const { service } = await sampleService('Sunday Service');
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<SaveServiceTemplateDialog service={service} onClose={onClose} onSaved={onSaved} />);
    expect((screen.getByTestId('save-template-name') as HTMLInputElement).value).toBe('Sunday Service');
    fireEvent.click(screen.getByTestId('save-template-confirm'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toMatchObject({ name: 'Sunday Service', itemCount: 5 });
    expect(onClose).toHaveBeenCalled();
  });

  it('explains why a service cannot be saved, and needs a name', async () => {
    const empty = await api.createService({ title: 'Empty' });
    createdServices.push(empty.id);
    const onSaved = vi.fn();
    render(<SaveServiceTemplateDialog service={empty} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId('save-template-confirm'));
    expect((await screen.findByTestId('save-template-error')).textContent).toMatch(/no items/);
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('save-template-name'), { target: { value: ' ' } });
    expect((screen.getByTestId('save-template-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows nothing when there is no service', () => {
    render(<SaveServiceTemplateDialog service={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByTestId('save-template-dialog')).toBeNull();
  });
});

describe('service planner', () => {
  it('saves a service as a template and starts a new one from it', async () => {
    const { service } = await sampleService('Planner Sunday');
    const state = await api.getPresentationState();
    render(<ServicePlannerView presentationState={state} audienceStatus={{ isOpen: false } as any} onRefreshPresentationState={vi.fn()} onToggleBlackout={vi.fn()} onToggleAudienceWindow={vi.fn()} />);

    await screen.findAllByText('Planner Sunday');
    const saveButtons = await screen.findAllByTestId('save-as-template-btn');
    expect(saveButtons.length).toBeGreaterThan(0);
    // the list row for this service: the nearest ancestor of its title that has a save-as-template button
    const withButton = (el: HTMLElement | null): HTMLElement | null => {
      for (let node = el; node; node = node.parentElement) {
        if (node.querySelector('[data-testid="save-as-template-btn"]')) return node;
      }
      return null;
    };
    const row = screen.getAllByText('Planner Sunday').map((t) => withButton(t))[0]!;
    fireEvent.click(row.querySelector('[data-testid="save-as-template-btn"]')!);
    fireEvent.change(await screen.findByTestId('save-template-name'), { target: { value: 'Planner Template' } });
    fireEvent.click(screen.getByTestId('save-template-confirm'));
    await screen.findByText(/Saved template "Planner Template"/);
    expect((await api.listServiceTemplates()).map((t) => t.name)).toContain('Planner Template');

    fireEvent.click(screen.getByTestId('from-template-btn'));
    const choices = await screen.findAllByTestId('template-choice');
    fireEvent.click(choices.find((c) => c.textContent?.includes('Planner Template'))!);
    fireEvent.change(screen.getByTestId('template-title'), { target: { value: 'Made From Template' } });
    fireEvent.click(screen.getByTestId('template-create'));
    await screen.findByText(/Service "Made From Template" created from a template/);
    const all = await api.listServices();
    const made = all.find((s) => s.title === 'Made From Template')!;
    createdServices.push(made.id);
    expect(made).toBeTruthy();
    expect(service.id).not.toBe(made.id);
  });
});

describe('slide backgrounds', () => {
  it('sets a video background on one slide and clears it again', async () => {
    const { service } = await sampleService('Video Sunday');
    const asset = await api.importMediaAsset('/tmp/loop.mp4');
    const state = await api.getPresentationState();
    render(<ServicePlannerView presentationState={state} audienceStatus={{ isOpen: false } as any} onRefreshPresentationState={vi.fn()} onToggleBlackout={vi.fn()} onToggleAudienceWindow={vi.fn()} />);

    fireEvent.click((await screen.findAllByText('Video Sunday'))[0]);
    const items = await api.getServiceItems(service.id);
    const songItem = items.find((i) => i.itemType === 'song')!;
    fireEvent.click(await screen.findByText(songItem.title));
    const [first] = await api.getServiceItemSlides(songItem.id);

    fireEvent.click(await screen.findByTestId(`slide-set-background-${first.id}`));
    fireEvent.click(await screen.findByTestId(`media-asset-card-${asset.id}`));
    fireEvent.click(await screen.findByTestId('media-apply-bg-btn'));

    await waitFor(async () => {
      const saved = await api.getServiceItemSlides(songItem.id);
      expect(saved.find((s) => s.id === first.id)?.backgroundImage).toBe(asset.relativePath);
      expect(saved.filter((s) => s.backgroundImage).length).toBe(1);
    });
    expect(await screen.findByTestId('slide-card-bg-video')).toBeTruthy();

    fireEvent.click(await screen.findByTestId(`slide-clear-background-${first.id}`));
    await waitFor(async () => {
      const saved = await api.getServiceItemSlides(songItem.id);
      expect(saved.every((s) => !s.backgroundImage)).toBe(true);
    });
    await api.deleteMediaAsset(asset.id);
  });
});
