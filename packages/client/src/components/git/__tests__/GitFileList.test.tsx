/**
 * GitFileList Component Tests
 * [Source: Story 16.3 - Task 9.1]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GitFileList } from '../GitFileList';
import type { GitFileStatus } from '@bmad-studio/shared';

const stagedFiles: GitFileStatus[] = [
  { path: 'src/index.ts', index: 'M', working_dir: ' ' },
  { path: 'src/new-file.ts', index: 'A', working_dir: ' ' },
];

const unstagedFiles: GitFileStatus[] = [
  { path: 'src/utils.ts', index: ' ', working_dir: 'M' },
  { path: 'src/deleted.ts', index: ' ', working_dir: 'D' },
];

const untrackedFiles = ['src/temp.ts', 'notes.md'];

describe('GitFileList', () => {
  // TC-GIT-FL1: Renders file list with correct status indicators
  it('renders file list with correct status indicators (M, D, A, ?)', () => {
    render(
      <GitFileList
        title="Staged Changes"
        files={stagedFiles}
        type="staged"
        onFileClick={vi.fn()}
      />,
    );
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    expect(screen.getByText('src/new-file.ts')).toBeInTheDocument();
  });

  // TC-GIT-FL2: Shows "Stage All" button for unstaged group
  it('shows Stage All button for unstaged group', () => {
    const onStageAll = vi.fn();
    render(
      <GitFileList
        title="Changes"
        files={unstagedFiles}
        type="unstaged"
        onStageAll={onStageAll}
        onFileClick={vi.fn()}
      />,
    );
    const stageAllBtn = screen.getByTitle('Stage All');
    fireEvent.click(stageAllBtn);
    expect(onStageAll).toHaveBeenCalledTimes(1);
  });

  // TC-GIT-FL3: Shows "Unstage All" button for staged group
  it('shows Unstage All button for staged group', () => {
    const onUnstageAll = vi.fn();
    render(
      <GitFileList
        title="Staged Changes"
        files={stagedFiles}
        type="staged"
        onUnstageAll={onUnstageAll}
        onFileClick={vi.fn()}
      />,
    );
    const unstageAllBtn = screen.getByTitle('Unstage All');
    fireEvent.click(unstageAllBtn);
    expect(onUnstageAll).toHaveBeenCalledTimes(1);
  });

  // TC-GIT-FL4: Calls onStageFile when individual stage button clicked
  it('calls onStageFile when individual stage button is clicked', () => {
    const onStageFile = vi.fn();
    render(
      <GitFileList
        title="Changes"
        files={unstagedFiles}
        type="unstaged"
        onStageFile={onStageFile}
        onFileClick={vi.fn()}
      />,
    );
    const stageButtons = screen.getAllByTitle('Stage');
    fireEvent.click(stageButtons[0]);
    expect(onStageFile).toHaveBeenCalledWith('src/utils.ts');
  });

  // TC-GIT-FL5: Calls onUnstageFile when individual unstage button clicked
  it('calls onUnstageFile when individual unstage button is clicked', () => {
    const onUnstageFile = vi.fn();
    render(
      <GitFileList
        title="Staged Changes"
        files={stagedFiles}
        type="staged"
        onUnstageFile={onUnstageFile}
        onFileClick={vi.fn()}
      />,
    );
    const unstageButtons = screen.getAllByTitle('Unstage');
    fireEvent.click(unstageButtons[0]);
    expect(onUnstageFile).toHaveBeenCalledWith('src/index.ts');
  });

  // TC-GIT-FL6: Calls onFileClick when file path clicked
  it('calls onFileClick when file path is clicked', () => {
    const onFileClick = vi.fn();
    render(
      <GitFileList
        title="Staged Changes"
        files={stagedFiles}
        type="staged"
        onFileClick={onFileClick}
      />,
    );
    fireEvent.click(screen.getByText('src/index.ts'));
    expect(onFileClick).toHaveBeenCalledWith('src/index.ts', true);
  });

  // TC-GIT-FL7: Shows file count badge in group header
  it('shows file count badge in group header', () => {
    render(
      <GitFileList
        title="Staged Changes"
        files={stagedFiles}
        type="staged"
        onFileClick={vi.fn()}
      />,
    );
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Staged Changes')).toBeInTheDocument();
  });

  // TC-GIT-FL8: Handles empty file list gracefully
  it('returns null when files array is empty', () => {
    const { container } = render(
      <GitFileList
        title="Staged Changes"
        files={[]}
        type="staged"
        onFileClick={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  // Untracked files render with ? indicator
  it('renders untracked files with ? status indicator', () => {
    render(
      <GitFileList
        title="Untracked"
        files={untrackedFiles}
        type="untracked"
        onFileClick={vi.fn()}
      />,
    );
    const questionMarks = screen.getAllByText('?');
    expect(questionMarks).toHaveLength(2);
    expect(screen.getByText('src/temp.ts')).toBeInTheDocument();
    expect(screen.getByText('notes.md')).toBeInTheDocument();
  });

  // Collapsible behavior
  it('collapses and expands file list on header click', () => {
    render(
      <GitFileList
        title="Changes"
        files={unstagedFiles}
        type="unstaged"
        onFileClick={vi.fn()}
      />,
    );
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();

    // Click header to collapse
    fireEvent.click(screen.getByText('Changes'));
    expect(screen.queryByText('src/utils.ts')).not.toBeInTheDocument();

    // Click header to expand
    fireEvent.click(screen.getByText('Changes'));
    expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
  });
});
