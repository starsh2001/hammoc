/**
 * Client i18n Initialization Tests (Story 22.1 - Task 10.1)
 */

import { describe, it, expect } from 'vitest';
import i18n from '../i18n';

describe('Client i18n initialization', () => {
  it('has 6 supported languages', () => {
    const supportedLngs = i18n.options.supportedLngs;
    expect(supportedLngs).toContain('en');
    expect(supportedLngs).toContain('ko');
    expect(supportedLngs).toContain('zh-CN');
    expect(supportedLngs).toContain('ja');
    expect(supportedLngs).toContain('es');
    expect(supportedLngs).toContain('pt');
  });

  it('has fallback language set to en', () => {
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('has 6 namespaces configured', () => {
    const ns = i18n.options.ns;
    expect(ns).toContain('common');
    expect(ns).toContain('settings');
    expect(ns).toContain('board');
    expect(ns).toContain('chat');
    expect(ns).toContain('auth');
    expect(ns).toContain('notification');
  });

  it('has defaultNS set to common', () => {
    expect(i18n.options.defaultNS).toBe('common');
  });

  it('can translate en/settings keys', () => {
    const t = i18n.getFixedT('en', 'settings');
    expect(t('global.theme')).toBe('Theme');
    expect(t('global.language')).toBe('Language');
  });

  it('can translate ko/settings keys', () => {
    const t = i18n.getFixedT('ko', 'settings');
    expect(t('global.theme')).toBe('테마');
    expect(t('global.language')).toBe('언어');
  });

  it('falls back to en for unsupported language', () => {
    const t = i18n.getFixedT('fr', 'settings');
    expect(t('global.theme')).toBe('Theme');
  });
});
