/**
 * Server i18n Initialization Tests (Story 22.1 - Task 10.3)
 */

import { describe, it, expect } from 'vitest';
import i18next from '../i18n.js';

describe('Server i18n initialization', () => {
  it('initializes with server namespace', () => {
    expect(i18next.options.ns).toContain('server');
  });

  it('has fallback language set to en', () => {
    expect(i18next.options.fallbackLng).toEqual(['en']);
  });

  it('has 6 supported languages', () => {
    const supportedLngs = i18next.options.supportedLngs;
    expect(supportedLngs).toContain('en');
    expect(supportedLngs).toContain('ko');
    expect(supportedLngs).toContain('zh-CN');
    expect(supportedLngs).toContain('ja');
    expect(supportedLngs).toContain('es');
    expect(supportedLngs).toContain('pt');
  });

  it('can translate en server keys', () => {
    const t = i18next.getFixedT('en', 'server');
    expect(t('error.notFound')).toBe('Resource not found');
  });

  it('can translate ko server keys', () => {
    const t = i18next.getFixedT('ko', 'server');
    expect(t('error.notFound')).toBe('리소스를 찾을 수 없습니다');
  });
});
