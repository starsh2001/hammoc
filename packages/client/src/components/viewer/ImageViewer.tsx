/**
 * ImageViewer Component
 * Unified fullscreen overlay image viewer with zoom, pan, and multi-image navigation.
 * Handles both file-explorer images (single file by project path) and
 * URL-based image arrays (chat attachments with ← → navigation).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ImageIcon,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  StretchVertical,
  StretchHorizontal,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import type { OpenImageState } from '../../stores/imageViewerStore';
import { useImageViewerStore } from '../../stores/imageViewerStore';
import { usePanelStore } from '../../stores/panelStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useOverlayBackHandler } from '../../hooks/useOverlayBackHandler';

const ZOOM_STEP = 0.25;

type FitMode = 'screen' | 'width' | 'height' | null;

export function ImageViewer() {
  const {
    openImage,
    zoomLevel,
    naturalSize,
    closeViewer,
    setZoom,
    zoomBy,
    setNaturalSize,
    goNext,
    goPrev,
  } = useImageViewerStore();

  const { t } = useTranslation('common');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [fitMode, setFitMode] = useState<FitMode>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const lastOpenRef = useRef<OpenImageState>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageAreaRef = useRef<HTMLDivElement>(null);

  // Panel-aware positioning (same pattern as TextEditor)
  const isMobile = useIsMobile();
  const activePanel = usePanelStore((s) => s.activePanel);
  const panelWidth = usePanelStore((s) => s.panelWidth);
  const panelSide = usePanelStore((s) => s.panelSide);
  const MIN_CONTENT_WIDTH = 480;
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024),
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const panelOverlay =
    isMobile ||
    (activePanel !== null && windowWidth - panelWidth < MIN_CONTENT_WIDTH);
  const viewerInset = !panelOverlay && activePanel ? panelWidth : 0;

  const handleClose = useCallback(() => {
    closeViewer();
  }, [closeViewer]);

  // Track last opened image for reopen via forward navigation
  useEffect(() => {
    if (openImage) {
      lastOpenRef.current = openImage;
    }
  }, [openImage]);

  const handleReopen = useCallback(() => {
    const last = lastOpenRef.current;
    if (!last) return;
    const store = useImageViewerStore.getState();
    if (last.type === 'file') {
      store.openImageViewer(last.projectSlug, last.path);
    } else {
      store.openImageViewerUrls(last.images, last.currentIndex);
    }
  }, []);

  useOverlayBackHandler(!!openImage, handleClose, handleReopen);

  // Derived values
  const isUrlsMode = openImage?.type === 'urls';
  const hasMultipleImages = isUrlsMode && openImage.images.length > 1;

  // Stable key that changes whenever the displayed image changes
  const imageKey = openImage
    ? openImage.type === 'file'
      ? `file:${openImage.projectSlug}:${openImage.path}`
      : `urls:${openImage.images[openImage.currentIndex]?.url ?? openImage.currentIndex}`
    : null;

  // Reset state when a new image opens or index changes.
  // `naturalSize` is owned by the store and already reset there on open/nav.
  useEffect(() => {
    if (imageKey) {
      setIsLoading(true);
      setHasError(false);
      setPosition({ x: 0, y: 0 });
      setFitMode(null);
    }
  }, [imageKey]);

  // Focus container on open for keyboard events
  useEffect(() => {
    if (openImage) {
      containerRef.current?.focus();
    }
  }, [openImage]);

  // Keyboard handler: Escape, arrows, Tab focus cycling
  useEffect(() => {
    if (!openImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        handleClose();
      } else if (e.key === 'ArrowLeft' && hasMultipleImages) {
        goPrev();
      } else if (e.key === 'ArrowRight' && hasMultipleImages) {
        goNext();
      } else if (e.key === 'Tab') {
        // Cycle focus among focusable elements within the dialog
        const container = containerRef.current;
        if (!container) return;
        const focusable = container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        e.preventDefault();
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          (document.activeElement === first ? last : first).focus();
        } else {
          const idx = Array.from(focusable).indexOf(
            document.activeElement as HTMLElement,
          );
          const next = idx >= 0 && idx < focusable.length - 1
            ? focusable[idx + 1]
            : first;
          next.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openImage, handleClose, hasMultipleImages, goNext, goPrev]);

  // Body scroll lock
  useEffect(() => {
    if (!openImage) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [openImage]);

  // Mouse wheel zoom (manual zoom cancels any active fit mode)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      zoomBy(delta);
      setFitMode(null);
    },
    [zoomBy],
  );

  const handleZoomOut = useCallback(() => {
    zoomBy(-ZOOM_STEP);
    setFitMode(null);
  }, [zoomBy]);

  const handleZoomIn = useCallback(() => {
    zoomBy(ZOOM_STEP);
    setFitMode(null);
  }, [zoomBy]);

  // Drag to pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      posStart.current = { ...position };
    },
    [position],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: posStart.current.x + (e.clientX - dragStart.current.x),
        y: posStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Compute a zoom scale for a given fit mode against the current container/image.
  // Returns null when measurements are unavailable.
  const computeFitScale = useCallback(
    (mode: Exclude<FitMode, null>): number | null => {
      const container = imageAreaRef.current;
      if (!container || !naturalSize) return null;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return null;
      const scaleX = cw / naturalSize.w;
      const scaleY = ch / naturalSize.h;
      if (mode === 'screen') return Math.min(scaleX, scaleY);
      if (mode === 'width') return scaleX;
      return scaleY;
    },
    [naturalSize],
  );

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) {
        setNaturalSize({ w, h });
        const container = imageAreaRef.current;
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
          const scaleX = container.clientWidth / w;
          const scaleY = container.clientHeight / h;
          // Initial fit: don't upscale small images beyond 100%
          setZoom(Math.min(scaleX, scaleY, 1));
        }
      }
      setIsLoading(false);
    },
    [setZoom, setNaturalSize],
  );

  const handleZoom100 = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setFitMode(null);
  }, [setZoom]);

  const handleFit = useCallback(
    (mode: Exclude<FitMode, null>) => {
      const scale = computeFitScale(mode);
      if (scale !== null) setZoom(scale);
      setPosition({ x: 0, y: 0 });
      setFitMode(mode);
    },
    [computeFitScale, setZoom],
  );

  // Re-apply active fit mode when the image area resizes (window/panel changes).
  useEffect(() => {
    if (!openImage || fitMode === null) return;
    const container = imageAreaRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const scale = computeFitScale(fitMode);
      if (scale !== null) setZoom(scale);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [openImage, fitMode, computeFitScale, setZoom]);

  if (!openImage) return null;

  // Compute imageUrl and display name based on mode
  let imageUrl: string;
  let displayName: string;
  let displayPath: string;

  if (openImage.type === 'file') {
    const filePath = openImage.path;
    displayPath = filePath;
    displayName = filePath.includes('/') ? filePath.split('/').pop()! : filePath;
    imageUrl = `/api/projects/${openImage.projectSlug}/fs/raw?path=${encodeURIComponent(filePath)}`;
  } else {
    const current = openImage.images[openImage.currentIndex];
    if (!current) {
      closeViewer();
      return null;
    }
    displayName = current.name;
    displayPath = current.name;
    imageUrl = current.url;
  }

  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[55] transition-[left,right] duration-300 ease-in-out"
        style={
          panelSide === 'right'
            ? { right: viewerInset }
            : { left: viewerInset }
        }
        onClick={handleClose}
      />

      {/* Viewer Panel */}
      <div
        ref={containerRef}
        role="dialog"
        aria-label={t('imageViewer.title', 'Image viewer')}
        tabIndex={-1}
        className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-[#1c2129] transition-[left,right] duration-300 ease-in-out outline-none"
        style={
          panelSide === 'right'
            ? { right: viewerInset }
            : { left: viewerInset }
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300 dark:border-[#3a4d5e] bg-gray-50 dark:bg-[#263240]">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-300" />
            <span className="truncate text-sm font-mono text-gray-700 dark:text-gray-200">
              {displayPath}
              {hasMultipleImages &&
                ` (${openImage.currentIndex + 1}/${openImage.images.length})`}
            </span>
          </div>
          <div className="flex items-center gap-1 ml-3">
            {/* Navigation arrows for multi-image */}
            {hasMultipleImages && (
              <>
                <button
                  onClick={goPrev}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
                  aria-label={t('imageViewer.prevImage', 'Previous image')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goNext}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
                  aria-label={t('imageViewer.nextImage', 'Next image')}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-gray-200 dark:bg-[#253040] mx-1" />
              </>
            )}
            {/* Zoom controls */}
            <button
              onClick={handleZoomOut}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
              title={t('imageViewer.zoomOut')}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-300 w-12 text-center tabular-nums">
              {zoomPercent}%
            </span>
            <button
              onClick={handleZoomIn}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
              title={t('imageViewer.zoomIn')}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-[#253040] mx-1" />
            <button
              onClick={handleZoom100}
              disabled={!naturalSize}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300 disabled:opacity-40"
              title={t('imageViewer.zoom100')}
            >
              <span className="text-[10px] font-mono font-semibold">1:1</span>
            </button>
            <button
              onClick={() => handleFit('screen')}
              disabled={!naturalSize}
              aria-pressed={fitMode === 'screen'}
              className={`w-7 h-7 flex items-center justify-center rounded disabled:opacity-40 ${
                fitMode === 'screen'
                  ? 'bg-gray-300 dark:bg-[#3a4d5e] text-gray-800 dark:text-white'
                  : 'hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300'
              }`}
              title={t('imageViewer.fitScreen')}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFit('width')}
              disabled={!naturalSize}
              aria-pressed={fitMode === 'width'}
              className={`w-7 h-7 flex items-center justify-center rounded disabled:opacity-40 ${
                fitMode === 'width'
                  ? 'bg-gray-300 dark:bg-[#3a4d5e] text-gray-800 dark:text-white'
                  : 'hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300'
              }`}
              title={t('imageViewer.fitWidth')}
            >
              <StretchHorizontal className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFit('height')}
              disabled={!naturalSize}
              aria-pressed={fitMode === 'height'}
              className={`w-7 h-7 flex items-center justify-center rounded disabled:opacity-40 ${
                fitMode === 'height'
                  ? 'bg-gray-300 dark:bg-[#3a4d5e] text-gray-800 dark:text-white'
                  : 'hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300'
              }`}
              title={t('imageViewer.fitHeight')}
            >
              <StretchVertical className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-[#253040] mx-1" />
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
              aria-label={t('imageViewer.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Area */}
        <div
          ref={imageAreaRef}
          className={`flex-1 overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-gray-950 ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isLoading && !hasError && (
            <div className="absolute flex items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-300">
                {t('imageViewer.loadingImage')}
              </span>
            </div>
          )}

          {hasError ? (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <ImageIcon className="w-12 h-12 opacity-50" />
              <p className="text-sm">{t('imageViewer.loadFailed')}</p>
              <p className="text-xs text-gray-400">{displayName}</p>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={displayName}
              draggable={false}
              className="select-none transition-opacity duration-200"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
                opacity: isLoading ? 0 : 1,
                maxWidth: 'none',
                maxHeight: 'none',
              }}
              onLoad={handleImageLoad}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
