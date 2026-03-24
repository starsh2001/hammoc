/**
 * ModelSelector Tests (Story 26.2)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ModelSelector } from '../ModelSelector';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (key === 'effort.tooltip' && params) return `${params.model} · ${params.effort}`;
      if (key === 'effort.tooltipFull.low') return 'Low';
      if (key === 'effort.tooltipFull.medium') return 'Medium';
      if (key === 'effort.tooltipFull.high') return 'High';
      if (key === 'effort.tooltipFull.max') return 'Max';
      if (key === 'effort.low') return 'Lo';
      if (key === 'effort.medium') return 'Med';
      if (key === 'effort.high') return 'Hi';
      if (key === 'effort.max') return 'Max';
      if (key === 'effort.maxOpusOnly') return 'Max is available for Opus 4.6 only';
      if (key === 'effort.selectorAria' && params) return `Thinking effort: ${params.level}`;
      if (key === 'model.selectorAria' && params) return `Model: ${params.label}`;
      if (key === 'model.selectAria') return 'Select model';
      if (key === 'model.defaultLabel') return 'Default';
      return key;
    },
  }),
}));

describe('ModelSelector', () => {
  const defaultProps = {
    model: '',
    onModelChange: vi.fn(),
    activeModel: null as string | null,
  };

  describe('effort segment control', () => {
    it('renders effort segment control when dropdown is open and onEffortChange is provided', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort={undefined} onEffortChange={onEffortChange} />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button', { name: /Model/i }));

      // Check effort buttons are rendered
      expect(screen.getByText('Lo')).toBeInTheDocument();
      expect(screen.getByText('Med')).toBeInTheDocument();
      expect(screen.getByText('Hi')).toBeInTheDocument();
      expect(screen.getByText('Max')).toBeInTheDocument();
    });

    it('does not render effort segment control when onEffortChange is not provided', () => {
      render(<ModelSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));

      expect(screen.queryByText('Lo')).not.toBeInTheDocument();
    });

    it('calls onEffortChange with effort level on click', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort={undefined} onEffortChange={onEffortChange} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      fireEvent.click(screen.getByText('Hi'));

      expect(onEffortChange).toHaveBeenCalledWith('high');
    });

    it('calls onEffortChange with undefined when clicking already-selected effort (toggle off)', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort="high" onEffortChange={onEffortChange} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      fireEvent.click(screen.getByText('Hi'));

      expect(onEffortChange).toHaveBeenCalledWith(undefined);
    });

    it('keeps dropdown open after effort button click', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort={undefined} onEffortChange={onEffortChange} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      fireEvent.click(screen.getByText('Med'));

      // Dropdown should still be open (model list should still be visible)
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('Max button disabled logic', () => {
    it('disables Max button when activeModel is not Opus 4.6', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector
          {...defaultProps}
          activeModel="claude-sonnet-4-5-20250929"
          effort={undefined}
          onEffortChange={onEffortChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      const maxButton = screen.getByText('Max');

      expect(maxButton).toBeDisabled();
    });

    it('enables Max button when activeModel is claude-opus-4-6', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector
          {...defaultProps}
          activeModel="claude-opus-4-6"
          effort={undefined}
          onEffortChange={onEffortChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      const maxButton = screen.getByText('Max');

      expect(maxButton).not.toBeDisabled();
    });

    it('enables Max button when model is opus alias', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector
          {...defaultProps}
          model="opus"
          effort={undefined}
          onEffortChange={onEffortChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      const maxButton = screen.getByText('Max');

      expect(maxButton).not.toBeDisabled();
    });

    it('enables Max button when activeModel contains opus-4-6', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector
          {...defaultProps}
          activeModel="some-opus-4-6-variant"
          effort={undefined}
          onEffortChange={onEffortChange}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      const maxButton = screen.getByText('Max');

      expect(maxButton).not.toBeDisabled();
    });
  });

  describe('tooltip', () => {
    it('shows model + effort in tooltip when effort is selected', () => {
      render(
        <ModelSelector
          {...defaultProps}
          effort="high"
          onEffortChange={vi.fn()}
        />
      );

      const triggerButton = screen.getByRole('button', { name: /Model/i });
      expect(triggerButton).toHaveAttribute('title', 'Default · High');
    });

    it('shows model only in tooltip when effort is undefined', () => {
      render(
        <ModelSelector
          {...defaultProps}
          effort={undefined}
          onEffortChange={vi.fn()}
        />
      );

      const triggerButton = screen.getByRole('button', { name: /Model/i });
      expect(triggerButton).toHaveAttribute('title', 'Model: Default');
    });
  });
});
