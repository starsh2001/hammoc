/**
 * EpicProgressCard Tests
 * [Source: Story 12.4 - Task 3.1]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EpicProgressCard } from '../EpicProgressCard';
import type { BmadEpicStatus } from '@hammoc/shared';

const mockEpics: BmadEpicStatus[] = [
  {
    number: 1,
    name: 'Foundation',
    stories: [
      { file: '1.1.story.md', status: 'Done' },
      { file: '1.2.story.md', status: 'Done' },
      { file: '1.3.story.md', status: 'In Progress' },
    ],
  },
  {
    number: 2,
    name: 'Chat',
    stories: [
      { file: '2.1.story.md', status: 'Done' },
      { file: '2.2.story.md', status: 'Approved' },
      { file: '2.3.story.md', status: 'Draft' },
      { file: '2.4.story.md', status: 'Blocked' },
    ],
  },
];

const mockEpicNoStories: BmadEpicStatus = {
  number: 3,
  name: 'Empty Epic',
  stories: [],
};

const mockEmptyEpics: BmadEpicStatus[] = [];

describe('EpicProgressCard', () => {
  // TC-EP-1: Epic list with done/total counts (AC1)
  it('displays epic list with done/total counts', () => {
    render(<EpicProgressCard epics={mockEpics} />);

    expect(screen.getByText('1. Foundation')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('2. Chat')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
  });

  // TC-EP-2: Progress bar with correct width (AC2)
  it('renders progress bars with correct width', () => {
    const { container } = render(<EpicProgressCard epics={mockEpics} />);

    // Progress bars use dynamic colors based on completion:
    // Foundation (66%) = bg-blue-500, Chat (25%) = bg-amber-500
    const allBars = container.querySelectorAll('[style*="width"]');
    expect(allBars).toHaveLength(2);

    // Foundation: 2/3 = 66.66...%
    expect((allBars[0] as HTMLElement).style.width).toBe(`${(2 / 3) * 100}%`);
    // Chat: 1/4 = 25%
    expect((allBars[1] as HTMLElement).style.width).toBe('25%');
  });

  // TC-EP-3: Click epic to expand story list (AC5)
  it('expands story list on epic click', () => {
    render(<EpicProgressCard epics={mockEpics} />);

    // Before click: stories not visible
    expect(screen.queryByText('1.1.story.md')).not.toBeInTheDocument();

    // Click Foundation epic
    fireEvent.click(screen.getByText('1. Foundation'));

    // After click: stories visible
    expect(screen.getByText('1.1.story.md')).toBeInTheDocument();
    expect(screen.getByText('1.2.story.md')).toBeInTheDocument();
    expect(screen.getByText('1.3.story.md')).toBeInTheDocument();
  });

  // TC-EP-4: Story status badges (AC3)
  it('displays correct status badges for stories', () => {
    render(<EpicProgressCard epics={mockEpics} />);

    // Expand both epics
    fireEvent.click(screen.getByText('1. Foundation'));
    fireEvent.click(screen.getByText('2. Chat'));

    expect(screen.getAllByText('Done')).toHaveLength(3);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  // TC-EP-5: Epic with no stories shows "스토리 미작성" (AC4)
  it('shows "스토리 미작성" for epic with no stories', () => {
    render(<EpicProgressCard epics={[...mockEpics, mockEpicNoStories]} />);

    expect(screen.getByText('스토리 미정의')).toBeInTheDocument();
    expect(screen.getByText('3. Empty Epic')).toBeInTheDocument();

    // Click should not expand (no ChevronDown icon for this epic)
    fireEvent.click(screen.getByText('3. Empty Epic'));
    // Still no story details shown
    expect(screen.queryByText('스토리 미정의')).toBeInTheDocument();
  });

  // TC-EP-6: Empty epics array shows message
  it('shows "에픽이 없습니다." when epics array is empty', () => {
    render(<EpicProgressCard epics={mockEmptyEpics} />);

    expect(screen.getByText('에픽이 없습니다.')).toBeInTheDocument();
  });

  // TC-EP-7: Collapse expanded epic on second click (AC5)
  it('collapses expanded epic on second click', () => {
    render(<EpicProgressCard epics={mockEpics} />);

    // Click to expand
    fireEvent.click(screen.getByText('1. Foundation'));
    expect(screen.getByText('1.1.story.md')).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByText('1. Foundation'));
    expect(screen.queryByText('1.1.story.md')).not.toBeInTheDocument();
  });

  // TC-EP-8: Multiple epics can be expanded independently (AC5)
  it('allows multiple epics to be expanded independently', () => {
    render(<EpicProgressCard epics={mockEpics} />);

    // Expand Foundation
    fireEvent.click(screen.getByText('1. Foundation'));
    expect(screen.getByText('1.1.story.md')).toBeInTheDocument();

    // Expand Chat (Foundation should remain expanded)
    fireEvent.click(screen.getByText('2. Chat'));
    expect(screen.getByText('1.1.story.md')).toBeInTheDocument();
    expect(screen.getByText('2.1.story.md')).toBeInTheDocument();
  });
});
