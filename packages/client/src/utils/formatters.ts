/**
 * Formatters - Utility functions for formatting display values
 * [Source: Story 3.2 - Task 3]
 */

import i18n from '../i18n';

/**
 * Format a date string to relative time (e.g., "2시간 전", "3일 전")
 * Uses i18n for localized time strings
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return i18n.t('common:time.daysAgo', { count: diffDays });
  if (diffHours > 0) return i18n.t('common:time.hoursAgo', { count: diffHours });
  if (diffMins > 0) return i18n.t('common:time.minutesAgo', { count: diffMins });
  return i18n.t('common:time.justNow');
}

/**
 * Format project path for display (replace home directory with ~, truncate if too long)
 */
export function formatProjectPath(path: string): string {
  // Replace home directory with ~
  let formatted = path;

  // Unix/Mac style
  if (path.includes('/Users/')) {
    formatted = path.replace(/^\/Users\/[^/]+/, '~');
  }
  // Windows style
  else if (path.includes('C:\\Users\\')) {
    formatted = path.replace(/^C:\\Users\\[^\\]+/, '~');
  }

  // Truncate if too long
  const maxLength = 40;
  if (formatted.length > maxLength) {
    return '...' + formatted.slice(-maxLength + 3);
  }
  return formatted;
}
