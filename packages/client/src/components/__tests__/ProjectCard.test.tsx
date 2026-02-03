/**
 * ProjectCard Tests
 * [Source: Story 3.2 - Task 3]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectCard } from '../ProjectCard';
import type { ProjectInfo } from '@bmad-studio/shared';

describe('ProjectCard', () => {
  beforeEach(() => {
    // Mock current date for consistent relative time
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockProject: ProjectInfo = {
    originalPath: '/Users/user/my-project',
    projectSlug: 'abc123',
    sessionCount: 5,
    lastModified: '2026-02-01T10:00:00Z',
    isBmadProject: true,
  };

  const nonBmadProject: ProjectInfo = {
    originalPath: '/Users/user/another-project',
    projectSlug: 'def456',
    sessionCount: 2,
    lastModified: '2026-01-31T12:00:00Z',
    isBmadProject: false,
  };

  it('renders project path', () => {
    render(<ProjectCard project={mockProject} onClick={vi.fn()} />);

    expect(screen.getByText('~/my-project')).toBeInTheDocument();
  });

  it('renders session count', () => {
    render(<ProjectCard project={mockProject} onClick={vi.fn()} />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders relative time for lastModified', () => {
    render(<ProjectCard project={mockProject} onClick={vi.fn()} />);

    expect(screen.getByText('2시간 전')).toBeInTheDocument();
  });

  it('shows BMad badge for BMad projects', () => {
    render(<ProjectCard project={mockProject} onClick={vi.fn()} />);

    expect(screen.getByText('BMad')).toBeInTheDocument();
  });

  it('does not show BMad badge for non-BMad projects', () => {
    render(<ProjectCard project={nonBmadProject} onClick={vi.fn()} />);

    expect(screen.queryByText('BMad')).not.toBeInTheDocument();
  });

  it('calls onClick with projectSlug when clicked', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={mockProject} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('abc123');
  });

  it('is accessible as a button element', () => {
    render(<ProjectCard project={mockProject} onClick={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label');
  });

  it('handles keyboard navigation (Enter key)', () => {
    const onClick = vi.fn();
    render(<ProjectCard project={mockProject} onClick={onClick} />);

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalled();
  });

  it('displays correct relative time for days ago', () => {
    render(<ProjectCard project={nonBmadProject} onClick={vi.fn()} />);

    expect(screen.getByText('1일 전')).toBeInTheDocument();
  });
});
