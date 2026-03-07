/**
 * Image Viewer Store - Zustand store for image viewer state
 */

import { create } from 'zustand';

interface ImageViewerState {
  openImage: { projectSlug: string; path: string } | null;
  zoomLevel: number;
}

interface ImageViewerActions {
  openImageViewer: (projectSlug: string, path: string) => void;
  closeViewer: () => void;
  setZoom: (zoom: number) => void;
  resetView: () => void;
}

type ImageViewerStore = ImageViewerState & ImageViewerActions;

const initialState: ImageViewerState = {
  openImage: null,
  zoomLevel: 1,
};

export const useImageViewerStore = create<ImageViewerStore>((set) => ({
  ...initialState,

  openImageViewer: (projectSlug, path) => {
    set({
      openImage: { projectSlug, path },
      zoomLevel: 1,
    });
  },

  closeViewer: () => {
    set(initialState);
  },

  setZoom: (zoom) => {
    set({ zoomLevel: Math.max(0.1, Math.min(10, zoom)) });
  },

  resetView: () => {
    set({ zoomLevel: 1 });
  },
}));
