/**
 * ProjectSettingsPage - Project-scoped settings tab
 *
 * Left sidebar + right panel layout. The "Harness Workbench" group uses an
 * accordion pattern: on desktop, sub-items appear indented below the header;
 * on mobile, they render as a 2nd horizontal pill row beneath the top nav.
 */

import { Fragment, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProjectSettingsSection } from '../components/settings/ProjectSettingsSection';
import {
  HarnessWorkbenchSection,
  HARNESS_SUB_SECTIONS,
  LINT_DOMAIN_BY_SECTION,
  type HarnessSubSection,
} from '../components/settings/HarnessWorkbenchSection';
import { BmadConfigPanel } from '../components/settings/BmadConfigPanel';
import { ContextBuilderPanel } from '../components/settings/ContextBuilderPanel';
import { ObservabilityPanel } from '../components/settings/ObservabilityPanel';
import { MarketplacePanel } from '../components/settings/MarketplacePanel';
import { LintCountBadge } from '../components/settings/harness/LintCountBadge';
import { useProjectStore } from '../stores/projectStore';
import { useHarnessLintStore } from '../stores/harnessLintStore';
import type { LintCardDomain } from '@hammoc/shared';

type TopSection = 'general' | 'bmad' | 'contextBuilder' | 'observability' | 'marketplace';
type ActiveSection = TopSection | HarnessSubSection;

function isHarnessSection(s: ActiveSection): s is HarnessSubSection {
  return (HARNESS_SUB_SECTIONS as readonly string[]).includes(s);
}

