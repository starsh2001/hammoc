/**
 * ImageViewerModal - Full-size image viewer overlay
 * Story 27.2: Portal-based modal with keyboard navigation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ImageRef } from '@hammoc/shared';

interface ImageViewerModalProps {
  images: ImageRef[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageViewerModal({ images, initialIndex, onClose }: ImageViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const triggerRef = useRef<Element | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Capture trigger element on mount, restore focus on unmount
  useEffect(() => {
    triggerRef.current = document.activeElement;
    containerRef.current?.focus();
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  }, [images.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        handlePrev();
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        handleNext();
      }
      // Trap tab focus within modal
      if (e.key === 'Tab') {
        e.preventDefault();
      }
    },
    [onClose, handlePrev, handleNext, images.length],
  );

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Image viewer"
      tabIndex={-1}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Left arrow */}
      {images.length > 1 && (
        <button
          onClick={handlePrev}
          className="absolute left-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          aria-label="Previous image"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {/* Image + caption */}
      <div className="flex flex-col items-center gap-3 max-w-[90vw] max-h-[90vh]">
        <img
          src={currentImage.url}
          alt={currentImage.name}
          className="max-w-[90vw] max-h-[80vh] object-contain rounded"
        />
        <span className="text-white/80 text-sm">
          {currentImage.name}
          {images.length > 1 && ` (${currentIndex + 1}/${images.length})`}
        </span>
      </div>

      {/* Right arrow */}
      {images.length > 1 && (
        <button
          onClick={handleNext}
          className="absolute right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          aria-label="Next image"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
    </div>,
    document.body,
  );
}
