/**
 * Story 28.1: Harness plugin store.
 *
 * Holds the list of plugin cards rendered by the "Harness Workbench →
 * Plugins" panel, plus the settings.json mtime used for optimistic
 * concurrency on toggle writes. External-change events originate from
 * `useHarnessWatcher` (user-scope subscription) and are funnelled through
 * `handleExternalChange` which refetches the card list when one of the four
 * tracked paths changes.
 */

import { create } from 'zustand';
import type {
  HarnessEnabledPluginsFormat,
  HarnessExternalChangeEvent,
  HarnessPluginCard,
} from '@hammoc/shared';
import { ApiError } from '../services/api/client';
import { listPlugins, togglePlugin } from '../services/api/harnessPluginsApi';

interface HarnessPluginStoreState {
  cards: HarnessPluginCard[];
  enabledPluginsFormat: HarnessEnabledPluginsFormat;
  currentProjectPath?: string;
  settingsMtime?: string;
  /**
   * Slug threaded through the most recent `load` call. Used by
   * `handleExternalChange` to refetch with the correct project context so AC3
   * gating stays stable after external file changes.
   */
  lastProjectSlug?: string;
  isLoading: boolean;
  error?: { code: string; message: string };
  /** True when a toggle write succeeded — used by the UI to show the "applies to new sessions" banner until dismissed. */
  bannerVisible: boolean;

  load(projectSlug?: string): Promise<void>;
  toggle(key: string, enabled: boolean, projectSlug?: string): Promise<void>;
  handleExternalChange(payload: HarnessExternalChangeEvent): void;
  dismissBanner(): void;
  reset(): void;
}

function pathMatchesTrackedFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized === 'plugins/installed_plugins.json') return true;
  if (normalized === 'plugins/known_marketplaces.json') return true;
  if (normalized === 'settings.json') return true;
  if (/^plugins\/marketplaces\/[^/]+\/\.claude-plugin\/marketplace\.json$/.test(normalized)) return true;
  return false;
}

export const useHarnessPluginStore = create<HarnessPluginStoreState>((set, get) => ({
  cards: [],
  enabledPluginsFormat: 'object',
  isLoading: false,
  bannerVisible: false,

  async load(projectSlug?: string) {
    set({ isLoading: true, error: undefined, lastProjectSlug: projectSlug });
    try {
      const res = await listPlugins(projectSlug);
      set({
        cards: res.cards,
        enabledPluginsFormat: res.enabledPluginsFormat,
        currentProjectPath: res.currentProjectPath,
        // Reseed the mtime on every load so a STALE_WRITE recovery never
        // retries with the stale value — the next toggle will carry the
        // authoritative mtime the server just returned.
        settingsMtime: res.settingsMtime,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: { code: toErrorCode(err), message: toErrorMessage(err) },
      });
    }
  },

  async toggle(key: string, enabled: boolean, projectSlug?: string) {
    const state = get();
    // Optimistic flip of every card that matches the shared key.
    const prevCards = state.cards;
    const nextCards = prevCards.map((c) => (c.key === key ? { ...c, enabled } : c));
    set({ cards: nextCards, error: undefined });

    // The card's own settingsMtime is the right STALE_WRITE check value:
    // user-scope cards track ~/.claude/settings.json mtime, project-scope
    // cards track <project>/.claude/settings.json mtime. Falling back to the
    // store-level settingsMtime (user mtime) preserves behavior for older
    // shapes / empty-catalog states.
    const targetCard = prevCards.find((c) => c.key === key);
    const expectedMtime = targetCard?.settingsMtime ?? state.settingsMtime;
    const targetSettingsScope = targetCard?.settingsScope ?? 'user';

    try {
      const res = await togglePlugin(
        { key, enabled, expectedMtime },
        projectSlug,
      );
      // Bump every card sharing the same settings file to the new mtime so
      // subsequent toggles do not race ahead with a stale value.
      set((s) => ({
        cards: s.cards.map((c) =>
          c.settingsScope === targetSettingsScope ? { ...c, settingsMtime: res.mtime } : c,
        ),
        settingsMtime: targetSettingsScope === 'user' ? res.mtime : s.settingsMtime,
        enabledPluginsFormat: res.appliedFormat,
        bannerVisible: true,
      }));
    } catch (err) {
      // Revert optimistic change.
      set({ cards: prevCards });
      if (err instanceof ApiError && err.code === 'HARNESS_STALE_WRITE') {
        // Sync with the authoritative mtime before surfacing a transient
        // notice — the UI will see fresh data on the next render.
        await get().load(projectSlug);
        set({ error: { code: err.code, message: err.message } });
        return;
      }
      set({ error: { code: toErrorCode(err), message: toErrorMessage(err) } });
    }
  },

  handleExternalChange(payload: HarnessExternalChangeEvent) {
    if (payload.scope !== 'user') return;
    if (!pathMatchesTrackedFile(payload.path)) return;
    // Refetch with the last-known project slug so AC3 gating (which depends
    // on `currentProjectPath` resolved from the slug) does not regress to
    // "other project only" after an external file change.
    void get().load(get().lastProjectSlug);
  },

  dismissBanner() {
    set({ bannerVisible: false });
  },

  reset() {
    set({
      cards: [],
      enabledPluginsFormat: 'object',
      currentProjectPath: undefined,
      settingsMtime: undefined,
      lastProjectSlug: undefined,
      isLoading: false,
      error: undefined,
      bannerVisible: false,
    });
  },
}));

function toErrorCode(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  return 'UNKNOWN_ERROR';
}

function toErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
