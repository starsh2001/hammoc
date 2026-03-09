/**
 * TelegramSettingsSection Tests
 * Story 10.4: Telegram notification settings UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TelegramSettingsSection } from '../TelegramSettingsSection';
import type { TelegramSettingsApiResponse } from '@hammoc/shared';

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock preferences API
const mockGetTelegram = vi.fn();
const mockUpdateTelegram = vi.fn();
const mockTestTelegram = vi.fn();

vi.mock('../../../services/api/preferences', () => ({
  preferencesApi: {
    getTelegram: () => mockGetTelegram(),
    updateTelegram: (data: unknown) => mockUpdateTelegram(data),
    testTelegram: (overrides?: unknown) => mockTestTelegram(overrides),
  },
}));

const mockSettingsUnconfigured: TelegramSettingsApiResponse = {
  maskedBotToken: '',
  chatId: '',
  enabled: false,
  notifyPermission: true,
  notifyComplete: true,
  notifyError: true,
  notifyQueueStart: true,
  notifyQueueComplete: true,
  notifyQueueError: true,
  notifyQueueInputRequired: true,
  envOverrides: [],
  hasBotToken: false,
  hasChatId: false,
};

const mockSettingsConfigured: TelegramSettingsApiResponse = {
  maskedBotToken: '••••••••5678',
  chatId: '123456789',
  enabled: true,
  notifyPermission: true,
  notifyComplete: true,
  notifyError: false,
  notifyQueueStart: true,
  notifyQueueComplete: true,
  notifyQueueError: true,
  notifyQueueInputRequired: true,
  envOverrides: [],
  hasBotToken: true,
  hasChatId: true,
};

const mockSettingsEnvOverride: TelegramSettingsApiResponse = {
  maskedBotToken: '••••••••ABCD',
  chatId: '987654321',
  enabled: true,
  notifyPermission: true,
  notifyComplete: true,
  notifyError: true,
  notifyQueueStart: true,
  notifyQueueComplete: true,
  notifyQueueError: true,
  notifyQueueInputRequired: true,
  envOverrides: ['botToken', 'chatId'],
  hasBotToken: true,
  hasChatId: true,
};

describe('TelegramSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('TC-1: renders guide and input fields when unconfigured', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsUnconfigured);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText(/Telegram 알림을 설정하려면/)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Bot Token/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Chat ID/)).toBeInTheDocument();
  });

  it('TC-2: shows masked bot token when configured', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      const input = screen.getByLabelText(/Bot Token/) as HTMLInputElement;
      expect(input.value).toBe('••••••••5678');
    });
  });

  it('TC-3: clicking 변경 button switches to edit mode', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getAllByText('변경').length).toBeGreaterThan(0);
    });

    // Get the first 변경 button (Bot Token)
    const changeButtons = screen.getAllByText('변경');
    fireEvent.click(changeButtons[0]);

    expect(screen.getByText('저장')).toBeInTheDocument();
    expect(screen.getByText('취소')).toBeInTheDocument();
  });

  it('TC-4: saving bot token calls updateTelegram', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    const updatedSettings = { ...mockSettingsConfigured, maskedBotToken: '••••••••9999' };
    mockUpdateTelegram.mockResolvedValueOnce(updatedSettings);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getAllByText('변경').length).toBeGreaterThan(0);
    });

    // Enter edit mode for bot token
    fireEvent.click(screen.getAllByText('변경')[0]);

    const input = screen.getByPlaceholderText('Bot Token을 입력하세요');
    fireEvent.change(input, { target: { value: 'new-token-9999' } });
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => {
      expect(mockUpdateTelegram).toHaveBeenCalledWith({ botToken: 'new-token-9999' });
    });
  });

  it('TC-5: enable toggle is disabled when botToken/chatId not set', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsUnconfigured);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      const toggle = screen.getByLabelText('Telegram 알림 활성화') as HTMLInputElement;
      expect(toggle.disabled).toBe(true);
    });
    expect(screen.getByText('Bot Token과 Chat ID를 먼저 설정하세요.')).toBeInTheDocument();
  });

  it('TC-6: toggling enabled calls updateTelegram', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    mockUpdateTelegram.mockResolvedValueOnce({ ...mockSettingsConfigured, enabled: false });
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      const toggle = screen.getByLabelText('Telegram 알림 활성화') as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    fireEvent.click(screen.getByLabelText('Telegram 알림 활성화'));

    await waitFor(() => {
      expect(mockUpdateTelegram).toHaveBeenCalledWith({ enabled: false });
    });
  });

  it('TC-7: notification type checkboxes render correctly', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      const permCheck = screen.getByLabelText(/권한 요청 알림/) as HTMLInputElement;
      expect(permCheck.checked).toBe(true);
    });

    const completeCheck = screen.getByLabelText(/완료 알림 — ✅/) as HTMLInputElement;
    expect(completeCheck.checked).toBe(true);

    const errorCheck = screen.getByLabelText(/에러 알림 — ❌/) as HTMLInputElement;
    expect(errorCheck.checked).toBe(false);
  });

  it('TC-8: test notification success shows indicator', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    mockTestTelegram.mockResolvedValueOnce({ success: true });
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText('테스트 알림 보내기')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('테스트 알림 보내기'));

    await waitFor(() => {
      expect(screen.getByText(/✅ 성공/)).toBeInTheDocument();
    });
  });

  it('TC-9: test notification failure shows error message', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    mockTestTelegram.mockResolvedValueOnce({ success: false, error: 'Unauthorized' });
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText('테스트 알림 보내기')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('테스트 알림 보내기'));

    await waitFor(() => {
      expect(screen.getByText(/❌ 실패: Unauthorized/)).toBeInTheDocument();
    });
  });

  it('TC-10: shows env override indicators', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsEnvOverride);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      const overrideTexts = screen.getAllByText('(환경변수로 설정됨)');
      expect(overrideTexts.length).toBe(2);
    });
  });

  it('TC-11: retry button works on error', async () => {
    mockGetTelegram.mockRejectedValueOnce(new Error('network error'));
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText(/오류가 발생했습니다/)).toBeInTheDocument();
    });

    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    fireEvent.click(screen.getByText('재시도'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Bot Token/)).toBeInTheDocument();
    });
  });

  it('TC-12: guide links have correct URLs', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsUnconfigured);
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      const botFatherLink = screen.getByLabelText(/BotFather/) as HTMLAnchorElement;
      expect(botFatherLink.href).toBe('https://t.me/BotFather');
      expect(botFatherLink.target).toBe('_blank');
    });

    const userInfoLink = screen.getByLabelText(/userinfobot/) as HTMLAnchorElement;
    expect(userInfoLink.href).toBe('https://t.me/userinfobot');
  });

  it('TC-13: test button is disabled during cooldown', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    mockTestTelegram.mockResolvedValueOnce({ success: true });
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText('테스트 알림 보내기')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('테스트 알림 보내기'));

    await waitFor(() => {
      expect(screen.getByText(/✅ 성공/)).toBeInTheDocument();
    });

    // Button should be disabled during cooldown
    const testBtn = screen.getByRole('button', { name: /테스트 알림 보내기/ });
    expect(testBtn).toBeDisabled();
  });

  it('TC-14: test with unsaved botToken passes overrides', async () => {
    mockGetTelegram.mockResolvedValueOnce(mockSettingsConfigured);
    mockTestTelegram.mockResolvedValueOnce({ success: true });
    render(<TelegramSettingsSection />);

    await waitFor(() => {
      expect(screen.getAllByText('변경').length).toBeGreaterThan(0);
    });

    // Enter edit mode for bot token
    fireEvent.click(screen.getAllByText('변경')[0]);

    const input = screen.getByPlaceholderText('Bot Token을 입력하세요');
    fireEvent.change(input, { target: { value: 'test-token' } });

    // Click test button
    fireEvent.click(screen.getByText('테스트 알림 보내기'));

    await waitFor(() => {
      expect(mockTestTelegram).toHaveBeenCalledWith({ botToken: 'test-token' });
    });
  });
});
