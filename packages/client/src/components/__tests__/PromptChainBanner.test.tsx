/**
 * PromptChainBanner Tests
 * [Source: Story 24.2 - Task 9.6]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PromptChainBanner } from '../PromptChainBanner';
import type { PromptChainItem } from '@hammoc/shared';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'chain.next') return 'Next:';
      if (key === 'chain.cancelAll') return 'Cancel all';
      if (key === 'chain.cancelAllTitle') return 'Cancel all prompts';
      if (key === 'chain.expandList') return 'Expand';
      if (key === 'chain.collapseList') return 'Collapse';
      if (key === 'chain.removePrompt') return `Remove #${opts?.index}`;
      if (key === 'chain.removeTitle') return 'Remove';
      if (key === 'chain.waitingAria') return `Waiting: ${opts?.prompt}`;
      return key;
    },
  }),
}));

const makePendingItem = (content: string, id?: string): PromptChainItem => ({
  id: id ?? `chain-${content}`,
  content,
  status: 'pending',
  createdAt: Date.now(),
});

const makeSendingItem = (content: string, id?: string): PromptChainItem => ({
  id: id ?? `chain-${content}`,
  content,
  status: 'sending',
  createdAt: Date.now(),
});

describe('PromptChainBanner', () => {
  it('renders nothing when pendingPrompts is empty', () => {
    const { container } = render(
      <PromptChainBanner pendingPrompts={[]} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all items are sent status', () => {
    const sentItem: PromptChainItem = {
      id: 'chain-1',
      content: '/dev',
      status: 'sent',
      createdAt: Date.now(),
    };
    const { container } = render(
      <PromptChainBanner pendingPrompts={[sentItem]} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders banner with single pending prompt', () => {
    const items = [makePendingItem('/dev')];
    render(
      <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} />
    );

    expect(screen.getByTestId('prompt-chain-banner')).toBeInTheDocument();
    expect(screen.getByText('/dev')).toBeInTheDocument();
  });

  it('displays item.content for display text', () => {
    const items = [makePendingItem('/BMad:tasks:create-next-story')];
    render(
      <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} />
    );

    // shortLabel returns the first line as-is
    expect(screen.getByText('/BMad:tasks:create-next-story')).toBeInTheDocument();
  });

  it('shows sending status with spinner', () => {
    const items = [makeSendingItem('/dev')];
    const { container } = render(
      <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} />
    );

    // Loader2 icon has animate-spin class when sending
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('shows +N count for multiple pending items', () => {
    const items = [
      makePendingItem('/dev'),
      makePendingItem('/test'),
      makePendingItem('/build'),
    ];
    render(
      <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} />
    );

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    const items = [makePendingItem('/dev')];
    render(
      <PromptChainBanner pendingPrompts={items} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByTitle('Cancel all prompts'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onRemove with item id when remove button is clicked', () => {
    const onRemove = vi.fn();
    const items = [
      makePendingItem('/dev', 'id-1'),
      makePendingItem('/test', 'id-2'),
    ];
    render(
      <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} onRemove={onRemove} />
    );

    // Expand the list first
    fireEvent.click(screen.getByTitle('Expand'));

    // Click remove on second item
    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[1]);
    expect(onRemove).toHaveBeenCalledWith('id-2');
  });

  it('filters by pending and sending statuses for count display', () => {
    const items: PromptChainItem[] = [
      makeSendingItem('/dev', 'id-1'),
      makePendingItem('/test', 'id-2'),
      { id: 'id-3', content: '/build', status: 'sent', createdAt: Date.now() },
    ];
    render(
      <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} />
    );

    // Only 2 active items (sending + pending), so +1
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  describe('drag-and-drop reorder', () => {
    it('renders chain-item testid for each active item when expanded', () => {
      const items = [
        makePendingItem('/a', 'id-a'),
        makePendingItem('/b', 'id-b'),
      ];
      render(
        <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} onReorder={vi.fn()} />
      );

      // Expand to render the list
      fireEvent.click(screen.getByTitle('Expand'));

      expect(screen.getAllByTestId('chain-item')).toHaveLength(2);
    });

    it('makes pending items draggable when onReorder is provided', () => {
      const items = [
        makePendingItem('/a', 'id-a'),
        makePendingItem('/b', 'id-b'),
      ];
      render(
        <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} onReorder={vi.fn()} />
      );
      fireEvent.click(screen.getByTitle('Expand'));

      const listItems = screen.getAllByTestId('chain-item');
      for (const li of listItems) {
        expect(li.getAttribute('draggable')).toBe('true');
      }
    });

    it('does not make sending items draggable', () => {
      const items = [
        makeSendingItem('/sending', 'id-s'),
        makePendingItem('/b', 'id-b'),
      ];
      render(
        <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} onReorder={vi.fn()} />
      );
      fireEvent.click(screen.getByTitle('Expand'));

      const listItems = screen.getAllByTestId('chain-item');
      expect(listItems[0].getAttribute('draggable')).toBe('false');
      expect(listItems[1].getAttribute('draggable')).toBe('true');
    });

    it('does not make items draggable when onReorder is not provided', () => {
      const items = [makePendingItem('/a', 'id-a'), makePendingItem('/b', 'id-b')];
      render(
        <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} />
      );
      fireEvent.click(screen.getByTitle('Expand'));

      const listItems = screen.getAllByTestId('chain-item');
      for (const li of listItems) {
        expect(li.getAttribute('draggable')).toBe('false');
      }
    });

    it('calls onReorder with new id order when drop completes on a different item', () => {
      const onReorder = vi.fn();
      const items = [
        makePendingItem('/a', 'id-a'),
        makePendingItem('/b', 'id-b'),
        makePendingItem('/c', 'id-c'),
      ];
      render(
        <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} onReorder={onReorder} />
      );
      fireEvent.click(screen.getByTitle('Expand'));

      const listItems = screen.getAllByTestId('chain-item');
      // Drag id-a over id-c and drop
      fireEvent.dragStart(listItems[0]);
      fireEvent.dragEnter(listItems[2]);
      fireEvent.drop(listItems[2]);

      expect(onReorder).toHaveBeenCalledWith(['id-b', 'id-c', 'id-a']);
    });

    it('does not call onReorder when dropping onto the same item', () => {
      const onReorder = vi.fn();
      const items = [makePendingItem('/a', 'id-a'), makePendingItem('/b', 'id-b')];
      render(
        <PromptChainBanner pendingPrompts={items} onCancel={vi.fn()} onReorder={onReorder} />
      );
      fireEvent.click(screen.getByTitle('Expand'));

      const listItems = screen.getAllByTestId('chain-item');
      fireEvent.dragStart(listItems[0]);
      fireEvent.dragEnter(listItems[0]);
      fireEvent.drop(listItems[0]);

      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
