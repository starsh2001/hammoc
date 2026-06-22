import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  migrateSystemPrompt,
  SECTION_COMMON,
  SECTION_SDK,
  SECTION_CLI,
  SECTION_BMAD,
  LEGACY_DEFAULT_TEMPLATE,
} from '../workspaceContext.js';

describe('buildSystemPrompt', () => {
  it('SDK + BMad includes SECTION_COMMON, SECTION_SDK, and SECTION_BMAD', () => {
    const result = buildSystemPrompt('sdk', true);
    expect(result).toContain('# Hammoc Context');
    expect(result).toContain('## Engine: SDK');
    expect(result).toContain('## BMad Project');
    expect(result).not.toContain('## Engine: CLI');
  });

  it('SDK + non-BMad omits SECTION_BMAD', () => {
    const result = buildSystemPrompt('sdk', false);
    expect(result).toContain('## Engine: SDK');
    expect(result).not.toContain('## BMad Project');
  });

  it('CLI + BMad includes SECTION_CLI and SECTION_BMAD', () => {
    const result = buildSystemPrompt('cli', true);
    expect(result).toContain('## Engine: CLI');
    expect(result).toContain('## BMad Project');
    expect(result).not.toContain('## Engine: SDK');
  });

  it('CLI + non-BMad omits SECTION_BMAD', () => {
    const result = buildSystemPrompt('cli', false);
    expect(result).toContain('## Engine: CLI');
    expect(result).not.toContain('## BMad Project');
  });

  it('appends user area with separator when provided', () => {
    const result = buildSystemPrompt('sdk', true, 'custom instructions');
    expect(result).toContain('# Custom Instructions');
    expect(result).toContain('custom instructions');
  });

  it('omits separator when userArea is undefined', () => {
    const result = buildSystemPrompt('sdk', true);
    expect(result).not.toContain('# Custom Instructions');
  });

  it('omits separator when userArea is empty', () => {
    const result = buildSystemPrompt('sdk', true, '');
    expect(result).not.toContain('# Custom Instructions');
  });

  it('omits separator when userArea is whitespace-only', () => {
    const result = buildSystemPrompt('sdk', true, '   \n  ');
    expect(result).not.toContain('# Custom Instructions');
  });

  it('preserves {variable} placeholders for later resolution', () => {
    const result = buildSystemPrompt('sdk', false);
    expect(result).toContain('{homeDir}');
  });

  it('contains all section constants in correct order', () => {
    const result = buildSystemPrompt('sdk', true, 'my custom text');
    const commonIdx = result.indexOf(SECTION_COMMON);
    const sdkIdx = result.indexOf(SECTION_SDK);
    const bmadIdx = result.indexOf(SECTION_BMAD);
    const userIdx = result.indexOf('my custom text');
    expect(commonIdx).toBeLessThan(sdkIdx);
    expect(sdkIdx).toBeLessThan(bmadIdx);
    expect(bmadIdx).toBeLessThan(userIdx);
  });
});

describe('migrateSystemPrompt', () => {
  it('returns none for undefined input', () => {
    const result = migrateSystemPrompt(undefined);
    expect(result.outcome).toBe('none');
    expect(result.customSystemPrompt).toBeUndefined();
  });

  it('clears exact match with legacy template', () => {
    const result = migrateSystemPrompt(LEGACY_DEFAULT_TEMPLATE);
    expect(result.outcome).toBe('exact-match');
    expect(result.customSystemPrompt).toBeUndefined();
  });

  it('extracts trailing content from prefix match', () => {
    const customized = LEGACY_DEFAULT_TEMPLATE + '\n\nMy custom additions';
    const result = migrateSystemPrompt(customized);
    expect(result.outcome).toBe('prefix-match');
    expect(result.customSystemPrompt).toBe('My custom additions');
  });

  it('keeps completely different content as-is with migration flag', () => {
    const result = migrateSystemPrompt('Totally custom prompt');
    expect(result.outcome).toBe('no-match');
    expect(result.customSystemPrompt).toBe('Totally custom prompt');
    expect(result._systemPromptMigrated).toBe(true);
  });
});
