/**
 * Connection Status Indicator Component
 * Story 1.4: WebSocket Server Setup
 * Story 4.7: Connection Status Display - Extended with compact mode and Lucide icons
 */

import { Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
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
  const statusConfig = {
    connected: apiHealthy === false
      ? {
          icon: <AlertTriangle className="w-4 h-4 text-yellow-500" aria-hidden="true" />,
          text: 'API Unavailable',
          ariaLabel: '연결 상태: 서버 연결됨, API 사용 불가',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
        }
      : {
          icon: <Wifi className="w-4 h-4 text-green-500" aria-hidden="true" />,
          text: 'Connected',
          ariaLabel: 'WebSocket 연결 상태: 연결됨',
          bgColor: 'bg-green-100 dark:bg-green-900/30',
        },
    disconnected: {
      icon: <WifiOff className="w-4 h-4 text-red-500" aria-hidden="true" />,
      text: 'Disconnected',
      ariaLabel: 'WebSocket 연결 상태: 연결 끊김',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
    reconnecting: {
      icon: <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" aria-hidden="true" />,
      text: 'Reconnecting',
      ariaLabel: 'WebSocket 연결 상태: 재연결 중',
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
      ? `WebSocket 연결 상태: 재연결 중 ${reconnectAttempt}번째 시도`
      : config.ariaLabel;

  // Tooltip content shows error message if available, otherwise status text
  const tooltipContent = lastError
    || (status === 'connected' && apiHealthy === false ? 'Claude API에 연결할 수 없습니다' : displayText);

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
            aria-label="서버에 다시 연결 시도"
            title="재연결"
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
          aria-label="서버에 다시 연결 시도"
        >
          재연결
        </button>
      )}
    </div>
  );
}
