/**
 * Auth API - Authentication endpoints
 * [Source: Story 2.2 - Task 6, Story 2.4 - Task 4]
 */

import { api } from './client';
import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  AuthStatus,
  SetupPasswordRequest,
  SetupPasswordResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
} from '@hammoc/shared';

export const authApi = {
  login: (data: LoginRequest) => api.post<LoginResponse>('/auth/login', data),
  logout: () => api.post<LogoutResponse>('/auth/logout'),
  status: () => api.get<AuthStatus>('/auth/status'),
  setup: (data: SetupPasswordRequest) => api.post<SetupPasswordResponse>('/auth/setup', data),
  changePassword: (data: ChangePasswordRequest) => api.post<ChangePasswordResponse>('/auth/change-password', data),
};
