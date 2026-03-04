/**
 * WebSocket Connection Hook
 * Story 1.4: WebSocket Server Setup
 * Story 4.7: Connection Status Display - Added toast notifications
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSocket } from '../services/socket';
import type { ConnectionStatus } from '@bmad-studio/shared';
import { debugLogger } from '../utils/debugLogger';

export interface UseWebSocketReturn {
  connectionStatus: ConnectionStatus;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempt: number;
  lastError: string | null;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Hook for managing WebSocket connection state
 * @returns WebSocket connection state and control functions
 */
export function useWebSocket(): UseWebSocketReturn {
  const { t } = useTranslation('common');
  const socket = getSocket();

  // Initialize state based on current socket connection status.
  // Use 'reconnecting' instead of 'disconnected' when not yet connected
  // to avoid a brief red disconnect flash while connection is being established.
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() =>
    socket.connected ? 'connected' : 'reconnecting'
  );
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // Track if we've been connected before (to distinguish reconnect from initial connect)
  // Initialize based on current socket state
  const wasConnectedRef = useRef(socket.connected);

  const connect = useCallback(() => {
    if (!socket.connected) {
      setLastError(null);
      socket.connect();
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    socket.disconnect();
  }, [socket]);

  useEffect(() => {
    // If socket is not connected (e.g., created before auth, exhausted reconnection attempts),
    // force a fresh connection attempt now that user may be authenticated.
    if (!socket.connected) {
      socket.connect();
    }

    const handleConnect = () => {
      setConnectionStatus('connected');
      setReconnectAttempt(0);
      setLastError(null);
      wasConnectedRef.current = true;
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    const handleReconnectAttempt = (attempt: number) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempt(attempt);
    };

    const handleReconnectFailed = () => {
      setConnectionStatus('disconnected');
      setLastError(t('connection.reconnectFailed'));
      debugLogger.error('WebSocket reconnection failed', { error: 'Maximum reconnection attempts exceeded' });
    };

    const handleConnectError = (error: Error) => {
      setLastError(t('connection.connectError', { message: error.message }));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket, t]);

  return {
    connectionStatus,
    isConnected: connectionStatus === 'connected',
    isReconnecting: connectionStatus === 'reconnecting',
    reconnectAttempt,
    lastError,
    connect,
    disconnect,
  };
}
