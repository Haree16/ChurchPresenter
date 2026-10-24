import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';
import { Slide, BiblePassageQuery } from '../src/types';

describe('Phase 3: Service Planning & Live Presentation Control', () => {
  beforeEach(async () => {
    // Clean state if needed
  });

  describe('Service CRUD Operations', () => {
    it('creates, reads, updates, duplicates, and deletes church services', async () => {
      // 1. Create a service without requiring a service date
      const created = await api.createService({
        title: 'Wednesday Evening Prayer',
        category: 'Prayer Meeting',
        description: 'Midweek prayer and worship',
        serviceDate: null,
        notes: 'Sound check at 6:30 PM',
      });

      expect(created.id).toBeDefined();
      expect(created.title).toBe('Wednesday Evening Prayer');
      expect(created.category).toBe('Prayer Meeting');
      expect(created.serviceDate).toBeNull();

      // 2. Read service by ID
      const fetched = await api.getService(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('Wednesday Evening Prayer');

      // 3. Update service
      const updated = await api.updateService({
        ...created,
        title: 'Wednesday Evening Prayer & Intercession',
        serviceDate: '2026-10-21',
      });
      expect(updated.title).toBe('Wednesday Evening Prayer & Intercession');
      expect(updated.serviceDate).toBe('2026-10-21');

      // 4. Duplicate service
      const duplicated = await api.duplicateService(created.id, 'Wednesday Evening Prayer (Copy)');
      expect(duplicated.id).not.toBe(created.id);
      expect(duplicated.title).toBe('Wednesday Evening Prayer (Copy)');

      // 5. Delete service
      await api.deleteService(duplicated.id);
      const afterDelete = await api.getService(duplicated.id);
      expect(afterDelete).toBeNull();
    });

    it('lists all saved services and filters by category', async () => {
      const services = await api.listServices();
      expect(services.length).toBeGreaterThan(0);
      const sundayService = services.find((s) => s.id === 'service-sunday-morning');
      expect(sundayService).toBeDefined();
      expect(sundayService?.category).toBe('Sunday Worship');
    });
  });

  describe('Playlist Items & Reordering', () => {
    it('supports multiple item types with custom notes and ordering', async () => {
      const service = await api.createService({
        title: 'Youth Fellowship Night',
        category: 'Youth Meeting',
      });

      // Add a section divider
      const divider = await api.addServiceItem({
        serviceId: service.id,
        itemType: 'divider',
        title: 'Welcome & Icebreaker',
      });

      // Add announcement item with custom slide
      const announcementSlide: Slide = {
        id: `slide-ann-${Date.now()}`,
        presentationId: 'temp',
        sortOrder: 0,
        title: 'Youth Retreat 2026',
        body: 'Registration ends this Friday!\nSign up in the foyer.',
        backgroundColor: '#0f172a',
        foregroundColor: '#ffffff',
        fontSize: 'large',
        textAlignment: 'center',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const announcement = await api.addServiceItem(
        {
          serviceId: service.id,
          itemType: 'announcement',
          title: 'Youth Retreat Announcements',
          notes: 'Remind parents about permission slips',
        },
        [announcementSlide]
      );

      // Add countdown timer item
      const timer = await api.addServiceItem({
        serviceId: service.id,
        itemType: 'timer',
        title: 'Pre-Service 5-Min Countdown',
        durationSeconds: 300,
      });

      const items = await api.getServiceItems(service.id);
      expect(items.length).toBe(3);
      expect(items[0].id).toBe(divider.id);
      expect(items[1].id).toBe(announcement.id);
      expect(items[2].id).toBe(timer.id);

      // Reorder items
      await api.reorderServiceItems(service.id, [timer.id, divider.id, announcement.id]);
      const reorderedItems = await api.getServiceItems(service.id);
      expect(reorderedItems[0].id).toBe(timer.id);
      expect(reorderedItems[1].id).toBe(divider.id);
      expect(reorderedItems[2].id).toBe(announcement.id);

      // Verify slides snapshot
      const annSlides = await api.getServiceItemSlides(announcement.id);
      expect(annSlides.length).toBe(1);
      expect(annSlides[0].body).toContain('Registration ends this Friday');
    });
  });

  describe('Snapshot Isolation: Non-destructive Worship Library Integration', () => {
    it('snapshots song slides into the service item so library edits do not affect the service plan', async () => {
      const service = await api.createService({
        title: 'Sunday Worship Service Test',
        category: 'Sunday Worship',
      });

      // Add Amazing Grace to service
      const songItem = await api.addSongToService(
        service.id,
        'song-amazing-grace',
        'theme-builtin-dark',
        2
      );

      expect(songItem).toBeDefined();
      expect(songItem.itemType).toBe('song');
      expect(songItem.title).toContain('Amazing Grace');

      // Fetch snapshot slides
      const snapshotSlides = await api.getServiceItemSlides(songItem.id);
      expect(snapshotSlides.length).toBeGreaterThan(0);
      const originalFirstSlideText = snapshotSlides[0].body;
      expect(originalFirstSlideText).toContain('Amazing grace');

      // Now edit the song in the worship library
      const originalSong = await api.getSong('song-amazing-grace');
      expect(originalSong).not.toBeNull();

      if (originalSong) {
        await api.updateSong({
          ...originalSong.song,
          title: 'Amazing Grace (Revised Arrangement)',
        });
      }

      // Check that the service snapshot title and slides remain preserved
      const refreshedItem = await api.getServiceItem(songItem.id);
      expect(refreshedItem?.title).toBe(songItem.title);

      const refreshedSlides = await api.getServiceItemSlides(songItem.id);
      expect(refreshedSlides[0].body).toBe(originalFirstSlideText);
    });
  });

  describe('Offline Bible Passage Lookup & Slide Generation', () => {
    it('queries KJV scripture offline and generates grouped slides', async () => {
      const query: BiblePassageQuery = {
        translation: 'KJV',
        book: 'John',
        chapter: 3,
        startVerse: 16,
        endVerse: 17,
      };

      const result = await api.queryBiblePassage(query);
      expect(result.reference).toContain('John 3:16-17');
      expect(result.verses.length).toBe(2);
      expect(result.verses[0].text).toContain('For God so loved the world');

      // Add to service with 1 verse per slide
      const service = await api.createService({
        title: 'Scripture Reading Test',
        category: 'Sunday Worship',
      });

      const passageItem = await api.addBiblePassageToService(
        service.id,
        query,
        'theme-builtin-dark',
        1
      );

      expect(passageItem.itemType).toBe('bible');
      expect(passageItem.title).toContain('John 3:16-17');

      const slides = await api.getServiceItemSlides(passageItem.id);
      expect(slides.length).toBe(2);
      expect(slides[0].body).toContain('For God so loved the world');
      expect(slides[1].body).toContain('For God sent not his Son');
    });

    it('queries Tamil scripture offline and formats slides with proper Unicode', async () => {
      const query: BiblePassageQuery = {
        translation: 'Tamil',
        book: 'யோவான்',
        chapter: 3,
        startVerse: 16,
        endVerse: 17,
      };

      const result = await api.queryBiblePassage(query);
      expect(result.verses.length).toBe(2);
      expect(result.verses[0].text).toContain('தேவன், தம்முடைய ஒரேபேறான குமாரனை');

      const service = await api.createService({
        title: 'Tamil Service Test',
        category: 'Sunday Worship',
      });

      const item = await api.addBiblePassageToService(service.id, query);
      const slides = await api.getServiceItemSlides(item.id);
      expect(slides.length).toBeGreaterThan(0);
      expect(slides[0].body).toContain('தேவன்');
    });
  });

  describe('Deliberate Live Presentation & Boundary Navigation', () => {
    it('selecting or previewing items does not affect live output until deliberate action is taken', async () => {
      // Clear live state
      await api.clearLive();
      let state = await api.getPresentationState();
      expect(state.isLive).toBe(false);

      // Find a service item with slides
      const items = await api.getServiceItems('service-sunday-morning');
      const songItem = items.find((it) => (it.slideCount || 0) > 0) || items[1];
      expect(songItem).toBeDefined();

      // Set selected/preview item
      await api.setSelectedServiceItem('service-sunday-morning', songItem.id);
      state = await api.getPresentationState();
      // Audience output remains NOT live
      expect(state.isLive).toBe(false);
      expect(state.selectedItemId).toBe(songItem.id);

      // Take specific slide live deliberately
      const itemSlides = await api.getServiceItemSlides(songItem.id);
      expect(itemSlides.length).toBeGreaterThan(0);

      const liveState = await api.setLiveServiceItemSlide(
        'service-sunday-morning',
        songItem.id,
        itemSlides[0].id
      );

      expect(liveState.isLive).toBe(true);
      expect(liveState.currentServiceId).toBe('service-sunday-morning');
      expect(liveState.currentItemId).toBe(songItem.id);
      expect(liveState.currentSlide?.id).toBe(itemSlides[0].id);
    });

    it('navigates seamlessly across item boundaries when advancing past the last slide', async () => {
      // Setup a service with two consecutive items each having slides
      const service = await api.createService({
        title: 'Boundary Navigation Service',
        category: 'Sunday Worship',
      });

      const slide1A: Slide = {
        id: `slide-1A-${Date.now()}`,
        presentationId: 'temp',
        sortOrder: 0,
        title: 'Item 1 Slide 1',
        body: 'First item, slide 1',
        backgroundColor: '#0f172a',
        foregroundColor: '#ffffff',
        fontSize: 'medium',
        textAlignment: 'center',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const slide1B: Slide = {
        id: `slide-1B-${Date.now()}`,
        presentationId: 'temp',
        sortOrder: 1,
        title: 'Item 1 Slide 2',
        body: 'First item, slide 2 (Last slide of Item 1)',
        backgroundColor: '#0f172a',
        foregroundColor: '#ffffff',
        fontSize: 'medium',
        textAlignment: 'center',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const item1 = await api.addServiceItem(
        { serviceId: service.id, itemType: 'text', title: 'Part 1' },
        [slide1A, slide1B]
      );

      const slide2A: Slide = {
        id: `slide-2A-${Date.now()}`,
        presentationId: 'temp',
        sortOrder: 0,
        title: 'Item 2 Slide 1',
        body: 'Second item, slide 1 (First slide of Item 2)',
        backgroundColor: '#0f172a',
        foregroundColor: '#ffffff',
        fontSize: 'medium',
        textAlignment: 'center',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const item2 = await api.addServiceItem(
        { serviceId: service.id, itemType: 'text', title: 'Part 2' },
        [slide2A]
      );

      // Start live on Item 1, Slide 2 (last slide of Item 1)
      await api.setLiveServiceItemSlide(service.id, item1.id, slide1B.id);
      let state = await api.getPresentationState();
      expect(state.currentItemId).toBe(item1.id);
      expect(state.currentSlide?.id).toBe(slide1B.id);
      expect(state.nextSlide?.id).toBe(slide2A.id);

      // Advance: Next Slide should cross boundary into Item 2, Slide 1!
      state = await api.nextSlide();
      expect(state.currentItemId).toBe(item2.id);
      expect(state.currentSlide?.id).toBe(slide2A.id);

      // Retreat: Previous Slide should cross boundary back into Item 1, Slide 2!
      state = await api.previousSlide();
      expect(state.currentItemId).toBe(item1.id);
      expect(state.currentSlide?.id).toBe(slide1B.id);

      // Advance to Item 2
      state = await api.nextSlide();
      expect(state.currentItemId).toBe(item2.id);

      // At end of service: nextSlide stops cleanly without wrapping
      const endState = await api.nextSlide();
      expect(endState.currentItemId).toBe(item2.id);
      expect(endState.currentSlide?.id).toBe(slide2A.id);
    });
  });
});
