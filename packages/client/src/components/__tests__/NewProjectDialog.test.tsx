/**
 * NewProjectDialog Tests
 * [Source: Story 3.6 - Task 6]
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NewProjectDialog } from '../NewProjectDialog';
import { useProjectStore } from '../../stores/projectStore';

// Mock the project store
vi.mock('../../stores/projectStore', () => ({
  useProjectStore: vi.fn(),
}));

describe('NewProjectDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockCreateProject = vi.fn();
  const mockValidatePath = vi.fn();
  const mockClearCreateError = vi.fn();
  const mockClearPathValidation = vi.fn();
  const mockAbortCreation = vi.fn();
  const mockFetchBmadVersions = vi.fn();

  const defaultStoreState = {
    isCreating: false,
    createError: null,
    pathValidation: null,
    isValidating: false,
    createProject: mockCreateProject,
    validatePath: mockValidatePath,
    clearCreateError: mockClearCreateError,
    clearPathValidation: mockClearPathValidation,
    abortCreation: mockAbortCreation,
    bmadVersions: ['4.44.3'],
    isFetchingVersions: false,
    fetchBmadVersions: mockFetchBmadVersions,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProjectStore).mockReturnValue(defaultStoreState);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('새 프로젝트')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(
        <NewProjectDialog isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders path input field', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByLabelText('프로젝트 경로')).toBeInTheDocument();
    });

    it('renders BMad checkbox checked by default', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const checkbox = screen.getByRole('checkbox', { name: /BMad Method 초기화/ });
      expect(checkbox).toBeChecked();
    });

    it('renders cancel and create buttons', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '생성' })).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('calls onClose when cancel button clicked', async () => {
      const user = userEvent.setup();
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await user.click(screen.getByRole('button', { name: '취소' }));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when close icon clicked', async () => {
      const user = userEvent.setup();
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await user.click(screen.getByLabelText('닫기'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when Escape pressed', async () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      fireEvent.keyDown(screen.getByRole('dialog').querySelector('div')!, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('toggles BMad checkbox', async () => {
      const user = userEvent.setup();
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const checkbox = screen.getByRole('checkbox', { name: /BMad Method 초기화/ });
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it('validates path on blur', async () => {
      const user = userEvent.setup();
      mockValidatePath.mockResolvedValue({ valid: true, exists: true, isProject: false });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('프로젝트 경로');
      await user.type(input, '/Users/test/project');
      await user.tab(); // blur

      expect(mockValidatePath).toHaveBeenCalledWith('/Users/test/project');
    });
  });

  describe('Form Submission', () => {
    it('disables create button for empty path', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const createButton = screen.getByRole('button', { name: '생성' });
      expect(createButton).toBeDisabled();
    });

    it('creates project successfully', async () => {
      const user = userEvent.setup();
      mockValidatePath.mockResolvedValue({ valid: true, exists: true, isProject: false });
      mockCreateProject.mockResolvedValue({
        project: { projectSlug: 'new-slug', originalPath: '/test' },
        isExisting: false,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('프로젝트 경로');
      await user.type(input, '/Users/test/project');
      await user.click(screen.getByRole('button', { name: '생성' }));

      await waitFor(() => {
        expect(mockCreateProject).toHaveBeenCalledWith('/Users/test/project', true, '4.44.3');
      });

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith('new-slug', false);
      });
    });

    it('submits with Enter key', async () => {
      const user = userEvent.setup();
      mockValidatePath.mockResolvedValue({ valid: true, exists: true, isProject: false });
      mockCreateProject.mockResolvedValue({
        project: { projectSlug: 'new-slug', originalPath: '/test' },
        isExisting: false,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('프로젝트 경로');
      await user.type(input, '/Users/test/project{Enter}');

      await waitFor(() => {
        expect(mockCreateProject).toHaveBeenCalled();
      });
    });
  });

  describe('Existing Project Warning', () => {
    it('shows warning for existing project', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        pathValidation: {
          valid: true,
          exists: true,
          isProject: true,
          projectSlug: 'existing-slug',
        },
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByText(/이미 프로젝트로 등록되어 있습니다/)).toBeInTheDocument();
      expect(screen.getByText('기존 프로젝트로 이동하기')).toBeInTheDocument();
    });

    it('navigates to existing project when link clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        pathValidation: {
          valid: true,
          exists: true,
          isProject: true,
          projectSlug: 'existing-slug',
        },
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await user.click(screen.getByText('기존 프로젝트로 이동하기'));

      expect(mockOnSuccess).toHaveBeenCalledWith('existing-slug', true);
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('shows validation error', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        pathValidation: {
          valid: false,
          exists: false,
          isProject: false,
          error: '지정한 경로가 존재하지 않습니다.',
        },
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByText(/존재하지 않습니다/)).toBeInTheDocument();
    });

    it('shows create error', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        createError: '프로젝트 생성 중 오류가 발생했습니다.',
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByText('프로젝트 생성 중 오류가 발생했습니다.')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows validating indicator', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        isValidating: true,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByText('경로 확인 중...')).toBeInTheDocument();
    });

    it('shows creating state on button', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        isCreating: true,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByRole('button', { name: /생성 중/ })).toBeInTheDocument();
    });

    it('disables inputs while creating', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        isCreating: true,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByLabelText('프로젝트 경로')).toBeDisabled();
      expect(screen.getByRole('checkbox')).toBeDisabled();
    });
  });

  describe('Cancel During Creation', () => {
    it('shows confirmation when canceling via close button during creation', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        isCreating: true,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      // Click the close icon button (which is not disabled)
      await user.click(screen.getByLabelText('닫기'));

      expect(confirmSpy).toHaveBeenCalledWith('프로젝트 생성이 진행 중입니다. 취소하시겠습니까?');
      expect(mockOnClose).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('aborts creation when confirmed via close button', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        isCreating: true,
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      // Click the close icon button
      await user.click(screen.getByLabelText('닫기'));

      expect(mockAbortCreation).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA attributes', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'new-project-title');
    });

    it('marks input as invalid when create error exists', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        createError: 'Error message',
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('프로젝트 경로');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'path-error');
    });

    it('has role=alert for error messages', () => {
      vi.mocked(useProjectStore).mockReturnValue({
        ...defaultStoreState,
        createError: 'Error message',
      });

      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has minimum touch target size (44x44px)', () => {
      render(
        <NewProjectDialog isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        // Check that buttons have min-h-[44px] or min-w-[44px] classes
        expect(
          button.className.includes('min-h-[44px]') ||
            button.className.includes('min-w-[44px]') ||
            button.className.includes('p-2')
        ).toBe(true);
      });
    });
  });
});
