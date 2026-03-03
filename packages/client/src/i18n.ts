/**
 * Client i18n Initialization (Epic 22 - Story 22.1)
 * Configures i18next with react-i18next and browser language detection.
 * All locale JSON files are bundled statically — no runtime HTTP requests.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { SUPPORTED_LANGUAGES } from '@bmad-studio/shared';

// EN
import enCommon from './locales/en/common.json';
import enSettings from './locales/en/settings.json';
import enBoard from './locales/en/board.json';
import enChat from './locales/en/chat.json';
import enAuth from './locales/en/auth.json';
import enNotification from './locales/en/notification.json';
// KO
import koCommon from './locales/ko/common.json';
import koSettings from './locales/ko/settings.json';
import koBoard from './locales/ko/board.json';
import koChat from './locales/ko/chat.json';
import koAuth from './locales/ko/auth.json';
import koNotification from './locales/ko/notification.json';
// ZH-CN
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNBoard from './locales/zh-CN/board.json';
import zhCNChat from './locales/zh-CN/chat.json';
import zhCNAuth from './locales/zh-CN/auth.json';
import zhCNNotification from './locales/zh-CN/notification.json';
// JA
import jaCommon from './locales/ja/common.json';
import jaSettings from './locales/ja/settings.json';
import jaBoard from './locales/ja/board.json';
import jaChat from './locales/ja/chat.json';
import jaAuth from './locales/ja/auth.json';
import jaNotification from './locales/ja/notification.json';
// ES
import esCommon from './locales/es/common.json';
import esSettings from './locales/es/settings.json';
import esBoard from './locales/es/board.json';
import esChat from './locales/es/chat.json';
import esAuth from './locales/es/auth.json';
import esNotification from './locales/es/notification.json';
// PT
import ptCommon from './locales/pt/common.json';
import ptSettings from './locales/pt/settings.json';
import ptBoard from './locales/pt/board.json';
import ptChat from './locales/pt/chat.json';
import ptAuth from './locales/pt/auth.json';
import ptNotification from './locales/pt/notification.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, settings: enSettings, board: enBoard, chat: enChat, auth: enAuth, notification: enNotification },
      ko: { common: koCommon, settings: koSettings, board: koBoard, chat: koChat, auth: koAuth, notification: koNotification },
      'zh-CN': { common: zhCNCommon, settings: zhCNSettings, board: zhCNBoard, chat: zhCNChat, auth: zhCNAuth, notification: zhCNNotification },
      ja: { common: jaCommon, settings: jaSettings, board: jaBoard, chat: jaChat, auth: jaAuth, notification: jaNotification },
      es: { common: esCommon, settings: esSettings, board: esBoard, chat: esChat, auth: esAuth, notification: esNotification },
      pt: { common: ptCommon, settings: ptSettings, board: ptBoard, chat: ptChat, auth: ptAuth, notification: ptNotification },
    },
    fallbackLng: 'en',
    // Force Korean in test environment (existing tests assume Korean UI)
    ...(import.meta.env?.MODE === 'test' ? { lng: 'ko' } : {}),
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: ['common', 'settings', 'board', 'chat', 'auth', 'notification'],
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    react: { useSuspense: false }, // Static bundled resources — no async loading
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  });

export default i18n;
