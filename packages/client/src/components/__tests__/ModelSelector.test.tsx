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
      if (key === 'effort.label') return 'Effort';
      if (key === 'effort.tooltipFull.low') return 'Low';
      if (key === 'effort.tooltipFull.medium') return 'Medium';
      if (key === 'effort.tooltipFull.high') return 'High';
      if (key === 'effort.tooltipFull.max') return 'Max';
      if (key === 'effort.low') return 'Lo';
      if (key === 'effort.medium') return 'Med';
      if (key === 'effort.high') return 'Hi';
      if (key === 'effort.max') return 'Max';
      if (key === 'effort.default') return 'Default';
      if (key === 'effort.maxOpusOnly') return 'Max is available for Opus 4.6 only';
      if (key === 'effort.maxSubscriberOnly') return 'Max is not available for Claude.ai subscribers';
      if (key === 'effort.maxUnavailable') return 'Max N/A';
      if (key === 'effort.selectorAria' && params) return `Thinking effort: ${params.level}`;
      if (key === 'effort.groupAria') return 'Effort';
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

  describe('effort intensity bar', () => {
    it('renders 3 effort bars when dropdown is open and Max is unavailable', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort={undefined} onEffortChange={onEffortChange} />
      );

      // Open dropdown
      fireEvent.click(screen.getByRole('button', { name: /Model/i }));

      // Check 3 radio buttons are rendered (Low, Med, High)
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(3);
    });

    it('renders 4 effort bars when model is Opus 4.6', () => {
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
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(4);
    });

    it('does not render effort bars when onEffortChange is not provided', () => {
      render(<ModelSelector {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));

      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    });

    it('calls onEffortChange with effort level on click', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort={undefined} onEffortChange={onEffortChange} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));

      // Click the third bar (high)
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[2]);

      expect(onEffortChange).toHaveBeenCalledWith('high');
    });

    it('calls onEffortChange with undefined when clicking already-selected effort (toggle off)', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort="high" onEffortChange={onEffortChange} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));

      // Click the third bar (high) which is already selected
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[2]);

      expect(onEffortChange).toHaveBeenCalledWith(undefined);
    });

    it('keeps dropdown open after effort bar click', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector {...defaultProps} effort={undefined} onEffortChange={onEffortChange} />
      );

      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[1]); // click Medium

      // Dropdown should still be open (model list should still be visible)
      expect(screen.getByRole('listbox')).toBeInTheDocument();
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

    it('shows model + default effort label in tooltip when effort is undefined', () => {
      render(
        <ModelSelector
          {...defaultProps}
          effort={undefined}
          onEffortChange={vi.fn()}
        />
      );

      const triggerButton = screen.getByRole('button', { name: /Model/i });
      expect(triggerButton).toHaveAttribute('title', 'Default · Default (High)');
    });
  });
});
