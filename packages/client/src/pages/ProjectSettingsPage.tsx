/**
 * ProjectSettingsPage - Project-scoped settings tab
 *
 * Story 28.1 extended the page into a left-nav + right-panel layout so the
 * new "Harness Workbench" group can host the Plugins panel (and, later,
 * Skills / MCP / Hooks / Commands / Agents panels from Stories 28.2–28.6).
 * The original "General" section (model · permission · hidden overrides) is
 * preserved unchanged under the first nav item.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProjectSettingsSection } from '../components/settings/ProjectSettingsSection';
import { HarnessWorkbenchSection } from '../components/settings/HarnessWorkbenchSection';

type TopSection = 'general' | 'harness';

export function ProjectSettingsPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { t } = useTranslation(['settings', 'common']);
  const [active, setActive] = useState<TopSection>('general');

  if (!projectSlug) return null;

  const navItems: { key: TopSection; label: string }[] = [
    { key: 'general', label: t('settings:harness.workbench.nav.general', 'General') },
    { key: 'harness', label: t('common:tabs.harnessWorkbench', 'Harness Workbench') },
  ];

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        {t('settings:tabs.project')}
      </h2>
      <div className="flex flex-col sm:flex-row gap-4">
        <nav
          aria-label={t('settings:tabs.project')}
          className="flex sm:flex-col gap-1 sm:w-52 sm:shrink-0 border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-800 pb-2 sm:pb-0 sm:pr-4"
        >
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActive(item.key)}
              className={
                'px-3 py-2 text-left rounded-md text-sm transition-colors '
                + (active === item.key
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')
              }
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          {active === 'general' && <ProjectSettingsSection projectSlug={projectSlug} />}
          {active === 'harness' && <HarnessWorkbenchSection projectSlug={projectSlug} />}
        </div>
      </div>
    </div>
  );
}
