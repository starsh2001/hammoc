/**
 * Story 30.1 (Task 6.6): cross-panel store that drives the
 * `SecretOnSharedDialog` overlay.
 *
 * The four harness panels (agent / command / hook / mcp) each catch the
 * server-side `HARNESS_SECRET_ON_SHARED` error and call `open(...)`. The
 * dialog is rendered once at the workbench level (`HarnessWorkbenchSection`)
 * so it sits above the active sub-panel without duplicate mounts.
 *
 * The dialog is intentionally informational + advisory in this story: the
 * "Move to local" action emits an event the calling panel listens to so the
 * panel-specific re-route logic (which knows how to construct the
 * `*.local.<ext>` sibling for its domain) stays inside the panel. The store
 * itself does not perform file I/O.
 */

import { create } from 'zustand';

export interface SecretOnSharedDialogPayload {
  /**
   * Project-relative path of the offending file (mirrors the server's
   * error.details.relativePath).
   */
  targetPath: string;
  /** Detected secret locations (line numbers OR dot-paths, server-supplied). */
  secretLocations: string[];
  /**
   * Stable identifier of the panel that opened the dialog — the dialog
   * dispatches the user's action back to that panel via this id.
   */
  origin: 'agent' | 'command' | 'hook' | 'mcp';
  /**
   * Story 30.7 (Task C.0): caller-supplied i18n key for the 1st action
   * button. When present, the workbench mount forwards this to
   * `SecretOnSharedDialog.actionLabelKey` so the primary button label
   * matches the domain's routing policy (sibling save vs env-ref
   * substitution). Undefined keeps the v0.7 default
   * (`action.moveToLocal`).
   */
  actionLabelKey?: string;
  /**
   * Caller-supplied callback invoked when the user picks "Move to local".
   * The panel knows how to compute and route the save to the
   * `*.local.<ext>` sibling for its domain.
   */
  onMoveToLocal: () => void;
  /**
   * Caller-supplied callback for "Mark this value as not a secret". The
   * opt-out is per-save (no persistent cache) — re-saving still re-runs the
   * heuristic.
   */
  onMarkNotSecret: () => void;
}

interface State {
  payload: SecretOnSharedDialogPayload | null;
  open(payload: SecretOnSharedDialogPayload): void;
  close(): void;
}

export const useSecretOnSharedDialogStore = create<State>((set) => ({
  payload: null,
  open(payload) {
    set({ payload });
  },
  close() {
    set({ payload: null });
  },
}));

/**
 * Helper for panel code: derives the `*.local.<ext>` sibling for a given
 * shared file. e.g. `.claude/settings.json` → `.claude/settings.local.json`.
 * Returns null when the path has no dot-extension to insert before.
 */
export function deriveLocalSiblingPath(targetPath: string): string | null {
  const lastSlash = targetPath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? targetPath.slice(0, lastSlash + 1) : '';
  const file = lastSlash >= 0 ? targetPath.slice(lastSlash + 1) : targetPath;
  const dot = file.lastIndexOf('.');
  if (dot < 0) return null;
  const stem = file.slice(0, dot);
  const ext = file.slice(dot);
  // Already a `*.local.*` file — caller mis-routed.
  if (stem.endsWith('.local')) return null;
  return `${dir}${stem}.local${ext}`;
}
