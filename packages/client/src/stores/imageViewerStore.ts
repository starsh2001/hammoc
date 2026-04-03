/**
 * Image Viewer Store - Zustand store for unified image viewer state
 * Supports both file-explorer images (single file by path) and
 * URL-based image arrays (chat attachments) with navigation.
 */

import { create } from 'zustand';

export type OpenImageFile = { type: 'file'; projectSlug: string; path: string };
export type OpenImageUrls = {
  type: 'urls';
  images: { url: string; name: string }[];
  currentIndex: number;
};
export type OpenImageState = OpenImageFile | OpenImageUrls | null;

interface ImageViewerState {
  openImage: OpenImageState;
  zoomLevel: number;
}

interface ImageViewerActions {
  openImageViewer: (projectSlug: string, path: string) => void;
  openImageViewerUrls: (
    images: { url: string; name: string }[],
    index: number,
  ) => void;
  closeViewer: () => void;
  setZoom: (zoom: number) => void;
  zoomBy: (delta: number) => void;
  resetView: () => void;
  goNext: () => void;
  goPrev: () => void;
}

type ImageViewerStore = ImageViewerState & ImageViewerActions;

const initialState: ImageViewerState = {
  openImage: null,
  zoomLevel: 1,
};

export const useImageViewerStore = create<ImageViewerStore>((set, get) => ({
  ...initialState,

  openImageViewer: (projectSlug, path) => {
    set({
      openImage: { type: 'file', projectSlug, path },
      zoomLevel: 1,
    });
  },

  openImageViewerUrls: (images, index) => {
    if (images.length === 0) return;
    const clamped = Math.max(0, Math.min(index, images.length - 1));
    set({
      openImage: { type: 'urls', images, currentIndex: clamped },
      zoomLevel: 1,
    });
  },

  closeViewer: () => {
    set(initialState);
  },

  setZoom: (zoom) => {
    set({ zoomLevel: Math.max(0.1, Math.min(10, zoom)) });
  },

  zoomBy: (delta) => {
    set((s) => ({ zoomLevel: Math.max(0.1, Math.min(10, s.zoomLevel + delta)) }));
  },

  resetView: () => {
    set({ zoomLevel: 1 });
  },

  goNext: () => {
    const { openImage } = get();
    if (openImage?.type !== 'urls' || openImage.images.length < 2) return;
    const nextIndex =
      openImage.currentIndex < openImage.images.length - 1
        ? openImage.currentIndex + 1
        : 0;
    set({
      openImage: { ...openImage, currentIndex: nextIndex },
      zoomLevel: 1,
    });
  },

  goPrev: () => {
    const { openImage } = get();
    if (openImage?.type !== 'urls' || openImage.images.length < 2) return;
    const prevIndex =
      openImage.currentIndex > 0
        ? openImage.currentIndex - 1
        : openImage.images.length - 1;
    set({
      openImage: { ...openImage, currentIndex: prevIndex },
      zoomLevel: 1,
    });
  },
}));
