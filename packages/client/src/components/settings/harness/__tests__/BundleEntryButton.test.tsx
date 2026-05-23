/**
 * Story 30.6 (Task C.4): BundleEntryButton tests.
 *
 * 3 cases:
 *   1. Menu toggle — clicking the trigger opens / re-clicking closes
 *   2. Export menu item → store.openExport; Import → store.openImport
 *   3. The menu uses absolute positioning so it floats over siblings instead
 *      of pushing them on narrow viewports. Real mobile-viewport wrap
 *      behaviour is verified by Story 30.8's Playwright integration tests;
 *      this case only guards the layout class against accidental removal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BundleEntryButton } from '../BundleEntryButton';
import { useHarnessBundleStore } from '../../../../stores/harnessBundleStore';

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

vi.mock('../../../../services/api/harnessBundleApi', () => ({
  exportBundle: vi.fn(),
  fetchPluginDeps: vi.fn().mockResolvedValue({ pluginDependencies: [] }),
  importPreview: vi.fn(),
  importApply: vi.fn(),
}));

beforeEach(() => {
  useHarnessBundleStore.getState().close();
});

describe('BundleEntryButton', () => {
  it('toggles the menu on trigger click', () => {
    render(<BundleEntryButton projectSlug="demo" />);
    expect(screen.queryByTestId('bundle-entry-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bundle-entry-trigger'));
    expect(screen.getByTestId('bundle-entry-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bundle-entry-trigger'));
    expect(screen.queryByTestId('bundle-entry-menu')).not.toBeInTheDocument();
  });

  it('Export menu item calls openExport(projectSlug); Import calls openImport()', () => {
    const openExport = vi.fn();
    const openImport = vi.fn();
    useHarnessBundleStore.setState({ openExport, openImport });
    render(<BundleEntryButton projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-entry-trigger'));
    fireEvent.click(screen.getByTestId('bundle-entry-export'));
    expect(openExport).toHaveBeenCalledWith('demo');

    fireEvent.click(screen.getByTestId('bundle-entry-trigger'));
    fireEvent.click(screen.getByTestId('bundle-entry-import'));
    expect(openImport).toHaveBeenCalledTimes(1);
  });

  it('menu uses absolute positioning so it floats over siblings', () => {
    // Truth-in-test-naming: jsdom can't simulate a real mobile viewport, so
    // this case only verifies the layout class that *enables* wrap behaviour.
    // End-to-end viewport regression coverage belongs to Story 30.8's
    // Playwright integration tests.
    render(<BundleEntryButton projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-entry-trigger'));
    const menu = screen.getByTestId('bundle-entry-menu');
    expect(menu.className).toContain('absolute');
  });
});
