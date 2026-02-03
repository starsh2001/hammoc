/**
 * ErrorState Tests
 * [Source: Story 3.4 - Task 4]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorState } from '../ErrorState';

describe('ErrorState', () => {
  describe('not_found error', () => {
    it('renders not_found error with back button', () => {
      const onNavigateBack = vi.fn();
      render(<ErrorState errorType="not_found" onNavigateBack={onNavigateBack} />);

      expect(screen.getByText('프로젝트를 찾을 수 없습니다')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /돌아가기/i })).toBeInTheDocument();
    });

    it('calls onNavigateBack when back button clicked', () => {
      const onNavigateBack = vi.fn();
      render(<ErrorState errorType="not_found" onNavigateBack={onNavigateBack} />);

      fireEvent.click(screen.getByRole('button', { name: /돌아가기/i }));
      expect(onNavigateBack).toHaveBeenCalled();
    });

    it('does not show retry button for not_found', () => {
      render(<ErrorState errorType="not_found" onRetry={vi.fn()} />);

      expect(screen.queryByRole('button', { name: /다시 시도/i })).not.toBeInTheDocument();
    });
  });

  describe('network error', () => {
    it('renders network error with retry button', () => {
      const onRetry = vi.fn();
      render(<ErrorState errorType="network" onRetry={onRetry} />);

      expect(screen.getByText('네트워크 연결 오류')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /다시 시도/i })).toBeInTheDocument();
    });

    it('calls onRetry when retry button clicked', () => {
      const onRetry = vi.fn();
      render(<ErrorState errorType="network" onRetry={onRetry} />);

      fireEvent.click(screen.getByRole('button', { name: /다시 시도/i }));
      expect(onRetry).toHaveBeenCalled();
    });

    it('shows description about checking internet connection', () => {
      render(<ErrorState errorType="network" />);

      expect(screen.getByText(/인터넷 연결을 확인/)).toBeInTheDocument();
    });
  });

  describe('server error', () => {
    it('renders server error with retry button', () => {
      const onRetry = vi.fn();
      render(<ErrorState errorType="server" onRetry={onRetry} />);

      expect(screen.getByText('서버 오류')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /다시 시도/i })).toBeInTheDocument();
    });

    it('shows description about server issue', () => {
      render(<ErrorState errorType="server" />);

      expect(screen.getByText(/서버에 문제가 발생/)).toBeInTheDocument();
    });
  });

  describe('unknown error', () => {
    it('renders unknown error with retry button', () => {
      const onRetry = vi.fn();
      render(<ErrorState errorType="unknown" onRetry={onRetry} />);

      expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /다시 시도/i })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has accessible role="alert"', () => {
      render(<ErrorState errorType="network" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('hides decorative icon from screen readers', () => {
      render(<ErrorState errorType="network" />);

      const alertElement = screen.getByRole('alert');
      const svg = alertElement.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('has focusable buttons for keyboard navigation', () => {
      const onRetry = vi.fn();
      render(<ErrorState errorType="network" onRetry={onRetry} />);

      const retryButton = screen.getByRole('button', { name: /다시 시도/i });
      retryButton.focus();
      expect(document.activeElement).toBe(retryButton);
    });
  });

  describe('button visibility', () => {
    it('hides back button when onNavigateBack not provided', () => {
      render(<ErrorState errorType="not_found" />);

      expect(screen.queryByRole('button', { name: /돌아가기/i })).not.toBeInTheDocument();
    });

    it('hides retry button when onRetry not provided', () => {
      render(<ErrorState errorType="network" />);

      expect(screen.queryByRole('button', { name: /다시 시도/i })).not.toBeInTheDocument();
    });
  });
});
