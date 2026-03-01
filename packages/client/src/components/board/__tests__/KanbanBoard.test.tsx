/**
 * KanbanBoard Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanbanBoard } from '../KanbanBoard';
import type { BoardItem, BoardItemStatus } from '@bmad-studio/shared';

function createEmptyItemsByStatus(): Record<BoardItemStatus, BoardItem[]> {
  return {
    Open: [],
    Draft: [],
    Approved: [],
    InProgress: [],
    Review: [],
    Done: [],
    Closed: [],
  };
}

describe('KanbanBoard', () => {
  it('should render all 7 status columns', () => {
    render(<KanbanBoard itemsByStatus={createEmptyItemsByStatus()} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('should show empty columns with 0 count', () => {
    render(<KanbanBoard itemsByStatus={createEmptyItemsByStatus()} />);

    const zeroBadges = screen.getAllByText('0');
    expect(zeroBadges).toHaveLength(7);
  });

  it('should show correct item count in column headers', () => {
    const itemsByStatus = createEmptyItemsByStatus();
    itemsByStatus.Open = [
      { id: 'issue-1', type: 'issue', title: 'Bug 1', status: 'Open' },
      { id: 'issue-2', type: 'issue', title: 'Bug 2', status: 'Open' },
    ];
    itemsByStatus.InProgress = [
      { id: 'story-1', type: 'story', title: 'Feature', status: 'InProgress' },
    ];

    render(<KanbanBoard itemsByStatus={itemsByStatus} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should render cards in correct columns', () => {
    const itemsByStatus = createEmptyItemsByStatus();
    itemsByStatus.Open = [
      { id: 'issue-1', type: 'issue', title: 'Open Bug', status: 'Open' },
    ];
    itemsByStatus.Done = [
      { id: 'story-1', type: 'story', title: 'Done Story', status: 'Done' },
    ];

    render(<KanbanBoard itemsByStatus={itemsByStatus} />);

    expect(screen.getByText('Open Bug')).toBeInTheDocument();
    expect(screen.getByText('Done Story')).toBeInTheDocument();
  });
});
