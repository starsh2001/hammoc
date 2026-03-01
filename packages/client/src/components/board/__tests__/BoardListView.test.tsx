/**
 * BoardListView Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardListView } from '../BoardListView';
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

const mockItems: BoardItem[] = [
  { id: 'issue-1', type: 'issue', title: 'Bug 1', status: 'Open' },
  { id: 'issue-2', type: 'issue', title: 'Bug 2', status: 'Open' },
  { id: 'story-1', type: 'story', title: 'Feature A', status: 'Done' },
  { id: 'story-2', type: 'story', title: 'Feature B', status: 'Closed' },
];

function createMockItemsByStatus(): Record<BoardItemStatus, BoardItem[]> {
  const result = createEmptyItemsByStatus();
  for (const item of mockItems) {
    result[item.status].push(item);
  }
  return result;
}

describe('BoardListView', () => {
  it('should render accordion groups for statuses with items', () => {
    render(<BoardListView itemsByStatus={createMockItemsByStatus()} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('should hide groups with no items', () => {
    render(<BoardListView itemsByStatus={createMockItemsByStatus()} />);

    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('should show item count in accordion header', () => {
    render(<BoardListView itemsByStatus={createMockItemsByStatus()} />);

    // Open has 2 items
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should toggle accordion group on click', () => {
    render(<BoardListView itemsByStatus={createMockItemsByStatus()} />);

    // Open group should be expanded by default (desktop)
    expect(screen.getByText('Bug 1')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText('Open'));
    expect(screen.queryByText('Bug 1')).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Bug 1')).toBeInTheDocument();
  });

  it('should have aria-expanded attribute on accordion headers', () => {
    render(<BoardListView itemsByStatus={createMockItemsByStatus()} />);

    const openButton = screen.getByText('Open').closest('button');
    expect(openButton).toHaveAttribute('aria-expanded', 'true');
  });

  describe('mobile mode', () => {
    it('should collapse Done and Closed groups by default', () => {
      render(<BoardListView itemsByStatus={createMockItemsByStatus()} isMobile />);

      // Open should be expanded
      expect(screen.getByText('Bug 1')).toBeInTheDocument();

      // Done items should NOT be visible (collapsed)
      expect(screen.queryByText('Feature A')).not.toBeInTheDocument();

      // Closed items should NOT be visible (collapsed)
      expect(screen.queryByText('Feature B')).not.toBeInTheDocument();
    });

    it('should expand Done group on click in mobile', () => {
      render(<BoardListView itemsByStatus={createMockItemsByStatus()} isMobile />);

      fireEvent.click(screen.getByText('Done'));
      expect(screen.getByText('Feature A')).toBeInTheDocument();
    });
  });
});
