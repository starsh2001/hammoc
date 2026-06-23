/**
 * Client i18n key-surface regression tests (Story BS-7, issue BS7-3)
 *
 * Guards the in-app Claude login/logout translation surface against the class of
 * defect found in review (BS7-1): a new nested object key was added under a namespace
 * that already held a *string* of the same name (`account.logout`). JSON keeps the last
 * duplicate, so the string shadowed the object and the logout button/toast rendered the
 * literal key strings at runtime — invisible to typecheck and to the server-only detector
 * tests.
 *
 * Two layers of defense:
 *  1. Resolution: every login/logout key the components consume resolves to a non-empty
 *     string (no raw-key passthrough), in both en and ko.
 *  2. Source integrity: the raw settings/auth JSON has no duplicate key at any object level
 *     (the actual BS7-1 root cause, which JSON.parse silently collapses), and the
 *     account.logout / account.claudeLogout siblings keep their distinct string/object shapes.
 */

import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
// Raw source text (Vite `?raw`) so the duplicate-key scan sees the file as written,
// before JSON.parse silently collapses any duplicate keys.
import enSettingsRaw from '../locales/en/settings.json?raw';
import koSettingsRaw from '../locales/ko/settings.json?raw';
import enAuthRaw from '../locales/en/auth.json?raw';
import koAuthRaw from '../locales/ko/auth.json?raw';

const RAW_SOURCES: Record<string, Record<string, string>> = {
  en: { settings: enSettingsRaw, auth: enAuthRaw },
  ko: { settings: koSettingsRaw, auth: koAuthRaw },
};

const LOCALES = ['en', 'ko'] as const;

// Keys consumed by ClaudeLoginFlow.tsx (auth namespace).
const AUTH_KEYS = [
  'loginFlow.startButton',
  'loginFlow.startHint',
  'loginFlow.phase.initializing',
  'loginFlow.phase.methodSelect',
  'loginFlow.phase.awaitingAuth',
  'loginFlow.phase.codeInput',
  'loginFlow.phase.completing',
  'loginFlow.phase.done',
  'loginFlow.method.subscription.label',
  'loginFlow.method.subscription.description',
  'loginFlow.method.console.label',
  'loginFlow.method.console.description',
  'loginFlow.method.thirdParty.label',
  'loginFlow.method.thirdParty.description',
  'loginFlow.url.open',
  'loginFlow.url.copy',
  'loginFlow.url.copied',
  'loginFlow.url.hint',
  'loginFlow.code.label',
  'loginFlow.code.placeholder',
  'loginFlow.code.submit',
  'loginFlow.completeToast',
  'loginFlow.errorToast',
  'loginFlow.retry',
];

// Keys consumed by AccountSettingsSection.tsx (settings namespace).
const SETTINGS_KEYS = ['account.claudeLogout.button', 'account.claudeLogout.done'];

/**
 * Detect duplicate keys at the same object level in a raw JSON string.
 * JSON.parse silently keeps the last duplicate, so structural reads can't see the
 * collision — this scans the source text. Robust for strict (non-JSONC) JSON.
 */
function findDuplicateKeys(json: string): string[] {
  const dups: string[] = [];
  const scopes: Array<Set<string>> = [];
  let i = 0;

  while (i < json.length) {
    const c = json[i];

    if (c === '"') {
      // Read a complete string token (with escape handling).
      let s = '';
      i++;
      while (i < json.length) {
        const ch = json[i];
        if (ch === '\\') {
          s += ch + (json[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (ch === '"') {
          i++;
          break;
        }
        s += ch;
        i++;
      }
      // A string is a KEY iff the next non-whitespace char is ':'.
      let j = i;
      while (j < json.length && /\s/.test(json[j])) j++;
      if (json[j] === ':') {
        const scope = scopes[scopes.length - 1];
        if (scope) {
          if (scope.has(s)) dups.push(s);
          else scope.add(s);
        }
      }
      continue;
    }

    if (c === '{' || c === '[') {
      scopes.push(new Set());
    } else if (c === '}' || c === ']') {
      scopes.pop();
    }
    i++;
  }

  return dups;
}

describe('BS-7 login/logout i18n key surface', () => {
  describe.each(LOCALES)('locale: %s', (lng) => {
    it('resolves every ClaudeLoginFlow auth key to a non-empty string', () => {
      const t = i18n.getFixedT(lng, 'auth');
      for (const key of AUTH_KEYS) {
        const value = t(key);
        expect(typeof value, `${lng}/auth ${key}`).toBe('string');
        expect(value, `${lng}/auth ${key}`).not.toBe('');
        // No raw-key passthrough (i18next echoes the key when it can't resolve).
        expect(value, `${lng}/auth ${key}`).not.toBe(key);
      }
    });

    it('resolves every AccountSettingsSection logout key to a non-empty string', () => {
      const t = i18n.getFixedT(lng, 'settings');
      for (const key of SETTINGS_KEYS) {
        const value = t(key);
        expect(typeof value, `${lng}/settings ${key}`).toBe('string');
        expect(value, `${lng}/settings ${key}`).not.toBe('');
        expect(value, `${lng}/settings ${key}`).not.toBe(key);
      }
    });

    it('keeps account.logout (string) and account.claudeLogout (object) as distinct siblings', () => {
      // BS7-1: a nested object must not share a key name with a pre-existing string,
      // or one shadows the other after JSON parse.
      const logout = i18n.getResource(lng, 'settings', 'account.logout');
      const claudeLogout = i18n.getResource(lng, 'settings', 'account.claudeLogout');
      expect(typeof logout, `${lng} account.logout`).toBe('string');
      expect(typeof claudeLogout, `${lng} account.claudeLogout`).toBe('object');
      expect(claudeLogout).not.toBeNull();
    });

    it.each(['settings', 'auth'])('has no duplicate keys in %s.json source', (ns) => {
      const raw = RAW_SOURCES[lng][ns];
      expect(findDuplicateKeys(raw), `${lng}/${ns}.json duplicate keys`).toEqual([]);
    });
  });
});
