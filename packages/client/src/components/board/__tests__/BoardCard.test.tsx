/**
 * BoardCard Component Tests
 * [Source: Story 21.2 - Task 12]
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardCard } from '../BoardCard';
import type { BoardItem } from '@bmad-studio/shared';

const issueItem: BoardItem = {
  id: 'issue-1',
  type: 'issue',
  title: 'Fix login bug',
  status: 'Open',
  description: 'Login form does not validate email properly',
  severity: 'high',
  issueType: 'bug',
};

const storyItem: BoardItem = {
  id: 'story-21.1',
  type: 'story',
  title: 'Board API Implementation',
  status: 'Done',
  epicNumber: 21,
};

const epicItem: BoardItem = {
  id: 'epic-21',
  type: 'epic',
  title: 'Project Board',
  status: 'InProgress',
  epicNumber: 21,
  storyProgress: { total: 3, done: 1 },
};

describe('BoardCard', () => {
  describe('Type badges', () => {
    it('should render [I] badge for issue type', () => {
      render(<BoardCard item={issueItem} />);
      expect(screen.getByText('[I]')).toBeInTheDocument();
    });

    it('should render [S] badge for story type', () => {
      render(<BoardCard item={storyItem} />);
      expect(screen.getByText('[S]')).toBeInTheDocument();
    });

    it('should render [E] badge for epic type', () => {
      render(<BoardCard item={epicItem} />);
      expect(screen.getByText('[E]')).toBeInTheDocument();
    });
  });

  describe('Issue card', () => {
    it('should render title and description preview', () => {
      render(<BoardCard item={issueItem} />);
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      expect(screen.getByText('Login form does not validate email properly')).toBeInTheDocument();
    });

    it('should render severity badge', () => {
      render(<BoardCard item={issueItem} />);
      expect(screen.getByText('high')).toBeInTheDocument();
    });

    it('should render all severity levels', () => {
      const severities = ['low', 'medium', 'high', 'critical'] as const;
      for (const severity of severities) {
        const { unmount } = render(
          <BoardCard item={{ ...issueItem, severity }} />,
        );
        expect(screen.getByText(severity)).toBeInTheDocument();
        unmount();
      }
    });

    it('should render issue type text', () => {
      render(<BoardCard item={issueItem} />);
      expect(screen.getByText('bug')).toBeInTheDocument();
    });
  });

  describe('Story card', () => {
    it('should render epic number', () => {
      render(<BoardCard item={storyItem} />);
      expect(screen.getByText('Epic #21')).toBeInTheDocument();
    });
  });

  describe('Epic card', () => {
    it('should render story progress bar with text', () => {
      render(<BoardCard item={epicItem} />);
      expect(screen.getByText('1/3')).toBeInTheDocument();
    });

    it('should render progress bar with correct width', () => {
      const { container } = render(<BoardCard item={epicItem} />);
      const progressBar = container.querySelector('.bg-blue-500.rounded-full');
      expect(progressBar).toBeInTheDocument();
      expect((progressBar as HTMLElement).style.width).toBe('33.33333333333333%');
    });

    it('should render 0% progress when total is 0', () => {
      const emptyEpic: BoardItem = {
        ...epicItem,
        storyProgress: { total: 0, done: 0 },
      };
      const { container } = render(<BoardCard item={emptyEpic} />);
      const progressBar = container.querySelector('.bg-blue-500.rounded-full');
      expect((progressBar as HTMLElement).style.width).toBe('0%');
    });
  });
});
