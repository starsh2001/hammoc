/**
 * MobileKanbanBoard Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileKanbanBoard } from '../MobileKanbanBoard';
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

function createMockItemsByStatus(): Record<BoardItemStatus, BoardItem[]> {
  const result = createEmptyItemsByStatus();
  result.Open = [
    { id: 'issue-1', type: 'issue', title: 'Open Bug', status: 'Open' },
  ];
  result.InProgress = [
    { id: 'story-1', type: 'story', title: 'WIP Feature', status: 'InProgress' },
  ];
  return result;
}

describe('MobileKanbanBoard', () => {
  it('should show the first column (Open) initially', () => {
    render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Open Bug')).toBeInTheDocument();
  });

  it('should render indicator dots for all 7 columns', () => {
    render(<MobileKanbanBoard itemsByStatus={createEmptyItemsByStatus()} />);

    const dots = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
    );
    expect(dots).toHaveLength(7);
  });

  it('should highlight the current column dot', () => {
    render(<MobileKanbanBoard itemsByStatus={createEmptyItemsByStatus()} />);

    const dots = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
    );

    // First dot should be active (blue)
    expect(dots[0].className).toContain('bg-blue-500');
    expect(dots[1].className).toContain('bg-gray-300');
  });

  it('should display column header with status name and item count', () => {
    render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should navigate to column when dot is clicked', () => {
    render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

    // Click the 4th dot (InProgress)
    const dots = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
    );
    fireEvent.click(dots[3]); // InProgress is index 3

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('WIP Feature')).toBeInTheDocument();
  });

  describe('swipe navigation', () => {
    function simulateSwipe(element: HTMLElement, startX: number, endX: number) {
      fireEvent.touchStart(element, {
        touches: [{ clientX: startX, clientY: 100 }],
      });
      fireEvent.touchMove(element, {
        touches: [{ clientX: endX, clientY: 100 }],
      });
      fireEvent.touchEnd(element);
    }

    it('should navigate to next column on left swipe', () => {
      render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

      // Initially on Open (index 0)
      expect(screen.getByText('Open')).toBeInTheDocument();

      // Swipe left (negative delta > threshold)
      const container = screen.getByText('Open Bug').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 200, 100); // dx = -100

      // Should be on Draft (index 1)
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('should navigate to previous column on right swipe', () => {
      render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

      // Navigate to Draft first
      const dots = screen.getAllByRole('button').filter((btn) =>
        btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
      );
      fireEvent.click(dots[1]); // Draft
      expect(screen.getByText('Draft')).toBeInTheDocument();

      // Swipe right (positive delta > threshold)
      const container = screen.getByText('Draft').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 100, 200); // dx = +100

      // Should go back to Open
      expect(screen.getByText('Open Bug')).toBeInTheDocument();
    });

    it('should not navigate when swipe distance is below threshold (50px)', () => {
      render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

      const container = screen.getByText('Open Bug').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 200, 180); // dx = -20, below 50px threshold

      // Should stay on Open
      expect(screen.getByText('Open Bug')).toBeInTheDocument();
    });

    it('should not go before first column on right swipe', () => {
      render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

      // Already on first column (Open)
      const container = screen.getByText('Open Bug').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 100, 200); // right swipe

      // Should stay on Open
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('Open Bug')).toBeInTheDocument();
    });

    it('should not go past last column on left swipe', () => {
      render(<MobileKanbanBoard itemsByStatus={createMockItemsByStatus()} />);

      // Navigate to last column (Closed, index 6)
      const dots = screen.getAllByRole('button').filter((btn) =>
        btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
      );
      fireEvent.click(dots[6]);
      expect(screen.getByText('Closed')).toBeInTheDocument();

      // Try left swipe
      const container = screen.getByText('Closed').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 200, 100); // left swipe

      // Should stay on Closed
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });
  });
});
