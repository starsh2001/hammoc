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
import { BmadConfigPanel } from '../components/settings/BmadConfigPanel';
import { useProjectStore } from '../stores/projectStore';

type TopSection = 'general' | 'harness' | 'bmad';

export function ProjectSettingsPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { t } = useTranslation(['settings', 'common']);
  const [active, setActive] = useState<TopSection>('general');
  // Story 31.1 (AC1.b/c): the BMad nav item is gated by the existing
  // `ProjectInfo.isBmadProject` flag — no new detection logic. Reading it from
  // the project store means the nav auto-appears when `.bmad-core/` is added
  // mid-session (the store refresh that BmadOverview/ChatPage already trigger
  // updates this list — AC1.c).
  const isBmadProject = useProjectStore(
    (s) => s.projects.find((p) => p.projectSlug === projectSlug)?.isBmadProject ?? false,
  );

  if (!projectSlug) return null;

  const navItems: { key: TopSection; label: string }[] = [
    { key: 'general', label: t('settings:harness.workbench.nav.general', 'General') },
    { key: 'harness', label: t('common:tabs.harnessWorkbench', 'Harness Workbench') },
    // AC1.a: render the BMad nav slot only for BMad projects — no empty section
    // / placeholder card for non-BMad projects.
    ...(isBmadProject
      ? [{ key: 'bmad' as const, label: t('settings:harness.bmad.nav.title', 'BMad 설정') }]
      : []),
  ];

  // AC1.a: if BMad was removed mid-session while this tab was active, fall back
  // to General so the panel for a now-hidden nav item is never shown.
  const activeSection: TopSection = active === 'bmad' && !isBmadProject ? 'general' : active;

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
                + (activeSection === item.key
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')
              }
              data-testid={`project-settings-nav-${item.key}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          {activeSection === 'general' && <ProjectSettingsSection projectSlug={projectSlug} />}
          {activeSection === 'harness' && <HarnessWorkbenchSection projectSlug={projectSlug} />}
          {activeSection === 'bmad' && <BmadConfigPanel projectSlug={projectSlug} />}
        </div>
      </div>
    </div>
  );
}
