/**
 * Server i18n Middleware Tests (Story 22.1 - Task 10.4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock preferencesService so the async middleware doesn't read from disk
vi.mock('../../services/preferencesService.js', () => ({
  preferencesService: {
    readPreferences: vi.fn().mockResolvedValue({ language: null }),
  },
}));

import { i18nMiddleware, invalidateI18nCache } from '../i18n.js';

function mockReq(acceptLanguage?: string): Request {
  const headers: Record<string, string> = {};
  if (acceptLanguage) {
    headers['accept-language'] = acceptLanguage;
  }

  return {
    headers,
    acceptsLanguages: vi.fn((langs: string[]) => {
      if (!acceptLanguage) return false;
      // Simple matching: check if any supported lang matches the header
      for (const lang of langs) {
        if (acceptLanguage.includes(lang)) return lang;
      }
      return false;
    }),
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('i18nMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    // Reset cache between tests so each test gets fresh preference data
    invalidateI18nCache();
  });

  it('sets req.language from Accept-Language header', async () => {
    const req = mockReq('ko');
    await i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('ko');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to en when no Accept-Language header', async () => {
    const req = mockReq();
    await i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('en');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to en for unsupported language', async () => {
    const req = mockReq('fr');
    await i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('en');
    expect(next).toHaveBeenCalled();
  });

  it('attaches req.t as a translation function', async () => {
    const req = mockReq('en');
    await i18nMiddleware(req, mockRes(), next);
    expect(typeof req.t).toBe('function');
    expect(req.t!('error.notFound')).toBe('Resource not found');
  });

  it('detects zh-CN from Accept-Language', async () => {
    const req = mockReq('zh-CN');
    await i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('zh-CN');
  });

  it('uses language preference over Accept-Language header when set', async () => {
    const { preferencesService } = await import('../../services/preferencesService.js');
    vi.mocked(preferencesService.readPreferences).mockResolvedValueOnce({ language: 'ko' } as never);

    const req = mockReq('en'); // header says 'en' but preference is 'ko'
    await i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('ko');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to Accept-Language when preferencesService throws', async () => {
    const { preferencesService } = await import('../../services/preferencesService.js');
    vi.mocked(preferencesService.readPreferences).mockRejectedValueOnce(new Error('disk error'));

    const req = mockReq('ko');
    await i18nMiddleware(req, mockRes(), next);
    // Should use Accept-Language in catch block instead of hard-coding 'en'
    expect(req.language).toBe('ko');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to en when preferencesService throws and no Accept-Language', async () => {
    const { preferencesService } = await import('../../services/preferencesService.js');
    vi.mocked(preferencesService.readPreferences).mockRejectedValueOnce(new Error('disk error'));

    const req = mockReq(); // no Accept-Language header
    await i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('en');
    expect(next).toHaveBeenCalled();
  });
});
