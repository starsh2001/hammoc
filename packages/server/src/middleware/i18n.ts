/**
 * Server i18n Middleware (Epic 22 - Story 22.1)
 * Determines request language from Accept-Language header and attaches
 * req.t (translation function) and req.language to the request.
 */

import type { Request, Response, NextFunction } from 'express';
import i18next from '../i18n.js';
import { SUPPORTED_LANGUAGES } from '@bmad-studio/shared';

declare module 'express' {
  interface Request {
    t: (key: string, options?: Record<string, unknown>) => string;
    language: string;
  }
}

export function i18nMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const headerLang = req.acceptsLanguages([...SUPPORTED_LANGUAGES]);
  const lang = headerLang || 'en';

  req.t = i18next.getFixedT(lang as string);
  req.language = lang as string;
  next();
}
