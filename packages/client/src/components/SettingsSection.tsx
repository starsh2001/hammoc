/**
 * SettingsSection Component
 * Reusable section wrapper with mobile accordion behavior
 * [Source: Story 10.1 - Task 1]
 */

import { type LucideIcon, ChevronDown } from 'lucide-react';

interface SettingsSectionProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  /** Mobile accordion: whether section is expanded */
  isExpanded?: boolean;
  /** Mobile accordion: toggle callback */
  onToggle?: () => void;
}

export function SettingsSection({
  title,
  icon: Icon,
  children,
  isExpanded,
  onToggle,
}: SettingsSectionProps) {
  const sectionId = title.replace(/\s+/g, '-').toLowerCase();
  const isAccordion = onToggle !== undefined;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      {isAccordion ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={`section-content-${sectionId}`}
          className="w-full flex items-center justify-between px-4 py-3
                     text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800
                     transition-colors"
        >
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">
          <Icon className="w-5 h-5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">{title}</span>
        </div>
      )}

      {(!isAccordion || isExpanded) && (
        <div
          id={`section-content-${sectionId}`}
          role="region"
          aria-label={title}
          className="px-4 pb-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}
