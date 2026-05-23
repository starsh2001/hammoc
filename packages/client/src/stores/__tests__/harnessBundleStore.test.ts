/**
 * Story 30.6 (Task B.3): harnessBundleStore tests.
 *
 * 10 cases cover the actions that drive the dialogs:
 *   - `openExport` prefetches plugin deps + opens the dialog
 *   - `setSecretsPolicy` resets the ack flag when leaving included-explicit
 *   - `executeExport` passes ack flag only for included-explicit
 *   - `executeExport` rolls back `isExporting` on failure
 *   - `loadImportPreview` populates default actions + advances to preview
 *   - `loadImportPreview` returns to `select` step on failure
 *   - `setItemAction` patches a single key without touching the others
 *   - `applyBulkAction('overwrite')` sets every item to overwrite
 *   - `applyBulkAction('addOnly')` only flips `new` items to overwrite
 *   - `close()` resets every field — bundleToken / preview / actions all gone
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  BundleManifest,
  BundlePluginRef,
  ImportApplySummary,
  ImportPreviewResponse,
} from '@hammoc/shared';

vi.mock('../../services/api/harnessBundleApi', () => ({
  exportBundle: vi.fn(),
  fetchPluginDeps: vi.fn(),
  importPreview: vi.fn(),
  importApply: vi.fn(),
}));

import {
  exportBundle,
  fetchPluginDeps,
  importApply,
  importPreview,
} from '../../services/api/harnessBundleApi';
import { useHarnessBundleStore } from '../harnessBundleStore';

const mockedExport = vi.mocked(exportBundle);
const mockedFetchPluginDeps = vi.mocked(fetchPluginDeps);
const mockedImportPreview = vi.mocked(importPreview);
const mockedImportApply = vi.mocked(importApply);

function samplePluginDeps(): BundlePluginRef[] {
  return [{ name: 'demo-plugin', marketplace: 'official', version: '1.0.0' }];
}

function sampleManifest(): BundleManifest {
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
  };
}

function samplePreview(): ImportPreviewResponse {
  return {
    bundleToken: 'token-abc-123',
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
  };
}

function sampleApplySummary(): ImportApplySummary {
  return {
    applied: 1,
    skipped: 2,
    renamed: 0,
    results: [],
  };
}

beforeEach(() => {
  useHarnessBundleStore.getState().close();
  mockedExport.mockReset();
  mockedFetchPluginDeps.mockReset();
  mockedImportPreview.mockReset();
  mockedImportApply.mockReset();
  // jsdom does not implement URL.createObjectURL — stub it so the anchor
  // download path can run without throwing.
  if (!('createObjectURL' in URL)) {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
      'blob:stub';
  }
  if (!('revokeObjectURL' in URL)) {
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openExport', () => {
  it('opens the dialog and prefetches plugin deps', async () => {
    mockedFetchPluginDeps.mockResolvedValue({ pluginDependencies: samplePluginDeps() });
    await useHarnessBundleStore.getState().openExport('demo');
    const s = useHarnessBundleStore.getState();
    expect(s.exportDialogOpen).toBe(true);
    expect(mockedFetchPluginDeps).toHaveBeenCalledWith('demo');
    expect(s.exportPluginDeps).toEqual(samplePluginDeps());
    expect(s.exportConfig.secretsPolicy).toBe('excluded');
    expect(s.exportConfig.acknowledgedSecretInclusion).toBe(false);
  });
});

describe('setSecretsPolicy', () => {
  it('resets the ack flag when switching back from included-explicit', () => {
    useHarnessBundleStore.getState().setSecretsPolicy('included-explicit');
    useHarnessBundleStore.getState().setAcknowledgedSecretInclusion(true);
    expect(useHarnessBundleStore.getState().exportConfig.acknowledgedSecretInclusion).toBe(true);

    useHarnessBundleStore.getState().setSecretsPolicy('excluded');
    expect(useHarnessBundleStore.getState().exportConfig.acknowledgedSecretInclusion).toBe(false);
  });
});

describe('executeExport', () => {
  it('forwards acknowledgedSecretInclusion only when policy is included-explicit', async () => {
    mockedExport.mockResolvedValue({
      blob: new Blob(['zip-bytes']),
      filename: 'demo.WITH-SECRETS.zip',
    });
    useHarnessBundleStore.getState().setSecretsPolicy('included-explicit');
    useHarnessBundleStore.getState().setAcknowledgedSecretInclusion(true);

    await useHarnessBundleStore.getState().executeExport('demo');
    expect(mockedExport).toHaveBeenCalledWith(
      expect.objectContaining({
        projectSlug: 'demo',
        secretsPolicy: 'included-explicit',
        acknowledgedSecretInclusion: true,
      }),
    );
    const s = useHarnessBundleStore.getState();
    expect(s.isExporting).toBe(false);
    expect(s.lastExportSuccess).toEqual({
      filename: 'demo.WITH-SECRETS.zip',
      hadPlaintextSecrets: true,
    });
  });

  it('omits acknowledgedSecretInclusion for excluded / placeholder policies', async () => {
    mockedExport.mockResolvedValue({
      blob: new Blob(['zip-bytes']),
      filename: 'demo.zip',
    });
    await useHarnessBundleStore.getState().executeExport('demo');
    expect(mockedExport).toHaveBeenCalledWith(
      expect.objectContaining({
        secretsPolicy: 'excluded',
        acknowledgedSecretInclusion: undefined,
      }),
    );
  });

  it('rolls back isExporting and records the error on failure', async () => {
    mockedExport.mockRejectedValue(new Error('500 internal'));
    await expect(useHarnessBundleStore.getState().executeExport('demo')).rejects.toThrow('500');
    const s = useHarnessBundleStore.getState();
    expect(s.isExporting).toBe(false);
    expect(s.error).toContain('500');
  });
});

describe('loadImportPreview', () => {
  it('populates default item actions and advances to preview step', async () => {
    mockedImportPreview.mockResolvedValue(samplePreview());
    const file = new File(['zip'], 'bundle.zip', { type: 'application/zip' });
    await useHarnessBundleStore.getState().loadImportPreview('demo', file);
    const s = useHarnessBundleStore.getState();
    expect(s.importStep).toBe('preview');
    expect(s.importPreviewResponse?.bundleToken).toBe('token-abc-123');
    expect(s.importItemActions['skill:new-skill']).toBe('overwrite');
    expect(s.importItemActions['skill:conflict-skill']).toBe('skip');
    expect(s.importItemActions['claude-md:CLAUDE.md']).toBe('skip');
  });

  it('returns to the select step and records the error on failure', async () => {
    mockedImportPreview.mockRejectedValue(new Error('bad zip'));
    const file = new File(['zip'], 'bundle.zip', { type: 'application/zip' });
    await expect(
      useHarnessBundleStore.getState().loadImportPreview('demo', file),
    ).rejects.toThrow('bad zip');
    const s = useHarnessBundleStore.getState();
    expect(s.importStep).toBe('select');
    expect(s.error).toContain('bad zip');
  });
});

describe('setItemAction / applyBulkAction', () => {
  it('setItemAction patches one key without touching the others', async () => {
    mockedImportPreview.mockResolvedValue(samplePreview());
    await useHarnessBundleStore
      .getState()
      .loadImportPreview('demo', new File(['zip'], 'b.zip'));
    useHarnessBundleStore.getState().setItemAction('skill:new-skill', 'rename');
    const map = useHarnessBundleStore.getState().importItemActions;
    expect(map['skill:new-skill']).toBe('rename');
    expect(map['skill:conflict-skill']).toBe('skip');
  });

  it('applyBulkAction("overwrite") flips every non-same item to overwrite', async () => {
    mockedImportPreview.mockResolvedValue(samplePreview());
    await useHarnessBundleStore
      .getState()
      .loadImportPreview('demo', new File(['zip'], 'b.zip'));
    useHarnessBundleStore.getState().applyBulkAction('overwrite');
    const map = useHarnessBundleStore.getState().importItemActions;
    expect(map['skill:new-skill']).toBe('overwrite');
    expect(map['skill:conflict-skill']).toBe('overwrite');
    // `same` items stay `skip` — overwrite-on-equal-bytes is a no-op anyway.
    expect(map['claude-md:CLAUDE.md']).toBe('skip');
  });

  it('applyBulkAction("addOnly") only flips `new` items to overwrite', async () => {
    mockedImportPreview.mockResolvedValue(samplePreview());
    await useHarnessBundleStore
      .getState()
      .loadImportPreview('demo', new File(['zip'], 'b.zip'));
    useHarnessBundleStore.getState().applyBulkAction('addOnly');
    const map = useHarnessBundleStore.getState().importItemActions;
    expect(map['skill:new-skill']).toBe('overwrite');
    expect(map['skill:conflict-skill']).toBe('skip');
    expect(map['claude-md:CLAUDE.md']).toBe('skip');
  });
});

describe('executeImport + close', () => {
  it('echoes the bundleToken from the preview response into the apply call', async () => {
    mockedImportPreview.mockResolvedValue(samplePreview());
    mockedImportApply.mockResolvedValue(sampleApplySummary());
    await useHarnessBundleStore
      .getState()
      .loadImportPreview('demo', new File(['zip'], 'b.zip'));
    await useHarnessBundleStore.getState().executeImport('demo');
    expect(mockedImportApply).toHaveBeenCalledWith(
      expect.objectContaining({
        projectSlug: 'demo',
        bundleToken: 'token-abc-123',
      }),
    );
    const s = useHarnessBundleStore.getState();
    expect(s.isImporting).toBe(false);
    expect(s.lastImportSummary?.applied).toBe(1);
  });

  it('close() resets every field — bundleToken, preview, actions all gone', async () => {
    mockedImportPreview.mockResolvedValue(samplePreview());
    await useHarnessBundleStore
      .getState()
      .loadImportPreview('demo', new File(['zip'], 'b.zip'));
    useHarnessBundleStore.getState().acknowledgeImport();
    useHarnessBundleStore.getState().setSecretsPolicy('included-explicit');

    useHarnessBundleStore.getState().close();
    const s = useHarnessBundleStore.getState();
    expect(s.exportDialogOpen).toBe(false);
    expect(s.importDialogOpen).toBe(false);
    expect(s.importPreviewResponse).toBeNull();
    expect(s.importItemActions).toEqual({});
    expect(s.importAcknowledged).toBe(false);
    expect(s.exportConfig.secretsPolicy).toBe('excluded');
    expect(s.exportConfig.acknowledgedSecretInclusion).toBe(false);
  });
});
