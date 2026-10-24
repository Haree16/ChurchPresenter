import { describe, it, expect } from 'vitest';
import { api } from '../src/services/api';

describe('Slide & Presentation Management', () => {
  it('creates, edits, duplicates, reorders, and deletes slides', async () => {
    // 1. Create presentation
    const pres = await api.createPresentation('Easter Service 2026', 'Worship');
    expect(pres.id).toBeDefined();
    expect(pres.title).toBe('Easter Service 2026');

    // 2. Add slide 1
    const slide1 = await api.createSlide(pres.id, {
      title: 'Opening Chorus',
      body: 'Christ is Risen! Hallelujah!',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'xlarge',
      textAlignment: 'center',
    });
    expect(slide1.sortOrder).toBe(0);
    expect(slide1.body).toBe('Christ is Risen! Hallelujah!');

    // 3. Add slide 2
    const slide2 = await api.createSlide(pres.id, {
      title: 'Verse 1',
      body: 'Death could not hold You, the veil tore before You.',
      backgroundColor: '#0a0f1d',
      foregroundColor: '#ffffff',
      fontSize: 'large',
      textAlignment: 'center',
    });
    expect(slide2.sortOrder).toBe(1);

    // 4. Update slide 1
    const updatedSlide1 = await api.updateSlide(slide1.id, {
      title: 'Updated Opening Chorus',
      fontSize: 'large',
    });
    expect(updatedSlide1.title).toBe('Updated Opening Chorus');
    expect(updatedSlide1.fontSize).toBe('large');

    // 5. Duplicate slide 2
    const duplicated = await api.duplicateSlide(slide2.id);
    expect(duplicated.title).toBe('Verse 1 (Copy)');
    expect(duplicated.sortOrder).toBe(2);

    let slides = await api.getSlides(pres.id);
    expect(slides.length).toBe(3);

    // 6. Reorder slides
    await api.reorderSlides(pres.id, [duplicated.id, slide1.id, slide2.id]);
    slides = await api.getSlides(pres.id);
    expect(slides[0].id).toBe(duplicated.id);
    expect(slides[1].id).toBe(slide1.id);
    expect(slides[2].id).toBe(slide2.id);

    // 7. Delete slide
    await api.deleteSlide(duplicated.id);
    slides = await api.getSlides(pres.id);
    expect(slides.length).toBe(2);
    expect(slides[0].sortOrder).toBe(0);
    expect(slides[1].sortOrder).toBe(1);

    // 8. Delete presentation
    await api.deletePresentation(pres.id);
    const deletedPres = await api.getPresentation(pres.id);
    expect(deletedPres).toBeNull();
  });
});
