/**
 * ChatPage - Chat page layout with header, message area, and input area
 * [Source: Story 4.1 - Task 1, Story 4.2 - Task 7, Story 4.5 - Task 8]
 *
 * Features:
 * - Three-part layout: header, messages, input
 * - Auto-scroll to new messages
 * - Dark/light theme support
 * - Error handling with retry
 * - Accessibility support (ARIA, keyboard navigation)
 * - Chat input with streaming state support
 * - Real-time streaming support (Story 4.5)
 */

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { toast } from 'sonner';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useMessageStore } from '../stores/messageStore';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useSessionStore } from '../stores/sessionStore';
import type { Attachment, HistoryMessage } from '@hammoc/shared';
import { projectsApi } from '../services/api/projects';
import { useStreaming } from '../hooks/useStreaming';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useFavoriteCommands } from '../hooks/useFavoriteCommands';
import { useStarFavorites } from '../hooks/useStarFavorites';
import { useActiveAgent } from '../hooks/useActiveAgent';
import { getSocket } from '../services/socket';
import { generateUUID } from '../utils/uuid';
import { getAgentId } from '../utils/agentUtils';
import { debugLog, debugLogger } from '../utils/debugLogger';
import { ChatHeader } from '../components/ChatHeader';
import { MessageArea, type MessageAreaHandle } from '../components/MessageArea';
import { ScrollProvider, type ScrollContextValue } from '../contexts/ScrollContext';
import { InputArea } from '../components/InputArea';
import { PendingToolsIndicator } from '../components/PendingToolsIndicator';
import { ChatInput } from '../components/ChatInput';
import { QueueLockedBanner } from '../components/queue/QueueLockedBanner';
import { useQueueSession } from '../hooks/useQueueSession';
import { MessageBubble } from '../components/MessageBubble';
import { TaskNotificationCard } from '../components/TaskNotificationCard';
import { ToolCallCard } from '../components/ToolCallCard';
import { InteractiveResponseCard } from '../components/InteractiveResponseCard';
import { MessageListSkeleton } from '../components/MessageListSkeleton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { QuickPanel } from '../components/panel/QuickPanel';
import { usePanelStore } from '../stores/panelStore';
import { usePanelShortcuts } from '../hooks/usePanelShortcuts';
import { useTerminalStore } from '../stores/terminalStore';
import { useGitStatus } from '../hooks/useGitStatus';
import { useIsMobile } from '../hooks/useIsMobile';
import { ConfirmModal } from '../components/ConfirmModal';
import { ThinkingBlock } from '../components/ThinkingBlock';
import { PromptChainBanner } from '../components/PromptChainBanner';

/**
 * Render a single history message as the appropriate component.
 * Handles AskUserQuestion → InteractiveResponseCard, tool messages → ToolCallCard,
 * and text messages → MessageBubble. (Story 7.1 - QA fix MAINT-001)
 */
const COMPACT_MESSAGE_PREFIX = 'This session is being continued from a previous conversation';

function renderHistoryMessage(message: HistoryMessage, index: number, messages: HistoryMessage[]) {
  // Render task notification as notification card (not user bubble)
  if (message.type === 'task_notification' && message.taskStatus) {
    return <TaskNotificationCard key={message.id} status={message.taskStatus} summary={message.taskSummary} toolUseId={message.taskToolUseId} />;
  }

  // Render context compaction as a simple assistant "Compacted" bubble
  if (message.type === 'user' && typeof message.content === 'string' && message.content.startsWith(COMPACT_MESSAGE_PREFIX)) {
    return <MessageBubble key={message.id} message={{ ...message, type: 'assistant', content: 'Compacted' }} />;
  }

  if (message.type === 'tool_use' && message.toolName === 'AskUserQuestion') {
    const rawQuestions = message.toolInput?.questions as Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect?: boolean;
    }> | undefined;
    // Map all questions with their choices
    const mappedQuestions = rawQuestions?.map((q) => ({
      question: q.question,
      header: q.header,
      choices: q.options.map((opt) => ({
        label: opt.label, description: opt.description, value: opt.label,
      })),
      multiSelect: q.multiSelect,
    }));
    // First question's choices as top-level for backward compat
    const firstChoices = mappedQuestions?.[0]?.choices || [];
    return (
      <InteractiveResponseCard
        key={message.id}
        type="question"
        toolName="AskUserQuestion"
        toolInput={message.toolInput}
        choices={firstChoices}
        questions={mappedQuestions}
        multiSelect={rawQuestions?.[0]?.multiSelect}
        status="responded"
        response={message.toolResult?.output ?? i18n.t('chat:interactive.responded')}
      />
    );
  }
  // tool_use: result already merged by parser — pass as resultOutput
  if (message.type === 'tool_use') {
    return <div key={message.id} id={`tool-${message.id}`}><ToolCallCard message={message} resultOutput={message.toolResult?.output} /></div>;
  }
  // Skip successful tool_result — already merged into tool_use by parser
  if (message.type === 'tool_result' && message.toolResult?.success !== false) {
    return null;
  }
  // Skip user-denied tool_result — already shown as denied in the tool_use card
  if (message.type === 'tool_result' && /denied|거절/i.test(message.toolResult?.error ?? '')) {
    return null;
  }
  // Failed tool_result that couldn't be merged
  if (message.type === 'tool_result') {
    return <ToolCallCard key={message.id} message={message} />;
  }

  // Assistant message with thinking → separate ThinkingBlock card + MessageBubble
  if (message.type === 'assistant' && message.thinking) {
    return (
      <Fragment key={message.id}>
        <div className="flex justify-start">
          <div className="max-w-[90%] md:max-w-[80%]">
            <ThinkingBlock content={message.thinking} />
          </div>
        </div>
        {message.content && <MessageBubble message={message} />}
      </Fragment>
    );
  }

  return <MessageBubble key={message.id} message={message} />;
}

