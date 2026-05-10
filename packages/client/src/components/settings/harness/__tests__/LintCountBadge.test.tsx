/**
 * Story 30.2 (Task 5.8): LintCountBadge tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LintCountBadge } from '../LintCountBadge';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, unknown>) =>
        vars ? `${key}:${JSON.stringify(vars)}` : key,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

describe('LintCountBadge', () => {
  it('renders nothing when both counts are zero', () => {
    const { container } = render(<LintCountBadge errorCount={0} warnCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders amber when only warnings are present', () => {
    render(<LintCountBadge errorCount={0} warnCount={3} />);
    const el = screen.getByTestId('lint-count-badge-warn');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('amber');
  });

  it('renders red when errors are present, regardless of warn count', () => {
    render(<LintCountBadge errorCount={1} warnCount={5} />);
    const el = screen.getByTestId('lint-count-badge-error');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('red');
    expect(el.dataset.errorCount).toBe('1');
    expect(el.dataset.warnCount).toBe('5');
  });

  it('invokes onClick when supplied', () => {
    const onClick = vi.fn();
    render(<LintCountBadge errorCount={2} warnCount={0} onClick={onClick} />);
    fireEvent.click(screen.getByTestId('lint-count-badge-error'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
