/**
 * BMad Status Service Tests
 * [Source: Story 12.1 - Task 5.1]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockClose = vi.fn();
const mockOpen = vi.fn();

vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    readdir: (...args: unknown[]) => mockReaddir(...args),
    stat: (...args: unknown[]) => mockStat(...args),
  },
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  open: (...args: unknown[]) => mockOpen(...args),
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn(),
  },
}));

import { bmadStatusService } from '../bmadStatusService.js';
import yaml from 'js-yaml';

const PROJECT_ROOT = '/test/project';

const VALID_CONFIG_YAML = `
prd:
  prdFile: docs/prd.md
  prdSharded: true
  prdShardedLocation: docs/prd
  epicFilePattern: "epic-{n}*.md"
architecture:
  architectureFile: docs/architecture.md
  architectureSharded: true
  architectureShardedLocation: docs/architecture
devStoryLocation: docs/stories
qa:
  qaLocation: docs/qa
`;

const VALID_CONFIG_PARSED = {
  prd: {
    prdFile: 'docs/prd.md',
    prdSharded: true,
    prdShardedLocation: 'docs/prd',
    epicFilePattern: 'epic-{n}*.md',
  },
  architecture: {
    architectureFile: 'docs/architecture.md',
    architectureSharded: true,
    architectureShardedLocation: 'docs/architecture',
  },
  devStoryLocation: 'docs/stories',
  qa: {
    qaLocation: 'docs/qa',
  },
};

function setupOpenMock(content: string) {
  const buf = Buffer.from(content);
  mockOpen.mockResolvedValue({
    read: vi.fn().mockResolvedValue({ bytesRead: Math.min(buf.length, 500) }),
    close: mockClose,
  });
  // Override the read to actually fill the buffer
  mockOpen.mockImplementation(async () => ({
    read: async (buffer: Buffer, _offset: number, length: number, _position: number) => {
      const bytes = Math.min(buf.length, length);
      buf.copy(buffer, 0, 0, bytes);
      return { bytesRead: bytes };
    },
    close: mockClose,
  }));
}

describe('bmadStatusService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-BS-1: BMad 프로젝트가 아니면 NOT_BMAD_PROJECT 에러를 throw한다
  it('throws NOT_BMAD_PROJECT when core-config.yaml not found', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await expect(bmadStatusService.scanProject(PROJECT_ROOT)).rejects.toMatchObject({
      code: 'NOT_BMAD_PROJECT',
    });
  });

  // TC-BS-2: core-config.yaml을 파싱하여 config 필드를 반환한다
  it('parses core-config.yaml and returns config fields', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue(VALID_CONFIG_PARSED);
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.config).toEqual({
      prdFile: 'docs/prd.md',
      prdSharded: true,
      prdShardedLocation: 'docs/prd',
      epicFilePattern: 'epic-{n}*.md',
      architectureFile: 'docs/architecture.md',
      architectureSharded: true,
      architectureShardedLocation: 'docs/architecture',
      devStoryLocation: 'docs/stories',
      qaLocation: 'docs/qa',
    });
  });

  // TC-BS-3: 잘못된 YAML이면 CONFIG_PARSE_ERROR 에러를 throw한다
  it('throws CONFIG_PARSE_ERROR for invalid YAML', async () => {
    mockReadFile.mockResolvedValue('invalid: yaml: [');
    (yaml.load as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('YAML parse error');
    });

    await expect(bmadStatusService.scanProject(PROJECT_ROOT)).rejects.toMatchObject({
      code: 'CONFIG_PARSE_ERROR',
    });
  });

  // TC-BS-4: PRD 파일 존재 여부를 확인한다 — 존재하는 경우
  it('reports PRD as existing when path is found', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
    });
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML);
    mockStat.mockImplementation(async (p: string) => {
      if (p === path.join(PROJECT_ROOT, 'docs/prd.md')) return { isFile: () => true };
      if (p === path.join(PROJECT_ROOT, 'docs/architecture.md')) return { isFile: () => true };
      throw new Error('ENOENT');
    });
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.documents.prd).toEqual({ exists: true, path: 'docs/prd.md' });
  });

  // TC-BS-5: PRD 파일 존재 여부를 확인한다 — 미존재하는 경우
  it('reports PRD as not existing when path is not found', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
    });
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML);
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.documents.prd).toEqual({ exists: false, path: 'docs/prd.md' });
  });

  // TC-BS-6: Architecture 파일 존재 여부를 확인한다
  it('checks architecture document existence correctly', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
    });
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML);
    mockStat.mockImplementation(async (p: string) => {
      if (p === path.join(PROJECT_ROOT, 'docs/architecture.md')) return {};
      throw new Error('ENOENT');
    });
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.documents.architecture).toEqual({
      exists: true,
      path: 'docs/architecture.md',
    });
  });

  // TC-BS-7: 샤딩된 PRD의 경우 디렉토리로 존재 확인한다
  it('checks sharded PRD as directory existence', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue(VALID_CONFIG_PARSED);
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML);
    mockStat.mockImplementation(async (p: string) => {
      if (p === path.join(PROJECT_ROOT, 'docs/prd')) return { isDirectory: () => true };
      if (p === path.join(PROJECT_ROOT, 'docs/architecture')) return { isDirectory: () => true };
      throw new Error('ENOENT');
    });
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.documents.prd).toEqual({
      exists: true, path: 'docs/prd.md', sharded: true, shardedPath: 'docs/prd',
    });
    expect(result.documents.architecture).toEqual({
      exists: true, path: 'docs/architecture.md', sharded: true, shardedPath: 'docs/architecture',
    });
  });

  // TC-BS-8: 보조 문서 (stories, qa) 파일 수를 반환한다
  it('returns auxiliary document file counts', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
      qa: { qaLocation: 'docs/qa' },
    });
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML);
    // stat: core docs don't exist, but files inside aux dirs are regular files
    const storyDir = path.join(PROJECT_ROOT, 'docs/stories');
    const qaDir = path.join(PROJECT_ROOT, 'docs/qa');
    mockStat.mockImplementation(async (p: string) => {
      // Files inside stories/qa directories are regular files
      if (p.startsWith(storyDir + path.sep) || p.startsWith(qaDir + path.sep)) {
        return { isDirectory: () => false };
      }
      throw new Error('ENOENT');
    });
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === storyDir) return ['1.1.story.md', '1.2.story.md', 'notes.txt'];
      if (dir === qaDir) return ['qa-report.md', 'qa-log.md'];
      throw new Error('ENOENT');
    });

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.auxiliaryDocuments).toEqual([
      { type: 'stories', path: 'docs/stories', fileCount: 2, files: [{ name: '1.1.story.md' }, { name: '1.2.story.md' }] },
      { type: 'qa', path: 'docs/qa', fileCount: 2, files: [{ name: 'qa-log.md' }, { name: 'qa-report.md' }] },
    ]);
  });

  // TC-BS-9: 보조 문서 디렉토리가 없으면 fileCount 0을 반환한다
  it('returns fileCount 0 when auxiliary directories do not exist', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
      qa: { qaLocation: 'docs/qa' },
    });
    mockReadFile.mockResolvedValue(VALID_CONFIG_YAML);
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.auxiliaryDocuments).toEqual([
      { type: 'stories', path: 'docs/stories', fileCount: 0 },
      { type: 'qa', path: 'docs/qa', fileCount: 0 },
    ]);
  });

  // TC-BS-10: 스토리 파일을 에픽별로 그룹핑하여 반환한다
  it('groups story files by epic number', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.includes('prd.md'))
        return '## Epic 1: Foundation\n\n## Epic 2: Auth\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/stories'))
        return ['1.1.story.md', '1.2.story.md', '2.1.story.md'];
      throw new Error('ENOENT');
    });

    // Mock extractStoryStatus via open
    setupOpenMock('# Story\n\n## Status\n\nDone\n');

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics.length).toBe(2);
    expect(result.epics[0].number).toBe(1);
    expect(result.epics[0].name).toBe('Foundation');
    expect(result.epics[0].stories.length).toBe(2);
    expect(result.epics[1].number).toBe(2);
    expect(result.epics[1].name).toBe('Auth');
    expect(result.epics[1].stories.length).toBe(1);
  });

  // TC-BS-11: 각 스토리 파일에서 Status 필드를 추출한다
  it('extracts Status field from story files', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.includes('prd.md')) return '## Epic 1: Foundation\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return ['1.1.story.md'];
      throw new Error('ENOENT');
    });

    setupOpenMock('# Story 1.1\n\n## Status\n\nApproved\n');

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics[0].stories[0].status).toBe('Approved');
  });

  // TC-BS-11b: 다중 단어 Status를 올바르게 추출한다
  it('extracts multi-word Status like "Ready for Review"', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.includes('prd.md')) return '## Epic 1: Foundation\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return ['1.1.story.md'];
      throw new Error('ENOENT');
    });

    setupOpenMock('# Story 1.1\n\n## Status\n\nReady for Review\n');

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics[0].stories[0].status).toBe('Ready for Review');
  });

  // TC-BS-12: Status를 찾지 못하면 'Unknown'을 반환한다
  it('returns Unknown when Status field is not found', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.includes('prd.md')) return '## Epic 1: Foundation\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return ['1.1.story.md'];
      throw new Error('ENOENT');
    });

    setupOpenMock('# Story without status section\nSome content\n');

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics[0].stories[0].status).toBe('Unknown');
  });

  // TC-BS-13: monolithic PRD에서 에픽 이름을 추출한다
  it('extracts epic names from monolithic PRD', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.includes('prd.md'))
        return '## Epic 1: Foundation\n\n### Epic 2: Authentication\n\n## Epic 3: Dashboard\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return [];
      throw new Error('ENOENT');
    });

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics).toEqual([
      { number: 1, name: 'Foundation', stories: [] },
      { number: 2, name: 'Authentication', stories: [] },
      { number: 3, name: 'Dashboard', stories: [] },
    ]);
  });

  // TC-BS-15: Sharded PRD Step 1 — epicFilePattern으로 개별 에픽 파일을 매칭한다
  it('discovers epics from sharded PRD using epicFilePattern (Step 1)', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue(VALID_CONFIG_PARSED);
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.endsWith('epic-1-foundation.md'))
        return '# Epic 1: Foundation & Core Infrastructure\n\nSome content';
      if (filePath.endsWith('epic-2-auth.md'))
        return '## Epic 2: Authentication\n\nAuth details';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/prd'))
        return ['epic-1-foundation.md', 'epic-2-auth.md', 'index.md', 'overview.md'];
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return [];
      throw new Error('ENOENT');
    });

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics.length).toBe(2);
    expect(result.epics[0]).toEqual({ number: 1, name: 'Foundation & Core Infrastructure', stories: [] });
    expect(result.epics[1]).toEqual({ number: 2, name: 'Authentication', stories: [] });
  });

  // TC-BS-16: Sharded PRD Step 2 — epicFilePattern 매칭 실패 시 전체 .md 스캔 폴백
  it('falls back to scanning all .md files when epicFilePattern matches nothing (Step 2)', async () => {
    // Config has epicFilePattern but no files match it
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: {
        prdFile: 'docs/prd.md',
        prdSharded: true,
        prdShardedLocation: 'docs/prd',
        epicFilePattern: 'epic-{n}*.md', // pattern exists but no epic-N files
      },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      // No epic-N*.md files, but 6-epic-details.md contains epic headers
      if (filePath.endsWith('6-epic-details.md'))
        return '## Epic 1: Foundation\n\nContent\n\n## Epic 2: Authentication\n\nMore content\n';
      if (filePath.endsWith('index.md')) return '# PRD Index\nNo epic headers here\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/prd'))
        return ['index.md', '6-epic-details.md'];
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return [];
      throw new Error('ENOENT');
    });

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics.length).toBe(2);
    expect(result.epics[0]).toEqual({ number: 1, name: 'Foundation', stories: [] });
    expect(result.epics[1]).toEqual({ number: 2, name: 'Authentication', stories: [] });
  });

  // TC-BS-14: 스토리 파일이 없는 에픽도 빈 stories 배열로 반환한다
  it('returns epics with empty stories when no story files exist', async () => {
    (yaml.load as ReturnType<typeof vi.fn>).mockReturnValue({
      prd: { prdFile: 'docs/prd.md', prdSharded: false },
      architecture: { architectureFile: 'docs/architecture.md', architectureSharded: false },
      devStoryLocation: 'docs/stories',
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (filePath.includes('core-config.yaml')) return VALID_CONFIG_YAML;
      if (filePath.includes('prd.md'))
        return '## Epic 5: Future Feature\n## Epic 6: Another Feature\n';
      throw new Error('ENOENT');
    });
    mockStat.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockImplementation(async (dir: string) => {
      if (dir === path.join(PROJECT_ROOT, 'docs/stories')) return [];
      throw new Error('ENOENT');
    });

    const result = await bmadStatusService.scanProject(PROJECT_ROOT);

    expect(result.epics[0].stories).toEqual([]);
    expect(result.epics[1].stories).toEqual([]);
  });
});
