/**
 * WebSocket Connection Hook
 * Story 1.4: WebSocket Server Setup
 * Story 4.7: Connection Status Display - Added toast notifications
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSocket, forceReconnect } from '../services/socket';
import type { ConnectionStatus } from '@hammoc/shared';
import { debugLogger } from '../utils/debugLogger';

// After this many consecutive reconnect_error events, assume the server
// invalidated our session (e.g. forced disconnect(true) or server restart)
// and the stored sid will never be accepted. Force-reset the engine so the
// next attempt performs a fresh handshake with a new sid.
const RECONNECT_ERROR_FORCE_RESET_THRESHOLD = 3;

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

  // Count consecutive reconnect_error events — resets on any successful connect.
  const consecutiveReconnectErrorsRef = useRef(0);

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
      consecutiveReconnectErrorsRef.current = 0;
    };

    const handleDisconnect = (reason: string) => {
      setConnectionStatus('disconnected');
      // socket.io does NOT auto-reconnect when the server forcibly ends the
      // connection (reason === 'io server disconnect'). Observed in R-01
      // scenarios and when the server restarts. Kick off a manual reconnect so
      // the client recovers without requiring a full page reload.
      if (reason === 'io server disconnect') {
        debugLogger.warn('ws-manual-reconnect-after-server-disconnect');
        socket.connect();
      }
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

    const handleReconnectError = (error: Error) => {
      consecutiveReconnectErrorsRef.current += 1;
      if (consecutiveReconnectErrorsRef.current >= RECONNECT_ERROR_FORCE_RESET_THRESHOLD) {
        debugLogger.warn('ws-force-reset-after-consecutive-errors', {
          count: consecutiveReconnectErrorsRef.current,
          lastError: error?.message,
        });
        consecutiveReconnectErrorsRef.current = 0;
        forceReconnect();
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect_failed', handleReconnectFailed);
    socket.io.on('reconnect_error', handleReconnectError);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect_failed', handleReconnectFailed);
      socket.io.off('reconnect_error', handleReconnectError);
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
