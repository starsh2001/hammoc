/**
 * claudeLoginService — REAL captured login-flow frames (Story BS-7)
 *
 * Replays an ACTUAL non-destructive node-pty capture of the bundled interactive `claude`
 * (v2.1.181) driven through trust → `/login` → method-1 → OAuth URL + "Paste code" prompt.
 * The capture aborted with Ctrl+C BEFORE submitting any code, so the real credentials were
 * never overwritten (auth state untouched). It asserts the production detectors recognize the
 * real frames the runtime reads:
 *   - `detectLoginMethodPrompt` fires on the real method-selection menu grid,
 *   - `detectCodePrompt` fires on the real "Paste code here" grid,
 *   - `extractOAuthUrl` de-wraps the FULL ~450-char URL from the raw stream (the live GRID
 *     corrupts the long URL — `ht` clipped, ~2 chars lost per wrap — so the URL source is the
 *     raw stream, verified here against the real capture).
 *
 * The fixture is base64 of the raw PTY stream (base64 is git-safe: the raw stream is full of
 * control bytes / CRs that line-ending normalization would corrupt). server runs with
 * `globals: false`, so vitest primitives are imported explicitly.
 *
 * node-pty is mocked so importing claudeLoginService (→ cliSessionPool) never loads the native
 * binding; this test only exercises the PURE detectors + the screen model.
 *
 * @see docs/stories/BS-7.claude-code-login-ui.story.md
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

vi.mock('node-pty', () => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ execSync: vi.fn(() => ''), exec: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn() }),
}));

import { createCliScreenModel } from '../cliScreenModel.js';
import {
  detectLoginMethodPrompt,
  detectCodePrompt,
  detectTrustPrompt,
  extractOAuthUrl,
} from '../claudeLoginService.js';

function decodeFixture(name: string): string {
  return Buffer.from(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').trim(), 'base64').toString(
    'utf8',
  );
}

async function renderGrid(capture: string): Promise<string> {
  const screen = createCliScreenModel();
  screen.write(capture);
  await screen.flush();
  const text = screen.readScreenText();
  screen.dispose();
  return text;
}

const CAPTURE = decodeFixture('cli-login-flow.b64.txt');

describe('Story BS-7 — real captured login-flow frames', () => {
  it('decodes a non-trivial real capture (fixture sanity)', () => {
    expect(CAPTURE.length).toBeGreaterThan(3_000);
    expect(CAPTURE).toContain('Select login method');
    expect(CAPTURE).toContain('Paste code here');
  });

  it('detectLoginMethodPrompt fires on the real method-selection menu grid', async () => {
    // Cut right after the menu's footer is painted but BEFORE the option-1 selection clears it
    // (selection redraws to "✶ Opening browser…", removing the menu) — the grid the service reads
    // the instant the menu is up.
    const menuIdx = CAPTURE.indexOf('Select login method');
    const footerIdx = CAPTURE.indexOf('Esc to cancel', menuIdx);
    const grid = await renderGrid(CAPTURE.slice(0, footerIdx + 'Esc to cancel'.length));
    expect(detectLoginMethodPrompt(grid)).toBe(true);
  });

  it('detectCodePrompt fires on the real "Paste code here" grid', async () => {
    // Truncate before the Ctrl+C redraw → the live code-prompt screen the service reads.
    const upToCode = CAPTURE.slice(0, CAPTURE.indexOf('Press Ctrl-C again'));
    const grid = await renderGrid(upToCode);
    expect(detectCodePrompt(grid)).toBe(true);
  });

  it('extractOAuthUrl de-wraps the FULL URL from the raw stream', () => {
    const url = extractOAuthUrl(CAPTURE);
    expect(url).not.toBeNull();
    expect(url!.startsWith('https://claude.com/cai/oauth/authorize?')).toBe(true);
    expect(url!).toContain('code_challenge=');
    expect(url!).toContain('code_challenge_method=S256');
    expect(url!).toContain('state=');
    // The full URL is ~450 chars; a single-grid-row read would return only ~115.
    expect(url!.length).toBeGreaterThan(300);
    // No internal whitespace / wrap artifacts survived the de-wrap.
    expect(/\s/.test(url!)).toBe(false);
  });

  // Trust prompt did not appear in this capture (os.tmpdir() was already trusted), so it is
  // verified with a hand-built line — the documented defensive case.
  it('detectTrustPrompt matches the trust-prompt wording', () => {
    expect(detectTrustPrompt('  Is this a project you created or one you trust?  ')).toBe(true);
    expect(detectTrustPrompt('some ordinary assistant output')).toBe(false);
  });
});

describe('Story BS-7 — pure detector unit cases (hand-built rows)', () => {
  it('detectLoginMethodPrompt needs both the anchor and the cancel footer', () => {
    const full = ['  Select login method:', '  1. Claude account', '  Esc to cancel'].join('\n');
    expect(detectLoginMethodPrompt(full)).toBe(true);
    // Anchor without the live footer (e.g. quoted in prose) must not match.
    expect(detectLoginMethodPrompt('we will Select login method: later')).toBe(false);
  });

  it('detectCodePrompt needs both the anchor and the cancel footer', () => {
    const full = ['  Paste code here if prompted >', '  Esc to cancel'].join('\n');
    expect(detectCodePrompt(full)).toBe(true);
    expect(detectCodePrompt('Paste code here if prompted')).toBe(false);
  });

  it('extractOAuthUrl rejoins a hard-wrapped URL and stops at the trailing blank line', () => {
    const wrapped =
      'https://claude.com/cai/oauth/authorize?code=true&client_id=abc\n' +
      'def&code_challenge=XYZ&state=qqq\n' +
      '\n' +
      '  Paste code here if prompted >';
    expect(extractOAuthUrl(wrapped)).toBe(
      'https://claude.com/cai/oauth/authorize?code=true&client_id=abcdef&code_challenge=XYZ&state=qqq',
    );
  });

  it('extractOAuthUrl returns null when no URL is present', () => {
    expect(extractOAuthUrl('no url here\njust text')).toBeNull();
  });
});
