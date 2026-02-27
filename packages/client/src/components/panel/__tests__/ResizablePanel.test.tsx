/**
 * ResizableHandle Component Tests
 * [Source: Story 19.3 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResizableHandle } from '../ResizablePanel';

// PointerEvent polyfill for jsdom (which only supports MouseEvent)
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
    }
  };
}

// Mock panelStore
vi.mock('../../../stores/panelStore', () => ({
  usePanelStore: Object.assign(
    () => ({}),
    {
      getState: () => ({
        setIsDragging: vi.fn(),
      }),
    }
  ),
}));

describe('ResizableHandle', () => {
  const defaultProps = {
    width: 320,
    onWidthChange: vi.fn(),
    minWidth: 280,
    maxWidthRatio: 0.6,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
  });

  // TC-RH-1: Renders resize handle
  it('should render resize handle with correct testid', () => {
    render(<ResizableHandle {...defaultProps} />);
    expect(screen.getByTestId('panel-resize-handle')).toBeInTheDocument();
  });

  // TC-RH-2: Has role="separator" and aria-orientation
  it('should have role="separator" and aria-orientation="vertical"', () => {
    render(<ResizableHandle {...defaultProps} />);
    const handle = screen.getByTestId('panel-resize-handle');
    expect(handle).toHaveAttribute('role', 'separator');
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
  });

  // TC-RH-3: Has cursor-col-resize class
  it('should have cursor-col-resize class', () => {
    render(<ResizableHandle {...defaultProps} />);
    expect(screen.getByTestId('panel-resize-handle')).toHaveClass('cursor-col-resize');
  });

  // TC-RH-4: ARIA attributes match props
  it('should have correct aria-valuenow, aria-valuemin, aria-valuemax', () => {
    render(<ResizableHandle {...defaultProps} />);
    const handle = screen.getByTestId('panel-resize-handle');
    expect(handle).toHaveAttribute('aria-valuenow', '320');
    expect(handle).toHaveAttribute('aria-valuemin', '280');
    // maxWidth = floor(1024 * 0.6) = 614
    expect(handle).toHaveAttribute('aria-valuemax', '614');
  });

  // TC-RH-5: ArrowLeft increases width
  it('should increase width on ArrowLeft key', () => {
    render(<ResizableHandle {...defaultProps} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'ArrowLeft' });
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(330); // 320 + 10
  });

  // TC-RH-6: ArrowRight decreases width
  it('should decrease width on ArrowRight key', () => {
    render(<ResizableHandle {...defaultProps} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'ArrowRight' });
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(310); // 320 - 10
  });

  // TC-RH-7: Shift+ArrowLeft increases by 50px
  it('should increase width by 50px on Shift+ArrowLeft', () => {
    render(<ResizableHandle {...defaultProps} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'ArrowLeft', shiftKey: true });
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(370); // 320 + 50
  });

  // TC-RH-8: Home sets to minimum width
  it('should set to minimum width on Home key', () => {
    render(<ResizableHandle {...defaultProps} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'Home' });
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(280);
  });

  // TC-RH-9: End sets to maximum width
  it('should set to maximum width on End key', () => {
    render(<ResizableHandle {...defaultProps} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'End' });
    // maxWidth = floor(1024 * 0.6) = 614
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(614);
  });

  // TC-RH-10: Clamps to minimum width
  it('should clamp to minimum width on ArrowRight', () => {
    render(<ResizableHandle {...defaultProps} width={285} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'ArrowRight' });
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(280); // clamped to min
  });

  // TC-RH-11: Clamps to maximum width
  it('should clamp to maximum width on ArrowLeft', () => {
    render(<ResizableHandle {...defaultProps} width={610} />);
    fireEvent.keyDown(screen.getByTestId('panel-resize-handle'), { key: 'ArrowLeft' });
    // maxWidth = floor(1024 * 0.6) = 614, 610 + 10 = 620 > 614, clamped to 614
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(614);
  });

  // TC-RH-12: Drag — pointerdown + pointermove + pointerup sequence
  it('should call onWidthChange during drag sequence', () => {
    render(<ResizableHandle {...defaultProps} width={320} />);
    const handle = screen.getByTestId('panel-resize-handle');

    // Start drag
    fireEvent.pointerDown(handle, { clientX: 500 });

    // Move left (should increase width since panel is on the right)
    fireEvent(document, new PointerEvent('pointermove', { clientX: 450, bubbles: true }));

    // deltaX = 500 - 450 = 50, newWidth = 320 + 50 = 370
    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(370);

    // End drag
    fireEvent(document, new PointerEvent('pointerup', { bubbles: true }));
  });

  // TC-RH-13: Drag clamps to minWidth
  it('should clamp width to minimum during drag', () => {
    render(<ResizableHandle {...defaultProps} width={300} />);
    const handle = screen.getByTestId('panel-resize-handle');

    fireEvent.pointerDown(handle, { clientX: 500 });
    // Move right by 100px → deltaX = -100, newWidth = 300 + (-100) = 200, clamped to 280
    fireEvent(document, new PointerEvent('pointermove', { clientX: 600, bubbles: true }));

    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(280);

    fireEvent(document, new PointerEvent('pointerup', { bubbles: true }));
  });

  // TC-RH-14: Drag clamps to maxWidth
  it('should clamp width to maximum during drag', () => {
    render(<ResizableHandle {...defaultProps} width={600} />);
    const handle = screen.getByTestId('panel-resize-handle');

    fireEvent.pointerDown(handle, { clientX: 500 });
    // Move left by 200px → deltaX = 200, newWidth = 600 + 200 = 800, clamped to 614
    fireEvent(document, new PointerEvent('pointermove', { clientX: 300, bubbles: true }));

    expect(defaultProps.onWidthChange).toHaveBeenCalledWith(614);

    fireEvent(document, new PointerEvent('pointerup', { bubbles: true }));
  });

  // TC-RH-15: Has tabIndex for keyboard accessibility
  it('should be focusable with tabIndex', () => {
    render(<ResizableHandle {...defaultProps} />);
    const handle = screen.getByTestId('panel-resize-handle');
    expect(handle).toHaveAttribute('tabindex', '0');
  });
});
