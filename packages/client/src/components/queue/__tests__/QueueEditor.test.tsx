/**
 * QueueEditor Component Tests
 * [Source: Story 15.3 - Task 7.2]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueueEditor } from '../QueueEditor';
import { useQueueStore } from '../../../stores/queueStore';

// Mock useQueueRunner
const mockRunner = {
  isRunning: false,
  isPaused: false,
  isStarting: false,
  progress: { current: 0, total: 0 },
  lockedSessionId: null,
  pauseReason: undefined,
  completedItems: new Set<number>(),
  errorItem: null,
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  abort: vi.fn(),
};

vi.mock('../../../hooks/useQueueRunner', () => ({
  useQueueRunner: () => mockRunner,
}));

vi.mock('@bmad-studio/shared', () => ({
  parseQueueScript: vi.fn(),
}));

import { parseQueueScript } from '@bmad-studio/shared';
const mockedParse = vi.mocked(parseQueueScript);

describe('QueueEditor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useQueueStore.setState({
      script: '',
      parsedItems: [],
      warnings: [],
      isRunning: false,
      isPaused: false,
      isStarting: false,
      currentIndex: 0,
      totalItems: 0,
      pauseReason: undefined,
      lockedSessionId: null,
      currentModel: undefined,
      completedItems: new Set<number>(),
      errorItem: null,
    });
    mockRunner.isRunning = false;
    mockRunner.isPaused = false;
    mockRunner.isStarting = false;
    mockRunner.completedItems = new Set<number>();
    mockRunner.errorItem = null;
    vi.clearAllMocks();
    // Reset mock after clearAllMocks to preserve implementation
    mockedParse.mockReturnValue({ items: [], warnings: [] });
  });

  it('TC-QE-11: should render textarea for script editing', () => {
    render(<QueueEditor projectSlug="test-project" />);
    const textarea = screen.getByLabelText('큐 스크립트 에디터');
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('TC-QE-12: "파일 로드" button triggers file input', () => {
    render(<QueueEditor projectSlug="test-project" />);
    const button = screen.getByLabelText('파일 로드');
    expect(button).toBeInTheDocument();

    // The hidden file input should be present
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
  });

  it('TC-QE-13: loading a file sets script content', async () => {
    render(<QueueEditor projectSlug="test-project" />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const file = new File(['Hello\n@new\nWorld'], 'queue.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file] });

    fireEvent.change(fileInput);

    // Wait for FileReader to complete (use @testing-library waitFor for act() wrapping)
    await waitFor(() => {
      expect(useQueueStore.getState().script).toBe('Hello\n@new\nWorld');
    });
  });

  it('TC-QE-14: syntax highlighting renders directive spans', async () => {
    useQueueStore.setState({ script: '@new\n# comment\nHello' });
    render(<QueueEditor projectSlug="test-project" />);
    await act(async () => {}); // flush mount useEffect (parseScript)

    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    // Should contain highlighted spans
    expect(pre?.innerHTML).toContain('text-purple-700');
    expect(pre?.innerHTML).toContain('text-gray-500');
  });

  it('TC-QE-15: "실행" button disabled when script is empty', () => {
    render(<QueueEditor projectSlug="test-project" />);
    const button = screen.getByLabelText('실행');
    expect(button).toBeDisabled();
  });

  it('TC-QE-16: "실행" button calls start() with parsed items', () => {
    const items = [{ prompt: 'Hello', isNewSession: false }];
    mockedParse.mockReturnValue({ items, warnings: [] });
    useQueueStore.setState({
      script: 'Hello',
      parsedItems: items,
    });

    render(<QueueEditor projectSlug="test-project" />);
    const button = screen.getByLabelText('실행');
    fireEvent.click(button);

    expect(mockRunner.start).toHaveBeenCalledWith(items);
  });

  it('TC-QE-17: "실행" button shows "시작 중..." spinner while isStarting', () => {
    mockRunner.isStarting = true;
    useQueueStore.setState({
      script: 'Hello',
      parsedItems: [{ prompt: 'Hello', isNewSession: false }],
    });

    render(<QueueEditor projectSlug="test-project" />);
    expect(screen.getByText('시작 중...')).toBeInTheDocument();
  });

  it('TC-QE-18: validation warnings displayed below editor', async () => {
    // Mock parser to return warnings so parseScript on mount preserves them
    mockedParse.mockReturnValue({
      items: [{ prompt: '@unknown test', isNewSession: false }],
      warnings: [{ line: 1, message: 'Unknown directive: @unknown' }],
    });
    useQueueStore.setState({
      script: '@unknown test',
    });

    render(<QueueEditor projectSlug="test-project" />);
    await act(async () => {}); // flush mount useEffect (parseScript)
    expect(screen.getByText('Line 1: Unknown directive: @unknown')).toBeInTheDocument();
  });

  it('TC-QE-19: editor is hidden when queue is running (execution view shown)', () => {
    mockRunner.isRunning = true;
    render(<QueueEditor projectSlug="test-project" />);

    // When isRunning=true, the editor area is hidden and execution progress is shown instead
    expect(screen.queryByLabelText('큐 스크립트 에디터')).not.toBeInTheDocument();
  });

  it('TC-QE-19b: textarea becomes read-only when isStarting', () => {
    mockRunner.isStarting = true;
    render(<QueueEditor projectSlug="test-project" />);

    const textarea = screen.getByLabelText('큐 스크립트 에디터');
    expect(textarea).toHaveAttribute('readonly');
  });

  it('TC-QE-20: shows pause button when running', () => {
    mockRunner.isRunning = true;
    mockRunner.isPaused = false;
    useQueueStore.setState({ parsedItems: [{ prompt: 'Hello', isNewSession: false }] });
    render(<QueueEditor projectSlug="test-project" />);
    expect(screen.getByLabelText('일시정지')).toBeInTheDocument();
  });

  it('TC-QE-20b: shows resume and abort buttons when paused', () => {
    mockRunner.isRunning = true;
    mockRunner.isPaused = true;
    useQueueStore.setState({ parsedItems: [{ prompt: 'Hello', isNewSession: false }] });
    render(<QueueEditor projectSlug="test-project" />);
    expect(screen.getByLabelText('재개')).toBeInTheDocument();
    expect(screen.getByLabelText('중단')).toBeInTheDocument();
  });
  it('TC-QE-21: wrap toggle switches no-wrap and auto-wrap modes', () => {
    useQueueStore.setState({ script: 'a very long line for wrapping behavior' });
    render(<QueueEditor projectSlug="test-project" />);

    const textarea = screen.getByRole('textbox');
    const pre = document.querySelector('pre');
    const toggle = screen.getByLabelText('줄 바꿈 토글');

    expect(textarea).toHaveAttribute('wrap', 'soft');
    expect(pre).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);

    expect(textarea).toHaveAttribute('wrap', 'off');
    expect(pre).toHaveStyle({ whiteSpace: 'pre' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});
