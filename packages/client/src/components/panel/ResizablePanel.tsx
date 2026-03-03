/**
 * ResizableHandle - Drag handle for resizing the quick panel width
 * File named ResizablePanel.tsx per architecture docs, exports ResizableHandle.
 * [Source: Story 19.3 - Task 3]
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePanelStore } from '../../stores/panelStore';

interface ResizableHandleProps {
  /** Current panel width (px) — for ARIA valuenow */
  width: number;
  /** Width change callback — called on drag/keyboard input */
  onWidthChange: (width: number) => void;
  /** Minimum width (default: 280px) */
  minWidth?: number;
  /** Maximum width ratio (default: 0.6 = 60% of screen) */
  maxWidthRatio?: number;
}

function ResizableHandle({
  width,
  onWidthChange,
  minWidth = 280,
  maxWidthRatio = 0.6,
}: ResizableHandleProps) {
  const { t } = useTranslation('common');
  // Refs — no re-render needed for drag tracking values
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  // State — visual feedback during drag (className change requires re-render)
  const [isDraggingState, setIsDraggingState] = useState(false);

  const maxWidth = Math.floor(window.innerWidth * maxWidthRatio);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    setIsDraggingState(true);
    usePanelStore.getState().setIsDragging(true);
  }, [width]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging.current) return;

    // Panel is on the right side, so dragging LEFT increases width
    const deltaX = startX.current - e.clientX;
    const currentMaxWidth = Math.floor(window.innerWidth * maxWidthRatio);
    const newWidth = Math.min(
      Math.max(startWidth.current + deltaX, minWidth),
      currentMaxWidth
    );
    onWidthChange(newWidth);
  }, [onWidthChange, minWidth, maxWidthRatio]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);
    usePanelStore.getState().setIsDragging(false);
  }, []);

  // Document-level event listeners for stable drag tracking
  useEffect(() => {
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  // Keyboard accessibility (WAI-ARIA separator pattern)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 50 : 10;
    const currentMaxWidth = Math.floor(window.innerWidth * maxWidthRatio);

    switch (e.key) {
      case 'ArrowLeft': // Increase width (panel is on right)
        e.preventDefault();
        onWidthChange(Math.min(width + step, currentMaxWidth));
        break;
      case 'ArrowRight': // Decrease width
        e.preventDefault();
        onWidthChange(Math.max(width - step, minWidth));
        break;
      case 'Home':
        e.preventDefault();
        onWidthChange(minWidth);
        break;
      case 'End':
        e.preventDefault();
        onWidthChange(currentMaxWidth);
        break;
    }
  }, [width, onWidthChange, minWidth, maxWidthRatio]);

  // Prevent text selection and override cursor during drag
  useEffect(() => {
    if (isDraggingState) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingState]);

  return (
    <div
      data-testid="panel-resize-handle"
      className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10
                  hover:bg-blue-500/50 active:bg-blue-500/70
                  transition-colors duration-150
                  ${isDraggingState ? 'bg-blue-500/70' : 'bg-transparent'}`}
      onPointerDown={handlePointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('panel.resizeHandle')}
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    />
  );
}

export { ResizableHandle };
