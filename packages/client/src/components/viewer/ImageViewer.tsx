/**
 * ImageViewer Component
 * Fullscreen overlay image viewer with zoom and pan
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon, X, ZoomIn, ZoomOut, RotateCcw, Loader2 } from 'lucide-react';

import { useImageViewerStore } from '../../stores/imageViewerStore';
import { usePanelStore } from '../../stores/panelStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useOverlayBackHandler } from '../../hooks/useOverlayBackHandler';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

export function ImageViewer() {
  const { openImage, zoomLevel, closeViewer, setZoom, resetView } = useImageViewerStore();

  const { t } = useTranslation('common');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const lastOpenRef = useRef<{ projectSlug: string; path: string } | null>(null);

  // Panel-aware positioning (same pattern as TextEditor)
  const isMobile = useIsMobile();
  const activePanel = usePanelStore((s) => s.activePanel);
  const panelWidth = usePanelStore((s) => s.panelWidth);
  const MIN_CONTENT_WIDTH = 480;
  const [windowWidth, setWindowWidth] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const panelOverlay = isMobile || (activePanel !== null && windowWidth - panelWidth < MIN_CONTENT_WIDTH);
  const viewerRight = !panelOverlay && activePanel ? panelWidth : 0;

  const handleClose = useCallback(() => {
    closeViewer();
  }, [closeViewer]);

  // Track last opened image for reopen via forward navigation
  useEffect(() => {
    if (openImage) {
      lastOpenRef.current = { ...openImage };
    }
  }, [openImage]);

  const handleReopen = useCallback(() => {
    if (lastOpenRef.current) {
      useImageViewerStore.getState().openImageViewer(
        lastOpenRef.current.projectSlug,
        lastOpenRef.current.path,
      );
    }
  }, []);

  useOverlayBackHandler(!!openImage, handleClose, handleReopen);

  // Reset state when a new image opens
  useEffect(() => {
    if (openImage) {
      setIsLoading(true);
      setHasError(false);
      setPosition({ x: 0, y: 0 });
    }
  }, [openImage]);

  // Escape to close
  useEffect(() => {
    if (!openImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openImage, handleClose]);

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
      setZoom(zoomLevel + delta);
    },
    [zoomLevel, setZoom],
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

  const filePath = openImage.path;
  const fileName = filePath.includes('/') ? filePath.split('/').pop() : filePath;
  const imageUrl = `/api/projects/${openImage.projectSlug}/fs/raw?path=${encodeURIComponent(filePath)}`;
  const zoomPercent = Math.round(zoomLevel * 100);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[55] transition-[right] duration-300 ease-in-out"
        style={{ right: viewerRight }}
        onClick={handleClose}
      />

      {/* Viewer Panel */}
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-gray-900 transition-[right] duration-300 ease-in-out"
        style={{ right: viewerRight }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span className="truncate text-sm font-mono text-gray-700 dark:text-gray-300">
              {filePath}
            </span>
          </div>
          <div className="flex items-center gap-1 ml-3">
            {/* Zoom controls */}
            <button
              onClick={() => setZoom(zoomLevel - ZOOM_STEP)}
              disabled={zoomLevel <= MIN_ZOOM}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40"
              title={t('imageViewer.zoomOut')}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-center tabular-nums">
              {zoomPercent}%
            </span>
            <button
              onClick={() => setZoom(zoomLevel + ZOOM_STEP)}
              disabled={zoomLevel >= MAX_ZOOM}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-40"
              title={t('imageViewer.zoomIn')}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetView}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title={t('imageViewer.resetZoom')}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
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
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('imageViewer.loadingImage')}
              </span>
            </div>
          )}

          {hasError ? (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <ImageIcon className="w-12 h-12 opacity-50" />
              <p className="text-sm">{t('imageViewer.loadFailed')}</p>
              <p className="text-xs text-gray-400">{fileName}</p>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={fileName}
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
