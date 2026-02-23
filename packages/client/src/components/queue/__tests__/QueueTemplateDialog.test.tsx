/**
 * QueueTemplateDialog Component Tests
 * [Source: Story 15.5 - Task 8.4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueueTemplateDialog } from '../QueueTemplateDialog';
import type { QueueStoryInfo, QueueTemplate } from '@bmad-studio/shared';

// Mock queueApi
const mockGetStories = vi.fn();
const mockGetTemplates = vi.fn();
const mockSaveTemplate = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();

vi.mock('../../../services/api/queue', () => ({
  queueApi: {
    getStories: (...args: unknown[]) => mockGetStories(...args),
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    saveTemplate: (...args: unknown[]) => mockSaveTemplate(...args),
    updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  },
}));

vi.mock('@bmad-studio/shared', async () => {
  const actual = await vi.importActual('@bmad-studio/shared');
  return actual;
});

const mockStories: QueueStoryInfo[] = [
  { storyNum: '1.1', epicNum: 1, storyIndex: 1, title: 'Auth Setup' },
  { storyNum: '1.2', epicNum: 1, storyIndex: 2, title: 'Login Flow' },
  { storyNum: '2.1', epicNum: 2, storyIndex: 1, title: 'Dashboard' },
];

const mockTemplates: QueueTemplate[] = [
  { id: 'tmpl-1', name: 'Basic Dev', template: '/dev {story_num}', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const defaultProps = {
  projectSlug: 'test-project',
  open: true,
  onClose: vi.fn(),
  onGenerate: vi.fn(),
};

describe('QueueTemplateDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockGetStories.mockResolvedValue({ stories: mockStories });
    mockGetTemplates.mockResolvedValue(mockTemplates);
    mockSaveTemplate.mockResolvedValue({ id: 'new-1', name: 'New', template: 'test', createdAt: '', updatedAt: '' });
    mockUpdateTemplate.mockResolvedValue({ id: 'tmpl-1', name: 'Updated', template: 'test', createdAt: '', updatedAt: '' });
    mockDeleteTemplate.mockResolvedValue(undefined);
  });

  // TC-QT-26
  it('renders when open=true', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    expect(screen.getByText('템플릿으로 큐 생성')).toBeInTheDocument();
    // Wait for async data fetches to settle (getStories + getTemplates)
    await waitFor(() => {
      expect(screen.getByText(/1\.1/)).toBeInTheDocument();
    });
  });

  // TC-QT-27
  it('does not render when open=false', () => {
    render(<QueueTemplateDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('템플릿으로 큐 생성')).not.toBeInTheDocument();
  });

  // TC-QT-28
  it('loads and displays stories with checkboxes', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/1\.1/)).toBeInTheDocument();
      expect(screen.getByText(/Auth Setup/)).toBeInTheDocument();
    });
    const checkboxes = screen.getAllByRole('checkbox');
    // 3 story checkboxes + 1 pause toggle = 4
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });

  // TC-QT-29
  it('selecting/deselecting stories updates selection', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    // All checkboxes should be checked initially
    const checkboxes = screen.getAllByRole('checkbox');
    const storyCheckbox = checkboxes.find((cb) =>
      cb.closest('label')?.textContent?.includes('1.1')
    );
    expect(storyCheckbox).toBeDefined();
    expect(storyCheckbox).toBeChecked();

    // Uncheck it
    fireEvent.click(storyCheckbox!);
    expect(storyCheckbox).not.toBeChecked();
  });

  // TC-QT-30
  it('"전체 선택" / "전체 해제" buttons work', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    const deselectBtn = screen.getByText('전체 해제');
    fireEvent.click(deselectBtn);

    // All story checkboxes should be unchecked now
    const checkboxes = screen.getAllByRole('checkbox');
    const storyCheckboxes = checkboxes.filter((cb) =>
      cb.closest('label')?.textContent?.match(/\d+\.\d+/)
    );
    storyCheckboxes.forEach((cb) => expect(cb).not.toBeChecked());

    const selectBtn = screen.getByText('전체 선택');
    fireEvent.click(selectBtn);
    storyCheckboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  // TC-QT-31
  it('template text input updates preview', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num} go' } });

    await waitFor(() => {
      expect(screen.getByText('3. 미리보기')).toBeInTheDocument();
    });
  });

  // TC-QT-32
  it('file load populates template text', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    // Switch to file tab
    fireEvent.click(screen.getByText('파일 로드'));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['/dev {story_num}'], 'template.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 100 });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const previewSection = screen.queryByText('3. 미리보기');
      // Preview should appear after file load + stories selected
      expect(previewSection).toBeInTheDocument();
    });
  });

  // TC-QT-33
  it('"에디터에 로드" calls onGenerate with generated script', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num}' } });

    await waitFor(() => screen.getByText('3. 미리보기'));

    const loadBtn = screen.getByText('에디터에 로드');
    fireEvent.click(loadBtn);

    expect(defaultProps.onGenerate).toHaveBeenCalledWith(expect.stringContaining('/dev 1.1'));
  });

  // TC-QT-34
  it('@pause insertion toggle works', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num}' } });

    await waitFor(() => screen.getByText('3. 미리보기'));

    // @pause should be in preview by default (insertPause=true)
    const previewEl = document.querySelector('pre');
    expect(previewEl?.textContent).toContain('@pause');

    // Toggle off
    const pauseCheckbox = screen.getByLabelText(/에픽 간 @pause 자동 삽입/);
    fireEvent.click(pauseCheckbox);

    await waitFor(() => {
      const updatedPreview = document.querySelector('pre');
      expect(updatedPreview?.textContent).not.toContain('@pause');
    });
  });

  // TC-QT-35
  it('save template flow calls API and refreshes list', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num}' } });

    // Click save button
    await waitFor(() => screen.getByText('현재 템플릿 저장'));
    fireEvent.click(screen.getByText('현재 템플릿 저장'));

    // Fill in template name
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    fireEvent.change(nameInput, { target: { value: 'My Template' } });

    // Click save
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockSaveTemplate).toHaveBeenCalledWith('test-project', 'My Template', '/dev {story_num}');
    });
  });

  // TC-QT-36
  it('delete template flow calls API with confirmation', async () => {
    window.confirm = vi.fn(() => true);

    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    // Switch to saved templates tab
    fireEvent.click(screen.getByText('저장된 템플릿'));

    await waitFor(() => screen.getByText('Basic Dev'));

    const deleteBtn = screen.getByLabelText('Basic Dev 삭제');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('템플릿을 삭제하시겠습니까?');
    await waitFor(() => {
      expect(mockDeleteTemplate).toHaveBeenCalledWith('test-project', 'tmpl-1');
    });
  });

  // TC-QT-37
  it('saved template selection loads template text', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    fireEvent.click(screen.getByText('저장된 템플릿'));

    await waitFor(() => screen.getByText('Basic Dev'));
    fireEvent.click(screen.getByText('Basic Dev'));

    // After selecting, the preview should show generated content
    await waitFor(() => {
      expect(screen.getByText('3. 미리보기')).toBeInTheDocument();
    });
  });

  // TC-QT-38
  it('close button and Escape key call onClose', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    // Wait for async data fetches to settle
    await waitFor(() => screen.getByText(/1\.1/));

    // Close button
    const closeBtn = screen.getByLabelText('닫기');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);

    // Re-render and test Escape
    defaultProps.onClose.mockClear();
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getAllByText(/1\.1/));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // TC-QT-39a
  it('edit button loads template into textarea and sets selectedTemplateId', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    // Go to saved tab
    fireEvent.click(screen.getByText('저장된 템플릿'));
    await waitFor(() => screen.getByText('Basic Dev'));

    const editBtn = screen.getByLabelText('Basic Dev 편집');
    fireEvent.click(editBtn);

    // Should switch to input tab with template loaded
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/story_num/);
      expect(textarea).toHaveValue('/dev {story_num}');
    });

    // Save button should now say "템플릿 업데이트"
    await waitFor(() => {
      expect(screen.getByText('템플릿 업데이트')).toBeInTheDocument();
    });
  });

  // TC-QT-39b
  it('"템플릿 업데이트" button calls updateTemplate API when selectedTemplateId is set', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    // Go to saved tab and edit
    fireEvent.click(screen.getByText('저장된 템플릿'));
    await waitFor(() => screen.getByText('Basic Dev'));

    const editBtn = screen.getByLabelText('Basic Dev 편집');
    fireEvent.click(editBtn);

    await waitFor(() => screen.getByText('템플릿 업데이트'));

    fireEvent.click(screen.getByText('템플릿 업데이트'));

    // Name input should appear with pre-filled name
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    expect(nameInput).toHaveValue('Basic Dev');

    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith('test-project', 'tmpl-1', 'Basic Dev', '/dev {story_num}');
    });
  });

  // TC-QT-39c
  it('file load accepts .txt and .qlaude-queue files', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    fireEvent.click(screen.getByText('파일 로드'));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toContain('.txt');
    expect(fileInput.accept).toContain('.qlaude-queue');
  });

  // TC-QT-40
  it('file load rejects empty files with toast message', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    fireEvent.click(screen.getByText('파일 로드'));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const emptyFile = new File([''], 'empty.txt', { type: 'text/plain' });
    Object.defineProperty(emptyFile, 'size', { value: 0 });

    fireEvent.change(fileInput, { target: { files: [emptyFile] } });

    expect(alertSpy).toHaveBeenCalledWith('파일이 비어있습니다');
    alertSpy.mockRestore();
  });

  // TC-QT-41
  it('file load rejects files > 100KB with toast message', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    fireEvent.click(screen.getByText('파일 로드'));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(200000)], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(bigFile, 'size', { value: 200000 });

    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(alertSpy).toHaveBeenCalledWith('파일이 너무 큽니다 (최대 100KB)');
    alertSpy.mockRestore();
  });
  // TC-QT-42
  it('wrap toggle syncs template input and preview modes', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num} a-very-long-line' } });

    await waitFor(() => {
      expect(document.querySelector('pre')).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText('Toggle template wrap mode');
    const previewEl = document.querySelector('pre');

    expect(textarea).toHaveAttribute('wrap', 'soft');
    expect(textarea).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(previewEl).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);

    expect(textarea).toHaveAttribute('wrap', 'off');
    expect(textarea).toHaveStyle({ whiteSpace: 'pre' });
    expect(previewEl).toHaveStyle({ whiteSpace: 'pre' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  // TC-QT-43
  it('normalizes CRLF when loading a saved template into the editor', async () => {
    mockGetTemplates.mockResolvedValueOnce([
      {
        id: 'tmpl-crlf',
        name: 'CRLF Template',
        template: '/dev {story_num}\r\n@pause review',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getByText(/1\.1/));

    // Open the saved templates tab without relying on localized label text.
    for (const button of screen.getAllByRole('button')) {
      fireEvent.click(button);
      if (screen.queryByText('CRLF Template')) break;
    }
    await waitFor(() => screen.getByText('CRLF Template'));
    fireEvent.click(screen.getByText('CRLF Template'));

    // "Load to editor" is the last footer action button when preview exists.
    const buttons = screen.getAllByRole('button');
    const loadBtn = buttons[buttons.length - 1];
    fireEvent.click(loadBtn);

    const generated = defaultProps.onGenerate.mock.calls[0]?.[0] as string;
    expect(generated).toContain('/dev 1.1\n@pause review');
    expect(generated).not.toContain('\r');
  });

});
