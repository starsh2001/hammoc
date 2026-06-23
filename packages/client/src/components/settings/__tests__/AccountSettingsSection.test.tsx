/**
 * Story BS-8: AccountSettingsSection multi-account UI tests.
 * Asserts the account list renders the active indicator + switch/remove buttons and that
 * the remove button is disabled on the active account (AC8).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { AccountListResponse } from '@hammoc/shared';
import { AccountSettingsSection } from '../AccountSettingsSection';
import { accountApi } from '../../../services/api/account';
import { accountsApi } from '../../../services/api/accountsApi';

// Passthrough translation so assertions are key-based, not locale-coupled.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../services/api/account', () => ({
  accountApi: {
    get: vi.fn(),
    getUsage: vi.fn(),
    refresh: vi.fn(),
    refreshUsage: vi.fn(),
  },
}));

vi.mock('../../../services/api/accountsApi', () => ({
  accountsApi: { list: vi.fn(), switch: vi.fn(), remove: vi.fn() },
}));

vi.mock('../../../services/socket', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}));

// Avoid mounting the real login flow (it drives a socket handshake).
vi.mock('../../ClaudeLoginFlow', () => ({
  ClaudeLoginFlow: () => <div data-testid="login-flow" />,
}));

const mockedAccountGet = vi.mocked(accountApi.get);
const mockedAccountUsage = vi.mocked(accountApi.getUsage);
const mockedList = vi.mocked(accountsApi.list);

const twoAccounts: AccountListResponse = {
  activeKey: 'a@example.com',
  accounts: [
    { key: 'a@example.com', email: 'a@example.com', tier: 'max', active: true, lastUsedAt: 1 },
    { key: 'b@example.com', email: 'b@example.com', tier: 'pro', active: false, lastUsedAt: 2 },
  ],
};

describe('AccountSettingsSection — multi-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAccountGet.mockResolvedValue({
      account: { email: 'a@example.com', subscriptionType: 'max', apiProvider: 'firstParty' },
      fetchedAt: Date.now(),
    });
    mockedAccountUsage.mockResolvedValue({ rateLimit: null });
    mockedList.mockResolvedValue(twoAccounts);
  });

  it('renders the account list with both stored accounts', async () => {
    render(<AccountSettingsSection />);
    await waitFor(() => expect(screen.getByText('account.multiAccount.title')).toBeInTheDocument());
    expect(screen.getAllByText('a@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('b@example.com')).toBeInTheDocument();
  });

  it('shows a Switch button only for the inactive account', async () => {
    render(<AccountSettingsSection />);
    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    // Exactly one "Switch" button (for b@), none for the active a@.
    const switchButtons = screen.getAllByText('account.multiAccount.switch');
    expect(switchButtons).toHaveLength(1);
  });

  it('disables the Remove button on the active account, enables it on the inactive one (AC8)', async () => {
    render(<AccountSettingsSection />);
    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());

    // Both rows expose a remove control (aria-label = key); active one disabled.
    const removeButtons = screen.getAllByLabelText('account.multiAccount.remove');
    expect(removeButtons).toHaveLength(2);

    const [activeRemove, inactiveRemove] = removeButtons;
    expect(activeRemove).toBeDisabled();
    expect(inactiveRemove).not.toBeDisabled();
  });
});
