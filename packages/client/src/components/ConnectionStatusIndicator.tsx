/**
 * Connection Status Indicator Component
 * Story 1.4: WebSocket Server Setup
 * Story 4.7: Connection Status Display - Extended with compact mode and Lucide icons
 */

import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConnectionStatus } from '@bmad-studio/shared';

export interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  reconnectAttempt: number;
  lastError: string | null;
  onReconnect: () => void;
  /** Compact mode for header display - shows only icon with tooltip */
  compact?: boolean;
  /** API backend health (null = unknown/not yet checked) */
  apiHealthy?: boolean | null;
}

/**
 * Displays WebSocket connection status with accessibility support
 * Supports both full and compact (icon-only with tooltip) display modes
 */
export function ConnectionStatusIndicator({
  status,
  reconnectAttempt,
  lastError,
  onReconnect,
  compact = false,
  apiHealthy,
}: ConnectionStatusIndicatorProps) {
  const { t } = useTranslation('common');

  const statusConfig = {
    connected: apiHealthy === false
      ? {
          icon: <AlertTriangle className="w-4 h-4 text-yellow-500" aria-hidden="true" />,
          text: t('connection.apiUnavailable'),
          ariaLabel: t('connection.apiUnavailableAria'),
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
        }
      : {
          icon: <Wifi className="w-4 h-4 text-green-500" aria-hidden="true" />,
          text: t('connection.connected'),
          ariaLabel: t('connection.connectedAria'),
          bgColor: 'bg-green-100 dark:bg-green-900/30',
        },
    disconnected: {
      icon: <WifiOff className="w-4 h-4 text-red-500" aria-hidden="true" />,
      text: t('connection.disconnected'),
      ariaLabel: t('connection.disconnectedAria'),
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
    reconnecting: {
      icon: <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" aria-hidden="true" />,
      text: t('connection.reconnecting'),
      ariaLabel: t('connection.reconnectingAria'),
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    },
  };

  const config = statusConfig[status];
  const displayText =
    status === 'reconnecting'
      ? `${config.text} (${reconnectAttempt}/5)`
      : config.text;

  const ariaLabel =
    status === 'reconnecting'
      ? t('connection.reconnectingAttemptAria', { attempt: reconnectAttempt })
      : config.ariaLabel;

  // Tooltip content shows error message if available, otherwise status text
  const tooltipContent = lastError
    || (status === 'connected' && apiHealthy === false ? t('connection.apiCannotConnect') : displayText);

  // Compact mode: icon only with tooltip
  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        className={`flex items-center gap-1 p-1.5 rounded-full ${config.bgColor} transition-colors duration-300`}
        title={tooltipContent}
        data-testid="connection-status-indicator"
      >
        {config.icon}
        {status === 'disconnected' && lastError && (
          <button
            onClick={onReconnect}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
            aria-label={t('connection.reconnectButtonAria')}
            title={t('connection.reconnectButton')}
          >
            <RefreshCw className="w-3 h-3 text-blue-500" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  // Full mode: icon + text + reconnect button
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className="flex items-center gap-2 transition-opacity duration-300"
      title={lastError || undefined}
      data-testid="connection-status-indicator"
    >
      {config.icon}
      <span className="text-sm text-gray-900 dark:text-gray-100">{displayText}</span>
      {status === 'disconnected' && lastError && (
        <button
          onClick={onReconnect}
          className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
          aria-label={t('connection.reconnectButtonAria')}
        >
          {t('connection.reconnectButton')}
        </button>
      )}
    </div>
  );
}
