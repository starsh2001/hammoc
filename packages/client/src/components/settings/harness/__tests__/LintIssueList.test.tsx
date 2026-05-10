/**
 * Story 30.2 (Task 5.8): LintIssueList tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LintIssue } from '@hammoc/shared';
import { LintIssueList } from '../LintIssueList';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

function issue(overrides: Partial<LintIssue> = {}): LintIssue {
  return {
    ruleId: 'mcp/url-invalid',
    severity: 'error',
    cardScope: 'project',
    cardName: 'remote',
    cardDomain: 'mcp',
    location: { kind: 'path', path: ['mcpServers', 'remote', 'url'] },
    messageI18nKey: 'harness.tools.lint.rule.mcpUrlInvalid.message',
    ...overrides,
  };
}

describe('LintIssueList', () => {
  it('shows the empty state when no issues are passed', () => {
    render(<LintIssueList issues={[]} onActivate={() => {}} />);
    expect(screen.getByTestId('lint-issue-list-empty')).toBeInTheDocument();
  });

  it('renders one row per issue', () => {
    render(
      <LintIssueList
        issues={[
          issue({ ruleId: 'mcp/url-invalid', cardName: 'remote' }),
          issue({ ruleId: 'mcp/command-not-on-path', severity: 'warn', cardName: 'github' }),
        ]}
        onActivate={() => {}}
      />,
    );
    expect(screen.getAllByTestId('lint-issue-row')).toHaveLength(2);
  });

  it('invokes onActivate with the clicked row issue', () => {
    const onActivate = vi.fn();
    const target = issue({ cardName: 'remote' });
    render(<LintIssueList issues={[target]} onActivate={onActivate} />);
    fireEvent.click(screen.getByTestId('lint-issue-row'));
    expect(onActivate).toHaveBeenCalledWith(target);
  });

  it('surfaces the server-PATH notice and a disable CTA on mcp/command-not-on-path rows (AC3.a/c)', () => {
    const onOpenRulePreferences = vi.fn();
    const target = issue({
      ruleId: 'mcp/command-not-on-path',
      severity: 'warn',
      cardName: 'github',
      messageI18nKey: 'harness.tools.lint.rule.mcpCommandNotOnPath.message',
    });
    render(
      <LintIssueList
        issues={[target]}
        onActivate={() => {}}
        onOpenRulePreferences={onOpenRulePreferences}
      />,
    );
    expect(screen.getByTestId('lint-issue-row-server-path-notice')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lint-issue-row-disable-cta'));
    expect(onOpenRulePreferences).toHaveBeenCalledWith('mcp/command-not-on-path');
  });

  it('does not render the disable CTA for non-environment-sensitive rules', () => {
    const onOpenRulePreferences = vi.fn();
    render(
      <LintIssueList
        issues={[issue({ ruleId: 'mcp/url-invalid' })]}
        onActivate={() => {}}
        onOpenRulePreferences={onOpenRulePreferences}
      />,
    );
    expect(screen.queryByTestId('lint-issue-row-server-path-notice')).toBeNull();
    expect(screen.queryByTestId('lint-issue-row-disable-cta')).toBeNull();
  });
});
