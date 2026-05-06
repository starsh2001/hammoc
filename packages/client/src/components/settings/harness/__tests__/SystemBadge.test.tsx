/**
 * Story 29.2: SystemBadge component tests.
 *
 * Covers:
 *  - hammoc variant renders the indigo color cluster + i18n label
 *  - claudeCode variant renders the amber color cluster + i18n label
 *  - explicit `label` prop overrides the i18n default
 *  - data-variant attribute exposes the variant for downstream selectors
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object' && opts.defaultValue) {
          return String(opts.defaultValue);
        }
        return key;
      },
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

import { SystemBadge } from '../SystemBadge';

describe('SystemBadge', () => {
  it('renders the hammoc variant with the indigo color cluster', () => {
    render(<SystemBadge variant="hammoc" />);
    const el = screen.getByTestId('system-badge-hammoc');
    expect(el.textContent).toBe('Snippets (Hammoc)');
    expect(el.className).toMatch(/indigo/);
    expect(el.getAttribute('data-variant')).toBe('hammoc');
  });

  it('renders the claudeCode variant with the amber color cluster', () => {
    render(<SystemBadge variant="claudeCode" />);
    const el = screen.getByTestId('system-badge-claudeCode');
    expect(el.textContent).toBe('Command Favorites (Claude Code)');
    expect(el.className).toMatch(/amber/);
  });

  it('honors the explicit label prop over the i18n default', () => {
    render(<SystemBadge variant="hammoc" label="Custom" />);
    expect(screen.getByTestId('system-badge-hammoc').textContent).toBe('Custom');
  });

  it('appends extra className from props', () => {
    render(<SystemBadge variant="claudeCode" className="extra-class" />);
    expect(screen.getByTestId('system-badge-claudeCode').className).toMatch(/extra-class/);
  });
});
