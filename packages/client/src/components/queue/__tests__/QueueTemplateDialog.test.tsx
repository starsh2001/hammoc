/**
 * QueueTemplateDialog Component Tests
 * [Source: Story 15.5 - Task 8.4]
 *
 * Updated to match the two-tab (Load / Editor) + Apply modal layout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueueTemplateDialog } from '../QueueTemplateDialog';
import type { QueueStoryInfo, QueueTemplate } from '@hammoc/shared';

// Mock queueApi
const mockGetStories = vi.fn();
const mockGetTemplates = vi.fn();
const mockSaveTemplate = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockGetGlobalTemplates = vi.fn();
const mockSaveGlobalTemplate = vi.fn();
const mockUpdateGlobalTemplate = vi.fn();
const mockDeleteGlobalTemplate = vi.fn();

vi.mock('../../../services/api/queue', () => ({
  queueApi: {
    getStories: (...args: unknown[]) => mockGetStories(...args),
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    saveTemplate: (...args: unknown[]) => mockSaveTemplate(...args),
    updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
    deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
    getGlobalTemplates: (...args: unknown[]) => mockGetGlobalTemplates(...args),
    saveGlobalTemplate: (...args: unknown[]) => mockSaveGlobalTemplate(...args),
    updateGlobalTemplate: (...args: unknown[]) => mockUpdateGlobalTemplate(...args),
    deleteGlobalTemplate: (...args: unknown[]) => mockDeleteGlobalTemplate(...args),
  },
}));

vi.mock('@hammoc/shared', async () => {
  const actual = await vi.importActual('@hammoc/shared');
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

/**
 * Helper: navigate to the Editor tab and type a template, then open the Apply modal.
 * Returns after stories are visible in the Apply modal.
 */
async function openApplyFromEditor(templateText = '/dev {story_num}') {
  // Switch to Editor tab
  fireEvent.click(screen.getByText('에디터'));

  // Type template text
  const textarea = screen.getByPlaceholderText(/story_num/);
  fireEvent.change(textarea, { target: { value: templateText } });

  // Click "적용" (Apply) in footer
  fireEvent.click(screen.getByText('적용'));

  // Wait for stories to load in the Apply modal
  await waitFor(() => {
    expect(screen.getByText(/1\.1/)).toBeInTheDocument();
  });
}

/**
 * Helper: select a saved template in Load tab and open Apply modal.
 */
async function selectTemplateAndApply(templateName: string) {
  // Wait for saved templates to load
  await waitFor(() => screen.getByText(templateName));

  // Select the template via its radio label
  fireEvent.click(screen.getByText(templateName));

  // Click "적용" (Apply) in footer
  fireEvent.click(screen.getByText('적용'));

  // Wait for stories to load in the Apply modal
  await waitFor(() => {
    expect(screen.getByText(/1\.1/)).toBeInTheDocument();
  });
}

