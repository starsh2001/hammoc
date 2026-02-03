/**
 * SDK Error Classes
 * Custom error classes for handling Claude Agent SDK errors
 */

/**
 * Error codes for SDK errors
 */
export enum SDKErrorCode {
  UNKNOWN = 'UNKNOWN',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_PATH = 'INVALID_PATH',
  ABORTED = 'ABORTED',
}

/**
 * HTTP status codes for SDK errors
 */
export const SDK_ERROR_STATUS: Record<SDKErrorCode, number> = {
  [SDKErrorCode.UNKNOWN]: 500,
  [SDKErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [SDKErrorCode.AUTHENTICATION_ERROR]: 401,
  [SDKErrorCode.NETWORK_ERROR]: 503,
  [SDKErrorCode.INVALID_REQUEST]: 400,
  [SDKErrorCode.SERVICE_UNAVAILABLE]: 503,
  [SDKErrorCode.PERMISSION_DENIED]: 403,
  [SDKErrorCode.INVALID_PATH]: 400,
  [SDKErrorCode.ABORTED]: 499,
};

/**
 * Base SDK Error class
 */
export class SDKError extends Error {
  readonly code: SDKErrorCode;
  readonly statusCode: number;
  readonly retryAfter?: number;
  readonly originalError?: Error;

  constructor(
    message: string,
    code: SDKErrorCode = SDKErrorCode.UNKNOWN,
    options?: {
      retryAfter?: number;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.statusCode = SDK_ERROR_STATUS[code];
    this.retryAfter = options?.retryAfter;
    this.originalError = options?.originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SDKError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Rate Limit Error - thrown when API rate limits are exceeded
 */
export class RateLimitError extends SDKError {
  constructor(retryAfter: number = 60, originalError?: Error) {
    super(
      'API 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.',
      SDKErrorCode.RATE_LIMIT_EXCEEDED,
      { retryAfter, originalError }
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Authentication Error - thrown when CLI authentication fails
 */
export class AuthenticationError extends SDKError {
  constructor(originalError?: Error) {
    super(
      'Claude Code CLI 인증이 필요합니다. "claude login" 명령을 실행하세요.',
      SDKErrorCode.AUTHENTICATION_ERROR,
      { originalError }
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Network Error - thrown when network connectivity issues occur
 */
export class NetworkError extends SDKError {
  constructor(originalError?: Error) {
    super(
      '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인하세요.',
      SDKErrorCode.NETWORK_ERROR,
      { originalError }
    );
    this.name = 'NetworkError';
  }
}

/**
 * Invalid Path Error - thrown when project path is invalid
 */
export class InvalidPathError extends SDKError {
  readonly path: string;

  constructor(path: string, originalError?: Error) {
    super(
      `유효하지 않은 경로입니다: ${path}`,
      SDKErrorCode.INVALID_PATH,
      { originalError }
    );
    this.name = 'InvalidPathError';
    this.path = path;
  }
}

/**
 * Service Unavailable Error - thrown when Claude service is down
 */
export class ServiceUnavailableError extends SDKError {
  constructor(originalError?: Error) {
    super(
      'Claude 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.',
      SDKErrorCode.SERVICE_UNAVAILABLE,
      { originalError }
    );
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Aborted Error - thrown when operation is cancelled
 */
export class AbortedError extends SDKError {
  constructor(originalError?: Error) {
    super(
      '작업이 취소되었습니다.',
      SDKErrorCode.ABORTED,
      { originalError }
    );
    this.name = 'AbortedError';
  }
}

/**
 * Parse SDK error and return appropriate error class
 */
export function parseSDKError(error: unknown): SDKError {
  if (error instanceof SDKError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for rate limit errors
    if (message.includes('rate limit') || message.includes('too many requests')) {
      const retryMatch = message.match(/retry.+?(\d+)/i);
      const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : 60;
      return new RateLimitError(retryAfter, error);
    }

    // Check for authentication errors
    if (
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('login')
    ) {
      return new AuthenticationError(error);
    }

    // Check for network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound')
    ) {
      return new NetworkError(error);
    }

    // Check for abort errors
    if (message.includes('abort') || error.name === 'AbortError') {
      return new AbortedError(error);
    }

    // Check for service unavailable
    if (message.includes('service unavailable') || message.includes('503')) {
      return new ServiceUnavailableError(error);
    }

    // Default to generic SDK error
    return new SDKError(error.message, SDKErrorCode.UNKNOWN, {
      originalError: error,
    });
  }

  // Handle non-Error objects
  return new SDKError(
    String(error),
    SDKErrorCode.UNKNOWN
  );
}

/**
 * Check if an error is retriable
 */
export function isRetriableError(error: unknown): boolean {
  if (error instanceof SDKError) {
    return [
      SDKErrorCode.RATE_LIMIT_EXCEEDED,
      SDKErrorCode.NETWORK_ERROR,
      SDKErrorCode.SERVICE_UNAVAILABLE,
    ].includes(error.code);
  }
  return false;
}

/**
 * Get retry delay for an error in milliseconds
 */
export function getRetryDelay(error: unknown): number {
  if (error instanceof SDKError && error.retryAfter) {
    return error.retryAfter * 1000;
  }
  return 5000; // Default 5 seconds
}
