/**
 * Story 28.1: Harness Workbench section container.
 *
 * Lives inside the project settings tab. Story 28.1 ships a single sub-panel
 * ("Plugins"); later stories (28.2–28.6) will slot Skills, MCP, Hooks,
 * Commands and Agents panels into the same nav. Keeping the nav + router
 * component separate from the individual panels lets each panel stay
 * single-responsibility.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginPanel } from './harness/PluginPanel';
import { SkillPanel } from './harness/SkillPanel';
import { McpPanel } from './harness/McpPanel';

type HarnessSubSection = 'plugins' | 'skills' | 'mcps';

const SUB_SECTIONS: readonly HarnessSubSection[] = ['plugins', 'skills', 'mcps'] as const;

interface Props {
  projectSlug: string;
}

export function HarnessWorkbenchSection({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const [active, setActive] = useState<HarnessSubSection>('plugins');

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <nav
        aria-label={t('harness.workbench.title')}
        className="flex sm:flex-col gap-1 sm:w-48 sm:shrink-0"
      >
        {SUB_SECTIONS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={
              'px-3 py-2 text-left rounded-md text-sm transition-colors '
              + (active === key
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')
            }
          >
            {t(`harness.workbench.nav.${key}`)}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-w-0">
        {active === 'plugins' && <PluginPanel projectSlug={projectSlug} />}
        {active === 'skills' && <SkillPanel projectSlug={projectSlug} />}
        {active === 'mcps' && <McpPanel projectSlug={projectSlug} />}
      </div>
    </div>
  );
}
