/**
 * Session Management Hook
 * Story 1.6: Session Management
 *
 * Manages session state with WebSocket event handling
 * for session creation, resumption, and listing
 */

import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import type { SessionInfo } from '@bmad-studio/shared';

export interface UseSessionReturn {
  currentSessionId: string | null;
  pendingResume: string | null;
  sessions: SessionInfo[];
  isLoadingSessions: boolean;
  resumeSession: (sessionId: string) => void;
  startNewSession: () => void;
  listSessions: (projectPath: string) => void;
}

/**
 * Hook for managing session state with WebSocket events
 * @returns Session state and control functions
 */
export function useSession(): UseSessionReturn {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(false);
  const [pendingResume, setPendingResume] = useState<string | null>(null);

  const socket = getSocket();

  /**
   * Resume an existing session
   */
  const resumeSession = useCallback((sessionId: string) => {
    setPendingResume(sessionId);
  }, []);

  /**
   * Start a new session (clear pending resume)
   */
  const startNewSession = useCallback(() => {
    setPendingResume(null);
    setCurrentSessionId(null);
  }, []);

  /**
   * Request session list from server
   */
  const listSessions = useCallback(
    (projectPath: string) => {
      if (!projectPath) return;

      setIsLoadingSessions(true);
      socket.emit('session:list', { projectPath });
    },
    [socket]
  );

  useEffect(() => {
    /**
     * Handle session:created event
     */
    const handleSessionCreated = (data: { sessionId: string; model?: string }) => {
      setCurrentSessionId(data.sessionId);
      setPendingResume(null);
      if (data.model) {
        useChatStore.getState().setActiveModel(data.model);
      }
    };

    /**
     * Handle session:resumed event
     */
    const handleSessionResumed = (data: { sessionId: string; model?: string }) => {
      setCurrentSessionId(data.sessionId);
      setPendingResume(null);
      if (data.model) {
        useChatStore.getState().setActiveModel(data.model);
      }
    };

    /**
     * Handle session:list event
     */
    const handleSessionList = (data: { sessions: SessionInfo[] }) => {
      setSessions(data.sessions);
      setIsLoadingSessions(false);
    };

    // Register event listeners
    socket.on('session:created', handleSessionCreated);
    socket.on('session:resumed', handleSessionResumed);
    socket.on('session:list', handleSessionList);

    // Cleanup on unmount
    return () => {
      socket.off('session:created', handleSessionCreated);
      socket.off('session:resumed', handleSessionResumed);
      socket.off('session:list', handleSessionList);
    };
  }, [socket]);

  return {
    currentSessionId,
    pendingResume,
    sessions,
    isLoadingSessions,
    resumeSession,
    startNewSession,
    listSessions,
  };
}
