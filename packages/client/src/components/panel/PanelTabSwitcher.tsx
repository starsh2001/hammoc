/**
 * PanelTabSwitcher - Tab switcher for quick panel header
 * Displays icon tabs for each panel type with keyboard navigation.
 * [Source: Story 19.2 - Task 2]
 */

import { useTranslation } from 'react-i18next';
import type { QuickPanelType } from '../../stores/panelStore';
import { PANEL_CONFIG, PANEL_TYPES } from './QuickPanel';

interface PanelTabSwitcherProps {
  activePanel: QuickPanelType;
  onSwitchPanel: (type: QuickPanelType) => void;
  terminalAccessible?: boolean;
  /** Git changed file count for badge on git tab */
  gitChangedCount?: number;
}

export function PanelTabSwitcher({
  activePanel,
  onSwitchPanel,
  terminalAccessible = true,
  gitChangedCount,
}: PanelTabSwitcherProps) {
  const { t } = useTranslation('common');
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledTypes = PANEL_TYPES.filter(
      pt => !(pt === 'terminal' && !terminalAccessible)
    );
    const currentIndex = enabledTypes.indexOf(activePanel);
    let nextIndex: number | null = null;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % enabledTypes.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + enabledTypes.length) % enabledTypes.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = enabledTypes.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextType = enabledTypes[nextIndex];
    onSwitchPanel(nextType);
    const target = (e.currentTarget as HTMLElement)
      .querySelector<HTMLElement>(`[data-testid="panel-tab-${nextType}"]`);
    target?.focus();
  };

  return (
    <div className="flex items-center gap-1" role="tablist" aria-label={t('panel.tabList')} onKeyDown={handleKeyDown}>
      {PANEL_TYPES.map(type => {
        const config = PANEL_CONFIG[type];
        const IconComponent = config.icon;
        const isActive = activePanel === type;
        const isDisabled = type === 'terminal' && !terminalAccessible;

        return (
          <button
            key={type}
            role="tab"
            aria-selected={isActive}
            aria-label={t(config.titleKey)}
            aria-disabled={isDisabled}
            tabIndex={isActive ? 0 : -1}
            onClick={() => !isDisabled && onSwitchPanel(type)}
            disabled={isDisabled}
            className={`p-2 rounded-lg transition-colors
              ${isActive
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040] hover:text-gray-700 dark:hover:text-gray-300'}
              ${isDisabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''}
            `}
            title={isDisabled ? `${t(config.titleKey)} ${t('panel.disabledSuffix')}` : t(config.titleKey)}
            data-testid={`panel-tab-${type}`}
          >
            <div className="relative">
              <IconComponent className="w-5 h-5" aria-hidden="true" />
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
