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
import { useChainStore } from '../stores/chainStore';
import { ROOT_BRANCH_KEY } from '@hammoc/shared';
import type { Attachment, HistoryMessage } from '@hammoc/shared';
import type { EditSubmitParams } from '../components/MessageBubble';
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
import { usePreferencesStore } from '../stores/preferencesStore';
import { usePanelShortcuts } from '../hooks/usePanelShortcuts';
import { useTerminalStore } from '../stores/terminalStore';
import { useGitStatus } from '../hooks/useGitStatus';
import { useIsMobile } from '../hooks/useIsMobile';
import { ConfirmModal } from '../components/ConfirmModal';
import { ThinkingBlock } from '../components/ThinkingBlock';
import { PromptChainBanner } from '../components/PromptChainBanner';
import { useEdgeSwipe } from '../hooks/useEdgeSwipe';
import { useMessageTree } from '../hooks/useMessageTree';
import { getBaseUuid } from '../utils/messageTree';


/**
 * Render a single history message as the appropriate component.
 * Handles AskUserQuestion → InteractiveResponseCard, tool messages → ToolCallCard,
 * and text messages → MessageBubble. (Story 7.1 - QA fix MAINT-001)
 */
const COMPACT_MESSAGE_PREFIX = 'This session is being continued from a previous conversation';

