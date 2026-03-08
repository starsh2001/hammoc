/**
 * HelpSection Tests
 * Story 10.5: Help section with usage guides and keyboard shortcuts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpSection } from '../HelpSection';

describe('HelpSection', () => {
  const originalPlatform = navigator.platform;

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
    // Re-import module to pick up platform change
    vi.restoreAllMocks();
  });

  it('TC-1: renders basic chat usage guide', () => {
    render(<HelpSection />);

    expect(screen.getByText('기본 채팅 사용법')).toBeInTheDocument();
    expect(screen.getByText(/Enter\(데스크톱\)/)).toBeInTheDocument();
    expect(screen.getByText(/이미지 첨부/)).toBeInTheDocument();
    expect(screen.getByText(/새 세션/)).toBeInTheDocument();
    expect(screen.getByText(/세션 전환/)).toBeInTheDocument();
  });

  it('TC-2: renders slash command guide', () => {
    render(<HelpSection />);

    expect(screen.getByText('슬래시 커맨드')).toBeInTheDocument();
    expect(screen.getByText(/\/를 입력하면/)).toBeInTheDocument();
    expect(screen.getByText(/즐겨찾기로 등록 가능/)).toBeInTheDocument();
  });

  it('TC-3: renders all three Permission Mode options', () => {
    render(<HelpSection />);

    expect(screen.getByText('권한 모드')).toBeInTheDocument();
    expect(screen.getByText('계획 모드')).toBeInTheDocument();
    expect(screen.getByText('Ask before edits (기본)')).toBeInTheDocument();
    expect(screen.getByText('자동 모드')).toBeInTheDocument();
  });

  it('TC-4: renders BMad Method guide', () => {
    render(<HelpSection />);

    expect(screen.getByText('BMad Method 연동')).toBeInTheDocument();
    expect(screen.getByText(/AI 기반 개발 워크플로우/)).toBeInTheDocument();
    expect(screen.getByText(/BMad Core를 설치/)).toBeInTheDocument();
  });

  it('TC-5: renders keyboard shortcuts table', () => {
    render(<HelpSection />);

    expect(screen.getByText('키보드 단축키')).toBeInTheDocument();
    expect(screen.getByText('단축키')).toBeInTheDocument();
    expect(screen.getByText('기능')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Shift+Enter')).toBeInTheDocument();
    expect(screen.getByText('Escape')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.getByText(/Diff 뷰어 변경점 탐색/)).toBeInTheDocument();
  });

  it('TC-6: shows Cmd instead of Ctrl on macOS', async () => {
    // HelpSection reads navigator.platform at module level,
    // so we need to re-import with mocked platform
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });

    // Clear module cache and re-import
    vi.resetModules();
    const { HelpSection: MacHelpSection } = await import('../HelpSection');
    render(<MacHelpSection />);

    expect(screen.getByText('⌘+C')).toBeInTheDocument();
  });
});
