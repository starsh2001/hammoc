/**
 * Socket.io Client Singleton
 * Story 1.4: WebSocket Server Setup
 */

import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@bmad-studio/shared';

let socketInstance: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * Get the singleton Socket.io client instance
 * Creates a new instance if one doesn't exist
 * @returns Socket.io client instance
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socketInstance) {
    // Use current hostname for mobile/remote access, fallback to localhost
    // Server port is configurable via VITE_SERVER_PORT env var (for multi-instance setup)
    const serverPort = import.meta.env.VITE_SERVER_PORT || '3000';
    const socketUrl = `http://${window.location.hostname}:${serverPort}`;
    socketInstance = io(socketUrl, {
      autoConnect: true,
      withCredentials: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });
  }
  return socketInstance;
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
