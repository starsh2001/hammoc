// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PasswordStep } from '../PasswordStep';
import { useAuthStore } from '../../../../stores/authStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

describe('PasswordStep', () => {
  const onNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      isPasswordConfigured: false,
      isLoading: false,
      error: null,
      rateLimitInfo: null,
      login: vi.fn().mockResolvedValue(true),
      setupPassword: vi.fn().mockResolvedValue(true),
      clearError: vi.fn(),
    });
  });

  it('renders setup mode when password is not configured', () => {
    useAuthStore.setState({ isPasswordConfigured: false });
    render(<PasswordStep onNext={onNext} />);
    expect(screen.getByText('wizard.password.setupTitle')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login.setupPlaceholder')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login.confirmPlaceholder')).toBeInTheDocument();
  });

  it('renders login mode when password is configured', () => {
    useAuthStore.setState({ isPasswordConfigured: true });
    render(<PasswordStep onNext={onNext} />);
    expect(screen.getByText('wizard.password.loginTitle')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login.loginPlaceholder')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('login.confirmPlaceholder')).not.toBeInTheDocument();
  });

  it('calls setupPassword in setup mode and advances on success', async () => {
    const setupPassword = vi.fn().mockResolvedValue(true);
    useAuthStore.setState({ isPasswordConfigured: false, setupPassword });
    render(<PasswordStep onNext={onNext} />);

    fireEvent.change(screen.getByPlaceholderText('login.setupPlaceholder'), { target: { value: 'pass123' } });
    fireEvent.change(screen.getByPlaceholderText('login.confirmPlaceholder'), { target: { value: 'pass123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'login.setupComplete' }));

    await waitFor(() => {
      expect(setupPassword).toHaveBeenCalledWith('pass123', 'pass123');
      expect(onNext).toHaveBeenCalled();
    });
  });

  it('calls login in login mode and advances on success', async () => {
    const login = vi.fn().mockResolvedValue(true);
    useAuthStore.setState({ isPasswordConfigured: true, login });
    render(<PasswordStep onNext={onNext} />);

    fireEvent.change(screen.getByPlaceholderText('login.loginPlaceholder'), { target: { value: 'pass123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'login.loginButton' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('pass123', true);
      expect(onNext).toHaveBeenCalled();
    });
  });

  it('displays error message', () => {
    useAuthStore.setState({ error: 'Invalid password' });
    render(<PasswordStep onNext={onNext} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid password');
  });

  it('shows rate limit countdown', () => {
    useAuthStore.setState({ rateLimitInfo: { retryAfter: 30 } });
    render(<PasswordStep onNext={onNext} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
