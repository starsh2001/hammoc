/**
 * ProjectService Settings Tests
 * Story 10.3: Project settings with effective values and null handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import { projectService } from '../projectService.js';
import { preferencesService } from '../preferencesService.js';
import type { UserPreferences } from '@hammoc/shared';

// Spy on fs methods
vi.spyOn(fs, 'readFile');
vi.spyOn(fs, 'writeFile');
vi.spyOn(fs, 'mkdir');

// Mock preferencesService
vi.spyOn(preferencesService, 'getEffectivePreferences');

const mockGlobalPrefs: UserPreferences = {
  defaultModel: 'sonnet',
  permissionMode: 'default',
  theme: 'system',
  chatTimeoutMs: 300000,
};

describe('ProjectService Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue(mockGlobalPrefs);
  });

  describe('readProjectSettings', () => {
    it('returns empty object when settings file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('ENOENT'));
      const result = await projectService.readProjectSettings('/tmp/test-project');
      expect(result).toEqual({});
    });

    it('reads existing settings correctly', async () => {
      const stored = { hidden: true, modelOverride: 'opus' };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(stored));
      const result = await projectService.readProjectSettings('/tmp/test-project');
      expect(result).toEqual(stored);
    });
  });

  describe('writeProjectSettings', () => {
    it('TC-S3: null values delete the corresponding field', async () => {
      const existing = { hidden: false, modelOverride: 'opus', permissionModeOverride: 'plan' as const };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(existing));
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

      await projectService.writeProjectSettings('/tmp/test-project', {
        modelOverride: null,
        hidden: true,
      });

      const writtenData = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      // modelOverride should be removed (null -> delete)
      expect(writtenData.modelOverride).toBeUndefined();
      // hidden should be updated
      expect(writtenData.hidden).toBe(true);
      // permissionModeOverride should remain (not in update request)
      expect(writtenData.permissionModeOverride).toBe('plan');
    });

    it('preserves existing values when field is undefined in update', async () => {
      const existing = { hidden: false, modelOverride: 'opus' };
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(existing));
      vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
      vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined);

      await projectService.writeProjectSettings('/tmp/test-project', {
        hidden: true,
      });

      const writtenData = JSON.parse(vi.mocked(fs.writeFile).mock.calls[0][1] as string);
      expect(writtenData.modelOverride).toBe('opus');
      expect(writtenData.hidden).toBe(true);
    });
  });

  describe('_buildEffectiveResponse', () => {
    it('TC-S1: returns global values as effective when no overrides', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      // Access private method via the public getProjectSettingsWithEffective
      // We'll test through the mock parseSessionsIndex path
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result.effectiveModel).toBe('sonnet');
      expect(result.effectivePermissionMode).toBe('default');
      expect(result._overrides).toEqual([]);
    });

    it('TC-S2: returns overridden values when project has overrides', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        modelOverride: 'opus',
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result.effectiveModel).toBe('opus');
      expect(result.effectivePermissionMode).toBe('default'); // No permission override
      expect(result._overrides).toEqual(['modelOverride']);
    });

    it('TC-S5: _overrides array only includes overridden fields', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        hidden: true,
        permissionModeOverride: 'plan',
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result._overrides).toEqual(['permissionModeOverride']);
      expect(result._overrides).not.toContain('hidden');
      expect(result.effectivePermissionMode).toBe('plan');
    });
  });

  // effectiveEngineMode precedence: per-project override > global > default (Epic 33)
  describe('_buildEffectiveResponse — effectiveEngineMode', () => {
    it('project override cli → effectiveEngineMode cli', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({ engineModeOverride: 'cli' }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result.effectiveEngineMode).toBe('cli');
      expect(result._overrides).toContain('engineModeOverride');
    });

    it('no override + global engineMode cli → effectiveEngineMode cli', async () => {
      vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ ...mockGlobalPrefs, engineMode: 'cli' });
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result.effectiveEngineMode).toBe('cli');
      expect(result._overrides).not.toContain('engineModeOverride');
    });

    it('no override + no global → effectiveEngineMode defaults to sdk', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result.effectiveEngineMode).toBe('sdk');
      expect(result._overrides).not.toContain('engineModeOverride');
    });

    it('project override sdk wins over a global cli preference', async () => {
      vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ ...mockGlobalPrefs, engineMode: 'cli' });
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({ engineModeOverride: 'sdk' }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (projectService as any)._buildEffectiveResponse('/tmp/test-project');

      expect(result.effectiveEngineMode).toBe('sdk');
      expect(result._overrides).toContain('engineModeOverride');
    });
  });

  // getEffectiveEngineMode is the engine-side resolver. It shares computeEffectiveEngineMode
  // with _buildEffectiveResponse, so the same precedence must hold on the bare resolved mode
  // (this is what the engine factory consumes).
  describe('getEffectiveEngineMode', () => {
    it('project override cli → cli', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({ engineModeOverride: 'cli' }));

      const mode = await projectService.getEffectiveEngineMode('/tmp/test-project');
      expect(mode).toBe('cli');
    });

    it('no override + global engineMode cli → cli', async () => {
      vi.mocked(preferencesService.getEffectivePreferences).mockResolvedValue({ ...mockGlobalPrefs, engineMode: 'cli' });
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      const mode = await projectService.getEffectiveEngineMode('/tmp/test-project');
      expect(mode).toBe('cli');
    });

    it('no override + no global → sdk (default)', async () => {
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({}));

      const mode = await projectService.getEffectiveEngineMode('/tmp/test-project');
      expect(mode).toBe('sdk');
    });
  });
});
