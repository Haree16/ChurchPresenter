import { useState, useEffect, useCallback } from 'react';
import { Presentation, Slide, PresentationState } from '../types';
import { api } from '../services/api';

export function usePresentation() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [selectedPresentationId, setSelectedPresentationId] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [presentationState, setPresentationState] = useState<PresentationState>({
    currentPresentationId: null,
    currentSlideId: null,
    currentSlideIndex: 0,
    totalSlides: 0,
    currentSlide: null,
    nextSlide: null,
    isBlackout: false,
    isLive: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load presentations list
  const refreshPresentations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await api.listPresentations();
      setPresentations(list);
      if (list.length > 0 && !selectedPresentationId) {
        setSelectedPresentationId(list[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load presentations';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPresentationId]);

  // Load slides when selected presentation changes
  const refreshSlides = useCallback(async (presId: string) => {
    try {
      const slideList = await api.getSlides(presId);
      setSlides(slideList);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load slides';
      setError(msg);
    }
  }, []);

  // Initial fetch and subscription
  useEffect(() => {
    refreshPresentations();

    let unsubscribe: (() => void) | undefined;
    api.subscribeStateChanges((state) => {
      setPresentationState(state);
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    api.getPresentationState().then((state) => {
      setPresentationState(state);
      if (state.currentPresentationId) {
        setSelectedPresentationId(state.currentPresentationId);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [refreshPresentations]);

  const refreshPresentationState = useCallback(async () => {
    try {
      const state = await api.getPresentationState();
      setPresentationState(state);
      return state;
    } catch (err: unknown) {
      console.error('Failed to refresh presentation state:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (selectedPresentationId) {
      refreshSlides(selectedPresentationId);
    } else {
      setSlides([]);
    }
  }, [selectedPresentationId, refreshSlides]);

  // Slide CRUD
  const createSlide = async (slideData: Partial<Slide>) => {
    if (!selectedPresentationId) return null;
    try {
      const newSlide = await api.createSlide(selectedPresentationId, slideData);
      await refreshSlides(selectedPresentationId);
      await refreshPresentations();
      return newSlide;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create slide';
      setError(msg);
      return null;
    }
  };

  const updateSlide = async (id: string, slideData: Partial<Slide>) => {
    try {
      const updated = await api.updateSlide(id, slideData);
      if (selectedPresentationId) {
        await refreshSlides(selectedPresentationId);
      }
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update slide';
      setError(msg);
      return null;
    }
  };

  const deleteSlide = async (id: string) => {
    try {
      await api.deleteSlide(id);
      if (selectedPresentationId) {
        await refreshSlides(selectedPresentationId);
        await refreshPresentations();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete slide';
      setError(msg);
    }
  };

  const duplicateSlide = async (id: string) => {
    try {
      const duplicated = await api.duplicateSlide(id);
      if (selectedPresentationId) {
        await refreshSlides(selectedPresentationId);
        await refreshPresentations();
      }
      return duplicated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to duplicate slide';
      setError(msg);
      return null;
    }
  };

  const reorderSlides = async (slideIds: string[]) => {
    if (!selectedPresentationId) return;
    try {
      await api.reorderSlides(selectedPresentationId, slideIds);
      await refreshSlides(selectedPresentationId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reorder slides';
      setError(msg);
    }
  };

  // Presentation CRUD
  const createPresentation = async (
    title: string,
    category: Presentation['category'],
    themeName?: string | null
  ) => {
    try {
      const created = await api.createPresentation(title, category, themeName);
      await refreshPresentations();
      setSelectedPresentationId(created.id);
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create presentation';
      setError(msg);
      return null;
    }
  };

  const updatePresentation = async (
    id: string,
    title: string,
    category: Presentation['category'],
    themeName?: string | null
  ) => {
    try {
      const updated = await api.updatePresentation(id, title, category, themeName);
      await refreshPresentations();
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update presentation';
      setError(msg);
      return null;
    }
  };

  const deletePresentation = async (id: string) => {
    try {
      await api.deletePresentation(id);
      if (selectedPresentationId === id) {
        setSelectedPresentationId(null);
      }
      await refreshPresentations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete presentation';
      setError(msg);
    }
  };

  const duplicatePresentation = async (id: string) => {
    try {
      const duplicated = await api.duplicatePresentation(id);
      await refreshPresentations();
      setSelectedPresentationId(duplicated.id);
      return duplicated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to duplicate presentation';
      setError(msg);
      return null;
    }
  };

  // Live Presentation Controls
  const goLive = async (slideId: string) => {
    if (!selectedPresentationId) return;
    try {
      await api.setLiveSlide(selectedPresentationId, slideId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set live slide';
      setError(msg);
    }
  };

  const nextSlide = async () => {
    try {
      await api.nextSlide();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to advance slide';
      setError(msg);
    }
  };

  const previousSlide = async () => {
    try {
      await api.previousSlide();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to go to previous slide';
      setError(msg);
    }
  };

  const clearMedia = async () => {
    try {
      await api.clearMedia();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear media');
    }
  };

  const clearAll = async () => {
    try {
      await api.clearAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to clear output');
    }
  };

  const toggleLogo = async () => {
    try {
      await api.toggleLogo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle logo';
      setError(msg);
    }
  };

  const toggleBlackout = async () => {
    try {
      await api.toggleBlackout();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle blackout';
      setError(msg);
    }
  };

  const selectedPresentation =
    presentations.find((p) => p.id === selectedPresentationId) || null;

  return {
    presentations,
    selectedPresentationId,
    selectedPresentation,
    setSelectedPresentationId,
    slides,
    presentationState,
    isLoading,
    error,
    clearError: () => setError(null),
    refreshPresentations,
    refreshSlides,
    createSlide,
    updateSlide,
    deleteSlide,
    duplicateSlide,
    reorderSlides,
    createPresentation,
    updatePresentation,
    deletePresentation,
    duplicatePresentation,
    goLive,
    nextSlide,
    previousSlide,
    toggleBlackout,
    toggleLogo,
    clearMedia,
    clearAll,
    refreshPresentationState,
  };
}
