// Story 1.2: SDK types for ChatService
export * from './types/sdk.js';

// Story 1.3: Streaming types for StreamHandler
export * from './types/streaming.js';

// Story 1.4: WebSocket types for Socket.io
export * from './types/websocket.js';

// Story 5.5: Attachment, ImageAttachment, IMAGE_CONSTRAINTS
export * from './types/message.js';
export * from './constants/index.js';

// Story 1.6: Session types for session management
// Story 3.3: Session List API types (SessionListItem, SessionListResponse, SESSION_ERRORS)
export * from './types/session.js';

// Story 1.7: CLI status types for CLI Status API
export * from './types/cli.js';

// Story 2.1: Auth types for Password Configuration
export {
  AuthConfig,
  PasswordValidationResult,
  MIN_PASSWORD_LENGTH,
  AuthConfigError,
} from './types/auth.js';

// Story 2.2: Login types
export {
  LoginRequest,
  LoginResponse,
  RateLimitInfo,
  RateLimitErrorResponse,
  LOGIN_ERRORS,
} from './types/auth.js';

// Story 2.4: Logout types and error codes
export {
  LogoutResponse,
  AuthStatus,
  AUTH_ERROR_CODES,
  SetupPasswordRequest,
  SetupPasswordResponse,
} from './types/auth.js';

// Story 2.5: Auth error messages
export { AUTH_ERROR_MESSAGES } from './types/auth.js';

// Change password types
export type { ChangePasswordRequest, ChangePasswordResponse } from './types/auth.js';

// Story 3.1: Project types for Project List API
// Story 3.6: Extended with project creation types
export {
  ProjectInfo,
  ProjectListResponse,
  PROJECT_ERRORS,
  CreateProjectRequest,
  CreateProjectResponse,
  DeleteProjectResponse,
  ValidatePathRequest,
  ValidatePathResponse,
  BmadVersionsResponse,
  ProjectSettings,
  UpdateProjectSettingsRequest,
  ProjectSettingsApiResponse,
  SetupBmadRequest,
  SetupBmadResponse,
} from './types/project.js';

// Story 5.1: SlashCommand types for command autocomplete
// Story 9.8: StarCommand, CommandsResponse types
export { SlashCommand, StarCommand, CommandsResponse } from './types/command.js';

// User Preferences types (server-side settings)
export {
  CommandFavoriteEntry,
  UserPreferences,
  PromptHistoryData,
  DEFAULT_PREFERENCES,
  PreferencesApiResponse,
  TelegramSettings,
  TelegramSettingsApiResponse,
  UpdateTelegramSettingsRequest,
  WebPushSettings,
  WebPushSettingsApiResponse,
  WebPushSubscribeRequest,
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  PermissionSyncPolicy,
} from './types/preferences.js';

// Story 3.5: History types for Session History Loading
export {
  RawJSONLMessage,
  HistoryMessage,
  PaginationInfo,
  HistoryMessagesResponse,
  PaginationOptions,
  ContentBlock,
  TextContentBlock,
  ThinkingContentBlock,
  ToolUseContentBlock,
  ToolResultContentBlock,
  ImageContentBlock,
} from './types/history.js';

// Story 11.1: File System types for file read and directory list API
export * from './types/fileSystem.js';

// Story 12.1: BMad Status types for BMad Dashboard API
export * from './types/bmadStatus.js';

// Story 15.1: Queue Runner types
export * from './types/queue.js';

// Story 15.1: Queue script parser
export { parseQueueScript, serializeQueueItems } from './utils/queueParser.js';

// Story 15.5: Queue template utilities
export { extractStoryNumbers, generateQueueFromTemplate } from './utils/queueTemplateUtils.js';

// Story 16.1: Git types (Epic 16)
export * from './types/git.js';

// Story 17.1: Terminal PTY types (Epic 17)
export * from './types/terminal.js';

// Story 20.1: Dashboard types
export * from './types/dashboard.js';

// Story 21.1: Board types (Epic 21)
export * from './types/board.js';

// Logger types (shared between server and client)
export { LogLevel, parseLogLevel } from './types/logger.js';