export function ChatPage() {
  const { t } = useTranslation('chat');
  const { projectSlug, sessionId } = useParams<{
    projectSlug: string;
    sessionId: string;
  }>();
  const navigate = useNavigate();

  const {
    messages,
    isLoading,
    isLoadingMore,
    error,
    pagination,
    lastAgentCommand,
    fetchMessages,
    fetchMoreMessages,
    clearMessages,
    addOptimisticMessage,
  } = useMessageStore();

  const { isStreaming, isCompacting, streamingSessionId, streamingSegments, segmentsPendingClear, sendMessage, abortStreaming, abortResponse, permissionMode, setPermissionMode, selectedModel, setSelectedModel, resetSelectedModel, resetPermissionMode, activeModel, contextUsage, resetContextUsage, clearStreamingSegments, streamCompleteCount } = useChatStore();
  const { projects, fetchProjects } = useProjectStore();
  const { sessions, renameSession } = useSessionStore();
  // Get session name from sessionStore (populated when coming from session list)
  const sessionName = useMemo(() => {
    return sessions.find((s) => s.sessionId === sessionId)?.name;
  }, [sessions, sessionId]);

  // Handle session rename
  const handleRenameSession = useCallback((name: string | null) => {
    if (projectSlug && sessionId) {
      renameSession(projectSlug, sessionId, name);
    }
  }, [projectSlug, sessionId, renameSession]);

  // Get working directory and isBmadProject from project
  const currentProject = useMemo(() => {
    return projects.find((p) => p.projectSlug === projectSlug);
  }, [projects, projectSlug]);

  const workingDirectory = currentProject?.originalPath || '';
  const isBmadProject = currentProject?.isBmadProject ?? false;

  // Fetch projects if not loaded (for direct URL navigation)
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, [projects.length, fetchProjects]);

  // Fetch project settings for override application (Story 10.3)
  const setProjectSettings = useChatStore((s) => s.setProjectSettings);
  useEffect(() => {
    if (!projectSlug) {
      setProjectSettings(null);
      return;
    }

    let cancelled = false;
    projectsApi.getSettings(projectSlug)
      .then((settings) => {
        if (!cancelled) {
          setProjectSettings(settings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectSettings(null);
        }
      });

    return () => { cancelled = true; };
  }, [projectSlug, setProjectSettings]);

  // Initialize streaming event handlers
  useStreaming();

  // Fetch slash commands for autocomplete (Story 5.1)
  const { commands, starCommands } = useSlashCommands(projectSlug);

  // Command favorites (Story 9.4/9.5)
  const { favoriteCommands, addFavorite, removeFavorite, reorderFavorites, isFavorite } = useFavoriteCommands();

  // Toggle favorite command handler (Story 9.5)
  const handleToggleFavorite = useCallback((command: string) => {
    if (isFavorite(command)) {
      removeFavorite(command);
    } else {
      if (favoriteCommands.length >= 20) {
        toast.warning(t('favorites.maxReached'));
        return;
      }
      addFavorite(command);
    }
  }, [isFavorite, addFavorite, removeFavorite, favoriteCommands.length]);

  // Active agent detection (Story 8.5)
  const { activeAgent } = useActiveAgent(messages, commands, lastAgentCommand);

  // Queue session lock detection (Story 15.4)
  const {
    isQueueLocked, isQueueRunning, isQueuePaused, isQueueCompleted, isQueueErrored,
    isQueueOnOtherSession, queueActiveSessionId,
    progress: queueProgress, currentPromptPreview: queuePromptPreview,
    pauseReason: queuePauseReason, errorItem: queueErrorItem,
    pause: queuePause, resume: queueResume, abort: queueAbort,
    dismissBanner: queueDismissBanner,
  } = useQueueSession(projectSlug || '', sessionId || '');

  // Star favorites per agent (Story 9.11)
  const activeAgentId = useMemo(() => {
    if (!activeAgent) return null;
    return getAgentId(activeAgent.command);
  }, [activeAgent]);

  // Current agent's star commands (Story 9.9)
  const activeAgentStarCommands = useMemo(() => {
    if (!activeAgentId) return undefined;
    return starCommands[activeAgentId] ?? [];
  }, [activeAgentId, starCommands]);

  const { starFavorites, addStarFavorite, removeStarFavorite, reorderStarFavorites, isStarFavorite } = useStarFavorites(activeAgentId);

  const handleToggleStarFavorite = useCallback((command: string) => {
    if (!activeAgent) return;
    if (isStarFavorite(command)) {
      removeStarFavorite(command);
    } else {
      if (starFavorites.length >= 10) {
        toast.warning(t('starFavorites.maxReached'));
        return;
      }
      addStarFavorite(command);
    }
  }, [activeAgent, isStarFavorite, addStarFavorite, removeStarFavorite, starFavorites.length]);

  // Remove star favorite (Story 9.12)
  const handleRemoveStarFavorite = useCallback((command: string) => {
    if (!activeAgent) return;
    removeStarFavorite(command);
  }, [activeAgent, removeStarFavorite]);

  const [agentListOpenTrigger, setAgentListOpenTrigger] = useState(0);
  const handleAgentIndicatorClick = useCallback(() => {
    setAgentListOpenTrigger((prev) => prev + 1);
  }, []);

  // Imperative ref for MessageArea scroll functions (used by ScrollProvider)
  const messageAreaRef = useRef<MessageAreaHandle>(null);
  const scrollContextValue = useMemo<ScrollContextValue>(() => ({
    scrollToElement: (...args) => messageAreaRef.current?.scrollToElement(...args),
    scrollToBottom: (...args) => messageAreaRef.current?.scrollToBottom(...args),
    adjustScrollBy: (dy) => messageAreaRef.current?.adjustScrollBy(dy),
  }), []);

  // Chain mode toggle — when ON, sending during streaming queues to promptChain
  const [chainMode, setChainMode] = useState(false);

  // Ctrl-hold temporary chain mode — activate while Ctrl is held, revert on release
  const ctrlChainRef = useRef(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !ctrlChainRef.current && !chainMode) {
        ctrlChainRef.current = true;
        setChainMode(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && ctrlChainRef.current) {
        ctrlChainRef.current = false;
        setChainMode(false);
      }
    };
    // Also deactivate when window loses focus (e.g., Ctrl+Tab)
    const handleBlur = () => {
      if (ctrlChainRef.current) {
        ctrlChainRef.current = false;
        setChainMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [chainMode]);

  // Timer ref for chain auto-send (allows cancellation on abort)
  const chainSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Internal send — bypasses chain buffer, sends directly to server.
  // Used by drainChain and non-chain-mode sends.
  const internalSend = useCallback(
    (content: string, attachments?: Attachment[]) => {
      const currentMessages = useMessageStore.getState().messages;
      const images = attachments?.map((a) => ({
        mimeType: a.mimeType,
        data: a.data,
        name: a.name,
      }));
      addOptimisticMessage(content, images);
      sendMessage(content, {
        workingDirectory: workingDirectory!,
        sessionId,
        resume: currentMessages.length > 0,
        attachments,
      });
    },
    [sendMessage, addOptimisticMessage, workingDirectory, sessionId]
  );

  // Drain chain: pop first item and send after 1s delay.
  // This is the ONLY path that sends messages in chain mode.
  const drainChain = useCallback(() => {
    if (promptChainRef.current.length === 0) return;
    if (useChatStore.getState().isStreaming) return;
    if (chainSendTimerRef.current) return;

    const next = promptChainRef.current[0];
    const updated = promptChainRef.current.slice(1);
    promptChainRef.current = updated;
    setPromptChain([...updated]);

    chainSendTimerRef.current = setTimeout(() => {
      chainSendTimerRef.current = null;
      internalSend(next);
    }, 1000);
  }, [internalSend]);

  // Handle message send
  const handleSendMessage = useCallback(
    (content: string, attachments?: Attachment[]) => {
      if (!workingDirectory) {
        debugLogger.error('Cannot send message: workingDirectory not found');
        return;
      }

      // Chain mode: ALL user input goes to buffer. drainChain handles sending.
      if (chainMode) {
        if (promptChainRef.current.length >= 5) {
          return;
        }
        const updatedChain = [...promptChainRef.current, content];
        promptChainRef.current = updatedChain;
        setPromptChain(updatedChain);
        // Try to drain immediately (will no-op if streaming or timer pending)
        drainChain();
        return;
      }

      // Non-chain mode: send directly
      internalSend(content, attachments);
    },
    [chainMode, internalSend, drainChain, workingDirectory]
  );

  // Handle abort — also discard any prompt chain (Story 12.3)
  const handleAbort = useCallback(() => {
    if (useChatStore.getState().isStreaming) {
      setPromptChain([]);
      promptChainRef.current = [];
      // Cancel any pending chain auto-send timer
      if (chainSendTimerRef.current) {
        clearTimeout(chainSendTimerRef.current);
        chainSendTimerRef.current = null;
      }
      abortResponse();
    }
  }, [abortResponse]);

  // Handle BMad agent selection (Story 8.3) - Quick Launch
  const handleAgentSelect = useCallback((agentCommand: string) => {
    const currentMessages = useMessageStore.getState().messages;
    const currentIsStreaming = useChatStore.getState().isStreaming;

    if (currentMessages.length === 0 && !currentIsStreaming) {
      // Empty session: send agent command directly
      setPromptChain([]); promptChainRef.current = [];
      if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
      handleSendMessage(agentCommand);
    } else {
      // Active session: start new session immediately (no confirmation)
      setPromptChain([]); promptChainRef.current = [];
      if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
      abortResponse();
      clearMessages();
      clearStreamingSegments();
      resetSelectedModel();
      resetPermissionMode();
      pendingAgentCommandRef.current = agentCommand;
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    }
  }, [handleSendMessage, abortResponse, clearMessages, clearStreamingSegments, resetSelectedModel, resetPermissionMode, navigate, projectSlug]);

  // Ref to keep latest handleSendMessage for use in fetchMessages callback (Story 8.3)
  const handleSendMessageRef = useRef(handleSendMessage);
  useEffect(() => { handleSendMessageRef.current = handleSendMessage; }, [handleSendMessage]);

  // Handle manual compaction
  const handleCompact = useCallback(() => {
    if (!workingDirectory || isStreaming || messages.length === 0) return;
    addOptimisticMessage('/compact');
    sendMessage('/compact', {
      workingDirectory,
      sessionId,
      resume: true,
    });
  }, [sendMessage, addOptimisticMessage, workingDirectory, sessionId, isStreaming]);

  // Fetch messages on mount (only for existing sessions)
  // After fetch completes, clear any lingering streaming tool segments
  // (handles new session → real session URL navigation case)
  // If a background stream was restored during fetch, trim the last
  // assistant message to avoid duplication with buffer replay.
  useEffect(() => {
    if (projectSlug && sessionId) {
      fetchMessages(projectSlug, sessionId).then(() => {
        const chat = useChatStore.getState();
        const msgState = useMessageStore.getState();
        debugLog.chatpage('DEDUP fetchMessages.then() callback', {
          isStreaming: chat.isStreaming,
          isCompacting: chat.isCompacting,
          segCount: chat.streamingSegments.length,
          segTypes: chat.streamingSegments.map(s => s.type),
          msgCount: msgState.messages.length,
          msgTypes: msgState.messages.map(m => m.type),
        });
        if (chat.isStreaming) {
          // During active streaming, trim all messages after the last user message
          // to avoid duplication with buffer replay. The entire assistant turn
          // will be recreated from streaming segments via completeStreaming.
          // Exception: during compaction, don't trim — there's no assistant turn
          // being replayed, trimming would remove legitimate history.
          if (!chat.isCompacting) {
            const msgs = useMessageStore.getState().messages;
            let lastUserIdx = -1;
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].type === 'user') {
                lastUserIdx = i;
                break;
              }
            }
            if (lastUserIdx >= 0 && lastUserIdx < msgs.length - 1) {
              useMessageStore.setState({ messages: msgs.slice(0, lastUserIdx + 1) });
            }
          }
          // If messages are empty during active streaming (SDK may be rewriting
          // JSONL during compaction), schedule a retry to pick up flushed history
          if (useMessageStore.getState().messages.length === 0) {
            setTimeout(() => {
              useMessageStore.getState().fetchMessages(projectSlug, sessionId, { silent: true });
            }, 3000);
          }
        } else if (chat.streamingSegments.length > 0) {
          clearStreamingSegments();
        }

        // Auto-send pending agent command after navigation (Story 8.3)
        if (pendingAgentCommandRef.current) {
          const command = pendingAgentCommandRef.current;
          pendingAgentCommandRef.current = null;
          handleSendMessageRef.current(command);
        } else {
          // Auto-send agent command from URL search params (Story 12.3)
          const searchParams = new URLSearchParams(window.location.search);
          const agentParam = searchParams.get('agent');
          const taskParam = searchParams.get('task');
          if (agentParam && useMessageStore.getState().messages.length === 0) {
            window.history.replaceState(null, '', window.location.pathname);
            // Queue task command for prompt chain (sent after agent response completes)
            if (taskParam) {
              promptChainRef.current = [taskParam];
              setPromptChain([taskParam]);
            }
            handleSendMessageRef.current(agentParam);
          }
        }
      });
    }
  }, [projectSlug, sessionId, fetchMessages, clearStreamingSegments]);

  // Prompt chain: drain after streaming completes (normal completion).
  // streamCompleteCount is incremented only by completeStreaming, NOT by
  // abortStreaming or error handlers.
  // Fires when chainMode is ON, OR when promptChain has items (dashboard 2-step send).
  const prevCompleteCountRef = useRef(streamCompleteCount);
  useEffect(() => {
    const prevCount = prevCompleteCountRef.current;
    prevCompleteCountRef.current = streamCompleteCount;
    if (streamCompleteCount > prevCount && (chainMode || promptChainRef.current.length > 0)) {
      drainChain();
    }
  }, [streamCompleteCount, chainMode, drainChain]);

  // Safety net: drain chain after unexpected streaming stop (abort/error).
  // Only fires on genuine true→false transition (not initial mount).
  // Fires when chainMode is ON, OR when promptChain has items (dashboard 2-step send).
  const prevIsStreamingForChainRef = useRef(isStreaming);
  useEffect(() => {
    const wasStreaming = prevIsStreamingForChainRef.current;
    prevIsStreamingForChainRef.current = isStreaming;
    if (wasStreaming && !isStreaming && (chainMode || promptChainRef.current.length > 0)) {
      drainChain();
    }
  }, [isStreaming, chainMode, drainChain]);

  // Clean up on component unmount (not on sessionId change):
  // - Clear messages
  // - Detach socket from server-side stream (session:leave)
  // - Clear client-side streaming state (without aborting server-side stream,
  //   which continues in background for reconnection support)
  useEffect(() => {
    return () => {
      debugLog.chatpage('DEDUP ChatPage UNMOUNT cleanup', {
        isStreaming: useChatStore.getState().isStreaming,
        segCount: useChatStore.getState().streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
      });
      clearMessages();
      // Cancel any pending chain auto-send timer before unmount
      if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
      const socket = getSocket();
      socket.emit('session:leave', sessionIdRef.current || '');
      if (useChatStore.getState().isStreaming) {
        useChatStore.getState().abortStreaming();
      }
    };
  }, [clearMessages]);

  // Clean up previous session's streaming state when sessionId changes
  // (e.g., navigating via QueueLockedBanner Link or direct URL change).
  // Uses cleanup function so it runs with the OLD sessionId on re-run.
  // Unmount cleanup is handled by the separate effect above.
  useEffect(() => {
    return () => {
      // Leave the session room on the server so stale stream events stop arriving
      const socket = getSocket();
      socket.emit('session:leave', sessionId || '');
      // Clear client-side streaming state (don't abort server stream — it continues in background)
      if (useChatStore.getState().isStreaming) {
        debugLog.chatpage('sessionId change cleanup → abortStreaming', { oldSessionId: sessionId });
        useChatStore.getState().abortStreaming();
      }
    };
  }, [sessionId]);

  // Probe for active background stream on session mount
  // Must also handle case where socket connects AFTER this effect runs (fresh page load)
  // Skip if already streaming (e.g., navigated from /new to real sessionId mid-stream)
  useEffect(() => {
    if (!sessionId) return;

    const socket = getSocket();
    let isInitialConnect = true; // Track whether this is first connect or reconnect
    let hasJoined = false; // Prevent duplicate session:join (React Strict Mode / rapid navigation)

    const emitJoin = () => {
      const isStreaming = useChatStore.getState().isStreaming;
      debugLog.chatpage('DEDUP emitJoin', {
        sessionId,
        isStreaming,
        hasJoined,
        segCount: useChatStore.getState().streamingSegments.length,
        msgCount: useMessageStore.getState().messages.length,
      });
      debugLog.chatpage('emitJoin', { sessionId, isStreaming });
      // Don't probe if we're already streaming on this session (avoids duplicate buffer replay)
      if (isStreaming) return;
      // Prevent duplicate join for the same effect lifecycle
      if (hasJoined) return;
      hasJoined = true;
      socket.emit('session:join', sessionId);
    };

    const handleConnect = () => {
      const chatState = useChatStore.getState();
      debugLog.chatpage('handleConnect', {
        isInitialConnect,
        isStreaming: chatState.isStreaming,
        streamingSessionId: chatState.streamingSessionId,
        sessionId,
        projectSlug,
        socketConnected: socket.connected,
        msgCount: useMessageStore.getState().messages.length,
      });
      // On reconnection, allow re-joining (server needs to know we're back)
      if (!isInitialConnect) {
        hasJoined = false;
      }
      emitJoin();

      // On RECONNECTION (not initial load), do a silent history refresh
      // to pick up any messages that arrived while disconnected.
      // Skip during active streaming — useStreaming handles reconnection separately,
      // and fetchMessages could replace messages with stale history (JSONL not yet flushed).
      if (!isInitialConnect && projectSlug && sessionId && !useChatStore.getState().isStreaming) {
        const msgState = useMessageStore.getState();
        if (msgState.currentSessionId === sessionId && msgState.messages.length > 0) {
          debugLog.chatpage('handleConnect → fetchMessages (reconnection)', {
            currentSessionId: msgState.currentSessionId,
            msgCount: msgState.messages.length,
          });
          msgState.fetchMessages(projectSlug, sessionId, { silent: true });
        }
      }
      isInitialConnect = false;
    };

    if (socket.connected) {
      handleConnect();
    }
    socket.on('connect', handleConnect);

    return () => {
      socket.off('connect', handleConnect);
    };
  }, [sessionId, projectSlug]);

  // Reset context usage on session change (separate from fetchMessages useEffect)
  useEffect(() => {
    resetContextUsage();
  }, [sessionId, resetContextUsage]);

  const handleBack = useCallback(() => {
    if (projectSlug) {
      navigate(`/project/${projectSlug}/sessions`);
    }
  }, [navigate, projectSlug]);

  // Unified panel state (Story 19.1, 19.3, 19.4)
  const { activePanel, lastActivePanel, openPanel, togglePanel, closePanel,
          panelWidth, setPanelWidth, isDragging } = usePanelStore();
  usePanelShortcuts();
  const isMobile = useIsMobile();

  // Track viewport width for panel overlay detection
  const MIN_CONTENT_WIDTH = 480;
  const [windowWidth, setWindowWidth] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Panel switches to full-screen overlay when content area would be too narrow
  const panelOverlay = isMobile || (activePanel !== null && windowWidth - panelWidth < MIN_CONTENT_WIDTH);

  const handlePanelWidthChange = useCallback((width: number) => {
    setPanelWidth(width);
  }, [setPanelWidth]);

  const handlePanelReopen = useCallback(() => {
    openPanel(lastActivePanel);
  }, [openPanel, lastActivePanel]);

  const chatAreaStyle = !panelOverlay && activePanel
    ? { paddingRight: `${panelWidth}px` }
    : undefined;
  const chatAreaTransition = !panelOverlay && !isDragging
    ? 'transition-[padding-right] duration-300 ease-in-out'
    : '';


  // Confirm modal state (non-blocking replacement for window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'agentLaunch';
    agentCommand?: string;
  }>({ isOpen: false, action: 'agentLaunch' });

  // Ref to store pending agent command for auto-send after navigation (Story 8.3)
  const pendingAgentCommandRef = useRef<string | null>(null);

  // Prompt chain — client-side sequential execution (Story 12.3)
  // State for UI rendering + ref for non-stale access in effect callbacks
  const [promptChain, setPromptChain] = useState<string[]>([]);
  const promptChainRef = useRef<string[]>([]);
  useEffect(() => { promptChainRef.current = promptChain; }, [promptChain]);
  // Stable callback for ChatInput to read fresh chain length from ref
  // (bypasses React async render cycle — chainCount prop can be stale)
  const getChainLength = useCallback(() => promptChainRef.current.length, []);

  // Keep latest sessionId in ref for cleanup (useEffect closures capture stale values)
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const { changedFileCount } = useGitStatus(projectSlug);

  // Story 17.5: Terminal access state (read from store directly to avoid useTerminal side-effects)
  const terminalAccess = useTerminalStore((state) => state.terminalAccess);
  const isTerminalAccessible = terminalAccess?.allowed ?? true;

  const handleNavigateToGitTab = useCallback(() => {
    closePanel();
    navigate(`/project/${projectSlug}/git`);
  }, [closePanel, navigate, projectSlug]);

  const handleNavigateToTerminalTab = useCallback(() => {
    closePanel();
    navigate(`/project/${projectSlug}/terminal`);
  }, [closePanel, navigate, projectSlug]);

  // Execute confirmed action (after user confirms in modal)
  const executeConfirmedAction = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'agentLaunch' });
    // Clear chain state before navigating away
    setPromptChain([]); promptChainRef.current = [];
    if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
    abortResponse();

    if (confirmModal.action === 'agentLaunch') {
      clearMessages();
      clearStreamingSegments();
      resetSelectedModel();
      resetPermissionMode();
      pendingAgentCommandRef.current = confirmModal.agentCommand ?? null;
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    }
  }, [confirmModal.action, confirmModal.agentCommand, abortResponse, clearMessages, clearStreamingSegments, resetSelectedModel, resetPermissionMode, navigate, projectSlug]);

  const handleSessionSelect = useCallback((selectedSessionId: string) => {
    closePanel();
    if (!projectSlug) return;
    // Don't navigate if selecting the current session
    if (selectedSessionId === sessionId) return;
    setPromptChain([]); promptChainRef.current = [];
    if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
    clearMessages();
    clearStreamingSegments();
    resetSelectedModel();
    resetPermissionMode();
    navigate(`/project/${projectSlug}/session/${selectedSessionId}`, { replace: true });
  }, [closePanel, sessionId, clearMessages, clearStreamingSegments, resetSelectedModel, resetPermissionMode, navigate, projectSlug]);

  const handleNewSession = useCallback(() => {
    if (!projectSlug) return;
    setPromptChain([]); promptChainRef.current = [];
    if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
    clearMessages();
    clearStreamingSegments();
    resetSelectedModel();
    resetPermissionMode();
    const newSessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${newSessionId}`);
  }, [clearMessages, clearStreamingSegments, resetSelectedModel, resetPermissionMode, navigate, projectSlug]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'agentLaunch' });
  }, []);

  const handleRetry = useCallback(() => {
    if (projectSlug && sessionId) {
      fetchMessages(projectSlug, sessionId);
    }
  }, [projectSlug, sessionId, fetchMessages]);

  // During active streaming (non-compaction), hide history messages after
  // the last user message to prevent duplication with streaming segments.
  // This render-level filter avoids timing races between fetchMessages (HTTP)
  // and buffer replay (WebSocket) that state-based trims can't handle.
  const displayMessages = useMemo(() => {
    const segCount = useChatStore.getState().streamingSegments.length;
    if (!isStreaming || isCompacting) {
      debugLog.chatpage('DEDUP displayMessages: NO FILTER', {
        isStreaming, isCompacting, msgCount: messages.length,
        msgTypes: messages.map(m => m.type),
        segCount,
      });
      return messages;
    }
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx >= 0 && lastUserIdx < messages.length - 1) {
      const filtered = messages.slice(0, lastUserIdx + 1);
      debugLog.chatpage('DEDUP displayMessages: FILTERED', {
        isStreaming, isCompacting,
        totalMsgCount: messages.length,
        filteredMsgCount: filtered.length,
        removedCount: messages.length - filtered.length,
        removedTypes: messages.slice(lastUserIdx + 1).map(m => m.type),
        segCount,
      });
      return filtered;
    }
    debugLog.chatpage('DEDUP displayMessages: NO TRIM NEEDED (user is last)', {
      isStreaming, msgCount: messages.length,
      msgTypes: messages.map(m => m.type),
      segCount,
    });
    return messages;
  }, [messages, isStreaming, isCompacting]);

  const handleLoadMore = useCallback(() => {
    fetchMoreMessages();
  }, [fetchMoreMessages]);

  // Redirect if required params are missing (MUST be after all hooks)
  if (!projectSlug || !sessionId) {
    return <Navigate to="/" replace />;
  }

  const quickPanelElement = (
    <QuickPanel
      activePanel={activePanel}
      onClose={closePanel}
      onReopen={handlePanelReopen}
      onSwitchPanel={openPanel}
      terminalAccessible={isTerminalAccessible}
      projectSlug={projectSlug}
      currentSessionId={sessionId}
      onSelectSession={handleSessionSelect}
      onNavigateToGitTab={handleNavigateToGitTab}
      onNavigateToTerminalTab={handleNavigateToTerminalTab}
      panelWidth={panelWidth}
      onWidthChange={handlePanelWidthChange}
      isMobile={panelOverlay}
      gitChangedCount={changedFileCount}
    />
  );

  const showQueueBanner = isQueueLocked || isQueueCompleted || isQueueErrored || isQueueOnOtherSession;
  const queueBannerElement = showQueueBanner ? (
    <QueueLockedBanner
      isRunning={isQueueRunning}
      isPaused={isQueuePaused}
      isCompleted={isQueueCompleted}
      isErrored={isQueueErrored}
      isOnOtherSession={isQueueOnOtherSession}
      activeSessionId={queueActiveSessionId}
      progress={queueProgress}
      currentPromptPreview={queuePromptPreview}
      pauseReason={queuePauseReason}
      errorItem={queueErrorItem}
      projectSlug={projectSlug!}
      onPause={queuePause}
      onResume={queueResume}
      onAbort={queueAbort}
      onDismiss={queueDismissBanner}
      onNavigateToSession={handleSessionSelect}
    />
  ) : null;

  const promptChainBannerElement = promptChain.length > 0 ? (
    <PromptChainBanner
      pendingPrompts={promptChain}
      onCancel={() => {
        setPromptChain([]); promptChainRef.current = [];
        if (chainSendTimerRef.current) { clearTimeout(chainSendTimerRef.current); chainSendTimerRef.current = null; }
      }}
      onRemove={(index) => {
        setPromptChain((prev) => prev.filter((_, i) => i !== index));
        promptChainRef.current = promptChainRef.current.filter((_, i) => i !== index);
      }}
    />
  ) : null;

  const confirmModalElement = (
    <ConfirmModal
      isOpen={confirmModal.isOpen}
      title={t('confirmModal.agentLaunch.title')}
      message={t('confirmModal.agentLaunch.message')}
      confirmText={t('common:button.confirm')}
      cancelText={t('common:button.cancel')}
      onConfirm={executeConfirmedAction}
      onCancel={handleCancelConfirm}
      variant="danger"
    />
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="chat-page"
        className={`h-dvh flex flex-col overflow-hidden bg-white dark:bg-[#1c2129] ${chatAreaTransition}`}
        style={chatAreaStyle}
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} activePanel={activePanel} lastActivePanel={lastActivePanel} onTogglePanel={togglePanel} gitChangedCount={changedFileCount} terminalAccessible={isTerminalAccessible}onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
        {queueBannerElement}
        {promptChainBannerElement}
        <main
          role="main"
          aria-label={t('chatPage.ariaLabel')}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <section
            role="log"
            aria-label={t('messageArea.ariaLabel')}
            aria-live="polite"
            data-testid="message-area"
            className="flex-1 overflow-y-auto"
          >
            <div className="content-container p-4">
              <MessageListSkeleton />
            </div>
          </section>
        </main>
        <InputArea disabled>
          <ChatInput
            onSend={handleSendMessage}
            disabled
            isStreaming={isStreaming}
            onAbort={handleAbort}
            queueLocked={isQueueLocked}
            placeholder={t('chatPage.loadingPlaceholder')}
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
            isBmadProject={isBmadProject}
            onAgentSelect={handleAgentSelect}
            agentListOpenTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgent?.command}
            starCommands={activeAgentStarCommands}
            activeAgent={activeAgent}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            favoriteCommands={favoriteCommands}
            onReorderFavorites={reorderFavorites}
            onRemoveFavorite={removeFavorite}

            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={handleToggleStarFavorite}
            starFavorites={starFavorites}
            onReorderStarFavorites={reorderStarFavorites}
            onRemoveStarFavorite={handleRemoveStarFavorite}

          />
        </InputArea>
        {quickPanelElement}
        {confirmModalElement}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        data-testid="chat-page"
        className={`h-dvh flex flex-col overflow-hidden bg-white dark:bg-[#1c2129] ${chatAreaTransition}`}
        style={chatAreaStyle}
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} activePanel={activePanel} lastActivePanel={lastActivePanel} onTogglePanel={togglePanel} gitChangedCount={changedFileCount} terminalAccessible={isTerminalAccessible}onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
        {queueBannerElement}
        {promptChainBannerElement}
        <main
          role="main"
          aria-label={t('chatPage.ariaLabel')}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <section
            role="log"
            aria-label={t('messageArea.ariaLabel')}
            data-testid="message-area"
            className="flex-1 flex items-center justify-center"
          >
            <ErrorState errorType="unknown" onRetry={handleRetry} />
          </section>
        </main>
        <InputArea disabled>
          <ChatInput
            onSend={handleSendMessage}
            disabled
            isStreaming={isStreaming}
            onAbort={handleAbort}
            queueLocked={isQueueLocked}
            placeholder={t('chatPage.errorPlaceholder')}
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
            isBmadProject={isBmadProject}
            onAgentSelect={handleAgentSelect}
            agentListOpenTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgent?.command}
            starCommands={activeAgentStarCommands}
            activeAgent={activeAgent}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            favoriteCommands={favoriteCommands}
            onReorderFavorites={reorderFavorites}
            onRemoveFavorite={removeFavorite}

            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={handleToggleStarFavorite}
            starFavorites={starFavorites}
            onReorderStarFavorites={reorderStarFavorites}
            onRemoveStarFavorite={handleRemoveStarFavorite}

          />
        </InputArea>
        {quickPanelElement}
        {confirmModalElement}
      </div>
    );
  }

  // Empty state (no messages)
  if (messages.length === 0) {
    return (
      <div
        data-testid="chat-page"
        className={`h-dvh flex flex-col overflow-hidden bg-white dark:bg-[#1c2129] ${chatAreaTransition}`}
        style={chatAreaStyle}
      >
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} activePanel={activePanel} lastActivePanel={lastActivePanel} onTogglePanel={togglePanel} gitChangedCount={changedFileCount} terminalAccessible={isTerminalAccessible}onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
        {queueBannerElement}
        {promptChainBannerElement}
        <main
          role="main"
          aria-label={t('chatPage.ariaLabel')}
          className="flex-1 flex flex-col min-h-0 overflow-hidden"
        >
          <MessageArea
            streamingSegments={streamingSegments}
            isStreaming={isStreaming && !!streamingSessionId}
            isCompacting={isCompacting}
            segmentsPendingClear={segmentsPendingClear}
            emptyState={
              !isStreaming && streamingSegments.length === 0 ? (
                <EmptyState
                  title={t('chatPage.empty.title')}
                  description={t('chatPage.empty.description')}
                />
              ) : undefined
            }
          >
            {null}
          </MessageArea>
        </main>
        <InputArea>
          <ChatInput
            onSend={handleSendMessage}
            isStreaming={isStreaming}
            onAbort={handleAbort}
            queueLocked={isQueueLocked}
            placeholder={isStreaming ? t('chatPage.streaming') : t('chatPage.default')}
            commands={commands}
            permissionMode={permissionMode}
            onPermissionModeChange={setPermissionMode}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            activeModel={activeModel}
            isBmadProject={isBmadProject}
            onAgentSelect={handleAgentSelect}
            agentListOpenTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgent?.command}
            starCommands={activeAgentStarCommands}
            activeAgent={activeAgent}

            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
            favoriteCommands={favoriteCommands}
            onReorderFavorites={reorderFavorites}
            onRemoveFavorite={removeFavorite}

            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={handleToggleStarFavorite}
            starFavorites={starFavorites}
            onReorderStarFavorites={reorderStarFavorites}
            onRemoveStarFavorite={handleRemoveStarFavorite}

            chainMode={chainMode}
            onChainModeToggle={() => { if (!ctrlChainRef.current) setChainMode((prev) => !prev); }}
            chainCount={promptChain.length}
            chainMax={5}
            getChainLength={getChainLength}
          />
        </InputArea>
        {quickPanelElement}
        {confirmModalElement}
      </div>
    );
  }

  // Messages view
  return (
    <ScrollProvider value={scrollContextValue}>
    <div
      data-testid="chat-page"
      className={`h-dvh flex flex-col overflow-hidden bg-white dark:bg-[#1c2129] ${chatAreaTransition}`}
      style={chatAreaStyle}
    >
      <ChatHeader
        projectSlug={workingDirectory || projectSlug}
        sessionTitle={sessionId} sessionName={sessionName}
        onBack={handleBack}
        onNewSession={handleNewSession}
        activePanel={activePanel}
        lastActivePanel={lastActivePanel}
        onTogglePanel={togglePanel}
        gitChangedCount={changedFileCount}
        terminalAccessible={isTerminalAccessible}
        onRefresh={handleRetry}
        onRenameSession={handleRenameSession}
        activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null}
        onAgentIndicatorClick={handleAgentIndicatorClick}
        isBmadProject={isBmadProject}
      />
      {queueBannerElement}
      {promptChainBannerElement}

      <main
        role="main"
        aria-label={t('chatPage.ariaLabel')}
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
      >
        <MessageArea ref={messageAreaRef} scrollDependencies={[messages]} streamingSegments={streamingSegments} isStreaming={isStreaming && !!streamingSessionId} isCompacting={isCompacting} isLoadingMore={isLoadingMore} segmentsPendingClear={segmentsPendingClear}>
          {/* Load older messages button */}
          {pagination?.hasMore && (
            <div className="flex justify-center py-4">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400
                           hover:text-blue-700 dark:hover:text-blue-300
                           disabled:opacity-50 focus:outline-none focus:ring-2
                           focus:ring-blue-500 rounded-lg"
              >
                {isLoadingMore ? t('chatPage.loadingMore') : t('chatPage.loadMore')}
              </button>
            </div>
          )}

          {/* Message list */}
          {displayMessages.map((msg, idx) => renderHistoryMessage(msg, idx, displayMessages))}
        </MessageArea>
      </main>

      {isStreaming && <PendingToolsIndicator segments={streamingSegments} />}

      <InputArea>
        <ChatInput
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          onAbort={handleAbort}
          queueLocked={isQueueLocked}
          placeholder={isStreaming ? t('chatPage.streaming') : t('chatPage.default')}
          commands={commands}
          permissionMode={permissionMode}
          onPermissionModeChange={setPermissionMode}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          activeModel={activeModel}
          isBmadProject={isBmadProject}
          onAgentSelect={handleAgentSelect}
          agentListOpenTrigger={agentListOpenTrigger}
          activeAgentCommand={activeAgent?.command}
          starCommands={activeAgentStarCommands}
          activeAgent={activeAgent}
          contextUsage={contextUsage}
          onNewSession={handleNewSession}
          onCompact={handleCompact}
          isFavorite={isFavorite}
          onToggleFavorite={handleToggleFavorite}
          favoriteCommands={favoriteCommands}
          onReorderFavorites={reorderFavorites}
          onRemoveFavorite={removeFavorite}
          isStarFavorite={isStarFavorite}
          onToggleStarFavorite={handleToggleStarFavorite}
          starFavorites={starFavorites}
          onReorderStarFavorites={reorderStarFavorites}
          onRemoveStarFavorite={handleRemoveStarFavorite}

          chainMode={chainMode}
          onChainModeToggle={() => { if (!ctrlChainRef.current) setChainMode((prev) => !prev); }}
          chainCount={promptChain.length}
          chainMax={5}
          getChainLength={getChainLength}
        />
      </InputArea>
      {quickPanelElement}
      {confirmModalElement}
    </div>
    </ScrollProvider>
  );
}