export function ProjectSettingsPage() {
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const { t } = useTranslation(['settings', 'common']);
  const [active, setActive] = useState<ActiveSection>('general');
  const isBmadProject = useProjectStore(
    (s) => s.projects.find((p) => p.projectSlug === projectSlug)?.isBmadProject ?? false,
  );

  const lintIssues = useHarnessLintStore((s) => s.issues);
  const lintCounts = lintIssues.reduce(
    (acc, issue) => {
      const slot = acc[issue.cardDomain];
      if (issue.severity === 'error') slot.error += 1;
      else slot.warn += 1;
      return acc;
    },
    {
      skill: { error: 0, warn: 0 },
      mcp: { error: 0, warn: 0 },
      hook: { error: 0, warn: 0 },
      command: { error: 0, warn: 0 },
      agent: { error: 0, warn: 0 },
    } as Record<LintCardDomain, { error: number; warn: number }>,
  );

  if (!projectSlug) return null;

  const activeSection: ActiveSection = active === 'bmad' && !isBmadProject ? 'general' : active;
  const harnessActive = isHarnessSection(activeSection);

  const navItems: { key: TopSection | 'harness'; label: string }[] = [
    { key: 'general', label: t('settings:harness.workbench.nav.general', 'General') },
    { key: 'harness', label: t('common:tabs.harnessWorkbench', 'Harness Workbench') },
    ...(isBmadProject
      ? [{ key: 'bmad' as const, label: t('settings:harness.bmad.nav.title', 'BMad 설정') }]
      : []),
    { key: 'contextBuilder', label: t('settings:harness.contextBuilder.nav.title', '컨텍스트 빌더') },
    { key: 'observability', label: t('settings:harness.observability.nav.title', '관측성') },
    { key: 'marketplace', label: t('settings:harness.marketplace.nav.title', '마켓플레이스') },
  ];

  const handleNavClick = (key: TopSection | 'harness') => {
    if (key === 'harness') {
      if (!harnessActive) setActive('plugins');
    } else {
      setActive(key);
    }
  };

  const isItemActive = (key: TopSection | 'harness') => {
    if (key === 'harness') return harnessActive;
    return activeSection === key;
  };

  return (
    <div className="p-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        {t('settings:tabs.project')}
      </h2>
      <div className="flex flex-col sm:flex-row gap-4">
        <nav
          aria-label={t('settings:tabs.project')}
          className="flex flex-col gap-1.5 sm:gap-1 sm:w-52 sm:shrink-0 border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-gray-800 pb-2 sm:pb-0 sm:pr-4"
        >
          {/* Top items: horizontal scroll on mobile, vertical on desktop */}
          <div
            className="-mx-4 sm:mx-0 px-4 sm:px-0 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {navItems.map((item) => (
              <Fragment key={item.key}>
                <button
                  type="button"
                  onClick={() => handleNavClick(item.key)}
                  className={
                    'shrink-0 whitespace-nowrap sm:whitespace-normal px-3 py-2 text-left rounded-md text-sm transition-colors flex items-center '
                    + (isItemActive(item.key)
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')
                  }
                  data-testid={`project-settings-nav-${item.key}`}
                >
                  {item.key === 'harness' && (
                    <svg
                      className="hidden sm:block w-3 h-3 shrink-0 mr-1.5 transition-transform duration-200"
                      style={harnessActive ? { transform: 'rotate(90deg)' } : undefined}
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M4.5 2.5l3.5 3.5-3.5 3.5" />
                    </svg>
                  )}
                  {item.label}
                </button>
                {/* Desktop: harness sub-items inline after the header */}
                {item.key === 'harness' && harnessActive && (
                  <div className="hidden sm:flex sm:flex-col gap-0.5 ml-5">
                    {HARNESS_SUB_SECTIONS.map((sub) => {
                      const lintDomain = LINT_DOMAIN_BY_SECTION[sub];
                      const counts = lintDomain ? lintCounts[lintDomain] : undefined;
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => setActive(sub)}
                          className={
                            'px-2.5 py-1.5 text-left rounded-md text-sm transition-colors flex items-center gap-1.5 justify-between '
                            + (activeSection === sub
                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 font-medium'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')
                          }
                          data-testid={`project-settings-nav-harness-${sub}`}
                        >
                          <span>{t(`settings:harness.workbench.nav.${sub}`)}</span>
                          {counts && (counts.error > 0 || counts.warn > 0) && (
                            <LintCountBadge errorCount={counts.error} warnCount={counts.warn} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Fragment>
            ))}
            <div className="shrink-0 w-3 sm:hidden" aria-hidden />
          </div>

          {/* Mobile: harness sub-items 2nd pill row */}
          {harnessActive && (
            <div
              className="sm:hidden -mx-4 pl-4 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: 'none' }}
            >
              {HARNESS_SUB_SECTIONS.map((sub) => {
                const lintDomain = LINT_DOMAIN_BY_SECTION[sub];
                const counts = lintDomain ? lintCounts[lintDomain] : undefined;
                return (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setActive(sub)}
                    className={
                      'shrink-0 whitespace-nowrap px-3.5 py-1.5 text-center rounded-full text-sm transition-colors flex items-center gap-1.5 '
                      + (activeSection === sub
                        ? 'bg-blue-600 text-white font-medium shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-800')
                    }
                    data-testid={`project-settings-nav-harness-${sub}`}
                  >
                    <span>{t(`settings:harness.workbench.nav.${sub}`)}</span>
                    {counts && (counts.error > 0 || counts.warn > 0) && (
                      <LintCountBadge errorCount={counts.error} warnCount={counts.warn} />
                    )}
                  </button>
                );
              })}
              <div className="shrink-0 w-4" aria-hidden />
            </div>
          )}
        </nav>
        <div className="flex-1 min-w-0">
          {activeSection === 'general' && <ProjectSettingsSection projectSlug={projectSlug} />}
          {isHarnessSection(activeSection) && (
            <HarnessWorkbenchSection projectSlug={projectSlug} activeSubSection={activeSection} />
          )}
          {activeSection === 'bmad' && <BmadConfigPanel projectSlug={projectSlug} />}
          {activeSection === 'contextBuilder' && <ContextBuilderPanel projectSlug={projectSlug} />}
          {activeSection === 'observability' && <ObservabilityPanel projectSlug={projectSlug} />}
          {activeSection === 'marketplace' && <MarketplacePanel projectSlug={projectSlug} />}
        </div>
      </div>
    </div>
  );
}
