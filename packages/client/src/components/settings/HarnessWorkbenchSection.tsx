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
import { ModeBanner } from './harness/ModeBanner';
import { LintRulePreferencesDialog } from './harness/LintRulePreferencesDialog';
import type { LintCardDomain } from '@hammoc/shared';
import { useHarnessPluginStore } from '../../stores/harnessPluginStore';
import { useHarnessSkillStore } from '../../stores/harnessSkillStore';
import { useHarnessMcpStore } from '../../stores/harnessMcpStore';
import { useHarnessHookStore } from '../../stores/harnessHookStore';
import { useHarnessCommandStore } from '../../stores/harnessCommandStore';
import { useHarnessAgentStore } from '../../stores/harnessAgentStore';
import { useClaudeMdStore } from '../../stores/claudeMdStore';
import { useSnippetStore } from '../../stores/snippetStore';
import { useHarnessShareScopeStore } from '../../stores/harnessShareScopeStore';
import { useHarnessLintStore } from '../../stores/harnessLintStore';
import { getSocket } from '../../services/socket';
import type { HarnessExternalChangeEvent } from '@hammoc/shared';
import {
  useSecretOnSharedDialogStore,
  deriveLocalSiblingPath,
} from '../../stores/secretOnSharedDialogStore';
import { SecretOnSharedDialog } from './harness/SecretOnSharedDialog';
import { BundleEntryButton } from './harness/BundleEntryButton';
import { BundleExportDialog } from './harness/BundleExportDialog';
import { BundleImportDialog } from './harness/BundleImportDialog';
import { useHarnessBundleStore } from '../../stores/harnessBundleStore';

export type HarnessSubSection =
  | 'plugins'
  | 'skills'
  | 'mcps'
  | 'hooks'
  | 'commands'
  | 'agents'
  | 'claudeMd'
  | 'snippets';

export const HARNESS_SUB_SECTIONS: readonly HarnessSubSection[] = [
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
  activeSubSection: HarnessSubSection;
}

export const LINT_DOMAIN_BY_SECTION: Partial<Record<HarnessSubSection, LintCardDomain>> = {
  skills: 'skill',
  mcps: 'mcp',
  hooks: 'hook',
  commands: 'command',
  agents: 'agent',
};

export function HarnessWorkbenchSection({ projectSlug, activeSubSection }: Props) {
  const { t } = useTranslation('settings');
  const [lintPrefsOpen, setLintPrefsOpen] = useState(false);
  const shareMode = useHarnessShareScopeStore((s) => s.mode);
  const secretDialogPayload = useSecretOnSharedDialogStore((s) => s.payload);
  const closeSecretDialog = useSecretOnSharedDialogStore((s) => s.close);

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
    // Story 30.1: prefetch the project's share-scope verdicts (drives the
    // ShareBadge on every panel + the ModeBanner above the nav).
    void useHarnessShareScopeStore.getState().load(projectSlug);
    // Story 30.2: prefetch the lint issues (drives the count badges on the
    // sub-section nav + the inline marker on every card header).
    void useHarnessLintStore.getState().load(projectSlug);
  }, [projectSlug]);

  // Story 30.1 (AC2): subscribe to harness:external-change at the workbench
  // level so a single watcher event reaches the share-scope store. Sub-panels
  // already manage their own subscriptions for their own data; the Mode
  // verdict is workbench-wide, so it lives here.
  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: HarnessExternalChangeEvent) => {
      useHarnessShareScopeStore.getState().handleExternalChange(payload, projectSlug);
      useHarnessLintStore.getState().handleExternalChange(payload, projectSlug);
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
    };
  }, [projectSlug]);

  return (
    <div className="flex flex-col gap-3">
      {/* Story 30.1 (AC3.b): Mode banner sits above the sub-section nav so
          the verdict is workbench-wide and not duplicated per panel. */}
      {/* Story 30.6 — Mode B 에서 Export CTA 활성 (Story 30.4 인계 종결).
          The CTA opens the BundleExportDialog mounted below this tree. */}
      <ModeBanner
        mode={shareMode}
        onExportClick={() => void useHarnessBundleStore.getState().openExport(projectSlug)}
      />
      {/* Story 30.2 (AC4.a) / Story 30.6 (AC8.b): "lint 규칙" + "번들" entry
          points sit above the sub-section nav as a workbench-wide meta line —
          siblings inside the same flex-end wrap container so they share the
          mobile wrap slot. */}
      <div className="flex justify-end gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setLintPrefsOpen(true)}
          data-testid="lint-rule-prefs-trigger"
          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          {t('harness.tools.lint.preferences.title')}
        </button>
        <BundleEntryButton projectSlug={projectSlug} />
      </div>
    {activeSubSection === 'plugins' && <PluginPanel projectSlug={projectSlug} />}
    {activeSubSection === 'skills' && (
      <SkillPanel
        projectSlug={projectSlug}
        onOpenLintPreferences={() => setLintPrefsOpen(true)}
      />
    )}
    {activeSubSection === 'mcps' && (
      <McpPanel
        projectSlug={projectSlug}
        onOpenLintPreferences={() => setLintPrefsOpen(true)}
      />
    )}
    {activeSubSection === 'hooks' && (
      <HookPanel
        projectSlug={projectSlug}
        onOpenLintPreferences={() => setLintPrefsOpen(true)}
      />
    )}
    {activeSubSection === 'commands' && (
      <CommandPanel
        projectSlug={projectSlug}
        onOpenLintPreferences={() => setLintPrefsOpen(true)}
      />
    )}
    {activeSubSection === 'agents' && (
      <AgentPanel
        projectSlug={projectSlug}
        onOpenLintPreferences={() => setLintPrefsOpen(true)}
      />
    )}
    {activeSubSection === 'claudeMd' && <ClaudeMdPanel projectSlug={projectSlug} />}
    {activeSubSection === 'snippets' && <SnippetPanel projectSlug={projectSlug} />}
    <LintRulePreferencesDialog open={lintPrefsOpen} onClose={() => setLintPrefsOpen(false)} />
    {/* Story 30.6 — Bundle dialogs mount once per workbench. Open/close state
        is owned by harnessBundleStore so dialog lifecycle stays inside the
        store rather than threading through props. */}
    <BundleExportDialog projectSlug={projectSlug} />
    <BundleImportDialog projectSlug={projectSlug} />
    {secretDialogPayload && (
      <SecretOnSharedDialog
        targetPath={secretDialogPayload.targetPath}
        siblingLocalPath={deriveLocalSiblingPath(secretDialogPayload.targetPath) ?? secretDialogPayload.targetPath}
        willAutoCreateSibling
        secretLocations={secretDialogPayload.secretLocations}
        actionLabelKey={secretDialogPayload.actionLabelKey}
        onMoveToLocal={() => {
          secretDialogPayload.onMoveToLocal();
          closeSecretDialog();
        }}
        onMarkNotSecret={() => {
          secretDialogPayload.onMarkNotSecret();
          closeSecretDialog();
        }}
        onCancel={closeSecretDialog}
      />
    )}
    </div>
  );
}
