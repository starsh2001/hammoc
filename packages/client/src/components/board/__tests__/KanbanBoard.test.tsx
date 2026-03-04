/**
 * KanbanBoard Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanbanBoard } from '../KanbanBoard';
import type { BoardItem } from '@bmad-studio/shared';
import { DEFAULT_BOARD_CONFIG } from '@bmad-studio/shared';

function createEmptyItemsByColumn(): Record<string, BoardItem[]> {
  return Object.fromEntries(DEFAULT_BOARD_CONFIG.columns.map((c) => [c.id, []]));
}

describe('KanbanBoard', () => {
  it('should render all 5 columns', () => {
    render(<KanbanBoard itemsByColumn={createEmptyItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Doing')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('should show empty columns with 0 count', () => {
    render(<KanbanBoard itemsByColumn={createEmptyItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    const zeroBadges = screen.getAllByText('0');
    expect(zeroBadges).toHaveLength(5);
  });

  it('should show correct item count in column headers', () => {
    const itemsByColumn = createEmptyItemsByColumn();
    itemsByColumn.Open = [
      { id: 'issue-1', type: 'issue', title: 'Bug 1', status: 'Open' },
      { id: 'issue-2', type: 'issue', title: 'Bug 2', status: 'Open' },
    ];
    itemsByColumn.Doing = [
      { id: 'story-1', type: 'story', title: 'Feature', status: 'InProgress' },
    ];

    render(<KanbanBoard itemsByColumn={itemsByColumn} boardConfig={DEFAULT_BOARD_CONFIG} />);

    expect(screen.getByTestId('column-count-Open')).toHaveTextContent('2');
    expect(screen.getByTestId('column-count-Doing')).toHaveTextContent('1');
  });

  it('should render cards in correct columns', () => {
    const itemsByColumn = createEmptyItemsByColumn();
    itemsByColumn.Open = [
      { id: 'issue-1', type: 'issue', title: 'Open Bug', status: 'Open' },
    ];
    itemsByColumn.Close = [
      { id: 'story-1', type: 'story', title: 'Done Story', status: 'Done' },
      { id: 'story-2', type: 'story', title: 'Closed Story', status: 'Closed' },
    ];

    render(<KanbanBoard itemsByColumn={itemsByColumn} boardConfig={DEFAULT_BOARD_CONFIG} />);

    expect(screen.getByText('Open Bug')).toBeInTheDocument();
    expect(screen.getByText('Done Story')).toBeInTheDocument();
    expect(screen.getByText('Closed Story')).toBeInTheDocument();
  });
});
