/**
 * InputArea Component Tests
 * [Source: Story 4.1 - Task 8]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InputArea } from '../InputArea';

describe('InputArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render with data-testid', () => {
      render(<InputArea />);

      expect(screen.getByTestId('input-area')).toBeInTheDocument();
    });

    it('should render children when provided', () => {
      render(
        <InputArea>
          <input type="text" placeholder="Type here" />
          <button>Send</button>
        </InputArea>
      );

      expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    });

    it('should render placeholder text when no children', () => {
      render(<InputArea />);

      expect(screen.getByText('메시지 입력은 Story 4.2에서 구현됩니다.')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should be rendered as footer element', () => {
      render(<InputArea />);

      const footer = screen.getByTestId('input-area');
      expect(footer.tagName).toBe('FOOTER');
    });

    it('should have aria-label', () => {
      render(<InputArea />);

      expect(screen.getByTestId('input-area')).toHaveAttribute('aria-label', '메시지 입력');
    });
  });

  describe('disabled state', () => {
    it('should apply disabled styles when disabled is true', () => {
      render(<InputArea disabled />);

      const inputArea = screen.getByTestId('input-area');
      expect(inputArea.className).toContain('opacity-50');
      expect(inputArea.className).toContain('pointer-events-none');
    });

    it('should not apply disabled styles when disabled is false', () => {
      render(<InputArea disabled={false} />);

      const inputArea = screen.getByTestId('input-area');
      expect(inputArea.className).not.toContain('opacity-50');
    });
  });

  describe('dark mode', () => {
    it('should have dark mode classes', () => {
      render(<InputArea />);

      const inputArea = screen.getByTestId('input-area');
      expect(inputArea.className).toContain('dark:border-gray-700');
      expect(inputArea.className).toContain('dark:bg-gray-800');
    });
  });

  describe('mobile support', () => {
    it('should have safe-area-inset styles for iOS', () => {
      render(<InputArea />);

      const inputArea = screen.getByTestId('input-area');
      expect(inputArea.className).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]');
    });
  });

  describe('layout', () => {
    it('should be flex-shrink-0 to stay at bottom', () => {
      render(<InputArea />);

      const inputArea = screen.getByTestId('input-area');
      expect(inputArea.className).toContain('flex-shrink-0');
    });

    it('should have border-top', () => {
      render(<InputArea />);

      const inputArea = screen.getByTestId('input-area');
      expect(inputArea.className).toContain('border-t');
    });
  });
});
