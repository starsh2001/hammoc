/**
 * BoardListView Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BoardListView } from '../BoardListView';
import type { BoardItem } from '@hammoc/shared';
import { DEFAULT_BOARD_CONFIG } from '@hammoc/shared';

function createEmptyItemsByColumn(): Record<string, BoardItem[]> {
  return Object.fromEntries(DEFAULT_BOARD_CONFIG.columns.map((c) => [c.id, []]));
}

function createMockItemsByColumn(): Record<string, BoardItem[]> {
  const result = createEmptyItemsByColumn();
  result.Open = [
    { id: 'issue-1', type: 'issue', title: 'Bug 1', status: 'Open' },
    { id: 'issue-2', type: 'issue', title: 'Bug 2', status: 'Open' },
  ];
  result.Close = [
    { id: 'story-1', type: 'story', title: 'Feature A', status: 'Done' },
    { id: 'story-2', type: 'story', title: 'Feature B', status: 'Closed' },
  ];
  return result;
}

describe('BoardListView', () => {
  // Helper: find column header text (inside font-semibold span, not a status badge)
  function getColumnHeaders() {
    return screen.getAllByText(/.+/, {
      selector: 'span.text-sm.font-semibold',
    });
  }

  it('should render accordion groups for columns with items', () => {
    render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    const headers = getColumnHeaders();
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).toContain('Open');
    expect(headerTexts).toContain('Close');
  });

  it('should hide groups with no items', () => {
    render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    const headers = getColumnHeaders();
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).not.toContain('To Do');
    expect(headerTexts).not.toContain('Doing');
    expect(headerTexts).not.toContain('Review');
  });

  it('should show item count in accordion header', () => {
    render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    // Open has 2 items, Close has 2 items
    expect(screen.getByTestId('column-count-Open')).toHaveTextContent('2');
    expect(screen.getByTestId('column-count-Close')).toHaveTextContent('2');
  });

  it('should toggle accordion group on click', () => {
    render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    // Open group should be expanded by default (desktop)
    expect(screen.getByText('Bug 1')).toBeInTheDocument();

    // Click the Open column header
    const openHeader = screen.getByText('Open', { selector: 'span.text-sm.font-semibold' });
    fireEvent.click(openHeader);
    expect(screen.queryByText('Bug 1')).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(openHeader);
    expect(screen.getByText('Bug 1')).toBeInTheDocument();
  });

  it('should have aria-expanded attribute on accordion headers', () => {
    render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    const openHeader = screen.getByText('Open', { selector: 'span.text-sm.font-semibold' });
    const openButton = openHeader.closest('button');
    expect(openButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('should group Done and Closed items in Close column', () => {
    render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} />);

    // Both items should be in Close accordion
    expect(screen.getByText('Feature A')).toBeInTheDocument();
    expect(screen.getByText('Feature B')).toBeInTheDocument();
  });

  describe('mobile mode', () => {
    it('should collapse Close group by default', () => {
      render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} isMobile />);

      // Open should be expanded
      expect(screen.getByText('Bug 1')).toBeInTheDocument();

      // Close items should NOT be visible (collapsed)
      expect(screen.queryByText('Feature A')).not.toBeInTheDocument();
      expect(screen.queryByText('Feature B')).not.toBeInTheDocument();
    });

    it('should expand Close group on click in mobile', () => {
      render(<BoardListView itemsByColumn={createMockItemsByColumn()} boardConfig={DEFAULT_BOARD_CONFIG} isMobile />);

      // Click the Close column header (font-semibold)
      const closeHeader = screen.getByText('Close', { selector: 'span.text-sm.font-semibold' });
      fireEvent.click(closeHeader);
      expect(screen.getByText('Feature A')).toBeInTheDocument();
    });
  });
});
