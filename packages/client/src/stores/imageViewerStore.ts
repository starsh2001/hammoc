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
export type NaturalSize = { w: number; h: number } | null;

// Pixel-based zoom bounds. The displayed long side is clamped between
// these values so the image is always visible and never absurdly huge.
// If 100% (scale=1) falls outside the range, 100% is still allowed.
const MIN_DISPLAY_PX = 32;
const MAX_DISPLAY_PX = 20000;

function clampZoom(scale: number, naturalSize: NaturalSize): number {
  if (!naturalSize) return scale;
  const longSide = Math.max(naturalSize.w, naturalSize.h);
  if (longSide <= 0) return scale;
  const minScale = Math.min(MIN_DISPLAY_PX / longSide, 1);
  const maxScale = Math.max(MAX_DISPLAY_PX / longSide, 1);
  return Math.max(minScale, Math.min(maxScale, scale));
}

interface ImageViewerState {
  openImage: OpenImageState;
  zoomLevel: number;
  naturalSize: NaturalSize;
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
  setNaturalSize: (size: NaturalSize) => void;
  goNext: () => void;
  goPrev: () => void;
}

type ImageViewerStore = ImageViewerState & ImageViewerActions;

const initialState: ImageViewerState = {
  openImage: null,
  zoomLevel: 1,
  naturalSize: null,
};

export const useImageViewerStore = create<ImageViewerStore>((set, get) => ({
  ...initialState,

  openImageViewer: (projectSlug, path) => {
    set({
      openImage: { type: 'file', projectSlug, path },
      zoomLevel: 1,
      naturalSize: null,
    });
  },

  openImageViewerUrls: (images, index) => {
    if (images.length === 0) return;
    const clamped = Math.max(0, Math.min(index, images.length - 1));
    set({
      openImage: { type: 'urls', images, currentIndex: clamped },
      zoomLevel: 1,
      naturalSize: null,
    });
  },

  closeViewer: () => {
    set(initialState);
  },

  setZoom: (zoom) => {
    set((s) => ({ zoomLevel: clampZoom(zoom, s.naturalSize) }));
  },

  zoomBy: (delta) => {
    set((s) => ({ zoomLevel: clampZoom(s.zoomLevel + delta, s.naturalSize) }));
  },

  resetView: () => {
    set({ zoomLevel: 1 });
  },

  setNaturalSize: (size) => {
    set({ naturalSize: size });
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
      naturalSize: null,
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
      naturalSize: null,
    });
  },
}));
