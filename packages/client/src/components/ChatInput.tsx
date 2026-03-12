/**
 * ChatInput Component - Multiline text input for chat messages
 * [Source: Story 4.2 - Tasks 2-6, Story 4.7 - Task 4, Story 5.1 - Task 4, Story 5.5 - Tasks 2-5]
 *
 * Features:
 * - Auto-resizing textarea (1-5 lines)
 * - Enter to send, Shift+Enter for newline
 * - IME composition handling (Korean input)
 * - Streaming state disable support
 * - Connection status warning (Story 4.7)
 * - Slash command autocomplete (Story 5.1)
 * - Image attachment via button, drag & drop, clipboard paste (Story 5.5)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Send, Square, Paperclip, X, Lock, Link2, Plus, Mic, MicOff } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useChatStore } from '../stores/chatStore';
import { useClickOutside } from '../hooks/useClickOutside';
import { usePromptHistory } from '../hooks/usePromptHistory';
import { CommandPalette } from './CommandPalette';
import { filterCommands } from './CommandPalette';
import { StarCommandPalette, filterStarCommands } from './StarCommandPalette';
import { PermissionModeSelector } from './PermissionModeSelector';
import { ModelSelector } from './ModelSelector';
import { BmadAgentButton } from './BmadAgentButton';
import { FavoritesPopup } from './FavoritesPopup';
import { FavoritesChipBar } from './FavoritesChipBar';
import { ContextUsageDisplay } from './ContextUsageDisplay';
import { UsageStatusBar } from './UsageStatusBar';
import { useSpeechRecognition, getSpeechLang } from '../hooks/useSpeechRecognition';
import type { SlashCommand, StarCommand, Attachment, PermissionMode, ChatUsage } from '@hammoc/shared';
import { IMAGE_CONSTRAINTS } from '@hammoc/shared';
import { generateUUID } from '../utils/uuid';
import { debugLogger } from '../utils/debugLogger';

// Permission mode color mapping for focus ring and send button
const MODE_COLORS: Record<PermissionMode, { ring: string; border: string; button: string }> = {
  plan: {
    ring: 'focus-within:ring-blue-500/40 dark:focus-within:ring-blue-400/40',
    border: 'focus-within:border-blue-500 dark:focus-within:border-blue-400',
    button: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
  },
  default: {
    ring: 'focus-within:ring-orange-500/40 dark:focus-within:ring-orange-400/40',
    border: 'focus-within:border-orange-500 dark:focus-within:border-orange-400',
    button: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600',
  },
  acceptEdits: {
    ring: 'focus-within:ring-gray-500/40 dark:focus-within:ring-gray-400/40',
    border: 'focus-within:border-gray-500 dark:focus-within:border-gray-400',
    button: 'bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-[#2d3a4a]',
  },
  bypassPermissions: {
    ring: 'focus-within:ring-red-500/40 dark:focus-within:ring-red-400/40',
    border: 'focus-within:border-red-500 dark:focus-within:border-red-400',
    button: 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
  },
  dontAsk: {
    ring: 'focus-within:ring-yellow-500/40 dark:focus-within:ring-yellow-400/40',
    border: 'focus-within:border-yellow-500 dark:focus-within:border-yellow-400',
    button: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600',
  },
};

const DEFAULT_MODE_COLORS = MODE_COLORS.default;

// Client-only extended attachment with preview URL and File reference
interface ClientAttachment extends Attachment {
  preview: string; // data:${mimeType};base64,${data} Data URL for img src
  file: File; // Original File object reference (not sent to server)
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader result is not a string'));
        return;
      }
      const base64Data = result.split(',')[1];
      if (!base64Data) {
        reject(new Error('Failed to extract base64 data from Data URL'));
        return;
      }
      resolve(base64Data);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(file);
  });
}

interface ChatInputProps {
  /** Message send callback */
  onSend: (content: string, attachments?: Attachment[]) => void;
  /** Disabled state (during streaming) */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Available slash commands for autocomplete */
  commands?: SlashCommand[];
  /** Whether Claude is currently streaming a response */
  isStreaming?: boolean;
  /** Callback to abort the current response */
  onAbort?: () => void;
  /** Current permission mode */
  permissionMode?: PermissionMode;
  /** Permission mode change callback */
  onPermissionModeChange?: (mode: PermissionMode) => void;
  /** Currently selected model */
  selectedModel?: string;
  /** Model change callback */
  onModelChange?: (model: string) => void;
  /** Actual model reported by SDK */
  activeModel?: string | null;
  /** Whether current project is a BMad project */
  isBmadProject?: boolean;
  /** Callback when a BMad agent is selected */
  onAgentSelect?: (agentId: string) => void;
  /** External trigger to open agent list (increment to open) */
  agentListOpenTrigger?: number;
  /** Currently active agent command (for checkmark indicator) */
  activeAgentCommand?: string | null;
  /** Context usage data for donut indicator */
  contextUsage?: ChatUsage | null;
  /** Callback for new session (critical usage) */
  onNewSession?: () => void;
  /** Callback for context compaction */
  onCompact?: () => void;
  /** Check if a command is favorited (Story 9.5) */
  isFavorite?: (command: string) => boolean;
  /** Toggle favorite status for a command (Story 9.5) */
  onToggleFavorite?: (command: string) => void;
  /** Favorite command strings (Story 9.6) */
  favoriteCommands?: string[];
  /** Reorder favorites callback (Story 9.6) */
  onReorderFavorites?: (commands: string[]) => void;
  /** Remove favorite callback (Story 9.6) */
  onRemoveFavorite?: (command: string) => void;
  /** Star commands for the active agent (Story 9.9) */
  starCommands?: StarCommand[];
  /** Active agent info for star command palette header (Story 9.9) */
  activeAgent?: SlashCommand | null;
  /** Check if a star command is favorited (Story 9.11) */
  isStarFavorite?: (command: string) => boolean;
  /** Toggle star favorite status (Story 9.11) */
  onToggleStarFavorite?: (command: string) => void;
  /** Star favorites for active agent (Story 9.12) */
  starFavorites?: string[];
  /** Reorder star favorites callback (Story 9.12) */
  onReorderStarFavorites?: (commands: string[]) => void;
  /** Remove star favorite callback (Story 9.12) */
  onRemoveStarFavorite?: (command: string) => void;
  /** Whether the session is queue-locked (Story 15.4) */
  queueLocked?: boolean;
  /** Prompt chain mode — queue messages during streaming (Story 12.3) */
  chainMode?: boolean;
  /** Toggle chain mode callback */
  onChainModeToggle?: () => void;
  /** Number of prompts currently in the chain (for UI display, may be stale) */
  chainCount?: number;
  /** Maximum chain size (default 5) */
  chainMax?: number;
  /** Returns fresh chain length from ref (bypasses React render cycle staleness) */
  getChainLength?: () => number;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  commands = [],
  isStreaming = false,
  onAbort,
  permissionMode,
  onPermissionModeChange,
  selectedModel,
  onModelChange,
  activeModel,
  isBmadProject,
  onAgentSelect,
  agentListOpenTrigger,
  activeAgentCommand,
  contextUsage,
  onNewSession,
  onCompact,
  isFavorite,
  onToggleFavorite,
  favoriteCommands,
  onReorderFavorites,
  onRemoveFavorite,
  starCommands,
  activeAgent,
  isStarFavorite,
  onToggleStarFavorite,
  starFavorites,
  onReorderStarFavorites,
  onRemoveStarFavorite,
  queueLocked = false,
  chainMode = false,
  onChainModeToggle,
  chainCount = 0,
  chainMax = 5,
  getChainLength,
}: ChatInputProps) {
  const { t, i18n } = useTranslation('chat');
  // Session lock state (another browser took over this session)
  const isSessionLocked = useChatStore((s) => s.isSessionLocked);
  const subscriptionRateLimit = useChatStore((s) => s.subscriptionRateLimit);

  // Local state
  const [content, setContent] = useState('');
  const [showConnectionWarning, setShowConnectionWarning] = useState(false);

  // Command palette state (Story 5.1)
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Star command palette state (Story 9.9)
  const [showStarCommands, setShowStarCommands] = useState(false);
  const [starSelectedIndex, setStarSelectedIndex] = useState(0);

  // Favorites popup state (Story 9.6)
  const [showFavorites, setShowFavorites] = useState(false);
  const favoritesContainerRef = useRef<HTMLDivElement>(null);

  // Image attachment state (Story 5.5)
  const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // WebSocket connection status
  const { isConnected } = useWebSocket();

  // Speech recognition (voice-to-text)
  const handleSpeechTranscript = useCallback((text: string) => {
    setContent((prev) => (prev ? prev + ' ' + text : text));
    // adjustHeight runs via useEffect on content change — no manual resize needed
  }, []);
  const speechRecognition = useSpeechRecognition({
    lang: getSpeechLang(i18n.language),
    onTranscript: handleSpeechTranscript,
  });

  // Show toast when speech recognition encounters an error
  useEffect(() => {
    if (speechRecognition.error) {
      const msg = speechRecognition.error === 'not-allowed'
        ? t('input.voiceDenied')
        : t('input.voiceError');
      toast.error(msg);
    }
  }, [speechRecognition.error, t]);

  // Stop speech recognition when input becomes locked
  useEffect(() => {
    if ((queueLocked || isSessionLocked) && speechRecognition.isListening) {
      speechRecognition.stop();
    }
  }, [queueLocked, isSessionLocked, speechRecognition.isListening, speechRecognition.stop]);

  // Detect touch device (mobile) - Enter becomes newline, send via button only
  const isTouchDevice = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);

  // Prompt history (ArrowUp/Down navigation)
  const { addToHistory, navigateUp, navigateDown, resetNavigation, isNavigating } = usePromptHistory();

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commandPaletteAreaRef = useRef<HTMLDivElement>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userHasFocusedRef = useRef(false);

  // Compute filter and filtered commands count for keyboard navigation
  const commandFilter = useMemo(() => {
    if (!content.startsWith('/')) return '';
    return content.slice(1);
  }, [content]);

  const filteredCommandsCount = useMemo(() => {
    if (!showCommands || commands.length === 0) return 0;
    return filterCommands(commands, commandFilter).length;
  }, [showCommands, commands, commandFilter]);

  // Star command filter (Story 9.9)
  const starCommandFilter = useMemo(() => {
    if (!content.startsWith('*')) return '';
    return content.slice(1);
  }, [content]);

  const filteredStarCommandsCount = useMemo(() => {
    if (!showStarCommands || !starCommands || starCommands.length === 0) return 0;
    return filterStarCommands(starCommands, starCommandFilter).length;
  }, [showStarCommands, starCommands, starCommandFilter]);

  // Get mode colors based on current permission mode
  const modeColors = useMemo(() => {
    if (!permissionMode) return DEFAULT_MODE_COLORS;
    return MODE_COLORS[permissionMode] || DEFAULT_MODE_COLORS;
  }, [permissionMode]);

  // Update showCommands based on content
  // Only show palette when content starts with "/" and has no space (still typing the command)
  useEffect(() => {
    if (content.startsWith('/') && !content.includes(' ') && commands.length > 0) {
      setShowCommands(true);
      setShowFavorites(false);
      setShowStarCommands(false);
    } else if (content.startsWith('*') && !content.includes(' ') && activeAgent && starCommands && starCommands.length > 0) {
      setShowStarCommands(true);
      setShowCommands(false);
      setShowFavorites(false);
    } else {
      setShowCommands(false);
      setShowStarCommands(false);
    }
  }, [content, commands.length, activeAgent, starCommands]);

  // Reset selectedIndex when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [commandFilter]);

  // Reset starSelectedIndex when star filter changes (Story 9.9)
  useEffect(() => {
    setStarSelectedIndex(0);
  }, [starCommandFilter]);

  // Height adjustment - textarea grows up to max-height, then scrolls internally.
  // Uses '0px' instead of 'auto' to minimize layout thrash that can trigger
  // visualViewport resize events on mobile (the debounced handler in MessageArea
  // provides the primary protection).
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = '0px';
    const scrollH = Math.max(textarea.scrollHeight, 28);
    textarea.style.height = `${scrollH}px`;
  }, []);

  // Adjust height on content change
  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  // Auto-focus on mount (desktop only - skip on touch devices to prevent keyboard popup)
  useEffect(() => {
    if (textareaRef.current && !isTouchDevice) {
      textareaRef.current.focus();
    }
  }, [isTouchDevice]);

  // Keep focus on mobile during streaming (prevent keyboard from hiding)
  useEffect(() => {
    if (!isTouchDevice || !isStreaming) return;

    const interval = setInterval(() => {
      if (userHasFocusedRef.current && textareaRef.current && document.activeElement !== textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isTouchDevice, isStreaming]);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Hide warning when connection is restored
  useEffect(() => {
    if (isConnected && showConnectionWarning) {
      setShowConnectionWarning(false);
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
    }
  }, [isConnected, showConnectionWarning]);

  // Show validation error with auto-dismiss (Story 5.5)
  const showValidationError = useCallback((message: string) => {
    setValidationError(message);
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    validationTimeoutRef.current = setTimeout(() => {
      setValidationError(null);
      validationTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Process files for attachment (Story 5.5)
  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (files.length > 0 && imageFiles.length === 0) {
      showValidationError(t('validation.onlyImages'));
      return;
    }

    for (const file of imageFiles) {
      if (!(IMAGE_CONSTRAINTS.ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
        showValidationError(t('validation.unsupportedFormat'));
        return;
      }
      if (file.size > IMAGE_CONSTRAINTS.MAX_SIZE_BYTES) {
        showValidationError(t('validation.fileTooLarge'));
        return;
      }
    }

    if (imageFiles.length === 0) return;

    // Check count limit against current state
    const currentCount = attachments.length;
    const remaining = IMAGE_CONSTRAINTS.MAX_COUNT - currentCount;
    if (remaining <= 0) {
      showValidationError(t('validation.maxImagesExceeded'));
      return;
    }
    const toAdd = imageFiles.slice(0, remaining);
    if (imageFiles.length > remaining) {
      showValidationError(t('validation.maxImagesExceeded'));
    }

    // Read files and create attachments
    const newAttachments: ClientAttachment[] = [];
    for (const file of toAdd) {
      try {
        const base64Data = await readFileAsBase64(file);
        const preview = `data:${file.type};base64,${base64Data}`;
        newAttachments.push({
          id: generateUUID(),
          type: 'image',
          name: file.name,
          size: file.size,
          mimeType: file.type,
          data: base64Data,
          preview,
          file,
        });
      } catch (err) {
        debugLogger.error('Failed to read image file', { error: err instanceof Error ? err.message : String(err), fileName: file.name });
        showValidationError(t('validation.failedToReadImage', { name: file.name }));
      }
    }
    if (newAttachments.length > 0) {
      setAttachments(current => [...current, ...newAttachments]);
    }
  }, [showValidationError, attachments.length]);

  // File input change handler (Story 5.5)
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [processFiles]);

  // Remove attachment (Story 5.5)
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // Drag and drop handlers (Story 5.5)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  // Clipboard paste handler (Story 5.5)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return; // Let default text paste happen

    e.preventDefault();
    const files = imageItems
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null)
      .map(f => {
        // Clipboard images have no filename, assign a default
        const ext = f.type.split('/')[1] || 'png';
        return new File([f], `clipboard-image-${Date.now()}.${ext}`, { type: f.type });
      });
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  // Command palette: close on outside click
  useClickOutside(commandPaletteAreaRef, useCallback(() => {
    if (showCommands) setShowCommands(false);
    if (showStarCommands) setShowStarCommands(false);
  }, [showCommands, showStarCommands]));

  // Favorites popup: close on outside click (Story 9.6)
  useClickOutside(favoritesContainerRef, useCallback(() => {
    if (showFavorites) setShowFavorites(false);
  }, [showFavorites]));

  // Favorites popup: toggle handler (Story 9.6)
  const handleToggleFavorites = useCallback(() => {
    setShowFavorites((prev) => {
      if (!prev) {
        setShowCommands(false);      // Mutual exclusion
        setShowStarCommands(false);   // Mutual exclusion (Story 9.9)
      }
      return !prev;
    });
  }, []);

  // Select all {placeholder}s in text after inserting into textarea
  // e.g. "*shard-doc {document} {destination} " → selects "{document} {destination}"
  const selectPlaceholders = useCallback((text: string) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last > first) {
        textarea.setSelectionRange(first, last + 1);
      } else {
        textarea.setSelectionRange(text.length, text.length);
      }
    });
  }, []);

  // Favorites popup: command select handler (Story 9.6)
  const handleFavoriteSelect = useCallback((command: string) => {
    setContent(command + ' ');
    setShowFavorites(false);
    textareaRef.current?.focus();
  }, []);

  // Star favorite popup select handler (Story 9.12)
  const handleStarFavoriteSelect = useCallback((command: string) => {
    const text = '*' + command + ' ';
    setContent(text);
    setShowFavorites(false);
    selectPlaceholders(text);
  }, [selectPlaceholders]);

  // Star command selection handler (Story 9.9)
  const handleStarCommandSelect = useCallback((command: string) => {
    const text = '*' + command + ' ';
    setContent(text);
    setShowStarCommands(false);
    setStarSelectedIndex(0);
    selectPlaceholders(text);
  }, [selectPlaceholders]);

  // Command selection handler (Story 5.1)
  const handleCommandSelect = useCallback((command: SlashCommand) => {
    setContent(command.command + ' ');
    setShowCommands(false);
    setSelectedIndex(0);
    textareaRef.current?.focus();
  }, []);

  // Submit handler
  const handleSubmit = useCallback(() => {
    if (isSessionLocked || queueLocked) return;
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    // Block submit during streaming when chain mode is OFF (no queuing available)
    if (isStreaming && !chainMode) return;
    // Block submit when chain is full — uses getChainLength() for fresh ref-based
    // value that bypasses React's async rendering (chainCount prop can be stale).
    if (chainMode && (getChainLength?.() ?? chainCount) >= chainMax) return;

    // Show warning if not connected
    if (!isConnected) {
      setShowConnectionWarning(true);
      // Auto-hide warning after 3 seconds
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      warningTimeoutRef.current = setTimeout(() => {
        setShowConnectionWarning(false);
        warningTimeoutRef.current = null;
      }, 3000);
      return;
    }

    // Warn (but don't block) if API is unhealthy
    const apiHealth = useChatStore.getState().apiHealth;
    if (apiHealth && !apiHealth.healthy) {
      toast.warning(t('errors.apiUnhealthy'), {
        id: 'api-health-warning',
        duration: 5000,
      });
    }

    addToHistory(trimmedContent);
    onSend(trimmedContent, attachments.length > 0 ? attachments : undefined);
    setContent('');
    setAttachments([]);

    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = '0px';
    }
  }, [content, isConnected, isSessionLocked, isStreaming, queueLocked, onSend, attachments, chainMode, chainMax, getChainLength, chainCount]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ignore Enter during IME composition (Korean input)
      // Check both nativeEvent.isComposing and the event's isComposing property
      const isComposing = e.nativeEvent?.isComposing ?? (e as unknown as KeyboardEvent).isComposing;
      if (isComposing) return;

      // Command palette keyboard navigation (Story 5.1)
      if (showCommands && filteredCommandsCount > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev >= filteredCommandsCount - 1 ? 0 : prev + 1
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev <= 0 ? filteredCommandsCount - 1 : prev - 1
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const filtered = filterCommands(commands, commandFilter);
          if (filtered[selectedIndex]) {
            handleCommandSelect(filtered[selectedIndex]);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowCommands(false);
          return;
        }
      }

      // Star command palette keyboard navigation (Story 9.9)
      if (showStarCommands && filteredStarCommandsCount > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setStarSelectedIndex((prev) =>
            prev >= filteredStarCommandsCount - 1 ? 0 : prev + 1
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setStarSelectedIndex((prev) =>
            prev <= 0 ? filteredStarCommandsCount - 1 : prev - 1
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const filtered = filterStarCommands(starCommands ?? [], starCommandFilter);
          if (filtered[starSelectedIndex]) {
            handleStarCommandSelect(filtered[starSelectedIndex].command);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowStarCommands(false);
          return;
        }
      }

      // Shift+Tab: cycle permission mode
      if (e.key === 'Tab' && e.shiftKey && permissionMode && onPermissionModeChange) {
        e.preventDefault();
        const modes: PermissionMode[] = ['plan', 'default', 'acceptEdits', 'bypassPermissions'];
        const idx = modes.indexOf(permissionMode);
        onPermissionModeChange(modes[(idx + 1) % modes.length]);
        return;
      }

      // Close favorites popup on Escape (Story 9.6)
      if (e.key === 'Escape' && showFavorites) {
        e.preventDefault();
        setShowFavorites(false);
        return;
      }

      // Mobile: back button sends Escape — blur textarea to dismiss keyboard cleanly
      if (e.key === 'Escape' && isTouchDevice) {
        textareaRef.current?.blur();
        return;
      }

      // Prompt history navigation (ArrowUp/Down when no palette is open)
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        const textarea = e.currentTarget;
        // Only activate when cursor is at the very start or input is empty
        if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
          const result = navigateUp(content);
          if (result !== null) {
            e.preventDefault();
            setContent(result);
          }
          return;
        }
      }

      if (e.key === 'ArrowDown' && !e.shiftKey) {
        const textarea = e.currentTarget;
        // Only activate when cursor is at the very end or navigating history
        if (isNavigating && textarea.selectionStart === textarea.value.length) {
          const result = navigateDown();
          if (result !== null) {
            e.preventDefault();
            setContent(result);
          }
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
        e.preventDefault();
        handleSubmit();
      }
      // Shift+Enter (desktop) / Enter (mobile): default behavior (newline)
    },
    [handleSubmit, showCommands, showFavorites, showStarCommands, filteredCommandsCount, filteredStarCommandsCount, commands, commandFilter, selectedIndex, handleCommandSelect, starCommands, starCommandFilter, starSelectedIndex, handleStarCommandSelect, content, navigateUp, navigateDown, isNavigating, isTouchDevice, permissionMode, onPermissionModeChange]
  );

  // Button click handler
  const handleButtonClick = useCallback(() => {
    handleSubmit();
    // Refocus textarea after sending
    textareaRef.current?.focus();
  }, [handleSubmit]);

  // Mobile: blur textarea when keyboard is dismissed via back button/gesture.
  // On Android, dismissing the keyboard does NOT blur the textarea, so we detect
  // it via viewport height increase. Uses visualViewport API (keyboard/zoom only)
  // with a 100px threshold to ignore small layout shifts (toasts, status bars).
  useEffect(() => {
    if (!isTouchDevice) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let lastHeight = vv.height;
    const handleResize = () => {
      const newHeight = vv.height;
      const delta = newHeight - lastHeight;
      if (delta > 100 && document.activeElement === textareaRef.current) {
        textareaRef.current?.blur();
      }
      lastHeight = newHeight;
    };
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, [isTouchDevice]);

  // Prevent focus from moving to button on both desktop and mobile.
  const preventFocusLoss = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
  }, []);

  const isChainFull = chainMode && chainCount >= chainMax;
  const isButtonDisabled = !content.trim() || isChainFull;

  const isAttachDisabled = attachments.length >= IMAGE_CONSTRAINTS.MAX_COUNT;

  return (
    <div className="flex flex-col gap-3">
      {/* Connection warning */}
      {showConnectionWarning && (
        <div
          role="alert"
          aria-live="assertive"
          className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-md"
          data-testid="connection-warning"
        >
          {t('errors.disconnected')}
        </div>
      )}

      {/* Image preview area (Story 5.5) */}
      {attachments.length > 0 && (
        <div
          className="flex gap-2 overflow-x-auto py-1 px-1"
          data-testid="image-preview-area"
        >
          {attachments.map(attachment => (
            <div key={attachment.id} className="relative flex-shrink-0 flex flex-col items-center gap-1">
              <div className="relative w-16 h-16">
                <img
                  src={attachment.preview}
                  alt={attachment.name}
                  className="w-16 h-16 object-cover rounded border border-gray-300 dark:border-[#2d3a4a]"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  className="w-16 h-16 rounded border border-gray-300 dark:border-[#2d3a4a] items-center justify-center text-xs text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-[#253040] p-1 text-center break-all"
                  style={{ display: 'none' }}
                >
                  {attachment.name}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRemoveAttachment(attachment.id);
                    }
                  }}
                  aria-label={t('attachment.remove', { name: attachment.name })}
                  className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center
                             bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800
                             rounded-full hover:bg-red-600 dark:hover:bg-red-400
                             focus:outline-none focus:ring-2 focus:ring-red-500
                             transition-colors"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-300 truncate max-w-[64px]">
                {attachment.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Validation error (Story 5.5) */}
      {validationError && (
        <div
          role="alert"
          className="px-3 py-1 text-sm text-red-600 dark:text-red-400"
          data-testid="validation-error"
        >
          {validationError}
        </div>
      )}

      {/* Favorites chip bar + popup wrapper (Story 9.7, 9.12) */}
      {((favoriteCommands && favoriteCommands.length > 0) || (activeAgent && starFavorites && starFavorites.length > 0)) && (
        <div ref={favoritesContainerRef} className="relative">
          <FavoritesChipBar
            favoriteCommands={favoriteCommands || []}
            commands={commands}
            onExecute={(cmd) => {
              setContent(cmd + ' ');
              setShowFavorites(false);
              textareaRef.current?.focus();
            }}
            onOpenDialog={handleToggleFavorites}
            starFavorites={starFavorites}
            activeAgent={activeAgent}
            onExecuteStarFavorite={(cmd) => {
              const text = '*' + cmd + ' ';
              setContent(text);
              setShowFavorites(false);
              selectPlaceholders(text);
            }}
            disabled={queueLocked}
          />
          {showFavorites && (
            <FavoritesPopup
              favoriteCommands={favoriteCommands || []}
              commands={commands}
              onSelect={handleFavoriteSelect}
              onClose={() => setShowFavorites(false)}
              onReorder={onReorderFavorites || (() => {})}
              onRemoveFavorite={onRemoveFavorite || (() => {})}
              starFavorites={starFavorites}
              starCommands={starCommands}
              activeAgent={activeAgent}
              onReorderStarFavorites={onReorderStarFavorites}
              onRemoveStarFavorite={onRemoveStarFavorite}
              onSelectStarFavorite={handleStarFavoriteSelect}
            />
          )}
        </div>
      )}

      {/* Hidden file input (Story 5.5) */}
      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_CONSTRAINTS.ACCEPT_STRING}
        multiple
        onChange={handleFileSelect}
        className="hidden"
        data-testid="file-input"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Textarea row */}
      <div
        ref={commandPaletteAreaRef}
        className={`relative ${isDragging ? 'border-2 border-dashed border-blue-500 rounded-lg p-1' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid="chat-input-area"
      >
        {/* Command palette (Story 5.1) */}
        {showCommands && commands.length > 0 && (
          <CommandPalette
            commands={commands}
            filter={commandFilter}
            selectedIndex={selectedIndex}
            onSelect={handleCommandSelect}
            onClose={() => setShowCommands(false)}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite}
          />
        )}

        {/* Star Command palette (Story 9.9) */}
        {showStarCommands && activeAgent && starCommands && starCommands.length > 0 && (
          <StarCommandPalette
            commands={starCommands}
            agent={activeAgent}
            filter={starCommandFilter}
            selectedIndex={starSelectedIndex}
            onSelect={handleStarCommandSelect}
            isStarFavorite={isStarFavorite}
            onToggleStarFavorite={onToggleStarFavorite}
          />
        )}

        <div
          className={`flex items-center rounded-lg transition-colors duration-150
                     ${chainMode
                       ? 'bg-violet-50 dark:bg-violet-950/30 border border-violet-300 dark:border-violet-700 focus-within:ring-2 focus-within:ring-violet-500 dark:focus-within:ring-violet-400'
                       : `bg-white dark:bg-[#263240] border border-gray-300 dark:border-[#2d3a4a] focus-within:ring-2 ${modeColors.ring} ${modeColors.border}`}`}
          onClick={() => { if (!isTouchDevice) textareaRef.current?.focus(); }}
        >
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              if (isSessionLocked || queueLocked) return;
              setContent(e.target.value);
              resetNavigation();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => {
              userHasFocusedRef.current = true;
            }}
            onBlur={() => {
              userHasFocusedRef.current = false;
            }}
            disabled={isSessionLocked || queueLocked || undefined}
            placeholder={isSessionLocked ? t('input.lockedOtherBrowser') : queueLocked ? t('input.queueControlled') : isStreaming && chainMode ? (isChainFull ? t('input.chainFull') : t('input.chainAdd')) : placeholder || t('input.placeholder')}
            role={showCommands || showStarCommands ? 'combobox' : undefined}
            aria-label={t('input.ariaLabel')}
            aria-describedby="input-hint"
            aria-expanded={showCommands || showStarCommands ? true : undefined}
            aria-controls={showCommands ? 'command-palette' : showStarCommands ? 'star-command-palette' : undefined}
            aria-activedescendant={
              showCommands && filteredCommandsCount > 0 ? `command-option-${selectedIndex}` :
              showStarCommands && filteredStarCommandsCount > 0 ? `star-command-option-${starSelectedIndex}` :
              undefined
            }
            aria-autocomplete={showCommands || showStarCommands ? 'list' : undefined}
            rows={1}
            className={`w-full resize-none px-2 py-1
                       bg-transparent
                       text-gray-900 dark:text-gray-100
                       placeholder-gray-500 dark:placeholder-gray-400
                       focus:outline-none
                       disabled:cursor-not-allowed
                       overflow-y-auto overscroll-contain`}
            style={{ minHeight: '22px', maxHeight: '120px' }}
          />
        </div>
        <span id="input-hint" className="sr-only">
          {t('input.hint')}
        </span>
      </div>

      {/* Button row */}
      <div className="flex items-center gap-2 mt-[1px] ml-[-2px] min-w-0">
        {/* Permission mode selector (Story 5.2) */}
        {permissionMode && onPermissionModeChange && (
          <PermissionModeSelector
            mode={permissionMode}
            onModeChange={onPermissionModeChange}
            disabled={queueLocked}
          />
        )}

        {/* Model selector */}
        {selectedModel !== undefined && onModelChange && (
          <ModelSelector
            model={selectedModel}
            onModelChange={onModelChange}
            activeModel={activeModel}
            disabled={queueLocked}
          />
        )}

        {/* BMad agent button (Story 8.1) */}
        {isBmadProject && onAgentSelect && (
          <BmadAgentButton
            isBmadProject={isBmadProject}
            agents={commands.filter((cmd) => cmd.category === 'agent')}
            onAgentSelect={(agentCommand) => {
              onAgentSelect(agentCommand);
            }}
            openTrigger={agentListOpenTrigger}
            activeAgentCommand={activeAgentCommand}
            disabled={queueLocked}
          />
        )}

        {/* Prompt chain mode toggle (Story 12.3) */}
        {onChainModeToggle && (
          <button
            type="button"
            tabIndex={-1}
            onClick={onChainModeToggle}
            onPointerDown={preventFocusLoss}
            disabled={queueLocked}
            aria-label={chainMode ? t('chainMode.off') : t('chainMode.on')}
            aria-pressed={chainMode}
            title={t('input.promptChainTitle')}
            className={`relative p-1 rounded-md flex-shrink-0 flex items-center justify-center transition-all duration-150 cursor-pointer
                       ${chainMode
                         ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 text-white'
                         : 'text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#253040]'}
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2`}
            style={{ height: '28px', width: '28px' }}
          >
            <Link2 size={14} aria-hidden="true" />
            {chainMode && chainCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center
                             text-[10px] font-bold leading-none bg-violet-400 dark:bg-violet-300 text-white dark:text-violet-900
                             rounded-full px-[3px]">
                {chainCount}
              </span>
            )}
          </button>
        )}

        <div className="flex-1" />

        {/* Right-side buttons */}
        <div className="flex items-center gap-1 sm:gap-2 mr-[-2px]">
        {/* Subscription rate limit glow dots */}
        <UsageStatusBar rateLimit={subscriptionRateLimit} />
        {/* Context usage donut indicator (always visible) */}
        <ContextUsageDisplay
          contextUsage={contextUsage ?? null}
          onNewSession={onNewSession}
          onCompact={onCompact}
          disabled={queueLocked}
        />

        {/* Attach button (Story 5.5) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onPointerDown={preventFocusLoss}
          disabled={isAttachDisabled || queueLocked}
          aria-label={t('input.attachImage')}
          className="p-1 rounded-md flex-shrink-0 flex items-center justify-center
                     text-gray-500 dark:text-gray-300
                     hover:text-gray-700 dark:hover:text-gray-200
                     hover:bg-gray-100 dark:hover:bg-[#253040]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                     transition-all duration-150"
          style={{ height: '28px', width: '28px' }}
        >
          <Paperclip size={16} aria-hidden="true" />
        </button>

        {/* Voice input button (Speech Recognition) */}
        {speechRecognition.isSupported && (
          <button
            type="button"
            onClick={speechRecognition.toggle}
            onPointerDown={preventFocusLoss}
            disabled={queueLocked || isSessionLocked}
            aria-label={speechRecognition.isListening ? t('input.stopVoice') : t('input.startVoice')}
            className={`p-1 rounded-md flex-shrink-0 flex items-center justify-center
                       ${speechRecognition.isListening
                         ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 animate-pulse'
                         : 'text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#253040]'}
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                       transition-all duration-150`}
            style={{ height: '28px', width: '28px' }}
          >
            {speechRecognition.isListening
              ? <MicOff size={16} aria-hidden="true" />
              : <Mic size={16} aria-hidden="true" />}
          </button>
        )}

        {isSessionLocked ? (
          <button
            type="button"
            disabled
            onPointerDown={preventFocusLoss}
            aria-label={t('input.sessionLocked')}
            className="p-1 rounded-md flex-shrink-0 flex items-center justify-center
                       bg-gray-400 dark:bg-gray-600
                       text-white
                       opacity-50 cursor-not-allowed"
            style={{ height: '28px', width: '28px' }}
          >
            <Lock size={16} aria-hidden="true" />
          </button>
        ) : isStreaming && onAbort && !chainMode ? (
          <button
            type="button"
            onClick={onAbort}
            onPointerDown={preventFocusLoss}
            disabled={queueLocked}
            aria-label={t('input.abort')}
            className="p-1 rounded-md flex-shrink-0 flex items-center justify-center
                       bg-red-600 hover:bg-red-700
                       dark:bg-red-500 dark:hover:bg-red-600
                       text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                       transition-all duration-150"
            style={{ height: '28px', width: '28px' }}
          >
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleButtonClick}
            onPointerDown={preventFocusLoss}
            disabled={isButtonDisabled}
            aria-label={chainMode ? t('input.addToChain') : t('input.send')}
            className={`p-1 rounded-md flex-shrink-0 flex items-center justify-center
                       ${chainMode
                         ? 'bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600'
                         : modeColors.button}
                       text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 ${chainMode ? 'focus:ring-violet-500' : modeColors.ring} focus:ring-offset-2
                       transition-all duration-150`}
            style={{ height: '28px', width: '28px' }}
          >
            {chainMode
              ? <Plus size={16} aria-hidden="true" />
              : <Send size={16} aria-hidden="true" />}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
