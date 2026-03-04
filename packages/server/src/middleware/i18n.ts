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

export async function i18nMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const prefs = await preferencesService.readPreferences();
    const prefLang = prefs.language && SUPPORTED_LANGUAGES.includes(prefs.language as typeof SUPPORTED_LANGUAGES[number])
      ? prefs.language
      : null;
    const headerLang = req.acceptsLanguages([...SUPPORTED_LANGUAGES]);
    const lang = prefLang || (headerLang as string) || 'en';

    req.t = i18next.getFixedT(lang);
    req.language = lang;
  } catch {
    req.t = i18next.getFixedT('en');
    req.language = 'en';
  }
  next();
}
