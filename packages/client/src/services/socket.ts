/**
 * Socket.io Client Singleton
 * Story 1.4: WebSocket Server Setup
 */

import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@hammoc/shared';

let socketInstance: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * Get the singleton Socket.io client instance
 * Creates a new instance if one doesn't exist
 * @returns Socket.io client instance
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socketInstance) {
    // Use VITE_SERVER_PORT if explicitly set (dev mode), otherwise use the
    // current page origin so --port CLI flag works without rebuild.
    const socketUrl = import.meta.env.VITE_SERVER_PORT
      ? `http://${window.location.hostname}:${import.meta.env.VITE_SERVER_PORT}`
      : window.location.origin;
    socketInstance = io(socketUrl, {
      autoConnect: true,
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socketInstance;
}

/**
 * Force a clean reconnection by disconnecting then reconnecting.
 * This resets Socket.io's internal backoff timer so the next attempt
 * happens immediately instead of waiting up to reconnectionDelayMax.
 * Used after mobile sleep / browser suspension where the connection may be stale.
 */
export function forceReconnect(): void {
  if (!socketInstance) return;
  socketInstance.disconnect();
  socketInstance.connect();
}

/**
 * Disconnect the socket and clear the instance
 */
export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
