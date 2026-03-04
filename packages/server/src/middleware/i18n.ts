/**
 * Server i18n Middleware (Epic 22 - Story 22.1, 22.3)
 * Determines request language using priority:
 * (1) user preference from preferencesService → (2) Accept-Language header → (3) 'en' fallback
 * Attaches req.t (translation function) and req.language to the request.
 */

import type { Request, Response, NextFunction } from 'express';
import i18next from '../i18n.js';
import { SUPPORTED_LANGUAGES } from '@bmad-studio/shared';
import { preferencesService } from '../services/preferencesService.js';

declare module 'express' {
  interface Request {
    t?: (key: string, options?: Record<string, unknown>) => string;
    language?: string;
  }
}

// In-memory cache for language preference (avoids disk I/O on every request)
let cachedPrefLang: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export async function i18nMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const now = Date.now();
    if (now - cacheTimestamp > CACHE_TTL_MS) {
      const prefs = await preferencesService.readPreferences();
      cachedPrefLang = prefs.language && SUPPORTED_LANGUAGES.includes(prefs.language as typeof SUPPORTED_LANGUAGES[number])
        ? prefs.language
        : null;
      cacheTimestamp = now;
    }
    const headerLang = req.acceptsLanguages([...SUPPORTED_LANGUAGES]);
    const lang = cachedPrefLang || (headerLang as string) || 'en';

    req.t = i18next.getFixedT(lang);
    req.language = lang;
  } catch {
    // Fallback: try Accept-Language before hard-coding 'en'
    const headerLang = req.acceptsLanguages([...SUPPORTED_LANGUAGES]);
    const lang = (headerLang as string) || 'en';
    req.t = i18next.getFixedT(lang);
    req.language = lang;
  }
  next();
}

/** Reset the preference cache (e.g., after language preference changes) */
export function invalidateI18nCache(): void {
  cacheTimestamp = 0;
}