function renderHistoryMessage(
  message: HistoryMessage,
  index: number,
  messages: HistoryMessage[],
  t?: (key: string) => string,
  branchInfo?: { total: number; current: number },
  onNavigateBranch?: (messageId: string, direction: 'prev' | 'next') => void,
  isBranchNavigationDisabled?: boolean,
  onEditSubmit?: (params: EditSubmitParams) => void,
  isStreaming?: boolean,
  onRewind?: (messageUuid: string) => void,
  isRewinding?: boolean,
  onSummarize?: (messageUuid: string) => void,
  isSummarizing?: boolean,
  summarizingMessageUuid?: string | null,
  summaryResult?: { messageUuid: string; summary: string } | null,
  onClearSummaryResult?: () => void,
  actionsLocked?: boolean,
  onFork?: (assistantMessageId: string) => void,
) {
  // Render task notification as notification card (not user bubble)
  if (message.type === 'task_notification' && message.taskStatus) {
    return <TaskNotificationCard key={message.id} status={message.taskStatus} summary={message.taskSummary} toolUseId={message.taskToolUseId} />;
  }

  // Render compact_boundary system message as divider + badge
  if (message.type === 'system' && message.subtype === 'compact_boundary') {
    return (
      <div key={message.id} className="flex items-center gap-3 my-4 px-4">
        <div className="flex-1 border-t border-zinc-300 dark:border-zinc-600" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          {t?.('compaction.boundary') ?? 'Conversation compacted'}
        </span>
        <div className="flex-1 border-t border-zinc-300 dark:border-zinc-600" />
      </div>
    );
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
    // Extract toolBlockId from message.id pattern: "${uuid}-tool-${toolBlockId}"
    const toolBlockId = message.id.includes('-tool-') ? message.id.split('-tool-').pop() : message.id;
    return <div key={message.id} id={`tool-${toolBlockId}`}><ToolCallCard message={message} resultOutput={message.toolResult?.output} /></div>;
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
        {message.content && <MessageBubble message={message} isStreaming={isStreaming} />}
      </Fragment>
    );
  }

  return <MessageBubble key={message.id} message={message} branchInfo={branchInfo} onNavigateBranch={onNavigateBranch} isBranchNavigationDisabled={isBranchNavigationDisabled} onEditSubmit={onEditSubmit} isStreaming={isStreaming} onRewind={onRewind} isRewinding={isRewinding} onSummarize={onSummarize} isSummarizing={isSummarizing && summarizingMessageUuid === getBaseUuid(message.id)} summaryResult={summaryResult} onClearSummaryResult={onClearSummaryResult} actionsLocked={actionsLocked} onFork={onFork} />;
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

  const { isStreaming, isCompacting, streamingSessionId, streamingSegments, segmentsPendingClear, sendMessage, abortStreaming, abortResponse, permissionMode, setPermissionMode, selectedModel, setSelectedModel, resetSelectedModel, selectedEffort, setSelectedEffort, resetSelectedEffort, resetPermissionMode, activeModel, contextUsage, resetContextUsage, clearStreamingSegments, rewindFiles, isRewinding, lastDryRunResult, setIsRewinding, clearLastDryRunResult, isSummarizing, summarizingMessageUuid, summaryResult, setSummarizing, clearSummaryResult, editingMessageUuid } = useChatStore();
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

  // Toggle favorite command handler (Story 9.5, BS-1)
  const handleToggleFavorite = useCallback((command: string) => {
    if (isFavorite(command)) {
      const entry = favoriteCommands.find((e) => e.command === command);
      if (entry) removeFavorite(entry);
    } else {
      if (favoriteCommands.length >= 20) {
        toast.warning(t('favorites.maxReached'));
        return;
      }
      // Look up scope from loaded commands
      const cmd = commands.find((c) => c.command === command);
      addFavorite(command, cmd?.scope);
    }
  }, [isFavorite, addFavorite, removeFavorite, favoriteCommands, commands, t]);

  // Active agent detection (Story 8.5)
  const { activeAgent } = useActiveAgent(messages, commands, lastAgentCommand);

  // Queue session lock detection (Story 15.4)
  const {
    isQueueLocked, isQueueRunning, isQueuePaused, isQueueCompleted, isQueueErrored,
    isQueueOnOtherSession, queueActiveSessionId,
    progress: queueProgress, currentPromptPreview: queuePromptPreview,
    isPauseRequested: queueIsPauseRequested, isWaitingForInput: queueIsWaitingForInput,
    pauseReason: queuePauseReason, errorItem: queueErrorItem,
    pause: queuePause, cancelPause: queueCancelPause, resume: queueResume, abort: queueAbort,
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

  // Chain mode toggle — when ON, sending during streaming queues to server chain
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

  // Internal send — sends directly to server (non-chain-mode sends).
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

  // Handle message send
  const handleSendMessage = useCallback(
    (content: string, attachments?: Attachment[]) => {
      if (!workingDirectory || !sessionId) {
        debugLogger.error('Cannot send message: workingDirectory or sessionId not found');
        return;
      }

      // Chain mode: send to server buffer. Server handles drain.
      if (chainMode) {
        if (useChainStore.getState().chainItems.length >= 10) {
          return;
        }
        getSocket()?.emit('chain:add', {
          sessionId,
          content,
          workingDirectory,
          permissionMode,
          model: selectedModel,
          effort: selectedEffort,
        });
        return;
      }

      // Non-chain mode: send directly
      internalSend(content, attachments);
    },
    [chainMode, internalSend, workingDirectory, sessionId, permissionMode, selectedModel, selectedEffort]
  );

  // Handle abort — abortResponse handles fetch+clear internally
  const handleAbort = useCallback(() => {
    if (useChatStore.getState().isStreaming) {
      abortResponse();
    } else if (useChainStore.getState().chainItems.length > 0 && sessionId) {
      // Not streaming but chain is pending (gap between chain items) —
      // emit chain:clear so the server cancels the next scheduled drain.
      getSocket()?.emit('chain:clear', { sessionId });
      useChainStore.getState().clearChainItems();
    }
  }, [abortResponse, sessionId]);

  // Handle BMad agent selection (Story 8.3) - Quick Launch
  const handleAgentSelect = useCallback((agentCommand: string) => {
    const currentMessages = useMessageStore.getState().messages;
    const currentIsStreaming = useChatStore.getState().isStreaming;

    if (currentMessages.length === 0 && !currentIsStreaming) {
      // Empty session: send agent command directly
      handleSendMessage(agentCommand);
    } else {
      // Active session: start new session immediately (no confirmation)
      abortResponse();
      clearMessages();
      clearStreamingSegments();
      resetSelectedModel();
      resetSelectedEffort();
      resetPermissionMode();
      pendingAgentCommandRef.current = agentCommand;
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    }
  }, [handleSendMessage, abortResponse, clearMessages, clearStreamingSegments, resetSelectedModel, resetSelectedEffort, resetPermissionMode, navigate, projectSlug]);

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

  // Promise that resolves when initial fetchMessages completes.
  // session:join (emitJoin) waits on this so history is visible before buffer-replay.
  const initialFetchDoneRef = useRef<{ resolve: () => void; promise: Promise<void> } | null>(null);

  // Fetch messages on mount (only for existing sessions)
  // After fetch completes, clear any lingering streaming tool segments
  // (handles new session → real session URL navigation case)
  // If a background stream was restored during fetch, trim the last
  // assistant message to avoid duplication with buffer replay.
  useEffect(() => {
    if (projectSlug && sessionId) {
      // Create a fresh promise for this session — emitJoin will await it
      let resolve: () => void;
      const promise = new Promise<void>((r) => { resolve = r; });
      initialFetchDoneRef.current = { resolve: resolve!, promise };

      fetchMessages(projectSlug, sessionId).then(() => {
        // Signal that initial fetch is done — emitJoin can now send session:join
        initialFetchDoneRef.current?.resolve();
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
          // Server-side streamStartedAt filtering already excludes stream-period
          // messages from fetchMessages response. No client-side trim needed.
          // If messages are empty during active streaming (SDK may be rewriting
          // JSONL during compaction), schedule a retry to pick up flushed history.
          if (useMessageStore.getState().messages.length === 0) {
            setTimeout(() => {
              useMessageStore.getState().fetchMessages(projectSlug, sessionId, { silent: true });
            }, 3000);
          }
        } else if (chat.streamingSegments.length > 0 && !chat.segmentsPendingClear) {
          // Only clear non-frozen segments (e.g., leftover from navigation).
          // Frozen segments (segmentsPendingClear) are cleared by fetchAndClearSegments
          // after the completion/abort fetch completes.
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
          const chainPrompts = searchParams.getAll('chain');
          if (agentParam && useMessageStore.getState().messages.length === 0) {
            window.history.replaceState(null, '', window.location.pathname);
            // Queue task command for prompt chain via server (sent after agent response completes)
            const wd = currentProject?.originalPath;
            if (sessionId && wd) {
              const chatState = useChatStore.getState();
              const chainOpts = {
                workingDirectory: wd,
                permissionMode: chatState.permissionMode,
                model: chatState.selectedModel,
                effort: chatState.selectedEffort,
              };
              if (taskParam) {
                getSocket()?.emit('chain:add', { sessionId, content: taskParam, ...chainOpts });
              }
              for (const prompt of chainPrompts) {
                getSocket()?.emit('chain:add', { sessionId, content: prompt, ...chainOpts });
              }
            }
            handleSendMessageRef.current(agentParam);
          }
        }
      });
    }
  }, [projectSlug, sessionId, fetchMessages, clearStreamingSegments]);

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
      useChainStore.getState().clearChainItems();
      const socket = getSocket();
      // Story 25.9: Cancel in-progress summary on session leave
      if (useChatStore.getState().isSummarizing) {
        socket.emit('session:cancel-summary', { sessionId: sessionIdRef.current || '' });
        useChatStore.getState().setSummarizing(false, null);
      }
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
      // Clear chain store immediately to avoid stale data during session switch
      useChainStore.getState().clearChainItems();
      // Clear client-side streaming state (don't abort server stream — it continues in background)
      if (useChatStore.getState().isStreaming) {
        debugLog.chatpage('sessionId change cleanup → abortStreaming', { oldSessionId: sessionId });
        useChatStore.getState().abortStreaming();
      }
      // Clear stale result error AFTER abort to prevent late events from re-setting it
      useChatStore.setState({ lastResultError: null });
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

    const emitJoin = async () => {
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
      // Wait for initial history fetch to complete before joining the stream.
      // This ensures conversation history (e.g., forked session's original messages)
      // is visible before buffer-replay starts showing streaming content.
      await initialFetchDoneRef.current?.promise;
      socket.emit('session:join', sessionId, projectSlug);
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
          panelWidth, setPanelWidth, isDragging, panelSide, togglePanelSide, swipeFrom, applyDefaults: applyPanelDefaults } = usePanelStore();
  const panelDefaultOpen = usePreferencesStore((s) => s.preferences.panelDefaultOpen);
  const panelDefaultSide = usePreferencesStore((s) => s.preferences.panelDefaultSide);
  const prefsLoaded = usePreferencesStore((s) => s.loaded);
  useEffect(() => {
    if (!prefsLoaded) return;
    applyPanelDefaults({ panelDefaultOpen, panelDefaultSide });
  }, [applyPanelDefaults, panelDefaultOpen, panelDefaultSide, prefsLoaded]);
  usePanelShortcuts();
  const isMobile = useIsMobile();

  // Edge swipe to open/close panel on mobile
  const { openPanelWithSwipe, closePanelWithSwipe } = usePanelStore();
  const handleEdgeSwipeOpen = useCallback((from: 'left' | 'right') => {
    openPanelWithSwipe(lastActivePanel, from);
  }, [openPanelWithSwipe, lastActivePanel]);
  const handleEdgeSwipeClose = useCallback((toward: 'left' | 'right') => {
    closePanelWithSwipe(toward);
  }, [closePanelWithSwipe]);
  useEdgeSwipe({
    isOpen: activePanel !== null,
    enabled: isMobile,
    onOpen: handleEdgeSwipeOpen,
    onClose: handleEdgeSwipeClose,
  });

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
    ? { [panelSide === 'right' ? 'paddingRight' : 'paddingLeft']: `${panelWidth}px` }
    : undefined;
  const chatAreaTransition = !panelOverlay && !isDragging
    ? 'transition-[padding-left,padding-right] duration-300 ease-in-out'
    : '';


  // Confirm modal state (non-blocking replacement for window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'agentLaunch';
    agentCommand?: string;
  }>({ isOpen: false, action: 'agentLaunch' });

  // Ref to store pending agent command for auto-send after navigation (Story 8.3)
  const pendingAgentCommandRef = useRef<string | null>(null);

  // Stable callback for ChatInput to read fresh chain length from store
  const getChainLength = useCallback(() => useChainStore.getState().chainItems.length, []);

  // Keep latest sessionId in ref for cleanup (useEffect closures capture stale values)
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const { changedFileCount } = useGitStatus(projectSlug);

  // Story 17.5: Terminal access state (read from store directly to avoid useTerminal side-effects)
  const terminalAccess = useTerminalStore((state) => state.terminalAccess);
  const isTerminalAccessible = terminalAccess?.allowed ?? true;

  const handleNavigateToGitTab = useCallback(() => {
    navigate(`/project/${projectSlug}/git`, { replace: true });
    usePanelStore.setState({ activePanel: null });
  }, [navigate, projectSlug]);

  const handleNavigateToTerminalTab = useCallback(() => {
    navigate(`/project/${projectSlug}/terminal`, { replace: true });
    usePanelStore.setState({ activePanel: null });
  }, [navigate, projectSlug]);

  // Execute confirmed action (after user confirms in modal)
  const executeConfirmedAction = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'agentLaunch' });
    useChainStore.getState().clearChainItems();
    abortResponse();

    if (confirmModal.action === 'agentLaunch') {
      clearMessages();
      clearStreamingSegments();
      resetSelectedModel();
      resetSelectedEffort();
      resetPermissionMode();
      pendingAgentCommandRef.current = confirmModal.agentCommand ?? null;
      const newSessionId = generateUUID();
      navigate(`/project/${projectSlug}/session/${newSessionId}`);
    }
  }, [confirmModal.action, confirmModal.agentCommand, abortResponse, clearMessages, clearStreamingSegments, resetSelectedModel, resetSelectedEffort, resetPermissionMode, navigate, projectSlug]);

  const handleSessionSelect = useCallback((selectedSessionId: string) => {
    if (panelOverlay) closePanel();
    if (!projectSlug) return;
    // Don't navigate if selecting the current session
    if (selectedSessionId === sessionId) return;
    useChainStore.getState().clearChainItems();
    clearMessages();
    clearStreamingSegments();
    resetSelectedModel();
    resetSelectedEffort();
    resetPermissionMode();
    navigate(`/project/${projectSlug}/session/${selectedSessionId}`, { replace: true });
  }, [panelOverlay, closePanel, sessionId, clearMessages, clearStreamingSegments, resetSelectedModel, resetSelectedEffort, resetPermissionMode, navigate, projectSlug]);

  const handleNewSession = useCallback(() => {
    if (!projectSlug) return;
    useChainStore.getState().clearChainItems();
    clearMessages();
    clearStreamingSegments();
    resetSelectedModel();
    resetSelectedEffort();
    resetPermissionMode();
    const newSessionId = generateUUID();
    navigate(`/project/${projectSlug}/session/${newSessionId}`);
  }, [clearMessages, clearStreamingSegments, resetSelectedModel, resetSelectedEffort, resetPermissionMode, navigate, projectSlug]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmModal({ isOpen: false, action: 'agentLaunch' });
  }, []);

  const handleRetry = useCallback(() => {
    if (projectSlug && sessionId) {
      fetchMessages(projectSlug, sessionId);
    }
  }, [projectSlug, sessionId, fetchMessages]);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  // Server-side streamStartedAt filtering ensures fetchMessages only returns
  // pre-stream history. Stream-period content comes exclusively from buffer
  // replay (streaming segments). No client-side dedup filtering needed.
  const { displayMessages, branchPoints, navigateBranch, isBranchNavigationDisabled } = useMessageTree(messages);

  // True when viewing a non-latest (non-active) branch via pagination.
  // SDK cannot operate on non-active branch messages, so all actions and input must be disabled.
  const isOnOldBranch = useMemo(() =>
    displayMessages.some((m) => m.branchInfo && m.branchInfo.current < m.branchInfo.total - 1),
    [displayMessages]
  );

  // Story 25.7: Edit submit handler — truncate old branch, add optimistic message,
  // then send edit to server. Truncation also happens in handleSessionInit (useStreaming)
  // for passive viewers receiving session:resumed with resumeSessionAt.
  const handleEditSubmit = useCallback((params: EditSubmitParams) => {
    if (!workingDirectory || !sessionId) {
      debugLogger.error('Cannot edit message: workingDirectory or sessionId not found');
      return;
    }

    const msgs = useMessageStore.getState().messages;
    const editedMsg = msgs.find(
      (m) => m.id === params.messageUuid || m.id.startsWith(params.messageUuid),
    );
    const editedBranchInfo = editedMsg?.branchInfo;
    // Root message (no parentId) always uses ROOT_BRANCH_KEY — server resolves
    // to the actual JSONL root UUID. This ensures root edits always take the
    // same code path regardless of whether branches already exist.
    // Non-root messages use selectionKey (existing branch) or parentId (first edit).
    const isRootEdit = !params.parentId;
    const branchPointId = isRootEdit
      ? ROOT_BRANCH_KEY
      : (editedBranchInfo?.selectionKey ?? params.parentId);

    // Truncate old branch messages at the branch point.
    if (isRootEdit) {
      useMessageStore.setState({ messages: [] });
    } else if (branchPointId) {
      const bpId = branchPointId;
      const branchIdx = msgs.findIndex((m) => m.id === bpId || m.id.startsWith(bpId));
      if (branchIdx !== -1) {
        let lastPartIdx = branchIdx;
        for (let i = branchIdx + 1; i < msgs.length; i++) {
          if (msgs[i].id.startsWith(bpId)) {
            lastPartIdx = i;
          } else {
            break;
          }
        }
        useMessageStore.setState({ messages: msgs.slice(0, lastPartIdx + 1) });
      }
    }

    addOptimisticMessage(params.newText);
    sendMessage(params.newText, {
      workingDirectory,
      sessionId,
      resume: true,
      resumeSessionAt: branchPointId,
      expectedBranchTotal: editedBranchInfo ? editedBranchInfo.total + 1 : undefined,
    });
  }, [workingDirectory, sessionId, sendMessage, addOptimisticMessage]);

  // Story 25.8: Rewind code — dryRun 2-step flow
  const [rewindMessageUuid, setRewindMessageUuid] = useState<string | null>(null);

  const handleRewind = useCallback((messageUuid: string) => {
    if (!workingDirectory || !sessionId) return;
    setRewindMessageUuid(messageUuid);
    rewindFiles(sessionId, workingDirectory, messageUuid, true);
  }, [workingDirectory, sessionId, rewindFiles]);

  const handleRewindConfirm = useCallback(() => {
    if (!workingDirectory || !sessionId || !rewindMessageUuid) return;
    clearLastDryRunResult();
    rewindFiles(sessionId, workingDirectory, rewindMessageUuid, false);
    setRewindMessageUuid(null);
  }, [workingDirectory, sessionId, rewindMessageUuid, rewindFiles, clearLastDryRunResult]);

  const handleRewindCancel = useCallback(() => {
    clearLastDryRunResult();
    setIsRewinding(false);
    setRewindMessageUuid(null);
  }, [clearLastDryRunResult, setIsRewinding]);

  // Story 25.9: Handle summarize button click (or cancel if already summarizing)
  const handleSummarize = useCallback((messageUuid: string) => {
    if (!sessionId) return;
    const socket = getSocket();
    // If already summarizing, cancel
    if (isSummarizing) {
      socket.emit('session:cancel-summary', { sessionId });
      setSummarizing(false, null);
      return;
    }
    setSummarizing(true, messageUuid);
    socket.emit('session:generate-summary', { sessionId, messageUuid });
  }, [sessionId, isSummarizing, setSummarizing]);

  // Story 25.11: Fork session dialog state & handler
  const [forkTargetMessageId, setForkTargetMessageId] = useState<string | null>(null);
  const [forkPromptText, setForkPromptText] = useState('');
  const isForkingRef = useRef(false);

  const handleForkClick = useCallback((assistantMessageId: string) => {
    setForkTargetMessageId(assistantMessageId);
    setForkPromptText('');
  }, []);

  const handleForkConfirm = useCallback(() => {
    if (!workingDirectory || !sessionId || !forkTargetMessageId || isForkingRef.current) return;
    const assistantUuid = getBaseUuid(forkTargetMessageId);
    const prompt = forkPromptText.trim() || t('fork.prompt');
    isForkingRef.current = true;
    sendMessage(prompt, {
      workingDirectory,
      sessionId,
      resume: true,
      resumeSessionAt: assistantUuid,
      forkSession: true,
    });
    setForkTargetMessageId(null);
  }, [workingDirectory, sessionId, forkTargetMessageId, forkPromptText, sendMessage, t]);

  const handleForkCancel = useCallback(() => {
    setForkTargetMessageId(null);
    setForkPromptText('');
  }, []);

  // Story 25.11: Navigate to forked session when forkedSessionId is set
  const forkedSessionId = useChatStore((s) => s.forkedSessionId);
  const clearForkedSessionId = useChatStore((s) => s.clearForkedSessionId);

  useEffect(() => {
    if (forkedSessionId && projectSlug) {
      clearForkedSessionId();
      isForkingRef.current = false;
      navigate(`/project/${projectSlug}/session/${forkedSessionId}`);
    }
  }, [forkedSessionId, projectSlug, clearForkedSessionId, navigate]);

  // Story 25.11: Clean up isForkingRef on error or unexpected stream end during fork
  const lastResultError = useChatStore((s) => s.lastResultError);
  useEffect(() => {
    if (lastResultError && isForkingRef.current) {
      isForkingRef.current = false;
      toast.error(t('fork.error'));
    }
  }, [lastResultError, t]);

  // If streaming ended while forking but no forkedSessionId arrived, clean up
  useEffect(() => {
    if (!isStreaming && isForkingRef.current) {
      // Give a brief window for session:forked to arrive after stream completes
      const timeoutId = setTimeout(() => {
        if (isForkingRef.current && !useChatStore.getState().forkedSessionId) {
          isForkingRef.current = false;
          toast.error(t('fork.error'));
        }
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, t]);

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
      panelSide={panelSide}
      onToggleSide={togglePanelSide}
      swipeFrom={swipeFrom}
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
      onCancelPause={queueCancelPause}
      isPauseRequested={queueIsPauseRequested}
      isWaitingForInput={queueIsWaitingForInput}
      onResume={queueResume}
      onAbort={queueAbort}
      onDismiss={queueDismissBanner}
      onNavigateToSession={handleSessionSelect}
    />
  ) : null;

  const chainItems = useChainStore((state) => state.chainItems);
  const promptChainBannerElement = chainItems.length > 0 ? (
    <PromptChainBanner
      pendingPrompts={chainItems}
      onCancel={() => {
        if (sessionId) getSocket()?.emit('chain:clear', { sessionId });
      }}
      onRemove={(id) => {
        if (sessionId) getSocket()?.emit('chain:remove', { sessionId, id });
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} activePanel={activePanel} lastActivePanel={lastActivePanel} onTogglePanel={togglePanel} panelSide={panelSide} gitChangedCount={changedFileCount} terminalAccessible={isTerminalAccessible}onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
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
            selectedEffort={selectedEffort}
            onEffortChange={setSelectedEffort}
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
        <ChatHeader projectSlug={workingDirectory || projectSlug} sessionTitle={sessionId} sessionName={sessionName} onBack={handleBack} onNewSession={handleNewSession} activePanel={activePanel} lastActivePanel={lastActivePanel} onTogglePanel={togglePanel} panelSide={panelSide} gitChangedCount={changedFileCount} terminalAccessible={isTerminalAccessible}onRenameSession={handleRenameSession} activeAgent={activeAgent ? { name: activeAgent.name, command: activeAgent.command, icon: activeAgent.icon } : null} onAgentIndicatorClick={handleAgentIndicatorClick} isBmadProject={isBmadProject} />
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
            selectedEffort={selectedEffort}
            onEffortChange={setSelectedEffort}
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

  // Unified messages / empty-session view.
  // Both states share the same JSX tree so that ChatInput is never unmounted
  // during the empty→messages transition (which would lose typed text and
  // dismiss the mobile keyboard).
  const isEmpty = messages.length === 0;

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
        panelSide={panelSide}
        gitChangedCount={changedFileCount}
        terminalAccessible={isTerminalAccessible}
        onRefresh={handleRefresh}
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
        <MessageArea
          ref={isEmpty ? undefined : messageAreaRef}
          scrollDependencies={isEmpty ? undefined : [messages]}
          streamingSegments={streamingSegments}
          isStreaming={isStreaming && !!streamingSessionId}
          isCompacting={isCompacting}
          isLoadingMore={isEmpty ? undefined : isLoadingMore}
          segmentsPendingClear={segmentsPendingClear}
          emptyState={
            isEmpty && !isStreaming && streamingSegments.length === 0 ? (
              <EmptyState
                title={t('chatPage.empty.title')}
                description={t('chatPage.empty.description')}
              />
            ) : undefined
          }
        >
          {/* Load older messages button */}
          {!isEmpty && pagination?.hasMore && (
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
          {/* Disable all actions when viewing a non-latest branch (SDK limitation) */}
          {(() => {
            const actionsLocked = isRewinding || isSummarizing || !!editingMessageUuid || isOnOldBranch;
            return displayMessages.map((msg, idx) => (
            <Fragment key={msg.id}>
              <div data-message-id={msg.id}>
                {renderHistoryMessage(
                  msg, idx, displayMessages, t,
                  msg.branchInfo,
                  navigateBranch,
                  isBranchNavigationDisabled || isRewinding || isSummarizing || !!editingMessageUuid,
                  isOnOldBranch ? undefined : handleEditSubmit,
                  isStreaming,
                  isOnOldBranch ? undefined : handleRewind,
                  isRewinding,
                  isOnOldBranch ? undefined : handleSummarize,
                  isSummarizing,
                  summarizingMessageUuid,
                  summaryResult,
                  clearSummaryResult,
                  actionsLocked,
                  isOnOldBranch ? undefined : handleForkClick,
                )}
              </div>
            </Fragment>
          ));
          })()}
        </MessageArea>
      </main>

      {isStreaming && <PendingToolsIndicator segments={streamingSegments} />}

      <InputArea>
        <ChatInput
          onSend={handleSendMessage}
          isStreaming={isStreaming}
          onAbort={handleAbort}
          queueLocked={isQueueLocked}
          actionsDisabled={isOnOldBranch}
          placeholder={isStreaming ? t('chatPage.streaming') : isOnOldBranch ? t('chatPage.oldBranch') : t('chatPage.default')}
          commands={commands}
          permissionMode={permissionMode}
          onPermissionModeChange={setPermissionMode}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          activeModel={activeModel}
          selectedEffort={selectedEffort}
          onEffortChange={setSelectedEffort}
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
          chainCount={chainItems.length}
          chainMax={10}
          getChainLength={getChainLength}
        />
      </InputArea>
      {quickPanelElement}
      {confirmModalElement}

      {/* Story 25.8: Rewind confirmation dialog */}
      <ConfirmModal
        isOpen={!!lastDryRunResult}
        title={t('rewind.confirmTitle')}
        message={t('rewind.confirmMessage')}
        confirmText={t('rewind.confirm')}
        cancelText={t('rewind.cancel')}
        onConfirm={handleRewindConfirm}
        onCancel={handleRewindCancel}
      >
        {lastDryRunResult && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            <p className="mb-2 font-medium">
              {t('rewind.dryRunSummary', {
                count: lastDryRunResult.filesChanged?.length ?? 0,
                insertions: lastDryRunResult.insertions ?? 0,
                deletions: lastDryRunResult.deletions ?? 0,
              })}
            </p>
            {lastDryRunResult.filesChanged && lastDryRunResult.filesChanged.length > 0 && (
              <>
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{t('rewind.fileList')}</p>
                <ul className="max-h-60 overflow-y-auto text-xs font-mono space-y-0.5">
                  {lastDryRunResult.filesChanged.map((file) => (
                    <li key={file} className="truncate text-gray-700 dark:text-gray-200">{file}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </ConfirmModal>

      {/* Story 25.11: Fork session prompt dialog */}
      {forkTargetMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleForkCancel}>
          <div
            className="w-full max-w-md mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('fork.dialogTitle')}
            </h3>
            <textarea
              className="w-full h-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         placeholder-gray-400 dark:placeholder-gray-500
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder={t('fork.promptPlaceholder')}
              value={forkPromptText}
              onChange={(e) => setForkPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleForkConfirm();
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleForkCancel}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {t('fork.dialogCancel')}
              </button>
              <button
                onClick={handleForkConfirm}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                {t('fork.dialogConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ScrollProvider>
  );
}
