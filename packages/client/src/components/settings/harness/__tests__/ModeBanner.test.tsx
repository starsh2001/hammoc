/**
 * Story 30.1 (Task 4.5): ModeBanner tests.
 *
 * Covers Mode A vs Mode B rendering and the Mode B export CTA callback
 * wiring (the CTA is gated on `onExportClick !== null` — Story 30.4).
 */

import { describe, it, expect, vi } from 'vitest';
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
  it('renders the Mode A banner without an export CTA', () => {
    render(<ModeBanner mode="A" onExportClick={null} />);
    expect(screen.getByTestId('mode-banner-A')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-banner-export-cta')).not.toBeInTheDocument();
  });

  it('renders the Mode B banner WITHOUT an export CTA when onExportClick is null', () => {
    render(<ModeBanner mode="B" onExportClick={null} />);
    expect(screen.getByTestId('mode-banner-B')).toBeInTheDocument();
    expect(screen.queryByTestId('mode-banner-export-cta')).not.toBeInTheDocument();
  });

  it('renders the Mode B banner WITH an export CTA when onExportClick is provided', () => {
    render(<ModeBanner mode="B" onExportClick={vi.fn()} />);
    expect(screen.getByTestId('mode-banner-B')).toBeInTheDocument();
    expect(screen.getByTestId('mode-banner-export-cta')).toBeInTheDocument();
  });

  it('does not render anything when mode is unknown', () => {
    const { container } = render(<ModeBanner mode="unknown" onExportClick={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('invokes onExportClick when provided', () => {
    const onExportClick = vi.fn();
    render(<ModeBanner mode="B" onExportClick={onExportClick} />);
    fireEvent.click(screen.getByTestId('mode-banner-export-cta'));
    expect(onExportClick).toHaveBeenCalledTimes(1);
  });
});
