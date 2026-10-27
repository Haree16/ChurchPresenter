import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateProp, propPlacement, PROP_POSITIONS } from '../src/services/propLayout';
import { PropsLayer } from '../src/components/PropsLayer';
import { PropsControl } from '../src/components/PropsControl';
import { PropsManagerModal } from '../src/components/PropsManagerModal';
import { AudienceView } from '../src/components/AudienceView';
import { Prop } from '../src/types';

const textProp = (over: Partial<Prop> = {}): Prop => ({
  id: '', name: 'Welcome', kind: 'text', text: 'Welcome to church', imagePath: null,
  position: 'lower-third', sizePct: 6, textColor: '#ffffff', backgroundColor: '#000000', ...over,
});

async function reset() {
  await api.clearAll();
  for (const p of await api.listProps()) await api.deleteProp(p.id);
}

describe('validateProp', () => {
  it('accepts valid text and image props', () => {
    expect(validateProp(textProp())).toBeNull();
    expect(validateProp(textProp({ kind: 'image', text: null, imagePath: 'media/x.png', backgroundColor: null }))).toBeNull();
  });

  it('explains what is wrong', () => {
    expect(validateProp(textProp({ name: ' ' }))).toMatch(/name/);
    expect(validateProp(textProp({ name: 'n'.repeat(61) }))).toMatch(/too long/);
    expect(validateProp(textProp({ text: ' ' }))).toMatch(/needs some text/);
    expect(validateProp(textProp({ text: 'x'.repeat(201) }))).toMatch(/too long/);
    expect(validateProp(textProp({ kind: 'image', imagePath: '' }))).toMatch(/needs an image/);
    expect(validateProp(textProp({ kind: 'video' as any }))).toMatch(/Unknown prop type/);
    expect(validateProp(textProp({ position: 'nowhere' as any }))).toMatch(/position/);
    for (const size of [0, 101, 2.5, -1]) expect(validateProp(textProp({ sizePct: size }))).toMatch(/Size/);
    for (const c of ['red', '#fff', '#ffffff;x', 'rgb(0,0,0)']) {
      expect(validateProp(textProp({ textColor: c }))).toMatch(/Text colour/);
      expect(validateProp(textProp({ backgroundColor: c }))).toMatch(/Background colour/);
    }
  });

  it('every position has a placement', () => {
    for (const { value } of PROP_POSITIONS) expect(Object.keys(propPlacement(value)).length).toBeGreaterThan(0);
  });
});

describe('PropsLayer', () => {
  it('draws nothing without props', () => {
    const { container } = render(<PropsLayer props={[]} />);
    expect(container.firstChild).toBeNull();
    const { container: c2 } = render(<PropsLayer props={undefined} />);
    expect(c2.firstChild).toBeNull();
  });

  it('draws text props as plain text and ignores non-hex colours', () => {
    render(<PropsLayer props={[textProp({ id: 'a', text: '<b onclick=x>Hi</b>', textColor: 'red;position:fixed', backgroundColor: 'url(x)' })]} />);
    const item = screen.getByTestId('prop-item');
    expect(item.textContent).toBe('<b onclick=x>Hi</b>');
    expect(item.querySelector('b')).toBeNull();
    expect(item.style.color).toBe('rgb(255, 255, 255)'); // fell back to white
    expect(item.style.backgroundColor).toBe('transparent');
  });

  it('draws image props at the requested width and skips ones without a source', () => {
    render(
      <PropsLayer
        props={[
          textProp({ id: 'i', kind: 'image', text: null, imagePath: 'https://example.com/logo.png', sizePct: 12, position: 'top-right' }),
          textProp({ id: 'n', kind: 'image', text: null, imagePath: '' }),
        ]}
      />
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].style.width).toBe('12vw');
  });
});

describe('Props API (mock)', () => {
  it('creates, lists, updates and deletes; invalid props are rejected', async () => {
    await reset();
    await expect(api.createProp(textProp({ name: '' }))).rejects.toThrow(/name/);
    expect(await api.listProps()).toHaveLength(0);

    const a = await api.createProp(textProp({ name: '  Welcome  ' }));
    expect(a.name).toBe('Welcome');
    expect(a.id).toBeTruthy();
    const updated = await api.updateProp({ ...a, text: 'New words' });
    expect(updated.text).toBe('New words');
    await expect(api.updateProp({ ...a, id: 'ghost' })).rejects.toThrow(/no longer exists/);
    await expect(api.updateProp({ ...a, sizePct: 0 })).rejects.toThrow(/Size/);

    await api.deleteProp(a.id);
    expect(await api.listProps()).toHaveLength(0);
  });

  it('toggles props on and off, keeps them in step with edits and deletes, and clears them', async () => {
    await reset();
    const a = await api.createProp(textProp({ name: 'A' }));
    const b = await api.createProp(textProp({ name: 'B', position: 'top-bar' }));

    let s = await api.toggleProp(a.id);
    expect(s.activeProps!.map((p) => p.id)).toEqual([a.id]);
    s = await api.toggleProp(b.id);
    expect(s.activeProps).toHaveLength(2);
    s = await api.toggleProp(a.id);
    expect(s.activeProps!.map((p) => p.id)).toEqual([b.id]);
    await expect(api.toggleProp('ghost')).rejects.toThrow(/no longer exists/);

    await api.updateProp({ ...b, text: 'Edited live' });
    expect((await api.getPresentationState()).activeProps![0].text).toBe('Edited live');

    await api.deleteProp(b.id);
    expect((await api.getPresentationState()).activeProps).toEqual([]);

    await api.toggleProp(a.id);
    const cleared = await api.dispatchAction('clear_props');
    expect(cleared.activeProps).toEqual([]);
    await api.toggleProp(a.id);
    expect((await api.clearAll()).activeProps).toEqual([]);
    await reset();
  });
});

