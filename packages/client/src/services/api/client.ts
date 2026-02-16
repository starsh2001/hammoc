/**
 * API Client - REST API 통신을 위한 HTTP 클라이언트
 * [Source: docs/architecture/10-frontend-architecture.md - HTTP Client Layer]
 * [Source: Story 2.2 - Task 6]
 * [Extended: Story 3.6 - Task 4: AbortController support]
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiClientOptions {
  baseURL: string;
}

class ApiClient {
  private baseURL: string;

  constructor(options: ApiClientOptions) {
    this.baseURL = options.baseURL;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      credentials: 'include', // cookie 전송을 위해 필수
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error?.message) {
        throw new ApiError(
          response.status,
          errorData.error.code || 'UNKNOWN_ERROR',
          errorData.error.message,
          errorData.error.details
        );
      }
      // Non-JSON error response (e.g. proxy 502, HTML error page)
      const url = `${this.baseURL}${path}`;
      throw new ApiError(
        response.status,
        'UNKNOWN_ERROR',
        `요청 실패 (${response.status} ${response.statusText}) - ${url}`,
      );
    }

    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  async post<T>(path: string, data?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      signal: options?.signal,
    });
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient({ baseURL: '/api' });
