/**
 * Story 28.1: Harness Workbench section container.
 *
 * Lives inside the project settings tab. Story 28.1 ships a single sub-panel
 * ("Plugins"); later stories (28.2–28.6) will slot Skills, MCP, Hooks,
 * Commands and Agents panels into the same nav. Keeping the nav + router
 * component separate from the individual panels lets each panel stay
 * single-responsibility.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginPanel } from './harness/PluginPanel';
import { SkillPanel } from './harness/SkillPanel';
import { McpPanel } from './harness/McpPanel';
import { HookPanel } from './harness/HookPanel';
import { CommandPanel } from './harness/CommandPanel';
import { AgentPanel } from './harness/AgentPanel';
import { ClaudeMdPanel } from './harness/ClaudeMdPanel';
import { SnippetPanel } from './harness/SnippetPanel';
import { useHarnessPluginStore } from '../../stores/harnessPluginStore';
import { useHarnessSkillStore } from '../../stores/harnessSkillStore';
import { useHarnessMcpStore } from '../../stores/harnessMcpStore';
import { useHarnessHookStore } from '../../stores/harnessHookStore';
import { useHarnessCommandStore } from '../../stores/harnessCommandStore';
import { useHarnessAgentStore } from '../../stores/harnessAgentStore';
import { useClaudeMdStore } from '../../stores/claudeMdStore';
import { useSnippetStore } from '../../stores/snippetStore';

type HarnessSubSection =
  | 'plugins'
  | 'skills'
  | 'mcps'
  | 'hooks'
  | 'commands'
  | 'agents'
  | 'claudeMd'
  | 'snippets';

const SUB_SECTIONS: readonly HarnessSubSection[] = [
  'plugins',
  'skills',
  'mcps',
  'hooks',
  'commands',
  'agents',
  'claudeMd',
  'snippets',
] as const;

interface Props {
  projectSlug: string;
}

export function HarnessWorkbenchSection({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const [active, setActive] = useState<HarnessSubSection>('plugins');

  // Prefetch every sub-section's data in parallel as soon as the user enters
  // the workbench, so switching between sub-sections feels instant. Each
  // store's load() is stale-while-revalidate (the panel components also call
  // load() on mount, but a warm cache means no skeleton flash).
  useEffect(() => {
    void useHarnessPluginStore.getState().load(projectSlug);
    void useHarnessSkillStore.getState().load(projectSlug);
    void useHarnessMcpStore.getState().load(projectSlug);
    void useHarnessHookStore.getState().load(projectSlug);
    void useHarnessCommandStore.getState().load(projectSlug);
    void useHarnessAgentStore.getState().load(projectSlug);
    // Story 29.1: prefetch both CLAUDE.md columns in parallel.
    void useClaudeMdStore.getState().load('user');
    void useClaudeMdStore.getState().load('project', projectSlug);
    // Story 29.2: prefetch the snippet card grid for the active project.
    void useSnippetStore.getState().load(projectSlug);
  }, [projectSlug]);

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Sub-section nav: pill row on mobile (horizontal scroll, no wrap),
          sticky vertical sidebar on >=sm. The negative horizontal margin lets
          the scroll area extend to the parent's edge so the row feels like it
          continues off-screen — a standard mobile tab pattern. */}
      <nav
        aria-label={t('harness.workbench.title')}
        // Inline `scrollbar-width:none` is needed because index.css applies
        // `* { scrollbar-width: thin }` globally — Tailwind's arbitrary
        // variant has the same specificity and loses to the global rule.
        style={{ scrollbarWidth: 'none' }}
        className="-mx-4 sm:mx-0 px-4 sm:px-0 pb-1 sm:pb-0 flex sm:flex-col gap-1.5 sm:gap-1 sm:w-48 sm:shrink-0 overflow-x-auto sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {SUB_SECTIONS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={
              'shrink-0 whitespace-nowrap px-3.5 sm:px-3 py-1.5 sm:py-2 text-center sm:text-left rounded-full sm:rounded-md text-sm transition-colors '
              + (active === key
                ? 'bg-blue-600 text-white sm:bg-blue-50 sm:text-blue-700 sm:dark:bg-blue-900/30 sm:dark:text-blue-200 font-medium shadow-sm sm:shadow-none'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-800 sm:bg-transparent sm:dark:bg-transparent sm:hover:bg-gray-100 sm:dark:hover:bg-gray-800')
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
        {active === 'hooks' && <HookPanel projectSlug={projectSlug} />}
        {active === 'commands' && <CommandPanel projectSlug={projectSlug} />}
        {active === 'agents' && <AgentPanel projectSlug={projectSlug} />}
        {active === 'claudeMd' && <ClaudeMdPanel projectSlug={projectSlug} />}
        {active === 'snippets' && <SnippetPanel projectSlug={projectSlug} />}
      </div>
    </div>
  );
}
