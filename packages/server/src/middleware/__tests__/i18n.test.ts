/**
 * Server i18n Middleware Tests (Story 22.1 - Task 10.4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { i18nMiddleware } from '../i18n.js';

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
  });

  it('sets req.language from Accept-Language header', () => {
    const req = mockReq('ko');
    i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('ko');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to en when no Accept-Language header', () => {
    const req = mockReq();
    i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('en');
    expect(next).toHaveBeenCalled();
  });

  it('falls back to en for unsupported language', () => {
    const req = mockReq('fr');
    i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('en');
    expect(next).toHaveBeenCalled();
  });

  it('attaches req.t as a translation function', () => {
    const req = mockReq('en');
    i18nMiddleware(req, mockRes(), next);
    expect(typeof req.t).toBe('function');
    expect(req.t!('error.notFound')).toBe('Resource not found');
  });

  it('detects zh-CN from Accept-Language', () => {
    const req = mockReq('zh-CN');
    i18nMiddleware(req, mockRes(), next);
    expect(req.language).toBe('zh-CN');
  });
});
