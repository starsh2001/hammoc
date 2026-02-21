/**
 * File Store Tests
 * [Source: Story 11.3 - Task 5.1]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFileStore } from '../fileStore';

vi.mock('../../services/api/fileSystem', () => ({
  fileSystemApi: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

import { fileSystemApi } from '../../services/api/fileSystem';

const mockedReadFile = vi.mocked(fileSystemApi.readFile);
const mockedWriteFile = vi.mocked(fileSystemApi.writeFile);

const initialState = {
  openFile: null,
  content: '',
  originalContent: '',
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isTruncated: false,
  isMarkdownPreview: false,
  language: 'plaintext',
  error: null,
};

describe('useFileStore', () => {
  beforeEach(() => {
    useFileStore.setState(initialState);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('openFileInEditor', () => {
    it('TC-FS1: should load file content successfully', async () => {
      mockedReadFile.mockResolvedValue({
        content: 'hello world',
        isBinary: false,
        isTruncated: false,
        size: 11,
        mimeType: 'text/plain',
      });

      await useFileStore.getState().openFileInEditor('my-project', 'src/index.ts');

      const state = useFileStore.getState();
      expect(state.content).toBe('hello world');
      expect(state.originalContent).toBe('hello world');
      expect(state.isLoading).toBe(false);
      expect(state.isDirty).toBe(false);
      expect(state.openFile).toEqual({ projectSlug: 'my-project', path: 'src/index.ts' });
    });

    it('TC-FS2: should set error for binary files', async () => {
      mockedReadFile.mockResolvedValue({
        content: null,
        isBinary: true,
        isTruncated: false,
        size: 1024,
        mimeType: 'application/octet-stream',
      });

      await useFileStore.getState().openFileInEditor('my-project', 'image.png');

      const state = useFileStore.getState();
      expect(state.error).toBe('바이너리 파일은 편집할 수 없습니다.');
      expect(state.isLoading).toBe(false);
    });

    it('TC-FS3: should set error on API failure', async () => {
      mockedReadFile.mockRejectedValue(new Error('Network error'));

      await useFileStore.getState().openFileInEditor('my-project', 'src/index.ts');

      const state = useFileStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });

    it('TC-FS10: should set isTruncated for truncated files', async () => {
      mockedReadFile.mockResolvedValue({
        content: 'partial content...',
        isBinary: false,
        isTruncated: true,
        size: 1048577,
        mimeType: 'text/plain',
      });

      await useFileStore.getState().openFileInEditor('my-project', 'large-file.txt');

      const state = useFileStore.getState();
      expect(state.isTruncated).toBe(true);
      expect(state.content).toBe('partial content...');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('setContent', () => {
    it('TC-FS4: should mark as dirty when content changes', () => {
      useFileStore.setState({ originalContent: 'original', content: 'original' });

      useFileStore.getState().setContent('modified');

      const state = useFileStore.getState();
      expect(state.content).toBe('modified');
      expect(state.isDirty).toBe(true);
    });

    it('TC-FS5: should not be dirty when content matches original', () => {
      useFileStore.setState({ originalContent: 'original', content: 'modified', isDirty: true });

      useFileStore.getState().setContent('original');

      const state = useFileStore.getState();
      expect(state.content).toBe('original');
      expect(state.isDirty).toBe(false);
    });
  });

  describe('saveFile', () => {
    it('TC-FS6: should save file successfully', async () => {
      useFileStore.setState({
        openFile: { projectSlug: 'my-project', path: 'src/index.ts' },
        content: 'updated content',
        originalContent: 'original content',
        isDirty: true,
      });

      mockedWriteFile.mockResolvedValue({ success: true, size: 15 });

      const result = await useFileStore.getState().saveFile();

      expect(result).toBe(true);
      const state = useFileStore.getState();
      expect(state.originalContent).toBe('updated content');
      expect(state.isDirty).toBe(false);
      expect(state.isSaving).toBe(false);
    });

    it('TC-FS7: should return false on API failure', async () => {
      useFileStore.setState({
        openFile: { projectSlug: 'my-project', path: 'src/index.ts' },
        content: 'updated content',
      });

      mockedWriteFile.mockRejectedValue(new Error('Write failed'));

      const result = await useFileStore.getState().saveFile();

      expect(result).toBe(false);
      expect(useFileStore.getState().isSaving).toBe(false);
    });

    it('TC-FS8: should return false when no file is open', async () => {
      useFileStore.setState({ openFile: null });

      const result = await useFileStore.getState().saveFile();

      expect(result).toBe(false);
      expect(mockedWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('closeEditor', () => {
    it('TC-FS9: should reset all state including isTruncated', () => {
      useFileStore.setState({
        openFile: { projectSlug: 'my-project', path: 'src/index.ts' },
        content: 'some content',
        originalContent: 'original',
        isDirty: true,
        isLoading: false,
        isSaving: false,
        isTruncated: true,
        error: 'some error',
      });

      useFileStore.getState().closeEditor();

      const state = useFileStore.getState();
      expect(state.openFile).toBeNull();
      expect(state.content).toBe('');
      expect(state.originalContent).toBe('');
      expect(state.isDirty).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.isSaving).toBe(false);
      expect(state.isTruncated).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('language detection', () => {
    it('TC-FS15: should set language to typescript for .ts files', async () => {
      mockedReadFile.mockResolvedValue({
        content: 'const x = 1;',
        isBinary: false,
        isTruncated: false,
        size: 12,
        mimeType: 'text/plain',
      });

      await useFileStore.getState().openFileInEditor('my-project', 'src/index.ts');

      expect(useFileStore.getState().language).toBe('typescript');
    });

    it('TC-FS16: should set language to python for .py files', async () => {
      mockedReadFile.mockResolvedValue({
        content: 'print("hello")',
        isBinary: false,
        isTruncated: false,
        size: 14,
        mimeType: 'text/plain',
      });

      await useFileStore.getState().openFileInEditor('my-project', 'main.py');

      expect(useFileStore.getState().language).toBe('python');
    });

    it('TC-FS17: should set language to plaintext for files without extension', async () => {
      mockedReadFile.mockResolvedValue({
        content: 'FROM node:22',
        isBinary: false,
        isTruncated: false,
        size: 12,
        mimeType: 'text/plain',
      });

      await useFileStore.getState().openFileInEditor('my-project', 'Dockerfile');

      expect(useFileStore.getState().language).toBe('plaintext');
    });

    it('TC-FS18: closeEditor should reset language to plaintext', () => {
      useFileStore.setState({
        openFile: { projectSlug: 'my-project', path: 'src/index.ts' },
        language: 'typescript',
      });

      useFileStore.getState().closeEditor();

      expect(useFileStore.getState().language).toBe('plaintext');
    });
  });

  describe('resetError', () => {
    it('TC-FS11: should reset error to null', () => {
      useFileStore.setState({ error: 'some error' });

      useFileStore.getState().resetError();

      expect(useFileStore.getState().error).toBeNull();
    });
  });

  describe('toggleMarkdownPreview', () => {
    it('TC-FS12: should toggle isMarkdownPreview false → true → false', () => {
      expect(useFileStore.getState().isMarkdownPreview).toBe(false);

      useFileStore.getState().toggleMarkdownPreview();
      expect(useFileStore.getState().isMarkdownPreview).toBe(true);

      useFileStore.getState().toggleMarkdownPreview();
      expect(useFileStore.getState().isMarkdownPreview).toBe(false);
    });

    it('TC-FS13: closeEditor should reset isMarkdownPreview to false', () => {
      useFileStore.setState({
        openFile: { projectSlug: 'test', path: 'README.md' },
        isMarkdownPreview: true,
      });

      useFileStore.getState().closeEditor();

      expect(useFileStore.getState().isMarkdownPreview).toBe(false);
    });

    it('TC-FS14: openFileInEditor should reset isMarkdownPreview to false', async () => {
      mockedReadFile.mockResolvedValue({
        content: '# New file',
        isBinary: false,
        isTruncated: false,
        size: 10,
        mimeType: 'text/plain',
      });

      // Set preview mode on current file
      useFileStore.setState({
        openFile: { projectSlug: 'test', path: 'README.md' },
        isMarkdownPreview: true,
      });

      // Open a different file — should reset preview state
      await useFileStore.getState().openFileInEditor('test', 'OTHER.md');

      expect(useFileStore.getState().isMarkdownPreview).toBe(false);
    });
  });
});
