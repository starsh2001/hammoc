/**
 * Story 29.1: Two-column CLAUDE.md panel inside Harness Workbench.
 *
 * - Two ClaudeMdEditor columns side by side on >=sm; collapses into a
 *   tab toggle on mobile (AC1)
 * - Subscribes to harness:external-change for both scopes; routes the
 *   payload to the matching column via the store (AC2)
 * - "→" / "←" copy buttons in each column header open ClaudeMdCopyDialog (AC3)
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { useClaudeMdStore } from '../../../stores/claudeMdStore';
import { getSocket } from '../../../services/socket';
import { ClaudeMdEditor } from './ClaudeMdEditor';
import { ClaudeMdCopyDialog } from './ClaudeMdCopyDialog';

interface Props {
  projectSlug: string;
}

type MobileTab = 'user' | 'project';

export function ClaudeMdPanel({ projectSlug }: Props) {
  const { t } = useTranslation('settings');
  const load = useClaudeMdStore((s) => s.load);
  const handleExternalChange = useClaudeMdStore((s) => s.handleExternalChange);
  const userColumn = useClaudeMdStore((s) => s.user);
  const projectColumn = useClaudeMdStore((s) => s.project);

  const [mobileTab, setMobileTab] = useState<MobileTab>('project');
  const [copyDirection, setCopyDirection] = useState<'toUser' | 'toProject' | null>(null);

  // Initial load — both columns in parallel.
  useEffect(() => {
    void load('user');
    void load('project', projectSlug);
  }, [load, projectSlug]);

  // Socket subscription.
  useEffect(() => {
    const socket = getSocket();
    socket.emit('harness:subscribe', { scope: 'user' });
    socket.emit('harness:subscribe', { scope: 'project', projectSlug });
    const handler = (payload: Parameters<typeof handleExternalChange>[0]) => {
      handleExternalChange(payload, projectSlug);
    };
    socket.on('harness:external-change', handler);
    return () => {
      socket.off('harness:external-change', handler);
      socket.emit('harness:unsubscribe', { scope: 'user' });
      socket.emit('harness:unsubscribe', { scope: 'project', projectSlug });
    };
  }, [handleExternalChange, projectSlug]);

  const userHeader = (
    <header className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          {t('harness.claudeMd.userColumn.title', { defaultValue: 'Global CLAUDE.md' })}
        </span>
        <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
          {t('harness.agent.scopeBadge.user', { defaultValue: 'Global' })}
        </span>
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate">
          ~/.claude/CLAUDE.md
        </span>
      </div>
      <button
        type="button"
        data-testid="claude-md-copy-toProject"
        onClick={() => setCopyDirection('toProject')}
        title={t('harness.claudeMd.copy.toProject.tooltip', {
          defaultValue: 'Copy from global to project',
        })}
        className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <ArrowRight className="w-3 h-3" />
        <span>
          {t('harness.claudeMd.copy.toProject.label', { defaultValue: 'Copy to project' })}
        </span>
      </button>
    </header>
  );

  const projectHeader = (
    <header className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          {t('harness.claudeMd.projectColumn.title', { defaultValue: 'Project CLAUDE.md' })}
        </span>
        <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200">
          {t('harness.agent.scopeBadge.project', { defaultValue: 'Project' })}
        </span>
        <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate">
          &lt;projectRoot&gt;/CLAUDE.md
        </span>
      </div>
      <button
        type="button"
        data-testid="claude-md-copy-toUser"
        onClick={() => setCopyDirection('toUser')}
        title={t('harness.claudeMd.copy.toUser.tooltip', {
          defaultValue: 'Copy from project to global',
        })}
        className="self-start sm:self-auto shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <ArrowLeft className="w-3 h-3" />
        <span>
          {t('harness.claudeMd.copy.toUser.label', { defaultValue: 'Copy to global' })}
        </span>
      </button>
    </header>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        role="note"
        data-testid="claude-md-panel-help"
        className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-900 dark:text-blue-100 flex items-start gap-2"
      >
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          {t('harness.claudeMd.panelHelp', {
            defaultValue:
              'Both files are loaded into every Claude Code session — global first, project last (project takes precedence). Subdirectory CLAUDE.md files are loaded on demand when Claude reads files there; this panel only manages the two top-level files.',
          })}
        </span>
      </div>

      {/* Mobile tab toggle (visible only on <sm). */}
      <nav
        aria-label={t('harness.claudeMd.mobileTabs', { defaultValue: 'Switch CLAUDE.md scope' })}
        className="flex sm:hidden gap-1.5"
      >
        <button
          type="button"
          data-testid="claude-md-mobile-tab-user"
          onClick={() => setMobileTab('user')}
          className={
            'flex-1 px-3 py-1.5 rounded-full text-sm transition-colors ' +
            (mobileTab === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300')
          }
        >
          {t('harness.claudeMd.userColumn.title', { defaultValue: 'Global CLAUDE.md' })}
        </button>
        <button
          type="button"
          data-testid="claude-md-mobile-tab-project"
          onClick={() => setMobileTab('project')}
          className={
            'flex-1 px-3 py-1.5 rounded-full text-sm transition-colors ' +
            (mobileTab === 'project'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300')
          }
        >
          {t('harness.claudeMd.projectColumn.title', { defaultValue: 'Project CLAUDE.md' })}
        </button>
      </nav>

      <div className="flex flex-col sm:flex-row gap-4 min-w-0">
        <div
          className={
            mobileTab === 'user'
              ? 'flex-1 min-w-0'
              : 'hidden sm:flex sm:flex-1 sm:min-w-0'
          }
        >
          <ClaudeMdEditor scope="user" headerSlot={userHeader} />
        </div>
        <div
          className={
            mobileTab === 'project'
              ? 'flex-1 min-w-0'
              : 'hidden sm:flex sm:flex-1 sm:min-w-0'
          }
        >
          <ClaudeMdEditor scope="project" projectSlug={projectSlug} headerSlot={projectHeader} />
        </div>
      </div>

      {copyDirection && (
        <ClaudeMdCopyDialog
          direction={copyDirection}
          projectSlug={projectSlug}
          sourceContent={copyDirection === 'toUser' ? projectColumn.content : userColumn.content}
          targetContent={copyDirection === 'toUser' ? userColumn.content : projectColumn.content}
          targetExists={copyDirection === 'toUser' ? userColumn.exists : projectColumn.exists}
          onClose={() => setCopyDirection(null)}
        />
      )}
    </div>
  );
}
