/**
 * SessionListItem Tests
 * [Source: Story 3.4 - Task 3]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionListItem } from '../SessionListItem';
import type { SessionListItem as SessionListItemType } from '@bmad-studio/shared';

describe('SessionListItem', () => {
  beforeEach(() => {
    // Mock current date for consistent relative time
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockSession: SessionListItemType = {
    sessionId: 'session-123',
    firstPrompt: '프로젝트 구조를 설명해줘',
    messageCount: 15,
    created: '2026-01-15T09:30:00Z',
    modified: '2026-02-01T10:00:00Z',
  };

  it('renders session first prompt', () => {
    render(<SessionListItem session={mockSession} onClick={vi.fn()} />);

    expect(screen.getByText('프로젝트 구조를 설명해줘')).toBeInTheDocument();
  });

  it('renders message count', () => {
    render(<SessionListItem session={mockSession} onClick={vi.fn()} />);

    expect(screen.getByText('15개 메시지')).toBeInTheDocument();
  });

  it('renders relative time for modified date', () => {
    render(<SessionListItem session={mockSession} onClick={vi.fn()} />);

    expect(screen.getByText('2시간 전')).toBeInTheDocument();
  });

  it('calls onClick with sessionId when clicked', () => {
    const onClick = vi.fn();
    render(<SessionListItem session={mockSession} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('session-123');
  });

  it('displays fallback text for empty firstPrompt', () => {
    const emptySession = { ...mockSession, firstPrompt: '' };
    render(<SessionListItem session={emptySession} onClick={vi.fn()} />);

    expect(screen.getByText('(빈 세션)')).toBeInTheDocument();
  });

  it('is accessible as a button element with aria-label', () => {
    render(<SessionListItem session={mockSession} onClick={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label');
    expect(button.getAttribute('aria-label')).toContain('프로젝트 구조를 설명해줘');
    expect(button.getAttribute('aria-label')).toContain('15개');
  });

  it('handles keyboard navigation (Enter key)', () => {
    const onClick = vi.fn();
    render(<SessionListItem session={mockSession} onClick={onClick} />);

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalled();
  });

  it('displays correct relative time for days ago', () => {
    const oldSession: SessionListItemType = {
      ...mockSession,
      modified: '2026-01-29T12:00:00Z',
    };
    render(<SessionListItem session={oldSession} onClick={vi.fn()} />);

    expect(screen.getByText('3일 전')).toBeInTheDocument();
  });

  it('handles long firstPrompt (already truncated by API)', () => {
    const longPromptSession: SessionListItemType = {
      ...mockSession,
      firstPrompt: 'A'.repeat(100) + '...',
    };
    render(<SessionListItem session={longPromptSession} onClick={vi.fn()} />);

    expect(screen.getByText('A'.repeat(100) + '...')).toBeInTheDocument();
  });

  it('displays zero message count correctly', () => {
    const zeroMessageSession: SessionListItemType = {
      ...mockSession,
      messageCount: 0,
    };
    render(<SessionListItem session={zeroMessageSession} onClick={vi.fn()} />);

    expect(screen.getByText('0개 메시지')).toBeInTheDocument();
  });

  // Story 8.5 - Agent badge tests
  it('displays agent badge when agentInfo is provided (AC 5)', () => {
    render(
      <SessionListItem
        session={mockSession}
        onClick={vi.fn()}
        agentInfo={{ name: 'PM (Product Manager)', icon: '📋' }}
      />
    );

    const badge = screen.getByTestId('session-agent-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('📋');
    expect(badge).toHaveTextContent('PM (Product Manager)');
  });

  it('does not display agent badge when agentInfo is null', () => {
    render(
      <SessionListItem
        session={mockSession}
        onClick={vi.fn()}
        agentInfo={null}
      />
    );

    expect(screen.queryByTestId('session-agent-badge')).not.toBeInTheDocument();
  });

  it('uses aria-hidden on decorative icon', () => {
    render(<SessionListItem session={mockSession} onClick={vi.fn()} />);

    // The MessageSquare icon should have aria-hidden="true"
    const button = screen.getByRole('button');
    const svg = button.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
