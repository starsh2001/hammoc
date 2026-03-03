/**
 * QuickPanelTriggers - Chat header trigger buttons for quick panels
 * [Source: Story 19.4 - Task 1]
 */

import { useTranslation } from 'react-i18next';
import { History, FolderOpen, GitBranch, Terminal, type LucideIcon } from 'lucide-react';
import type { QuickPanelType } from '../../stores/panelStore';

export interface QuickPanelTriggersProps {
  /** Currently active panel type (null = no panel open) */
  activePanel: QuickPanelType | null;
  /** Toggle panel callback */
  onTogglePanel: (type: QuickPanelType) => void;
  /** Git changed file count for badge display */
  gitChangedCount?: number;
  /** Whether terminal is accessible (false = disabled for non-local IP) */
  terminalAccessible?: boolean;
}

interface TriggerConfig {
  type: QuickPanelType;
  icon: LucideIcon;
  labelKey: string;
  shortcutHint: string;
}

const TRIGGER_CONFIGS: TriggerConfig[] = [
  { type: 'sessions', icon: History, labelKey: 'panel.sessions', shortcutHint: 'Alt+1' },
  { type: 'files', icon: FolderOpen, labelKey: 'panel.files', shortcutHint: 'Alt+2' },
  { type: 'git', icon: GitBranch, labelKey: 'panel.gitPanel', shortcutHint: 'Alt+3' },
  { type: 'terminal', icon: Terminal, labelKey: 'panel.terminal', shortcutHint: 'Alt+4' },
];

export function QuickPanelTriggers({
  activePanel,
  onTogglePanel,
  gitChangedCount,
  terminalAccessible = true,
}: QuickPanelTriggersProps) {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-center" role="toolbar" aria-label={t('panel.toolbar')}>
      {TRIGGER_CONFIGS.map(({ type, icon: Icon, labelKey, shortcutHint }) => {
        const isActive = activePanel === type;
        const isTerminal = type === 'terminal';
        const isDisabled = isTerminal && !terminalAccessible;

        return (
          <button
            key={type}
            onClick={isDisabled ? undefined : () => onTogglePanel(type)}
            disabled={isDisabled}
            className={`
              p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
              transition-colors
              ${isActive
                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                : isDisabled
                  ? 'opacity-50 cursor-not-allowed text-gray-400 dark:text-gray-500'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }
            `}
            aria-label={t(labelKey)}
            aria-pressed={isActive}
            aria-disabled={isDisabled || undefined}
            title={isDisabled
              ? t('panel.terminalSecurityTooltip')
              : `${t(labelKey)} (${shortcutHint})`
            }
            data-testid={`panel-trigger-${type}`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" aria-hidden="true" />
              {type === 'git' && !!gitChangedCount && gitChangedCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center leading-none px-1">
                  {gitChangedCount}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
