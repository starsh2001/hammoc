/**
 * Server i18n Initialization (Epic 22 - Story 22.1)
 * Configures i18next for server-side translation with 'server' namespace.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import i18next from 'i18next';
import { SUPPORTED_LANGUAGES } from '@hammoc/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLocale(lang: string): Record<string, unknown> {
  try {
    const filePath = path.join(__dirname, 'locales', lang, 'server.json');
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

const resources: Record<string, { server: Record<string, unknown> }> = {};
for (const lang of SUPPORTED_LANGUAGES) {
  resources[lang] = { server: loadLocale(lang) };
}

i18next.init({
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: ['server'],
  defaultNS: 'server',
  resources,
});

export default i18next;
