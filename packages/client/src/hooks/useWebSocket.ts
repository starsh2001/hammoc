/**
 * WebSocket Connection Hook
 * Story 1.4: WebSocket Server Setup
 * Story 4.7: Connection Status Display - Added toast notifications
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
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
  const socket = getSocket();

  // Initialize state based on current socket connection status.
  // Use 'reconnecting' instead of 'disconnected' when not yet connected
  // to avoid a brief red disconnect flash while connection is being established.
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() =>
    socket.connected ? 'connected' : 'reconnecting'
  );
  const [reconnectAttempt, setReconnectAttempt] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // Track if we've been connected before (to show toast only on reconnect, not initial connect)
  // Initialize based on current socket state
  const wasConnectedRef = useRef(socket.connected);
  // Track if disconnect toast was shown (to avoid duplicate toasts)
  const disconnectToastShownRef = useRef(false);

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
      const wasReconnecting = wasConnectedRef.current;
      setConnectionStatus('connected');
      setReconnectAttempt(0);
      setLastError(null);

      // Show success toast only on reconnection (not initial connect)
      if (wasReconnecting && disconnectToastShownRef.current) {
        toast.success('서버에 다시 연결되었습니다.');
        disconnectToastShownRef.current = false;
      }

      wasConnectedRef.current = true;
    };

    const handleDisconnect = () => {
      setConnectionStatus('disconnected');

      // Show error toast only if we were previously connected
      if (wasConnectedRef.current && !disconnectToastShownRef.current) {
        toast.error('서버와 연결이 끊어졌습니다.');
        disconnectToastShownRef.current = true;
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      setConnectionStatus('reconnecting');
      setReconnectAttempt(attempt);
    };

    const handleReconnectFailed = () => {
      setConnectionStatus('disconnected');
      setLastError('서버 연결에 실패했습니다. 네트워크 연결을 확인해주세요.');
      debugLogger.error('WebSocket reconnection failed', { error: 'Maximum reconnection attempts exceeded' });
    };

    const handleConnectError = (error: Error) => {
      setLastError(`연결 오류: ${error.message}`);
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
  }, [socket]);

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
