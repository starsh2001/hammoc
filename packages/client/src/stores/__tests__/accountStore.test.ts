/**
 * Story BS-8: accountStore unit tests — fetch / switch / remove state transitions
 * and WebSocket cross-tab subscription wiring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AccountListResponse, AccountSwitchResponse } from '@hammoc/shared';
import { useAccountStore } from '../accountStore';
import { accountsApi } from '../../services/api/accountsApi';

vi.mock('../../services/api/accountsApi', () => ({
  accountsApi: {
    list: vi.fn(),
    switch: vi.fn(),
    remove: vi.fn(),
  },
}));

const socketHandlers: Record<string, (arg: unknown) => void> = {};
const mockOn = vi.fn((ev: string, cb: (arg: unknown) => void) => { socketHandlers[ev] = cb; });
const mockOff = vi.fn((ev: string) => { delete socketHandlers[ev]; });
vi.mock('../../services/socket', () => ({
  getSocket: () => ({ on: mockOn, off: mockOff, emit: vi.fn() }),
}));

const mockedList = vi.mocked(accountsApi.list);
const mockedSwitch = vi.mocked(accountsApi.switch);
const mockedRemove = vi.mocked(accountsApi.remove);

const listResponse: AccountListResponse = {
  activeKey: 'a@example.com',
  accounts: [
    { key: 'a@example.com', email: 'a@example.com', tier: 'max', active: true, lastUsedAt: 1 },
    { key: 'b@example.com', email: 'b@example.com', tier: 'pro', active: false, lastUsedAt: 2 },
  ],
};

describe('accountStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(socketHandlers)) delete socketHandlers[k];
    useAccountStore.setState({ accounts: [], activeKey: null, isLoading: false, pendingKey: null });
  });

  it('fetch loads accounts + active key', async () => {
    mockedList.mockResolvedValue(listResponse);
    await useAccountStore.getState().fetch();
    const state = useAccountStore.getState();
    expect(state.accounts).toHaveLength(2);
    expect(state.activeKey).toBe('a@example.com');
    expect(state.isLoading).toBe(false);
  });

  it('switchTo updates accounts/activeKey and returns reauthRequired', async () => {
    const switchResponse: AccountSwitchResponse = {
      success: true,
      activeKey: 'b@example.com',
      reauthRequired: false,
      accounts: [
        { key: 'a@example.com', email: 'a@example.com', tier: 'max', active: false, lastUsedAt: 1 },
        { key: 'b@example.com', email: 'b@example.com', tier: 'pro', active: true, lastUsedAt: 3 },
      ],
    };
    mockedSwitch.mockResolvedValue(switchResponse);

    const result = await useAccountStore.getState().switchTo('b@example.com');
    expect(result.reauthRequired).toBe(false);
    expect(useAccountStore.getState().activeKey).toBe('b@example.com');
    expect(useAccountStore.getState().pendingKey).toBeNull();
  });

  it('switchTo surfaces reauthRequired from the server (AC12)', async () => {
    mockedSwitch.mockResolvedValue({
      success: true, activeKey: 'b@example.com', reauthRequired: true, accounts: listResponse.accounts,
    });
    const result = await useAccountStore.getState().switchTo('b@example.com');
    expect(result.reauthRequired).toBe(true);
  });

  it('switchTo clears pendingKey on failure', async () => {
    mockedSwitch.mockRejectedValue(new Error('boom'));
    await expect(useAccountStore.getState().switchTo('b@example.com')).rejects.toThrow('boom');
    expect(useAccountStore.getState().pendingKey).toBeNull();
  });

  it('remove optimistically prunes the account', async () => {
    useAccountStore.setState({ accounts: listResponse.accounts, activeKey: 'a@example.com' });
    mockedRemove.mockResolvedValue({ success: true });

    await useAccountStore.getState().remove('b@example.com');
    expect(useAccountStore.getState().accounts.map((a) => a.key)).toEqual(['a@example.com']);
  });

  it('subscribe wires account:switched / account:removed and unsubscribe removes them', () => {
    mockedList.mockResolvedValue(listResponse);
    useAccountStore.setState({ accounts: listResponse.accounts, activeKey: 'a@example.com' });

    const unsubscribe = useAccountStore.getState().subscribe();
    expect(socketHandlers['account:switched']).toBeTypeOf('function');
    expect(socketHandlers['account:removed']).toBeTypeOf('function');

    // account:removed prunes locally
    socketHandlers['account:removed']({ key: 'b@example.com' });
    expect(useAccountStore.getState().accounts.map((a) => a.key)).toEqual(['a@example.com']);

    // account:switched triggers a re-fetch
    socketHandlers['account:switched']({ key: 'b@example.com', email: 'b@example.com', tier: 'pro' });
    expect(mockedList).toHaveBeenCalled();

    unsubscribe();
    expect(mockOff).toHaveBeenCalledWith('account:switched', expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith('account:removed', expect.any(Function));
  });
});
