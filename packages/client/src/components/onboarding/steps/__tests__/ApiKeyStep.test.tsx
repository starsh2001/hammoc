// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiKeyStep } from '../ApiKeyStep';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockPost = vi.fn();
vi.mock('../../../../services/api/client', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
}));

describe('ApiKeyStep', () => {
  const onNext = vi.fn();
  const onSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input, submit, and skip buttons', () => {
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wizard.next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wizard.apiKey.later' })).toBeInTheDocument();
  });

  it('shows format warning for non sk-ant- prefix', () => {
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'bad-key' } });
    expect(screen.getByText('wizard.apiKey.formatWarning')).toBeInTheDocument();
  });

  it('does not show format warning for sk-ant- prefix', () => {
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-valid123' } });
    expect(screen.queryByText('wizard.apiKey.formatWarning')).not.toBeInTheDocument();
  });

  it('does not show format warning when input is empty', () => {
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);
    expect(screen.queryByText('wizard.apiKey.formatWarning')).not.toBeInTheDocument();
  });

  it('shows error when trying to submit empty key', async () => {
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);
    // Submit button is disabled when input is empty, so try via keyboard
    const input = screen.getByPlaceholderText('sk-ant-...');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('wizard.apiKey.errorEmpty');
    });
  });

  it('calls onSkip when skip button is clicked', () => {
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: 'wizard.apiKey.later' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('saves key via API and calls onNext on success', async () => {
    mockPost.mockResolvedValue({});
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);

    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-test123' } });
    fireEvent.click(screen.getByRole('button', { name: 'wizard.next' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/config/api-key', { apiKey: 'sk-ant-test123' });
      expect(onNext).toHaveBeenCalled();
    });
  });

  it('shows error on save failure', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));
    render(<ApiKeyStep onNext={onNext} onSkip={onSkip} />);

    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), { target: { value: 'sk-ant-test123' } });
    fireEvent.click(screen.getByRole('button', { name: 'wizard.next' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error');
    });
    expect(onNext).not.toHaveBeenCalled();
  });
});