describe('Props on the audience screen', () => {
  it('shows over a live slide, is hidden by blackout, while alerts still show', async () => {
    await reset();
    const p = await api.createProp(textProp({ text: 'Lower third text' }));
    await api.nextSlide();
    await api.toggleProp(p.id);
    await api.sendAlert('Nursery call', 0);

    render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('prop-item').textContent).toBe('Lower third text'));

    await api.toggleBlackout();
    await waitFor(() => expect(screen.queryByTestId('props-layer')).toBeNull());
    expect(screen.getByTestId('audience-alert').textContent).toBe('Nursery call');

    await api.toggleBlackout();
    await waitFor(() => expect(screen.getByTestId('prop-item')).toBeTruthy());
    await reset();
  });
});

describe('PropsControl', () => {
  it('lists props, toggles them, and enables Clear Props only while one is on', async () => {
    await reset();
    const a = await api.createProp(textProp({ name: 'Welcome' }));
    const state = await api.getPresentationState();
    const { rerender } = render(<PropsControl presentationState={state} />);
    await waitFor(() => expect(screen.getByText('Welcome')).toBeTruthy());

    const clear = screen.getByTestId('btn-clear-props') as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
    const toggle = screen.getByTestId('prop-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    await waitFor(async () => expect((await api.getPresentationState()).activeProps).toHaveLength(1));

    rerender(<PropsControl presentationState={await api.getPresentationState()} />);
    expect(screen.getByTestId('prop-toggle').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('btn-clear-props') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('btn-clear-props'));
    await waitFor(async () => expect((await api.getPresentationState()).activeProps).toEqual([]));
    await api.deleteProp(a.id);
  });

  it('says so when there are no props', async () => {
    await reset();
    render(<PropsControl presentationState={await api.getPresentationState()} />);
    await waitFor(() => expect(screen.getByText(/No props yet/)).toBeTruthy());
  });
});

describe('PropsManagerModal', () => {
  it('creates a text prop, edits it and deletes it', async () => {
    await reset();
    render(<PropsManagerModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByTestId('prop-name'), { target: { value: 'Welcome' } });
    fireEvent.change(screen.getByTestId('prop-text'), { target: { value: 'Welcome home' } });
    fireEvent.change(screen.getByTestId('prop-position'), { target: { value: 'top-bar' } });
    fireEvent.click(screen.getByTestId('prop-save'));
    await waitFor(() => expect(screen.getAllByTestId('prop-row')).toHaveLength(1));
    expect((await api.listProps())[0]).toMatchObject({ name: 'Welcome', text: 'Welcome home', position: 'top-bar' });

    fireEvent.click(screen.getByTestId('prop-edit'));
    expect((screen.getByTestId('prop-name') as HTMLInputElement).value).toBe('Welcome');
    fireEvent.change(screen.getByTestId('prop-text'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByTestId('prop-save'));
    await waitFor(async () => expect((await api.listProps())[0].text).toBe('Changed'));
    expect(await api.listProps()).toHaveLength(1);

    fireEvent.click(screen.getByTestId('prop-delete'));
    await waitFor(() => expect(screen.queryAllByTestId('prop-row')).toHaveLength(0));
  });

  it('shows validation problems instead of saving', async () => {
    await reset();
    render(<PropsManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('prop-save'));
    expect(screen.getByTestId('props-error').textContent).toMatch(/name/);

    fireEvent.change(screen.getByTestId('prop-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('prop-save'));
    expect(screen.getByTestId('props-error').textContent).toMatch(/needs some text/);

    fireEvent.change(screen.getByTestId('prop-kind'), { target: { value: 'image' } });
    fireEvent.click(screen.getByTestId('prop-save'));
    expect(screen.getByTestId('props-error').textContent).toMatch(/needs an image/);
    expect(await api.listProps()).toHaveLength(0);
  });

  it('the backing box can be switched off', async () => {
    await reset();
    render(<PropsManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('prop-name'), { target: { value: 'Plain' } });
    fireEvent.change(screen.getByTestId('prop-text'), { target: { value: 'No box' } });
    fireEvent.click(screen.getByTestId('prop-bg-enabled'));
    fireEvent.click(screen.getByTestId('prop-save'));
    await waitFor(async () => expect((await api.listProps())[0].backgroundColor).toBeNull());
  });
});
