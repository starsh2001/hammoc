import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toast, ToastContainer } from '../Toast';
import { ToastMessage } from '../../../hooks/useToast';

describe('Toast', () => {
  const baseToast: ToastMessage = {
    id: 'toast-1',
    message: 'Test message',
    type: 'info',
  };

  it('should render toast message', () => {
    const onClose = vi.fn();
    render(<Toast toast={baseToast} onClose={onClose} />);

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('should render success toast with correct styling', () => {
    const toast: ToastMessage = { ...baseToast, type: 'success' };
    const onClose = vi.fn();
    render(<Toast toast={toast} onClose={onClose} />);

    expect(screen.getByRole('alert')).toHaveClass('bg-green-50');
  });

  it('should render error toast with correct styling', () => {
    const toast: ToastMessage = { ...baseToast, type: 'error' };
    const onClose = vi.fn();
    render(<Toast toast={toast} onClose={onClose} />);

    expect(screen.getByRole('alert')).toHaveClass('bg-red-50');
  });

  it('should render info toast with correct styling', () => {
    const onClose = vi.fn();
    render(<Toast toast={baseToast} onClose={onClose} />);

    expect(screen.getByRole('alert')).toHaveClass('bg-blue-50');
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<Toast toast={baseToast} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: '알림 닫기' });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledWith('toast-1');
  });

  it('should have alert role for accessibility', () => {
    const onClose = vi.fn();
    render(<Toast toast={baseToast} onClose={onClose} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should have aria-live polite attribute', () => {
    const onClose = vi.fn();
    render(<Toast toast={baseToast} onClose={onClose} />);

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('ToastContainer', () => {
  const toasts: ToastMessage[] = [
    { id: 'toast-1', message: 'Message 1', type: 'success' },
    { id: 'toast-2', message: 'Message 2', type: 'error' },
    { id: 'toast-3', message: 'Message 3', type: 'info' },
  ];

  it('should render nothing when toasts array is empty', () => {
    const onClose = vi.fn();
    const { container } = render(<ToastContainer toasts={[]} onClose={onClose} />);

    expect(container.firstChild).toBeNull();
  });

  it('should render all toasts', () => {
    const onClose = vi.fn();
    render(<ToastContainer toasts={toasts} onClose={onClose} />);

    expect(screen.getByText('Message 1')).toBeInTheDocument();
    expect(screen.getByText('Message 2')).toBeInTheDocument();
    expect(screen.getByText('Message 3')).toBeInTheDocument();
  });

  it('should call onClose with correct id when toast is closed', () => {
    const onClose = vi.fn();
    render(<ToastContainer toasts={toasts} onClose={onClose} />);

    const closeButtons = screen.getAllByRole('button', { name: '알림 닫기' });
    fireEvent.click(closeButtons[1]);

    expect(onClose).toHaveBeenCalledWith('toast-2');
  });

  it('should have aria-label on container', () => {
    const onClose = vi.fn();
    render(<ToastContainer toasts={toasts} onClose={onClose} />);

    expect(screen.getByLabelText('알림 목록')).toBeInTheDocument();
  });

  it('should be positioned at bottom-right', () => {
    const onClose = vi.fn();
    render(<ToastContainer toasts={toasts} onClose={onClose} />);

    const container = screen.getByLabelText('알림 목록');
    expect(container).toHaveClass('fixed', 'bottom-4', 'right-4');
  });
});
