/**
 * Multi-Account Management types (Story BS-8)
 *
 * Hammoc stores the OAuth credentials produced by each Claude Code login in
 * `~/.hammoc/accounts.json` so a user can keep several Claude accounts and switch
 * between them. Switching overwrites the single-account `~/.claude/.credentials.json`
 * the CLI binary reads (it has no `--profile` flag — see Story BS-8 Dev Notes).
 *
 * The credential token material (`accessToken` / `refreshToken`) lives ONLY in the
 * server-side {@link StoredAccount.credential} block. It is never serialized into an
 * API response or a WebSocket payload — those carry the token-free {@link AccountSummary}.
 */

/**
 * The `claudeAiOauth` block from `~/.claude/.credentials.json`, captured verbatim.
 * Shape verified against the live file (BS-8 Dev Notes › Credential File Structure):
 * `expiresAt` is epoch milliseconds (a number, not an ISO string / JWT), and
 * `subscriptionType` (the account tier) lives inside this block. `email` does NOT —
 * it only comes from accountInfoService, hence the fallback key (AC1a).
 */
export interface ClaudeOAuthCredential {
  claudeAiOauth: {
    accessToken: string;
    refreshToken?: string;
    /** Epoch milliseconds. Expiry check = `expiresAt < Date.now()`. */
    expiresAt?: number;
    scopes?: string[];
    /** Account tier, e.g. "max" / "pro" / "team". Read directly here (no SDK needed). */
    subscriptionType?: string;
    rateLimitTier?: string;
    [key: string]: unknown;
  };
}

/**
 * A stored account entry in `~/.hammoc/accounts.json`.
 * The {@link credential} field is server-side only — see the file header.
 */
export interface StoredAccount {
  /** Account email, or null when accountInfoService could not supply one (AC1a). */
  email: string | null;
  /** Subscription tier read from `credential.claudeAiOauth.subscriptionType`. */
  tier: string | null;
  /** The captured `claudeAiOauth` block (tokens — never sent to clients). */
  credential: ClaudeOAuthCredential;
  /** Epoch ms of the last capture / activation of this account. */
  lastUsedAt: number;
  /** True when keyed by the `account:<hash>` fallback and the email needs back-fill (AC1a). */
  needsEmailBackfill?: boolean;
}

/**
 * On-disk shape of `~/.hammoc/accounts.json`.
 * `activeKey` mirrors which credential is currently written to `~/.claude/.credentials.json`.
 */
export interface AccountsStore {
  /** Store key (email or `account:<hash>` fallback) of the active account, or null. */
  activeKey: string | null;
  /** Stored accounts keyed by email or the `account:<hash>` fallback. */
  accounts: Record<string, StoredAccount>;
}

/**
 * Token-free public view of a stored account for API + WebSocket payloads (AC14, AC15).
 * Exposes only the store key, email, tier, and bookkeeping flags — never tokens.
 */
export interface AccountSummary {
  /** Store key: the account email, or the `account:<hash>` fallback (AC1a). */
  key: string;
  email: string | null;
  tier: string | null;
  /** True when this is the currently active account. */
  active: boolean;
  lastUsedAt: number;
  needsEmailBackfill?: boolean;
}

/** GET /api/accounts response — token-free account list + active marker. */
export interface AccountListResponse {
  accounts: AccountSummary[];
  activeKey: string | null;
}

/** POST /api/accounts/switch request — `key` is the store key (email or fallback). */
export interface AccountSwitchRequest {
  key: string;
}

/** POST /api/accounts/switch response. */
export interface AccountSwitchResponse {
  success: boolean;
  activeKey: string | null;
  /**
   * True when the switched-to credential is already past `expiresAt` (AC12). The switch
   * still completes; the client should offer the BS-7 re-login flow for this account.
   * Phase 1 performs NO custom OAuth refresh call (BS-8 Dev Notes › Token Refresh).
   */
  reauthRequired: boolean;
  accounts: AccountSummary[];
}

/** WebSocket `account:switched` payload — token-free (AC15). */
export interface AccountSwitchedEvent {
  key: string;
  email: string | null;
  tier: string | null;
}

/** WebSocket `account:removed` payload — token-free. */
export interface AccountRemovedEvent {
  key: string;
}
