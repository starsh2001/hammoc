/**
 * Story 30.2 (Task 5.8): LintMarker tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LintIssue } from '@hammoc/shared';
import { LintMarker } from '../LintMarker';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, unknown>) => `${key}${vars ? ':' + JSON.stringify(vars) : ''}`,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

function makeIssue(overrides: Partial<LintIssue> = {}): LintIssue {
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

describe('LintMarker', () => {
  it('renders nothing for an empty issue list', () => {
    const { container } = render(<LintMarker issues={[]} onActivate={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders amber when only warnings are present', () => {
    render(
      <LintMarker
        issues={[makeIssue({ severity: 'warn', ruleId: 'agent/tools-non-standard' })]}
        onActivate={() => {}}
      />,
    );
    expect(screen.getByTestId('lint-marker-warn')).toBeInTheDocument();
  });

  it('prefers red when 1+ errors are present and prioritizes the first error', () => {
    const onActivate = vi.fn();
    const errorIssue = makeIssue({ ruleId: 'mcp/url-invalid', severity: 'error' });
    render(
      <LintMarker
        issues={[
          makeIssue({ severity: 'warn', ruleId: 'mcp/command-not-on-path' }),
          errorIssue,
        ]}
        onActivate={onActivate}
      />,
    );
    const marker = screen.getByTestId('lint-marker-error');
    expect(marker.dataset.errorCount).toBe('1');
    expect(marker.dataset.warnCount).toBe('1');
    fireEvent.click(marker);
    expect(onActivate).toHaveBeenCalledWith(errorIssue);
  });

  it('exposes the issue tooltip via aria-describedby + role="tooltip" for hover/focus parity', () => {
    render(
      <LintMarker
        issues={[makeIssue({ severity: 'error' })]}
        onActivate={() => {}}
      />,
    );
    const marker = screen.getByTestId('lint-marker-error');
    expect(marker.getAttribute('aria-label')).toBeTruthy();
    // AC3.b: rely on a role="tooltip" sibling rather than the HTML `title`
    // attribute (which only fires on hover and is not announced on focus).
    expect(marker.getAttribute('aria-describedby')).toBeTruthy();
    const tooltip = screen.getByTestId('lint-marker-tooltip-error');
    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(tooltip.id).toBe(marker.getAttribute('aria-describedby'));
  });

  it('appends the server-PATH notice for the mcp/command-not-on-path rule (AC3.a)', () => {
    render(
      <LintMarker
        issues={[makeIssue({ severity: 'warn', ruleId: 'mcp/command-not-on-path' })]}
        onActivate={() => {}}
      />,
    );
    const tooltip = screen.getByTestId('lint-marker-tooltip-warn');
    expect(tooltip.textContent).toContain(
      'harness.tools.lint.rule.mcpCommandNotOnPath.serverPathNotice',
    );
  });
});
