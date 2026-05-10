/**
 * Story 30.1 (Task 4.5): ModeBanner tests.
 *
 * Covers Mode A vs Mode B rendering, the Mode B export CTA callback wiring,
 * and the Story 30.3-not-yet-merged fallback (window.alert with the
 * `exportFallbackToast` key).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeBanner } from '../ModeBanner';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

describe('ModeBanner', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('renders the Mode A banner without an export CTA', () => {
    render(<ModeBanner mode="A" />);
    expect(screen.getByTestId('mode-banner-A')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-banner-export-cta')).not.toBeInTheDocument();
  });

  it('renders the Mode B banner WITH an export CTA', () => {
    render(<ModeBanner mode="B" />);
    expect(screen.getByTestId('mode-banner-B')).toBeInTheDocument();
    expect(screen.getByTestId('mode-banner-export-cta')).toBeInTheDocument();
  });

  it('does not render anything when mode is unknown', () => {
    const { container } = render(<ModeBanner mode="unknown" />);
    expect(container.firstChild).toBeNull();
  });

  it('invokes onExportClick when provided', () => {
    const onExportClick = vi.fn();
    render(<ModeBanner mode="B" onExportClick={onExportClick} />);
    fireEvent.click(screen.getByTestId('mode-banner-export-cta'));
    expect(onExportClick).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('falls back to a toast/alert when Story 30.3 export trigger is undefined', () => {
    render(<ModeBanner mode="B" />);
    fireEvent.click(screen.getByTestId('mode-banner-export-cta'));
    expect(alertSpy).toHaveBeenCalledWith('harness.tools.modeBanner.exportFallbackToast');
  });
});
