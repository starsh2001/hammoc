/**
 * Story 30.6 (Task C.4): BundleExportDialog tests.
 *
 * 7 cases enumerated per Story 30.6 AC2-UI:
 *   1. Section checkbox toggle syncs store.exportConfig.includes
 *   2. policy=excluded → no ack checkbox, export button enabled
 *   3. policy=placeholder → no ack checkbox, export button enabled
 *   4. policy=included-explicit → ack checkbox + filename notice rendered
 *   5. policy=included-explicit + unchecked → export button disabled
 *      (AC2-UI.b-2 security regression guard)
 *   6. Export click calls executeExport + fires the 5s toast on success
 *      (AC2-UI.b-3 — included-explicit only)
 *   7. close+reopen → policy resets to excluded + ack resets to false
 *      (AC2-UI.c)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { toast } from 'sonner';
import { BundleExportDialog } from '../BundleExportDialog';
import { useHarnessBundleStore } from '../../../../stores/harnessBundleStore';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && 'defaultValue' in opts) return (opts as { defaultValue: string }).defaultValue;
        if (opts && Object.keys(opts).length > 0) {
          return `${key}|${JSON.stringify(opts)}`;
        }
        return key;
      },
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

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

import { exportBundle } from '../../../../services/api/harnessBundleApi';
const mockedExportBundle = vi.mocked(exportBundle);
const mockedToast = vi.mocked(toast);

function openDialog() {
  // Seed the store as if openExport just resolved — the dialog is then
  // mounted and visible.
  useHarnessBundleStore.setState({
    exportDialogOpen: true,
    exportPluginDeps: [],
  });
}

beforeEach(() => {
  useHarnessBundleStore.getState().close();
  mockedExportBundle.mockReset();
  mockedToast.mockReset();
  mockedToast.success.mockReset();
  // jsdom polyfill — required so the download anchor path can run.
  if (!('createObjectURL' in URL)) {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
      'blob:stub';
  }
  if (!('revokeObjectURL' in URL)) {
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  }
});

describe('BundleExportDialog', () => {
  it('1. section checkbox toggle syncs store.exportConfig.includes', () => {
    openDialog();
    render(<BundleExportDialog projectSlug="demo" />);
    const cb = screen.getByTestId('bundle-export-section-skills') as HTMLInputElement;
    expect(cb.checked).toBe(true); // default — all sections included
    fireEvent.click(cb);
    expect(useHarnessBundleStore.getState().exportConfig.includes).not.toContain('skills');
    fireEvent.click(cb);
    expect(useHarnessBundleStore.getState().exportConfig.includes).toContain('skills');
  });

  it('2. policy=excluded shows no ack checkbox and export button is enabled', () => {
    openDialog();
    render(<BundleExportDialog projectSlug="demo" />);
    const submit = screen.getByTestId('bundle-export-submit') as HTMLButtonElement;
    expect(screen.queryByTestId('bundle-export-ack')).not.toBeInTheDocument();
    expect(submit.disabled).toBe(false);
  });

  it('3. policy=placeholder shows no ack checkbox and export button is enabled', () => {
    openDialog();
    render(<BundleExportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-export-policy-placeholder'));
    const submit = screen.getByTestId('bundle-export-submit') as HTMLButtonElement;
    expect(screen.queryByTestId('bundle-export-ack')).not.toBeInTheDocument();
    expect(submit.disabled).toBe(false);
  });

  it('4. policy=included-explicit shows the ack checkbox and the WITH-SECRETS filename notice', () => {
    openDialog();
    render(<BundleExportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-export-policy-included-explicit'));
    expect(screen.getByTestId('bundle-export-included-explicit-block')).toBeInTheDocument();
    expect(screen.getByTestId('bundle-export-ack')).toBeInTheDocument();
    // The filename notice references the WITH-SECRETS suffix via its i18n key,
    // which the mock returns verbatim.
    expect(
      screen.getByText(/includedExplicitFilenameNotice/),
    ).toBeInTheDocument();
  });

  it('5. included-explicit + ack unchecked disables the export button (security regression guard)', () => {
    openDialog();
    render(<BundleExportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-export-policy-included-explicit'));
    const submit = screen.getByTestId('bundle-export-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // Check the ack box → button enables.
    fireEvent.click(screen.getByTestId('bundle-export-ack'));
    expect(submit.disabled).toBe(false);
  });

  it('6. clicking export calls executeExport and fires the 5s included-explicit toast on success', async () => {
    openDialog();
    mockedExportBundle.mockResolvedValue({
      blob: new Blob(['zip']),
      filename: 'demo.WITH-SECRETS.zip',
    });
    render(<BundleExportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-export-policy-included-explicit'));
    fireEvent.click(screen.getByTestId('bundle-export-ack'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('bundle-export-submit'));
    });
    expect(mockedExportBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        projectSlug: 'demo',
        secretsPolicy: 'included-explicit',
        acknowledgedSecretInclusion: true,
      }),
    );
    expect(mockedToast).toHaveBeenCalledWith(
      expect.stringContaining('includedExplicitDownloadToast'),
      expect.objectContaining({ duration: 5000 }),
    );
  });

  it('7. close+reopen resets policy=excluded and acknowledgedSecretInclusion=false', () => {
    openDialog();
    render(<BundleExportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-export-policy-included-explicit'));
    fireEvent.click(screen.getByTestId('bundle-export-ack'));
    expect(useHarnessBundleStore.getState().exportConfig.secretsPolicy).toBe(
      'included-explicit',
    );

    // Simulate close → reopen via the store actions the dialog uses. The
    // close() reset causes a re-render that React expects inside act().
    act(() => {
      useHarnessBundleStore.getState().close();
      openDialog();
    });
    const s = useHarnessBundleStore.getState();
    expect(s.exportConfig.secretsPolicy).toBe('excluded');
    expect(s.exportConfig.acknowledgedSecretInclusion).toBe(false);
  });
});