describe('QueueTemplateDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mockGetStories.mockResolvedValue({ stories: mockStories });
    mockGetTemplates.mockResolvedValue(mockTemplates);
    mockGetGlobalTemplates.mockResolvedValue([]);
    mockSaveTemplate.mockResolvedValue({ id: 'new-1', name: 'New', template: 'test', createdAt: '', updatedAt: '' });
    mockUpdateTemplate.mockResolvedValue({ id: 'tmpl-1', name: 'Updated', template: 'test', createdAt: '', updatedAt: '' });
    mockDeleteTemplate.mockResolvedValue(undefined);
    mockSaveGlobalTemplate.mockResolvedValue({ id: 'new-g1', name: 'New Global', template: 'test', createdAt: '', updatedAt: '' });
    mockUpdateGlobalTemplate.mockResolvedValue({ id: 'gtmpl-1', name: 'Updated Global', template: 'test', createdAt: '', updatedAt: '' });
    mockDeleteGlobalTemplate.mockResolvedValue(undefined);
  });

  // TC-QT-26: renders title and Load tab by default
  it('renders when open=true', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    expect(screen.getByText('템플릿으로 큐 생성')).toBeInTheDocument();
    // Load tab should be active with saved templates visible
    await waitFor(() => {
      expect(screen.getByText('Basic Dev')).toBeInTheDocument();
    });
  });

  // TC-QT-27
  it('does not render when open=false', () => {
    render(<QueueTemplateDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('템플릿으로 큐 생성')).not.toBeInTheDocument();
  });

  // TC-QT-28: stories appear in Apply modal with checkboxes
  it('loads and displays stories with checkboxes', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await openApplyFromEditor();

    expect(screen.getByText(/Auth Setup/)).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    // 2 epic checkboxes + 3 story checkboxes + 1 pause toggle = 6
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });

  // TC-QT-29: selecting/deselecting stories in Apply modal
  it('selecting/deselecting stories updates selection', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await openApplyFromEditor();

    // All story checkboxes should be checked initially
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

  // TC-QT-30: select all / deselect all in Apply modal
  it('"전체 선택" / "전체 해제" buttons work', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await openApplyFromEditor();

    // Initially all selected, button should say "전체 해제"
    const deselectBtn = screen.getByText('전체 해제');
    fireEvent.click(deselectBtn);

    // All story checkboxes should be unchecked now
    const checkboxes = screen.getAllByRole('checkbox');
    const storyCheckboxes = checkboxes.filter((cb) =>
      cb.closest('label')?.textContent?.match(/\d+\.\d+/)
    );
    storyCheckboxes.forEach((cb) => expect(cb).not.toBeChecked());

    // After deselecting all, button should toggle to "전체 선택"
    const selectBtn = screen.getByText('전체 선택');
    fireEvent.click(selectBtn);
    storyCheckboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  // TC-QT-31: template text input in Editor tab updates preview in Apply modal
  it('template text input updates preview', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await openApplyFromEditor('/dev {story_num} go');

    await waitFor(() => {
      expect(screen.getByText('미리보기')).toBeInTheDocument();
    });
  });

  // TC-QT-32: file load populates template, then Apply shows preview
  it('file load populates template text', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);

    // File input is in Load tab (hidden)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['/dev {story_num}'], 'template.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { value: 100 });

    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for file to be loaded and radio to appear
    await waitFor(() => {
      expect(screen.getByText('template.txt')).toBeInTheDocument();
    });

    // Select the uploaded file radio (should be auto-selected) and click Apply
    fireEvent.click(screen.getByText('적용'));

    await waitFor(() => {
      const previewSection = screen.queryByText('미리보기');
      expect(previewSection).toBeInTheDocument();
    });
  });

  // TC-QT-33: "에디터에 로드" in Apply modal calls onGenerate
  it('"에디터에 로드" calls onGenerate with generated script', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await openApplyFromEditor('/dev {story_num}');

    await waitFor(() => screen.getByText('미리보기'));

    const loadBtn = screen.getByText('에디터에 로드');
    fireEvent.click(loadBtn);

    expect(defaultProps.onGenerate).toHaveBeenCalledWith(expect.stringContaining('/dev 1.1'));
  });

  // TC-QT-34: @pause insertion toggle in Apply modal
  it('@pause insertion toggle works', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    await openApplyFromEditor('/dev {story_num}');

    await waitFor(() => screen.getByText('미리보기'));

    // @pause should be in preview by default (insertPause=true)
    const previewEl = document.querySelector('pre');
    expect(previewEl?.textContent).toContain('@pause');

    // Toggle off
    const pauseCheckbox = screen.getByLabelText(/에픽 간 @pause/);
    fireEvent.click(pauseCheckbox);

    await waitFor(() => {
      const updatedPreview = document.querySelector('pre');
      expect(updatedPreview?.textContent).not.toContain('@pause');
    });
  });

  // TC-QT-35: save template in Editor tab
  it('save template flow calls API and refreshes list', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);

    // Switch to Editor tab
    fireEvent.click(screen.getByText('에디터'));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num}' } });

    // Fill in template name
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    fireEvent.change(nameInput, { target: { value: 'My Template' } });

    // Click save button
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockSaveTemplate).toHaveBeenCalledWith('test-project', 'My Template', '/dev {story_num}');
    });
  });

  // TC-QT-36: delete template from Load tab
  it('delete template flow calls API with confirmation', async () => {
    window.confirm = vi.fn(() => true);

    render(<QueueTemplateDialog {...defaultProps} />);

    // Wait for templates to load in the Load tab
    await waitFor(() => screen.getByText('Basic Dev'));

    const deleteBtn = screen.getByLabelText('Basic Dev 삭제');
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalledWith('템플릿을 삭제하시겠습니까?');
    await waitFor(() => {
      expect(mockDeleteTemplate).toHaveBeenCalledWith('test-project', 'tmpl-1');
    });
  });

  // TC-QT-37: selecting a saved template in Load tab and applying it
  it('saved template selection loads template text', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);

    // Wait for templates to load
    await waitFor(() => screen.getByText('Basic Dev'));

    // Select template radio
    fireEvent.click(screen.getByText('Basic Dev'));

    // Click Apply
    fireEvent.click(screen.getByText('적용'));

    // After applying, the preview should show generated content
    await waitFor(() => {
      expect(screen.getByText('미리보기')).toBeInTheDocument();
    });
  });

  // TC-QT-38: close button and Escape key
  it('close button and Escape key call onClose', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);
    // Wait for async data fetches to settle
    await waitFor(() => screen.getByText('Basic Dev'));

    // Close button
    const closeBtn = screen.getByLabelText('닫기');
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);

    // Re-render and test Escape
    defaultProps.onClose.mockClear();
    render(<QueueTemplateDialog {...defaultProps} />);
    await waitFor(() => screen.getAllByText('Basic Dev'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  // TC-QT-39a: edit button loads template into Editor tab textarea
  it('edit button loads template into textarea and sets selectedTemplateId', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);

    // Wait for templates in Load tab
    await waitFor(() => screen.getByText('Basic Dev'));

    // Select template radio
    fireEvent.click(screen.getByText('Basic Dev'));

    // Click "편집" (Edit) button in footer
    fireEvent.click(screen.getByText('편집'));

    // Should switch to Editor tab with template loaded
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/story_num/);
      expect(textarea).toHaveValue('/dev {story_num}');
    });

    // Template name should also be populated
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    expect(nameInput).toHaveValue('Basic Dev');
  });

  // TC-QT-39b: save in Editor tab with existing template name calls overwrite confirm + update API
  it('"템플릿 업데이트" button calls updateTemplate API when selectedTemplateId is set', async () => {
    window.confirm = vi.fn(() => true);

    render(<QueueTemplateDialog {...defaultProps} />);

    // Load tab: select template, click Edit
    await waitFor(() => screen.getByText('Basic Dev'));
    fireEvent.click(screen.getByText('Basic Dev'));
    fireEvent.click(screen.getByText('편집'));

    // Wait for Editor tab with template loaded
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/story_num/);
      expect(textarea).toHaveValue('/dev {story_num}');
    });

    // Template name should be pre-filled
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    expect(nameInput).toHaveValue('Basic Dev');

    // Click save (same name triggers overwrite flow)
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith('test-project', 'tmpl-1', 'Basic Dev', '/dev {story_num}');
    });
  });

  // TC-QT-39c: file input accepts correct file types
  it('file load accepts .txt and .qlaude-queue files', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);

    // File input is in Load tab (hidden)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput.accept).toContain('.txt');
    expect(fileInput.accept).toContain('.qlaude-queue');
  });

  // TC-QT-40: empty file rejected
  it('file load rejects empty files with toast message', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<QueueTemplateDialog {...defaultProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const emptyFile = new File([''], 'empty.txt', { type: 'text/plain' });
    Object.defineProperty(emptyFile, 'size', { value: 0 });

    fireEvent.change(fileInput, { target: { files: [emptyFile] } });

    expect(alertSpy).toHaveBeenCalledWith('파일이 비어있습니다');
    alertSpy.mockRestore();
  });

  // TC-QT-41: large file rejected
  it('file load rejects files > 100KB with toast message', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<QueueTemplateDialog {...defaultProps} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['x'.repeat(200000)], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(bigFile, 'size', { value: 200000 });

    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(alertSpy).toHaveBeenCalledWith('파일이 너무 큽니다 (최대 100KB)');
    alertSpy.mockRestore();
  });

  // TC-QT-42: wrap toggle in Editor tab syncs textarea and preview
  it('wrap toggle syncs template input and preview modes', async () => {
    render(<QueueTemplateDialog {...defaultProps} />);

    // Switch to Editor tab
    fireEvent.click(screen.getByText('에디터'));

    const textarea = screen.getByPlaceholderText(/story_num/);
    fireEvent.change(textarea, { target: { value: '/dev {story_num} a-very-long-line' } });

    // Open Apply modal to get preview
    fireEvent.click(screen.getByText('적용'));
    await waitFor(() => {
      expect(document.querySelector('pre')).toBeInTheDocument();
    });

    const previewEl = document.querySelector('pre');

    // Default is auto-wrap (soft / pre-wrap)
    expect(previewEl).toHaveStyle({ whiteSpace: 'pre-wrap' });

    // Close Apply modal to access Editor tab's wrap toggle
    fireEvent.keyDown(document, { key: 'Escape' });

    // Find the wrap toggle button — it's in the Editor tab toolbar
    const toggle = screen.getByLabelText('템플릿 줄 바꿈 토글');
    expect(textarea).toHaveAttribute('wrap', 'soft');
    expect(textarea).toHaveStyle({ whiteSpace: 'pre-wrap' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Toggle off
    fireEvent.click(toggle);

    expect(textarea).toHaveAttribute('wrap', 'off');
    expect(textarea).toHaveStyle({ whiteSpace: 'pre' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // Verify preview also uses the updated wrap mode
    fireEvent.click(screen.getByText('적용'));
    await waitFor(() => {
      expect(document.querySelector('pre')).toBeInTheDocument();
    });
    const updatedPreview = document.querySelector('pre');
    expect(updatedPreview).toHaveStyle({ whiteSpace: 'pre' });
  });

  // TC-QT-43: CRLF normalization when loading a saved template via Apply
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

    // Wait for saved templates to load with CRLF Template
    await waitFor(() => screen.getByText('CRLF Template'));

    // Select the CRLF template and click Apply
    fireEvent.click(screen.getByText('CRLF Template'));
    fireEvent.click(screen.getByText('적용'));

    // Wait for stories + preview in Apply modal
    await waitFor(() => expect(screen.getAllByText(/1\.1/).length).toBeGreaterThan(0));
    await waitFor(() => screen.getByText('미리보기'));

    // Click "에디터에 로드" to call onGenerate
    fireEvent.click(screen.getByText('에디터에 로드'));

    const generated = defaultProps.onGenerate.mock.calls[0]?.[0] as string;
    expect(generated).toContain('/dev 1.1\n@pause review');
    expect(generated).not.toContain('\r');
  });

});
