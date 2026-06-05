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
      if (key === 'effort.tooltipFull.xhigh') return 'XHigh';
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
      if (key === 'model.oneMContext') return '1M context';
      if (key === 'model.oneMIncludedMax') return 'Included with Max';
      if (key === 'model.oneMCreditsWarning') return 'Requires usage credits';
      if (key === 'model.oneMAria') return 'Toggle 1M context window';
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

  describe('effort preservation when model is unknown', () => {
    it('does not auto-clear Max while model and activeModel are both unknown', () => {
      const onEffortChange = vi.fn();
      render(
        <ModelSelector
          {...defaultProps}
          effort="max"
          onEffortChange={onEffortChange}
        />
      );
      expect(onEffortChange).not.toHaveBeenCalled();
    });

    it('clears unsupported effort once activeModel becomes known', () => {
      const onEffortChange = vi.fn();
      const { rerender } = render(
        <ModelSelector
          {...defaultProps}
          effort="max"
          onEffortChange={onEffortChange}
        />
      );
      expect(onEffortChange).not.toHaveBeenCalled();

      rerender(
        <ModelSelector
          {...defaultProps}
          activeModel="claude-haiku-4-5-20251001"
          effort="max"
          onEffortChange={onEffortChange}
        />
      );
      expect(onEffortChange).toHaveBeenCalledWith(undefined);
    });

    it('keeps Max selected when activeModel reports Opus 4.7', () => {
      const onEffortChange = vi.fn();
      const { rerender } = render(
        <ModelSelector
          {...defaultProps}
          effort="max"
          onEffortChange={onEffortChange}
        />
      );
      rerender(
        <ModelSelector
          {...defaultProps}
          activeModel="claude-opus-4-7"
          effort="max"
          onEffortChange={onEffortChange}
        />
      );
      expect(onEffortChange).not.toHaveBeenCalled();
    });

    it('keeps XHigh selected when activeModel reports Opus 4.8', () => {
      const onEffortChange = vi.fn();
      const { rerender } = render(
        <ModelSelector
          {...defaultProps}
          effort="xhigh"
          onEffortChange={onEffortChange}
        />
      );
      rerender(
        <ModelSelector
          {...defaultProps}
          activeModel="claude-opus-4-8"
          effort="xhigh"
          onEffortChange={onEffortChange}
        />
      );
      expect(onEffortChange).not.toHaveBeenCalled();
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

  describe('1M context toggle', () => {
    const renderOpen = (model: string, onModelChange = vi.fn()) => {
      render(<ModelSelector model={model} onModelChange={onModelChange} activeModel={null} />);
      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      return onModelChange;
    };

    it('is hidden for the Default selection', () => {
      renderOpen('');
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('is hidden for non-1M models (Haiku)', () => {
      renderOpen('claude-haiku-4-5-20251001');
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('is ON and locked for Opus (auto-1M, free on Max)', () => {
      const onModelChange = renderOpen('claude-opus-4-8');
      const sw = screen.getByRole('switch');
      expect(sw).toHaveAttribute('aria-checked', 'true');
      expect(sw).toBeDisabled();
      expect(screen.getByText('Included with Max')).toBeInTheDocument();
      fireEvent.click(sw);
      expect(onModelChange).not.toHaveBeenCalled(); // locked → no-op
    });

    it('defaults OFF and editable for Sonnet; opting in appends [1m]', () => {
      const onModelChange = renderOpen('claude-sonnet-4-6');
      const sw = screen.getByRole('switch');
      expect(sw).toHaveAttribute('aria-checked', 'false');
      expect(sw).not.toBeDisabled();
      expect(screen.getByText('Requires usage credits')).toBeInTheDocument();
      fireEvent.click(sw);
      expect(onModelChange).toHaveBeenCalledWith('claude-sonnet-4-6[1m]');
    });

    it('shows ON for an opted-in Sonnet; toggling off strips [1m]', () => {
      const onModelChange = renderOpen('claude-sonnet-4-6[1m]');
      const sw = screen.getByRole('switch');
      expect(sw).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(sw);
      expect(onModelChange).toHaveBeenCalledWith('claude-sonnet-4-6');
    });

    it('normalizes [1m] for the button label and selected-row checkmark', () => {
      render(<ModelSelector model="claude-sonnet-4-6[1m]" onModelChange={vi.fn()} activeModel={null} />);
      // Trigger aria-label uses the bare display name, not the raw `[1m]` value
      expect(screen.getByRole('button', { name: /Model: Sonnet 4\.6/i })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Model/i }));
      // The Sonnet 4.6 option is marked selected despite the `[1m]` suffix
      const option = screen.getByRole('option', { name: /Sonnet 4\.6/i });
      expect(option).toHaveAttribute('aria-selected', 'true');
    });
  });
});
