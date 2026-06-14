/**
 * Detects whether the bundled Claude Code engine (the platform binary shipped
 * inside @anthropic-ai/claude-agent-sdk-<platform>-<arch>) actually recognizes a
 * given model id.
 *
 * Native 1M context is opted into via the `[1m]` model suffix, but the binary
 * only honors it for models baked into its own model table. If the selected model
 * is newer than the bundled binary, the suffix is silently ignored and the model
 * falls back to ~200K — which makes long sessions auto-compact far below their
 * real limit and can break resume (thinking-block signature rejection). This util
 * lets the server surface that silent fallback instead of failing mysteriously.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import { isNative1MModel } from '@hammoc/shared';
import { createLogger } from './logger.js';

const log = createLogger('bundledBinaryModelSupport');

/** Claude model ids embedded in the binary, e.g. claude-opus-4-8, claude-sonnet-4-6, claude-opus-4-20250514. */
const MODEL_ID_RE = /claude-(?:opus|sonnet|haiku|fable|mythos)-[0-9]+(?:-[0-9]+)*/g;

let cache: { path: string; mtimeMs: number; models: Set<string> } | null = null;
let scanPromise: Promise<Set<string>> | null = null;

/**
 * Resolve the platform binary path (claude.exe on Windows, claude elsewhere) bundled inside
 * @anthropic-ai/claude-agent-sdk, or null if not installed. Exported so CLI mode
 * (cliSessionPool) can prefer this version-pinned engine over a system install — it is the
 * same Claude Code CLI binary, so SDK and CLI modes run the identical engine.
 */
export function resolveBundledBinaryPath(): string | null {
  const pkg = `@anthropic-ai/claude-agent-sdk-${os.platform()}-${os.arch()}`;
  const exe = os.platform() === 'win32' ? 'claude.exe' : 'claude';
  try {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve(`${pkg}/package.json`);
    return path.join(path.dirname(pkgJsonPath), exe);
  } catch {
    return null;
  }
}

/** Stream the (large) binary in chunks and collect every Claude model id it contains. */
function scanBinaryForModels(binPath: string): Promise<Set<string>> {
  return new Promise((resolve) => {
    const models = new Set<string>();
    let tail = '';
    const stream = fs.createReadStream(binPath, { encoding: 'latin1', highWaterMark: 1 << 22 });
    stream.on('data', (chunk) => {
      const text = tail + (chunk as string);
      const matches = text.match(MODEL_ID_RE);
      if (matches) for (const m of matches) models.add(m);
      // keep a small overlap so ids straddling a chunk boundary still match
      tail = text.slice(-64);
    });
    stream.on('end', () => resolve(models));
    stream.on('error', (err) => {
      log.warn(`binary model scan failed: ${err instanceof Error ? err.message : String(err)}`);
      resolve(new Set());
    });
  });
}

/** Model ids the bundled binary recognizes (memoized by path+mtime). Empty set if unreadable. */
async function getRecognizedModels(): Promise<Set<string>> {
  const binPath = resolveBundledBinaryPath();
  if (!binPath) return new Set();
  let mtimeMs = 0;
  try { mtimeMs = fs.statSync(binPath).mtimeMs; } catch { return new Set(); }
  if (cache && cache.path === binPath && cache.mtimeMs === mtimeMs) return cache.models;
  if (!scanPromise) {
    scanPromise = scanBinaryForModels(binPath).then((models) => {
      cache = { path: binPath, mtimeMs, models };
      scanPromise = null;
      return models;
    });
  }
  return scanPromise;
}

/**
 * True when `model` is a known native-1M model but the bundled binary does NOT
 * recognize it — so its 1M context silently falls back to ~200K. Conservative:
 * returns false (no warning) for bare aliases, unreadable binaries, or uncertainty.
 */
export async function modelMissingNative1MSupport(model?: string): Promise<boolean> {
  if (!model) return false;
  const base = model.replace(/\[1m\]$/i, '');
  // Only fully-versioned ids are checkable against the binary; bare aliases like
  // 'opus'/'sonnet' resolve to a concrete model server-side, so skip them.
  if (!/^claude-(?:opus|sonnet|haiku|fable|mythos)-[0-9]/.test(base)) return false;
  if (!isNative1MModel(base)) return false;

  const recognized = await getRecognizedModels();
  if (recognized.size === 0) return false; // couldn't read the binary → don't false-warn

  for (const r of recognized) {
    // exact, or either is the date-suffixed snapshot of the other (suffix always starts with '-')
    if (r === base || r.startsWith(`${base}-`) || base.startsWith(`${r}-`)) return false;
  }
  return true;
}
