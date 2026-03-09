/**
 * AboutSection Tests
 * Story 10.5: About section with app info, server health, and contact links
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AboutSection } from '../AboutSection';

// Mock api client
const mockGet = vi.fn();
vi.mock('../../../services/api/client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const mockHealthResponse = {
  status: 'healthy',
  version: '1.0.0',
  description: 'Web-based IDE for managing Claude Code sessions',
  license: 'MIT',
  author: { name: 'BMad', url: 'https://github.com/bmad-artifacts' },
  repository: { type: 'git', url: 'https://github.com/starsh2001/hammoc.git' },
  homepage: '',
  timestamp: '2026-02-17T12:00:00.000Z',
};

describe('AboutSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-A1: renders app name "HAMMOC"', async () => {
    mockGet.mockResolvedValueOnce(mockHealthResponse);
    render(<AboutSection />);

    expect(screen.getByText('HAMMOC')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('TC-A2: displays server version on successful health fetch', async () => {
    mockGet.mockResolvedValueOnce(mockHealthResponse);
    render(<AboutSection />);

    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('TC-A3: shows green status indicator when healthy', async () => {
    mockGet.mockResolvedValueOnce(mockHealthResponse);
    render(<AboutSection />);

    await waitFor(() => {
      expect(screen.getByText('healthy')).toBeInTheDocument();
    });

    const indicator = screen.getByLabelText('정상');
    expect(indicator.className).toContain('bg-green-500');
  });

  it('TC-A4: GitHub Issues link has correct URL derived from repository', async () => {
    mockGet.mockResolvedValueOnce(mockHealthResponse);
    render(<AboutSection />);

    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });

    const link = screen.getByLabelText('GitHub Issues 페이지로 이동 (새 탭)') as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/starsh2001/hammoc/issues');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.rel).toContain('noreferrer');
  });

  it('TC-A5: shows error message and retry button on fetch failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    render(<AboutSection />);

    await waitFor(() => {
      expect(screen.getByText('서버 연결 실패')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('서버 상태 재확인')).toBeInTheDocument();
  });

  it('TC-A6: retry button re-fetches health API', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    render(<AboutSection />);

    await waitFor(() => {
      expect(screen.getByText('서버 연결 실패')).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce(mockHealthResponse);
    fireEvent.click(screen.getByLabelText('서버 상태 재확인'));

    await waitFor(() => {
      expect(screen.getByText('healthy')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('TC-A7: shows loading text while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AboutSection />);

    expect(screen.getByText('확인 중...')).toBeInTheDocument();
  });

  it('TC-A8: shows red status indicator when unhealthy', async () => {
    mockGet.mockResolvedValueOnce({ ...mockHealthResponse, status: 'unhealthy' });
    render(<AboutSection />);

    await waitFor(() => {
      expect(screen.getByText('unhealthy')).toBeInTheDocument();
    });

    const indicator = screen.getByLabelText('비정상');
    expect(indicator.className).toContain('bg-red-500');
  });
});
