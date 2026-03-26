import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BranchPagination } from '../BranchPagination';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'branch.prev': 'Previous branch',
        'branch.next': 'Next branch',
      };
      if (key === 'branch.indicator' && opts) {
        return `Branch ${opts.current} of ${opts.total}`;
      }
      return translations[key] || key;
    },
  }),
}));

describe('BranchPagination', () => {
  const defaultProps = {
    messageId: 'msg-1',
    total: 3,
    current: 1,
    onNavigate: vi.fn(),
  };

  it('renders pagination with correct indicator', () => {
    render(<BranchPagination {...defaultProps} />);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('does not render when total is 1', () => {
    const { container } = render(
      <BranchPagination {...defaultProps} total={1} current={0} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('disables prev button on first page', () => {
    render(<BranchPagination {...defaultProps} current={0} />);

    const prevButton = screen.getByLabelText('Previous branch');
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<BranchPagination {...defaultProps} current={2} />);

    const nextButton = screen.getByLabelText('Next branch');
    expect(nextButton).toBeDisabled();
  });

  it('calls onNavigate with prev direction', () => {
    const onNavigate = vi.fn();
    render(<BranchPagination {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByLabelText('Previous branch'));
    expect(onNavigate).toHaveBeenCalledWith('msg-1', 'prev');
  });

  it('calls onNavigate with next direction', () => {
    const onNavigate = vi.fn();
    render(<BranchPagination {...defaultProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByLabelText('Next branch'));
    expect(onNavigate).toHaveBeenCalledWith('msg-1', 'next');
  });

  it('does not call onNavigate when prev is disabled', () => {
    const onNavigate = vi.fn();
    render(<BranchPagination {...defaultProps} current={0} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByLabelText('Previous branch'));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('supports keyboard navigation with ArrowLeft', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BranchPagination {...defaultProps} onNavigate={onNavigate} />,
    );

    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: 'ArrowLeft' });
    expect(onNavigate).toHaveBeenCalledWith('msg-1', 'prev');
  });

  it('supports keyboard navigation with ArrowRight', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <BranchPagination {...defaultProps} onNavigate={onNavigate} />,
    );

    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith('msg-1', 'next');
  });

  it('has correct aria attributes on indicator', () => {
    render(<BranchPagination {...defaultProps} />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-live', 'polite');
    expect(indicator).toHaveAttribute('aria-label', 'Branch 2 of 3');
  });
});
