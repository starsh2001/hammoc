/**
 * Sync bundled Hammoc agent-facing docs from the npm package into the user's
 * global footprint (~/.hammoc/docs/) at server startup:
 *
 *   packages/server/resources/manual/    → ~/.hammoc/docs/manual/
 *   packages/server/resources/internals/ → ~/.hammoc/docs/internals/
 *
 * `manual/` mirrors the user manual sharded by chapter (built from
 * docs/MANUAL.md). `internals/` documents Hammoc's on-disk mechanisms
 * that the agent needs but the user does not. Both are referenced by
 * absolute path from DEFAULT_WORKSPACE_TEMPLATE so any project running
 * Hammoc — not just the Hammoc source repo — can point Claude at them.
 *
 * Re-syncs whenever the package version changes (tracked via
 * ~/.hammoc/docs/.manual-version) so manual edits to the destination
 * are always restored after an upgrade.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('docsSync');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bundled subdirectories under packages/server/resources/ that mirror
// to ~/.hammoc/docs/<subdir>/ at boot.
const SYNC_SUBDIRS = ['manual', 'internals'] as const;

const RESOURCES_DIR = path.resolve(__dirname, '..', '..', 'resources');
const DEST_BASE = path.join(os.homedir(), '.hammoc', 'docs');
// Filename kept as `.manual-version` for backward compatibility with
// installs that synced before `internals/` was added.
const VERSION_FILE = path.join(DEST_BASE, '.manual-version');
// Both dev (src/services/) and prod (dist/services/) sit four directories deep
// inside the package, so root package.json is always at ../../../../.
const ROOT_PACKAGE_JSON = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');

async function readPackageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await fs.readFile(ROOT_PACKAGE_JSON, 'utf8'));
    if (pkg.name === 'hammoc' && typeof pkg.version === 'string') {
      return pkg.version;
    }
  } catch {
    // fall through to 'unknown' — sync will run on every boot until resolvable
  }
  return 'unknown';
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function syncBundledDocs(): Promise<void> {
  const currentVersion = await readPackageVersion();

  // Skip only when version matches AND every expected subdir is present —
  // a missing subdir (e.g. user wiped one) should force a full resync.
  try {
    const installed = await fs.readFile(VERSION_FILE, 'utf8');
    if (installed.trim() === currentVersion) {
      const allPresent = SYNC_SUBDIRS.every((sub) => existsSync(path.join(DEST_BASE, sub)));
      if (allPresent) {
        log.debug(`bundled docs already at version ${currentVersion}`);
        return;
      }
    }
  } catch {
    // version file missing or unreadable — proceed with sync
  }

  let anyFailed = false;
  for (const sub of SYNC_SUBDIRS) {
    const src = path.join(RESOURCES_DIR, sub);
    const dest = path.join(DEST_BASE, sub);
    if (!existsSync(src)) {
      log.warn(`${sub} resources not found at ${src}; skipping this subdir`);
      anyFailed = true;
      continue;
    }
    try {
      await fs.rm(dest, { recursive: true, force: true });
      await copyDir(src, dest);
      log.info(`synced ${sub} docs to ${dest}`);
    } catch (err) {
      log.warn(`failed to sync ${sub}: ${err instanceof Error ? err.message : String(err)}`);
      anyFailed = true;
    }
  }

  if (!anyFailed) {
    try {
      await fs.mkdir(path.dirname(VERSION_FILE), { recursive: true });
      await fs.writeFile(VERSION_FILE, currentVersion, 'utf8');
    } catch (err) {
      log.warn(`failed to write version file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
