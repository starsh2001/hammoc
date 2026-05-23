/**
 * Story 30.6 (Task C.4): BundleImportDialog tests.
 *
 * 14 cases enumerated per Story 30.6 AC3 / AC4-UI / AC5-UI:
 *   1. 4-step wizard step transitions are driven by importStep
 *   2. compatibility=future shows the future-bundle block + blocks preview
 *   3. compatibility=invalid shows the invalid-bundle block
 *   4. compatibility=malformed shows the malformed-manifest block with
 *      expandable Zod detail
 *   5. manifest.secretsPolicy=included-explicit fires the incoming acknowledge
 *      modal (AC3.g security regression guard)
 *   6. per-item action selectbox change syncs importItemActions
 *   7. bulk "overwrite" flips every non-same item to overwrite
 *   8. bulk "skip" flips every item to skip
 *   9. missingPlugins > 0 renders the red banner + per-plugin install CTA
 *   10. CLAUDE.md domain selectbox shows appendSection; other domains do not
 *   11. unknownSections > 0 renders the warning banner with each section name
 *       (AC5-UI.b regression guard — added by Story 30.6 QA-fix pass)
 *   12. bulk "addOnly" flips new items to overwrite, leaves others as skip
 *       (AC3.c regression guard — added by Story 30.6 QA-fix pass)
 *   13a. apply rejection without a count fires the `applyAbort` toast
 *   13b. apply rejection with `details.appliedBeforeRollback` fires
 *        `applyPartialRollback` with the count interpolated
 *        (cases 13a/13b together cover AC3.f regression guard — added by
 *        Story 30.6 QA-fix pass)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { toast } from 'sonner';
import type {
  BundleManifest,
  BundlePluginRef,
  ImportPreviewResponse,
} from '@hammoc/shared';
import { BundleImportDialog } from '../BundleImportDialog';
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
  fetchPluginDeps: vi.fn(),
  importPreview: vi.fn(),
  importApply: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockedToast = vi.mocked(toast);

function sampleManifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    bundleVersion: 1,
    hammocVersion: '1.5.0',
    claudeCodeSpecVersion: null,
    createdAt: '2026-05-23T14:00:00.000Z',
    sourceProjectSlug: 'demo',
    includes: ['claude-md', 'skills'],
    secretsPolicy: 'excluded',
    pluginDependencies: [],
    items: [],
    ...overrides,
  };
}

function samplePreviewResponse(
  overrides: Partial<ImportPreviewResponse> = {},
): ImportPreviewResponse {
  return {
    bundleToken: 'token-abc',
    manifest: sampleManifest(),
    preview: {
      items: [
        {
          domain: 'skill',
          identity: 'new-skill',
          status: 'new',
          defaultAction: 'overwrite',
          targetPath: '.claude/skills/new-skill/SKILL.md',
        },
        {
          domain: 'skill',
          identity: 'conflict-skill',
          status: 'overwrite',
          defaultAction: 'skip',
          targetPath: '.claude/skills/conflict-skill/SKILL.md',
        },
        {
          domain: 'claude-md',
          identity: 'CLAUDE.md',
          status: 'same',
          defaultAction: 'skip',
          targetPath: 'CLAUDE.md',
        },
      ],
      missingPlugins: [],
      unknownSections: [],
    },
    compatibility: 'compatible',
    ...overrides,
  };
}

function seedPreviewStep(preview: ImportPreviewResponse) {
  const itemActions: Record<string, import('@hammoc/shared').ImportItemAction> = {};
  for (const item of preview.preview.items) {
    itemActions[`${item.domain}:${item.identity}`] = item.defaultAction;
  }
  useHarnessBundleStore.setState({
    importDialogOpen: true,
    importStep: 'preview',
    importPreviewResponse: preview,
    importItemActions: itemActions,
    importAcknowledged: preview.manifest.secretsPolicy !== 'included-explicit',
  });
}

beforeEach(() => {
  useHarnessBundleStore.getState().close();
  mockedToast.mockReset();
  mockedToast.success.mockReset();
});

describe('BundleImportDialog', () => {
  it('1. wizard step transitions are driven by importStep (select → scanning → preview → applying)', () => {
    // select
    useHarnessBundleStore.setState({ importDialogOpen: true, importStep: 'select' });
    const { rerender } = render(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-file-input')).toBeInTheDocument();

    // scanning
    act(() => useHarnessBundleStore.setState({ importStep: 'scanning' }));
    rerender(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-scanning')).toBeInTheDocument();

    // preview
    act(() => seedPreviewStep(samplePreviewResponse()));
    rerender(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-preview-body')).toBeInTheDocument();

    // applying
    act(() => useHarnessBundleStore.setState({ importStep: 'applying' }));
    rerender(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-applying')).toBeInTheDocument();
  });

  it('2. compatibility=future blocks the preview and renders the future-bundle block', () => {
    seedPreviewStep(
      samplePreviewResponse({
        compatibility: 'future',
        compatibilityDetail: { bundleVersion: 2 },
      }),
    );
    render(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-compat-future')).toBeInTheDocument();
    expect(screen.queryByTestId('bundle-import-preview-body')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bundle-import-apply')).not.toBeInTheDocument();
  });

  it('3. compatibility=invalid renders the invalid-bundle block', () => {
    seedPreviewStep(samplePreviewResponse({ compatibility: 'invalid' }));
    render(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-compat-invalid')).toBeInTheDocument();
  });

  it('4. compatibility=malformed renders the malformed block with an expandable Zod detail', () => {
    seedPreviewStep(
      samplePreviewResponse({
        compatibility: 'malformed',
        compatibilityDetail: {
          issues: [{ path: ['manifest', 'bundleVersion'], message: 'required' }],
        },
      }),
    );
    const { container } = render(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-compat-malformed')).toBeInTheDocument();
    expect(container.querySelector('details')).not.toBeNull();
  });

  it('5. manifest.secretsPolicy=included-explicit fires the incoming acknowledge modal', () => {
    seedPreviewStep(
      samplePreviewResponse({
        manifest: sampleManifest({ secretsPolicy: 'included-explicit' }),
      }),
    );
    // The seed helper above only sets importAcknowledged=true when the
    // bundle's policy is NOT included-explicit, so the ack block must show.
    render(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-incoming-ack')).toBeInTheDocument();
    // Apply button is hidden until the user acknowledges.
    expect(screen.queryByTestId('bundle-import-apply')).not.toBeInTheDocument();
  });

  it('6. per-item action selectbox change syncs importItemActions', () => {
    seedPreviewStep(samplePreviewResponse());
    render(<BundleImportDialog projectSlug="demo" />);
    const sel = screen.getByTestId('bundle-import-action-skill:new-skill') as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'rename' } });
    expect(useHarnessBundleStore.getState().importItemActions['skill:new-skill']).toBe('rename');
    expect(useHarnessBundleStore.getState().importItemActions['skill:conflict-skill']).toBe('skip');
  });

  it('7. bulk overwrite flips every non-same item to overwrite (same stays skip)', () => {
    seedPreviewStep(samplePreviewResponse());
    render(<BundleImportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-import-bulk-overwrite'));
    const map = useHarnessBundleStore.getState().importItemActions;
    expect(map['skill:new-skill']).toBe('overwrite');
    expect(map['skill:conflict-skill']).toBe('overwrite');
    expect(map['claude-md:CLAUDE.md']).toBe('skip');
  });

  it('8. bulk skip flips every item to skip', () => {
    seedPreviewStep(samplePreviewResponse());
    render(<BundleImportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-import-bulk-skip'));
    const map = useHarnessBundleStore.getState().importItemActions;
    expect(map['skill:new-skill']).toBe('skip');
    expect(map['skill:conflict-skill']).toBe('skip');
    expect(map['claude-md:CLAUDE.md']).toBe('skip');
  });

  it('9. missingPlugins > 0 renders the red banner with per-plugin install CTAs', () => {
    const missing: BundlePluginRef[] = [
      { name: 'github-mcp', marketplace: 'official' },
      { name: 'slack-mcp', marketplace: 'community' },
    ];
    seedPreviewStep(
      samplePreviewResponse({
        preview: {
          items: [],
          missingPlugins: missing,
          unknownSections: [],
        },
        manifest: sampleManifest({ pluginDependencies: missing }),
      }),
    );
    render(<BundleImportDialog projectSlug="demo" />);
    expect(screen.getByTestId('bundle-import-missing-plugins')).toBeInTheDocument();
    expect(screen.getByTestId('bundle-import-install-github-mcp')).toBeInTheDocument();
    expect(screen.getByTestId('bundle-import-install-slack-mcp')).toBeInTheDocument();
    // Clicking install fires a fallback toast — Story 30.6 AC4-UI.c.
    fireEvent.click(screen.getByTestId('bundle-import-install-github-mcp'));
    expect(mockedToast).toHaveBeenCalledWith(
      expect.stringContaining('installFallbackToast'),
    );
  });

  it('10. CLAUDE.md domain selectbox shows appendSection; non-CLAUDE.md domains do not', () => {
    seedPreviewStep(samplePreviewResponse());
    render(<BundleImportDialog projectSlug="demo" />);
    const claudeSel = screen.getByTestId(
      'bundle-import-action-claude-md:CLAUDE.md',
    ) as HTMLSelectElement;
    const claudeValues = Array.from(claudeSel.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(claudeValues).toContain('appendSection');

    const skillSel = screen.getByTestId(
      'bundle-import-action-skill:new-skill',
    ) as HTMLSelectElement;
    const skillValues = Array.from(skillSel.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(skillValues).not.toContain('appendSection');
  });

  it('11. unknownSections > 0 renders the warning banner listing each section', () => {
    seedPreviewStep(
      samplePreviewResponse({
        preview: {
          items: [],
          missingPlugins: [],
          unknownSections: ['mystery-section', 'another-unknown'],
        },
      }),
    );
    render(<BundleImportDialog projectSlug="demo" />);
    const banner = screen.getByTestId('bundle-import-unknown-sections');
    expect(banner).toBeInTheDocument();
    // The component interpolates each section name into the
    // `compat.unknownSectionWarning` key; the test's i18n stub appends the
    // interpolation payload as JSON so we can assert both names landed in
    // separate paragraphs.
    expect(banner.textContent).toContain('mystery-section');
    expect(banner.textContent).toContain('another-unknown');
  });

  it('12. bulk addOnly flips new items to overwrite and leaves the rest as skip', () => {
    seedPreviewStep(samplePreviewResponse());
    render(<BundleImportDialog projectSlug="demo" />);
    fireEvent.click(screen.getByTestId('bundle-import-bulk-addonly'));
    const map = useHarnessBundleStore.getState().importItemActions;
    // `new` → overwrite (= add); `overwrite`/`same` stay as skip so nothing
    // existing on disk gets touched.
    expect(map['skill:new-skill']).toBe('overwrite');
    expect(map['skill:conflict-skill']).toBe('skip');
    expect(map['claude-md:CLAUDE.md']).toBe('skip');
  });

  it('13a. apply rejection without a count fires the applyAbort toast', async () => {
    const abortReject = vi.fn().mockRejectedValue(new Error('apply failed'));
    seedPreviewStep(samplePreviewResponse());
    useHarnessBundleStore.setState({ executeImport: abortReject });
    render(<BundleImportDialog projectSlug="demo" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bundle-import-apply'));
      // Two microtask flushes: one for the rejected mock, one for the catch
      // handler's toast call inside the dialog component.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedToast.error).toHaveBeenCalledWith(
      'harness.tools.bundle.importPreview.applyAbort',
    );
  });

  it('13b. apply rejection with details.appliedBeforeRollback fires applyPartialRollback with the count', async () => {
    const partialError = Object.assign(new Error('partial apply failed'), {
      details: { appliedBeforeRollback: 3 },
    });
    const partialReject = vi.fn().mockRejectedValue(partialError);
    seedPreviewStep(samplePreviewResponse());
    useHarnessBundleStore.setState({ executeImport: partialReject });
    render(<BundleImportDialog projectSlug="demo" />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('bundle-import-apply'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockedToast.error).toHaveBeenCalledWith(
      expect.stringContaining('applyPartialRollback'),
    );
    expect(mockedToast.error).toHaveBeenCalledWith(
      expect.stringContaining('"count":3'),
    );
  });
});
