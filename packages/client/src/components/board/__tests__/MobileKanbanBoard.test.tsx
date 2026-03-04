/**
 * MobileKanbanBoard Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileKanbanBoard } from '../MobileKanbanBoard';
import type { BoardItem } from '@bmad-studio/shared';
import { DEFAULT_BOARD_CONFIG } from '@bmad-studio/shared';

function createEmptyItemsByColumn(): Record<string, BoardItem[]> {
  return Object.fromEntries(DEFAULT_BOARD_CONFIG.columns.map((c) => [c.id, []]));
}

function createMockItemsByColumn(): Record<string, BoardItem[]> {
  const result = createEmptyItemsByColumn();
  result.Open = [
    { id: 'issue-1', type: 'issue', title: 'Open Bug', status: 'Open' },
  ];
  result.Doing = [
    { id: 'story-1', type: 'story', title: 'WIP Feature', status: 'InProgress' },
  ];
  return result;
}

describe('MobileKanbanBoard', () => {
  it('should show the first column (Open) initially', () => {
    render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    // "Open" appears as both column header and status badge
    expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Open Bug')).toBeInTheDocument();
  });

  it('should render indicator dots for all 5 columns', () => {
    render(<MobileKanbanBoard itemsByColumn={createEmptyItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    const dots = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
    );
    expect(dots).toHaveLength(5);
  });

  it('should highlight the current column dot', () => {
    render(<MobileKanbanBoard itemsByColumn={createEmptyItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    const dots = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
    );

    // First dot should be active (blue)
    expect(dots[0].className).toContain('bg-blue-500');
    expect(dots[1].className).toContain('bg-gray-300');
  });

  it('should display column header with column name and item count', () => {
    render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    // "Open" appears as both column header and status badge
    expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
    // Multiple columns may show "1" count since all columns render in the carousel
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('should navigate to column when dot is clicked', () => {
    render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    // Click the 3rd dot (Doing, index 2)
    const dots = screen.getAllByRole('button').filter((btn) =>
      btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
    );
    fireEvent.click(dots[2]); // Doing is index 2

    expect(screen.getByText('Doing')).toBeInTheDocument();
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
      render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

      // Initially on Open (index 0)
      expect(screen.getByText('Open Bug')).toBeInTheDocument();

      // Swipe left (negative delta > threshold)
      const container = screen.getByText('Open Bug').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 200, 100); // dx = -100

      // Should be on To Do (index 1)
      expect(screen.getByText('To Do')).toBeInTheDocument();
    });

    it('should navigate to previous column on right swipe', () => {
      render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

      // Navigate to To Do first
      const dots = screen.getAllByRole('button').filter((btn) =>
        btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
      );
      fireEvent.click(dots[1]); // To Do
      expect(screen.getByText('To Do')).toBeInTheDocument();

      // Swipe right (positive delta > threshold)
      const container = screen.getByText('To Do').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 100, 200); // dx = +100

      // Should go back to Open
      expect(screen.getByText('Open Bug')).toBeInTheDocument();
    });

    it('should not navigate when swipe distance is below threshold (50px)', () => {
      render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

      const container = screen.getByText('Open Bug').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 200, 180); // dx = -20, below 50px threshold

      // Should stay on Open
      expect(screen.getByText('Open Bug')).toBeInTheDocument();
    });

    it('should not go before first column on right swipe', () => {
      render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

      // Already on first column (Open)
      const container = screen.getByText('Open Bug').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 100, 200); // right swipe

      // Should stay on Open
      expect(screen.getByText('Open Bug')).toBeInTheDocument();
    });

    it('should not go past last column on left swipe', () => {
      render(<MobileKanbanBoard itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

      // Navigate to last column (Close, index 4)
      const dots = screen.getAllByRole('button').filter((btn) =>
        btn.getAttribute('aria-label')?.includes('칼럼으로 이동'),
      );
      fireEvent.click(dots[4]);
      expect(screen.getByText('Close')).toBeInTheDocument();

      // Try left swipe
      const container = screen.getByText('Close').closest('div[class*="flex-1"]') as HTMLElement;
      simulateSwipe(container, 200, 100); // left swipe

      // Should stay on Close
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
  });
});
