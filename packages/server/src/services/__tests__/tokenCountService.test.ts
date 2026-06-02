/**
 * Story 31.3 (Task A.7): tokenCountService tests — count_tokens proxy cache
 * (hit/miss, content change), non-blocking API failure, the N-B authoritative
 * server-recomputed hash, and token attribution enumeration.
 *
 * The Anthropic SDK + the enumerated services are mocked so no real API call /
 * disk scan happens. Each test uses unique text so the in-memory singleton
 * cache cannot collide across tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fsSync from 'node:fs';
import path from 'node:path';

const countTokensMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { countTokens: countTokensMock } })),
}));
vi.mock('../claudeMdService.js', () => ({ claudeMdService: { read: vi.fn() } }));
vi.mock('../harnessSkillService.js', () => ({ harnessSkillService: { listCards: vi.fn() } }));
vi.mock('../contextBuilderService.js', () => ({ contextBuilderService: { readManifest: vi.fn() } }));
vi.mock('../projectService.js', () => ({ projectService: { resolveOriginalPath: vi.fn() } }));

import { tokenCountService } from '../tokenCountService.js';
import { claudeMdService } from '../claudeMdService.js';
import { harnessSkillService } from '../harnessSkillService.js';
import { contextBuilderService } from '../contextBuilderService.js';

let tmpHome: string;

beforeEach(() => {
  tmpHome = fsSync.mkdtempSync(path.join(os.tmpdir(), 'tok-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome);
  countTokensMock.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  fsSync.rmSync(tmpHome, { recursive: true, force: true });
});

function mockProjectClaudeMd(content: string): void {
  vi.mocked(claudeMdService.read).mockImplementation(async (ref: any) => {
    if (ref.scope === 'project') return { content, absolutePath: '/p/CLAUDE.md' } as any;
    throw Object.assign(new Error('not found'), { code: 'HARNESS_FILE_NOT_FOUND' });
  });
}

describe('exactCount cache (AC-B3.b)', () => {
  it('miss → calls count_tokens; same content → cache hit (no 2nd call)', async () => {
    mockProjectClaudeMd('UNIQUE-A content for cache test');
    countTokensMock.mockResolvedValue({ input_tokens: 42 });

    const first = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'hint' });
    expect(first).toEqual({ tokens: 42, cached: false });

    const second = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'hint' });
    expect(second).toEqual({ tokens: 42, cached: true });
    expect(countTokensMock).toHaveBeenCalledTimes(1);
  });

  it('content change → new hash → cache miss → recount', async () => {
    mockProjectClaudeMd('UNIQUE-B original');
    countTokensMock.mockResolvedValueOnce({ input_tokens: 10 });
    const a = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'x' });
    expect(a.tokens).toBe(10);

    mockProjectClaudeMd('UNIQUE-B edited and longer now');
    countTokensMock.mockResolvedValueOnce({ input_tokens: 20 });
    const b = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'x' });
    expect(b).toEqual({ tokens: 20, cached: false });
    expect(countTokensMock).toHaveBeenCalledTimes(2);
  });
});

describe('N-B authoritative server hash', () => {
  it('ignores the request contentHash — server recomputes from actual text', async () => {
    mockProjectClaudeMd('UNIQUE-C content N-B');
    countTokensMock.mockResolvedValue({ input_tokens: 99 });

    // First call with a garbage/forged hint.
    const r1 = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'forged-1' });
    expect(r1).toEqual({ tokens: 99, cached: false });

    // Second call, SAME text but a DIFFERENT forged hint → still a cache HIT,
    // because the cache key is the server-recomputed sha of the real text.
    const r2 = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'forged-2' });
    expect(r2).toEqual({ tokens: 99, cached: true });
    expect(countTokensMock).toHaveBeenCalledTimes(1);
  });
});

describe('non-blocking failure (AC-B3.c)', () => {
  it('count_tokens throw → failed:true (approximation kept)', async () => {
    mockProjectClaudeMd('UNIQUE-D fail path');
    countTokensMock.mockRejectedValue(new Error('429 rate limit'));
    const res = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'x' });
    expect(res).toEqual({ tokens: 0, cached: false, failed: true });
  });

  it('no credentials → failed:true', async () => {
    delete process.env.ANTHROPIC_API_KEY; // and tmpHome has no ~/.claude/.credentials.json
    mockProjectClaudeMd('UNIQUE-E nocred');
    const res = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'x' });
    expect(res.failed).toBe(true);
    expect(countTokensMock).not.toHaveBeenCalled();
  });

  it('unresolvable element (missing file) → failed:true', async () => {
    vi.mocked(claudeMdService.read).mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'HARNESS_FILE_NOT_FOUND' }),
    );
    const res = await tokenCountService.exactCount('p', { kind: 'claudeMd-project', contentHash: 'x' });
    expect(res.failed).toBe(true);
  });
});

describe('listTokenAttribution (AC-B1)', () => {
  it('enumerates CLAUDE.md + skills, computes bytes/approxTokens/contentHash', async () => {
    // project CLAUDE.md present; global absent.
    vi.mocked(claudeMdService.read).mockImplementation(async (ref: any) => {
      if (ref.scope === 'project') return { content: 'project memory body', absolutePath: '/p/CLAUDE.md' } as any;
      throw Object.assign(new Error('not found'), { code: 'HARNESS_FILE_NOT_FOUND' });
    });
    // one skill with a real SKILL.md on disk.
    const skillRoot = path.join(tmpHome, 'skills', 'demo');
    fsSync.mkdirSync(skillRoot, { recursive: true });
    fsSync.writeFileSync(path.join(skillRoot, 'SKILL.md'), 'skill body 한글', 'utf8');
    vi.mocked(harnessSkillService.listCards).mockResolvedValue({
      cards: [{ name: 'demo', sources: [{ absoluteRoot: skillRoot } as any], activeScope: 'user' } as any],
      malformed: [],
    } as any);
    // context builder disabled → omitted.
    vi.mocked(contextBuilderService.readManifest).mockResolvedValue({
      manifest: { version: 1, enabled: false, files: [], variables: {}, customCommands: [] },
      mtime: '',
      scriptExists: false,
      entryRegistered: false,
    } as any);

    const items = await tokenCountService.listTokenAttribution('p');
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('claudeMd-project');
    expect(kinds).toContain('skill');
    expect(kinds).not.toContain('claudeMd-global'); // absent → omitted
    expect(kinds).not.toContain('contextBuilder'); // disabled → omitted

    const skill = items.find((i) => i.kind === 'skill')!;
    expect(skill.bytes).toBe(Buffer.byteLength('skill body 한글', 'utf8'));
    expect(skill.approxTokens).toBe(Math.ceil(skill.bytes / 4));
    expect(skill.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(skill.path).toContain('SKILL.md');
  });
});
