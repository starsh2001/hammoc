// Story 1.2: SDK types for ChatService
export * from './types/sdk.js';

// Story 1.3: Streaming types for StreamHandler
export * from './types/streaming.js';

// Story 1.4: WebSocket types for Socket.io
export * from './types/websocket.js';

// Story 1.5: Message types for display and error codes
// Story 5.5: Attachment, ImageAttachment, IMAGE_CONSTRAINTS
export * from './types/message.js';
export * from './constants/errorCodes.js';

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
  AUTH_CONFIG_ERRORS,
  AuthConfigErrorCode,
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
  AuthErrorCode,
} from './types/auth.js';

// Story 2.5: Auth error messages
export { AUTH_ERROR_MESSAGES } from './types/auth.js';

// Story 3.1: Project types for Project List API
// Story 3.6: Extended with project creation types
export {
  ProjectInfo,
  ProjectListResponse,
  PROJECT_ERRORS,
  ProjectErrorCode,
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
export { SlashCommand, CommandListResponse, StarCommand, CommandsResponse } from './types/command.js';

// User Preferences types (server-side settings)
export { UserPreferences, PromptHistoryData, DEFAULT_PREFERENCES, PreferencesApiResponse } from './types/preferences.js';

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
