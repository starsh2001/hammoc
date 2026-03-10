/**
 * HelpSection - Usage guide for SettingsPage
 * [Source: Story 10.5 - Task 1]
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS_KEYS = [
  { key: 'Enter', descKey: 'help.shortcuts.enter' },
  { key: 'Shift+Enter', descKey: 'help.shortcuts.shiftEnter' },
  { key: 'Escape', descKey: 'help.shortcuts.escape' },
  { key: `${modKey}+C`, descKey: 'help.shortcuts.ctrlC' },
  { key: 'F7 / Shift+F7', descKey: 'help.shortcuts.f7' },
  { key: '/', descKey: 'help.shortcuts.slash' },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-200 dark:bg-[#253040] rounded border border-gray-300 dark:border-[#2d3a4a] text-gray-800 dark:text-gray-200">
      {children}
    </kbd>
  );
}

function GuideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-[#263240] rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

function GuideList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function HelpSection() {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6">
      {/* Basic chat usage */}
      <GuideCard title={t('help.basicChat')}>
        <GuideList
          items={t('help.basicChatItems', { returnObjects: true }) as string[]}
        />
      </GuideCard>

      {/* Slash commands */}
      <GuideCard title={t('help.slashCommands')}>
        <GuideList
          items={t('help.slashCommandItems', { returnObjects: true }) as string[]}
        />
      </GuideCard>

      {/* Permission Mode */}
      <GuideCard title={t('help.permissionMode')}>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <li><strong className="text-gray-900 dark:text-white">{t('help.permissionPlanLabel')}</strong>: {t('help.permissionPlanDesc')}</li>
          <li><strong className="text-gray-900 dark:text-white">{t('help.permissionDefaultLabel')}</strong>: {t('help.permissionDefaultDesc')}</li>
          <li><strong className="text-gray-900 dark:text-white">{t('help.permissionAutoLabel')}</strong>: {t('help.permissionAutoDesc')}</li>
        </ul>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-300">
          {t('help.permissionNote')}
        </p>
      </GuideCard>

      {/* BMad Method */}
      <GuideCard title={t('help.bmadMethod')}>
        <GuideList
          items={t('help.bmadMethodItems', { returnObjects: true }) as string[]}
        />
      </GuideCard>

      {/* Keyboard shortcuts */}
      <GuideCard title={t('help.keyboardShortcuts')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#253040]">
                <th className="text-left py-2 pr-4 text-gray-900 dark:text-white font-medium">{t('help.shortcutKey')}</th>
                <th className="text-left py-2 text-gray-900 dark:text-white font-medium">{t('help.shortcutAction')}</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-300">
              {SHORTCUTS_KEYS.map((s, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-[#253040]/50">
                  <td className="py-2 pr-4">
                    <Kbd>{s.key}</Kbd>
                  </td>
                  <td className="py-2">{t(s.descKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideCard>
    </div>
  );
}
