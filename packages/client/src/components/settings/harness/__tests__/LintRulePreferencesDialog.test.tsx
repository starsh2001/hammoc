/**
 * Story 30.2 (Task 5.8): LintRulePreferencesDialog tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { LINT_RULE_DEFAULTS, LINT_RULE_IDS } from '@hammoc/shared';
import { LintRulePreferencesDialog } from '../LintRulePreferencesDialog';
import { useHarnessLintStore } from '../../../../stores/harnessLintStore';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

beforeEach(() => {
  useHarnessLintStore.getState().reset();
  // Seed the store with the canonical defaults so the dialog has something
  // to render against.
  useHarnessLintStore.setState({ rulePreferences: { ...LINT_RULE_DEFAULTS } });
});

describe('LintRulePreferencesDialog', () => {
  it('renders 7 toggles when open', () => {
    render(<LintRulePreferencesDialog open={true} onClose={() => {}} />);
    expect(screen.getByTestId('lint-rule-prefs-dialog')).toBeInTheDocument();
    for (const id of LINT_RULE_IDS) {
      expect(screen.getByTestId(`lint-rule-toggle-${id}`)).toBeInTheDocument();
    }
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <LintRulePreferencesDialog open={false} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('clicking close fires onClose', () => {
    const onClose = vi.fn();
    render(<LintRulePreferencesDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('lint-rule-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggling a checkbox calls store.toggleRule with the new value', async () => {
    const toggleSpy = vi.fn().mockResolvedValue(undefined);
    useHarnessLintStore.setState({ toggleRule: toggleSpy });
    render(<LintRulePreferencesDialog open={true} onClose={() => {}} />);

    const cb = screen.getByTestId('lint-rule-toggle-mcp/command-not-on-path') as HTMLInputElement;
    expect(cb.checked).toBe(false); // default OFF
    // Wrap in act() so the busyRule setState updates triggered by the
    // optimistic toggle path settle before the test moves on, silencing the
    // React act() warning surfaced in earlier QA gate review.
    await act(async () => {
      fireEvent.click(cb);
    });
    expect(toggleSpy).toHaveBeenCalledWith('mcp/command-not-on-path', true);
  });
});
