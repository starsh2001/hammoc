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
  RotateCcw,
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
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

export function ImageViewer() {
  const {
    openImage,
    zoomLevel,
    closeViewer,
    setZoom: _setZoom,
    zoomBy,
    resetView,
    goNext,
    goPrev,
  } = useImageViewerStore();

  const { t } = useTranslation('common');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const lastOpenRef = useRef<OpenImageState>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Reset state when a new image opens or index changes
  useEffect(() => {
    if (imageKey) {
      setIsLoading(true);
      setHasError(false);
      setPosition({ x: 0, y: 0 });
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

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      zoomBy(delta);
    },
    [zoomBy],
  );

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

  const handleResetView = useCallback(() => {
    resetView();
    setPosition({ x: 0, y: 0 });
  }, [resetView]);

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
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={zoomLevel <= MIN_ZOOM}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300 disabled:opacity-40"
              title={t('imageViewer.zoomOut')}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-300 w-12 text-center tabular-nums">
              {zoomPercent}%
            </span>
            <button
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoomLevel >= MAX_ZOOM}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300 disabled:opacity-40"
              title={t('imageViewer.zoomIn')}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#253040] text-gray-500 dark:text-gray-300"
              title={t('imageViewer.resetZoom')}
            >
              <RotateCcw className="w-4 h-4" />
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
              onLoad={() => setIsLoading(false)}
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
