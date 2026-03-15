/**
 * chainStore Tests
 * [Source: Story 24.2 - Task 9.1]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useChainStore } from '../chainStore';
import type { PromptChainItem } from '@hammoc/shared';

const mockItems: PromptChainItem[] = [
  { id: 'chain-1', content: '/dev', status: 'pending', createdAt: 1000 },
  { id: 'chain-2', content: '/test', status: 'sending', createdAt: 2000 },
];

describe('chainStore', () => {
  beforeEach(() => {
    useChainStore.setState({ chainItems: [] });
  });

  it('initializes with empty chainItems', () => {
    expect(useChainStore.getState().chainItems).toEqual([]);
  });

  it('setChainItems updates state', () => {
    useChainStore.getState().setChainItems(mockItems);
    expect(useChainStore.getState().chainItems).toEqual(mockItems);
  });

  it('setChainItems replaces existing items', () => {
    useChainStore.getState().setChainItems(mockItems);
    const newItems: PromptChainItem[] = [
      { id: 'chain-3', content: '/build', status: 'pending', createdAt: 3000 },
    ];
    useChainStore.getState().setChainItems(newItems);
    expect(useChainStore.getState().chainItems).toEqual(newItems);
  });

  it('clearChainItems resets to empty array', () => {
    useChainStore.getState().setChainItems(mockItems);
    useChainStore.getState().clearChainItems();
    expect(useChainStore.getState().chainItems).toEqual([]);
  });
});
