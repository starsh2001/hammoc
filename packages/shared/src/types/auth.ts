/**
 * Hammoc 인증 설정
 * @description ~/.hammoc/config.json에 저장되는 설정
 */
export interface AuthConfig {
  /** bcrypt로 해싱된 패스워드 */
  passwordHash: string;
  /** 설정 생성 시간 */
  createdAt: string;
  /** 마지막 패스워드 변경 시간 */
  updatedAt: string;
  /** 세션 시크릿 (서버 재시작 시 세션 유지용) [Story 2.4] */
  sessionSecret?: string;
  /** 세션 시크릿 버전 (패스워드 변경 시 세션 무효화용) [Story 2.4] */
  secretVersion?: number;
}

/**
 * 패스워드 유효성 검증 결과
 */
export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * 패스워드 최소 길이 상수
 */
export const MIN_PASSWORD_LENGTH = 4;

/**
 * 패스워드 관련 에러 코드 상수
 */
const AUTH_CONFIG_ERRORS = {
  PASSWORD_TOO_SHORT: {
    code: 'PASSWORD_TOO_SHORT',
    message: '패스워드는 최소 4자 이상이어야 합니다.',
  },
  PASSWORD_EMPTY: {
    code: 'PASSWORD_EMPTY',
    message: '패스워드를 입력해주세요.',
  },
  CONFIG_NOT_FOUND: {
    code: 'CONFIG_NOT_FOUND',
    message: '설정 파일을 찾을 수 없습니다.',
  },
  PASSWORD_MISMATCH: {
    code: 'PASSWORD_MISMATCH',
    message: '패스워드가 일치하지 않습니다.',
  },
  ALREADY_CONFIGURED: {
    code: 'ALREADY_CONFIGURED',
    message: '패스워드가 이미 설정되어 있습니다.',
  },
} as const;

/** 에러 코드 타입 (internal) */
type AuthConfigErrorCode = keyof typeof AUTH_CONFIG_ERRORS;

/**
 * 인증 설정 관련 에러 클래스
 */
export class AuthConfigError extends Error {
  constructor(public code: AuthConfigErrorCode) {
    super(AUTH_CONFIG_ERRORS[code].message);
    this.name = 'AuthConfigError';
  }
}

/**
 * 로그인 요청 DTO
 * @note Story 2.3에서 rememberMe 필드 추가
 */
export interface LoginRequest {
  password: string;
  rememberMe?: boolean; // 기본값: true (Story 2.3에서 추가)
}

/**
 * 로그인 응답 DTO
 */
export interface LoginResponse {
  success: boolean;
  message?: string;
}

/**
 * Rate Limit 에러 상세 정보 (429 응답의 error.details에 포함)
 * [Source: docs/architecture/5-api-specification.md - RateLimitError schema]
 */
export interface RateLimitInfo {
  retryAfter: number; // seconds until retry allowed
  remainingAttempts: number; // always 0 when rate limited
}

/**
 * 로그인 관련 에러 코드
 */
export const LOGIN_ERRORS = {
  INVALID_PASSWORD: {
    code: 'INVALID_PASSWORD',
    message: '패스워드가 올바르지 않습니다.',
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
  },
} as const;

/**
 * Rate Limit 에러 응답 형식 (HTTP 429)
 * API Spec과 일치하는 형식으로 응답해야 함
 */
export interface RateLimitErrorResponse {
  error: {
    code: 'RATE_LIMIT_EXCEEDED';
    message: string;
    details: RateLimitInfo;
  };
}

/**
 * 로그아웃 응답 DTO
 * [Source: Story 2.4 - Task 1]
 */
export interface LogoutResponse {
  success: boolean;
  message?: string;
}

/**
 * 인증 상태 응답 DTO
 */
export interface AuthStatus {
  authenticated: boolean;
  passwordConfigured: boolean;
}

/**
 * 초기 패스워드 설정 요청 DTO
 */
export interface SetupPasswordRequest {
  password: string;
  confirmPassword: string;
}

/**
 * 초기 패스워드 설정 응답 DTO
 */
export interface SetupPasswordResponse {
  success: boolean;
  message?: string;
}

/**
 * Change password request DTO
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/**
 * Change password response DTO
 */
export interface ChangePasswordResponse {
  success: boolean;
  message?: string;
}

/**
 * API 에러 코드 상수 (일관된 에러 처리를 위해 shared 패키지에서 관리)
 * [Source: Story 2.4 - Task 1]
 */
export const AUTH_ERROR_CODES = {
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  LOGOUT_FAILED: 'LOGOUT_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const;

type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/**
 * API Error Messages (centralized for consistency)
 * [Source: Story 2.5 - Task 1]
 */
export const AUTH_ERROR_MESSAGES = {
  INVALID_PASSWORD: 'Invalid password',
  RATE_LIMIT_EXCEEDED: 'Too many login attempts. Please try again later.',
  LOGOUT_FAILED: 'Failed to logout',
  UNAUTHORIZED: 'Authentication required',
} as const;
