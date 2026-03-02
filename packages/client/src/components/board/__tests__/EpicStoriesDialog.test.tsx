/**
 * EpicStoriesDialog Component Tests
 * [Source: Story 21.3 - Task 7]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EpicStoriesDialog } from '../EpicStoriesDialog';
import type { BoardItem } from '@bmad-studio/shared';

const epicItem: BoardItem = {
  id: 'epic-21',
  type: 'epic',
  title: 'Project Board',
  status: 'InProgress',
  epicNumber: 21,
  storyProgress: { total: 3, done: 1 },
};

const stories: BoardItem[] = [
  {
    id: 'story-21.1',
    type: 'story',
    title: 'Board API Implementation',
    status: 'Done',
    epicNumber: 21,
  },
  {
    id: 'story-21.2',
    type: 'story',
    title: 'Board UI Implementation',
    status: 'InProgress',
    epicNumber: 21,
  },
  {
    id: 'story-21.3',
    type: 'story',
    title: 'Card Actions',
    status: 'Draft',
    epicNumber: 21,
  },
];

describe('EpicStoriesDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when open is false', () => {
    render(
      <EpicStoriesDialog open={false} epic={epicItem} stories={stories} onClose={mockOnClose} />,
    );
    expect(screen.queryByText('Project Board')).not.toBeInTheDocument();
  });

  it('should not render when epic is null', () => {
    render(
      <EpicStoriesDialog open={true} epic={null} stories={stories} onClose={mockOnClose} />,
    );
    expect(screen.queryByText('진행률')).not.toBeInTheDocument();
  });

  it('should render epic title and progress bar', () => {
    render(
      <EpicStoriesDialog open={true} epic={epicItem} stories={stories} onClose={mockOnClose} />,
    );
    expect(screen.getByText('Project Board')).toBeInTheDocument();
    expect(screen.getByText('1/3 (33%)')).toBeInTheDocument();
    expect(screen.getByText('진행률')).toBeInTheDocument();
  });

  it('should render child stories with status badges', () => {
    render(
      <EpicStoriesDialog open={true} epic={epicItem} stories={stories} onClose={mockOnClose} />,
    );
    expect(screen.getByText('Board API Implementation')).toBeInTheDocument();
    expect(screen.getByText('Board UI Implementation')).toBeInTheDocument();
    expect(screen.getByText('Card Actions')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('should render story numbers from id', () => {
    render(
      <EpicStoriesDialog open={true} epic={epicItem} stories={stories} onClose={mockOnClose} />,
    );
    expect(screen.getByText('21.1')).toBeInTheDocument();
    expect(screen.getByText('21.2')).toBeInTheDocument();
    expect(screen.getByText('21.3')).toBeInTheDocument();
  });

  it('should show empty message when no stories', () => {
    render(
      <EpicStoriesDialog open={true} epic={epicItem} stories={[]} onClose={mockOnClose} />,
    );
    expect(screen.getByText('하위 스토리가 없습니다')).toBeInTheDocument();
  });

  it('should calculate progress from stories when storyProgress is missing', () => {
    const epicWithoutProgress: BoardItem = {
      ...epicItem,
      storyProgress: undefined,
    };
    render(
      <EpicStoriesDialog open={true} epic={epicWithoutProgress} stories={stories} onClose={mockOnClose} />,
    );
    // 1 out of 3 stories is Done
    expect(screen.getByText('1/3 (33%)')).toBeInTheDocument();
  });

  it('should close dialog when Escape key is pressed', () => {
    render(
      <EpicStoriesDialog open={true} epic={epicItem} stories={stories} onClose={mockOnClose} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close dialog when overlay is clicked', () => {
    render(
      <EpicStoriesDialog open={true} epic={epicItem} stories={stories} onClose={mockOnClose} />,
    );
    const overlay = document.querySelector('.bg-black\\/50');
    if (overlay) {
      fireEvent.click(overlay);
    }
    expect(mockOnClose).toHaveBeenCalled();
  });
});
