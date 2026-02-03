import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChecklistItem } from '../ChecklistItem';
import { OnboardingChecklistItem } from '../../../types/onboarding';

// Mock clipboard API
const mockWriteText = vi.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// Mock window.isSecureContext
Object.defineProperty(window, 'isSecureContext', {
  value: true,
  writable: true,
});

describe('ChecklistItem', () => {
  const baseItem: OnboardingChecklistItem = {
    id: 'test-item',
    label: 'Test Item',
    status: 'incomplete',
    description: 'Test description',
    command: 'npm install test',
  };

  beforeEach(() => {
    mockWriteText.mockClear();
    mockWriteText.mockResolvedValue(undefined);
  });

  it('should render complete status with check icon', () => {
    const item: OnboardingChecklistItem = { ...baseItem, status: 'complete' };
    render(<ChecklistItem item={item} />);

    expect(screen.getByText('Test Item')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      'Test Item: 완료됨'
    );
  });

  it('should render incomplete status with X icon', () => {
    const item: OnboardingChecklistItem = { ...baseItem, status: 'incomplete' };
    render(<ChecklistItem item={item} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      'Test Item: 미완료'
    );
  });

  it('should render optional status with circle icon', () => {
    const item: OnboardingChecklistItem = { ...baseItem, status: 'optional' };
    render(<ChecklistItem item={item} />);

    expect(screen.getByRole('listitem')).toHaveAttribute(
      'aria-label',
      'Test Item: 선택 사항'
    );
  });

  it('should display description when provided', () => {
    render(<ChecklistItem item={baseItem} />);

    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('should show command only when status is not complete', () => {
    render(<ChecklistItem item={baseItem} />);

    expect(screen.getByText('npm install test')).toBeInTheDocument();
  });

  it('should not show command when status is complete', () => {
    const item: OnboardingChecklistItem = { ...baseItem, status: 'complete' };
    render(<ChecklistItem item={item} />);

    expect(screen.queryByText('npm install test')).not.toBeInTheDocument();
  });

  it('should show optional badge when isOptional is true', () => {
    const item: OnboardingChecklistItem = { ...baseItem, isOptional: true };
    render(<ChecklistItem item={item} />);

    expect(screen.getByText('선택')).toBeInTheDocument();
  });

  it('should copy command to clipboard when copy button is clicked', async () => {
    const onCopySuccess = vi.fn();
    render(<ChecklistItem item={baseItem} onCopySuccess={onCopySuccess} />);

    const copyButton = screen.getByRole('button', { name: '명령어 복사' });
    fireEvent.click(copyButton);

    await vi.waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('npm install test');
    });

    expect(onCopySuccess).toHaveBeenCalled();
  });

  it('should call onCopyError when clipboard write fails', async () => {
    mockWriteText.mockRejectedValue(new Error('Copy failed'));
    const onCopyError = vi.fn();

    render(<ChecklistItem item={baseItem} onCopyError={onCopyError} />);

    const copyButton = screen.getByRole('button', { name: '명령어 복사' });
    fireEvent.click(copyButton);

    await vi.waitFor(() => {
      expect(onCopyError).toHaveBeenCalled();
    });
  });

  it('should have proper aria-label for copy button', () => {
    render(<ChecklistItem item={baseItem} />);

    const copyButton = screen.getByRole('button', { name: '명령어 복사' });
    expect(copyButton).toBeInTheDocument();
  });

  it('should render listitem role for accessibility', () => {
    render(<ChecklistItem item={baseItem} />);

    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });
});
