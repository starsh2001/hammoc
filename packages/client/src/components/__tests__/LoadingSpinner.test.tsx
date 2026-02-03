/**
 * LoadingSpinner Tests
 * [Source: Story 2.2 - Task 11]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  describe('rendering', () => {
    it('should render with default size', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      expect(spinner.className).toContain('w-6 h-6');
    });

    it('should render with small size', () => {
      render(<LoadingSpinner size="sm" />);

      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('w-4 h-4');
    });

    it('should render with medium size', () => {
      render(<LoadingSpinner size="md" />);

      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('w-6 h-6');
    });

    it('should render with large size', () => {
      render(<LoadingSpinner size="lg" />);

      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('w-8 h-8');
    });
  });

  describe('accessibility', () => {
    it('should have role="status"', () => {
      render(<LoadingSpinner />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have aria-label="Loading"', () => {
      render(<LoadingSpinner />);

      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply custom className', () => {
      render(<LoadingSpinner className="custom-class" />);

      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('custom-class');
    });

    it('should have animation class', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('animate-spin');
    });

    it('should have border classes', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      expect(spinner.className).toContain('border-2');
      expect(spinner.className).toContain('border-gray-300');
      expect(spinner.className).toContain('border-t-blue-500');
    });
  });
});
