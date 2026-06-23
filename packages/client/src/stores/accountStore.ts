/**
 * Account Store (Story BS-8) — Zustand state for the multi-account credential store.
 *
 * Holds the token-free account list + active key, drives switch/remove via REST, and
 * stays in sync across tabs by listening for the server's `account:switched` /
 * `account:removed` broadcasts.
 */

import { create } from 'zustand';
import type {
  AccountSummary,
  AccountSwitchedEvent,
  AccountRemovedEvent,
} from '@hammoc/shared';
import { getSocket } from '../services/socket';
import { accountsApi } from '../services/api/accountsApi';

interface AccountState {
  accounts: AccountSummary[];
  activeKey: string | null;
  isLoading: boolean;
  /** Store key currently being switched/removed (for per-row spinners + disabling). */
  pendingKey: string | null;
}

interface AccountActions {
  fetch: () => Promise<void>;
  /** Switch the active account. Returns whether re-authentication is required (AC12). */
  switchTo: (key: string) => Promise<{ reauthRequired: boolean }>;
  remove: (key: string) => Promise<void>;
  /** Wire WebSocket cross-tab sync. Returns an unsubscribe cleanup. */
  subscribe: () => () => void;
}

type AccountStore = AccountState & AccountActions;

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  activeKey: null,
  isLoading: false,
  pendingKey: null,

  fetch: async () => {
    set({ isLoading: true });
    try {
      const res = await accountsApi.list();
      set({ accounts: res.accounts, activeKey: res.activeKey, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  switchTo: async (key: string) => {
    set({ pendingKey: key });
    try {
      const res = await accountsApi.switch(key);
      set({ accounts: res.accounts, activeKey: res.activeKey, pendingKey: null });
      return { reauthRequired: res.reauthRequired };
    } catch (err) {
      set({ pendingKey: null });
      throw err;
    }
  },

  remove: async (key: string) => {
    set({ pendingKey: key });
    try {
      await accountsApi.remove(key);
      // Optimistic local prune; the broadcast also reaches other tabs.
      set((state) => ({
        accounts: state.accounts.filter((a) => a.key !== key),
        pendingKey: null,
      }));
    } catch (err) {
      set({ pendingKey: null });
      throw err;
    }
  },

  subscribe: () => {
    const socket = getSocket();
    const onSwitched = (_e: AccountSwitchedEvent) => {
      // Another tab (or this one) switched — re-pull the authoritative list + active marker.
      get().fetch();
    };
    const onRemoved = (e: AccountRemovedEvent) => {
      set((state) => ({ accounts: state.accounts.filter((a) => a.key !== e.key) }));
    };
    socket.on('account:switched', onSwitched);
    socket.on('account:removed', onRemoved);
    return () => {
      socket.off('account:switched', onSwitched);
      socket.off('account:removed', onRemoved);
    };
  },
}));
