import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChecklistSkeleton, ChecklistSkeletonList } from '../ChecklistSkeleton';

describe('ChecklistSkeleton', () => {
  it('should render with status role', () => {
    render(<ChecklistSkeleton />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should have aria-label for loading', () => {
    render(<ChecklistSkeleton />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '로딩 중');
  });

  it('should render screen reader text', () => {
    render(<ChecklistSkeleton />);

    expect(screen.getByText('체크리스트 항목 로딩 중...')).toBeInTheDocument();
  });

  it('should have animate-pulse class for animation', () => {
    render(<ChecklistSkeleton />);

    expect(screen.getByRole('status')).toHaveClass('animate-pulse');
  });
});

describe('ChecklistSkeletonList', () => {
  it('should render default count of 3 skeletons', () => {
    render(<ChecklistSkeletonList />);

    const skeletons = screen.getAllByText('체크리스트 항목 로딩 중...');
    expect(skeletons).toHaveLength(3);
  });

  it('should render specified count of skeletons', () => {
    render(<ChecklistSkeletonList count={5} />);

    const skeletons = screen.getAllByText('체크리스트 항목 로딩 중...');
    expect(skeletons).toHaveLength(5);
  });

  it('should have aria-label on container', () => {
    render(<ChecklistSkeletonList />);

    expect(screen.getByRole('status', { name: '체크리스트 로딩 중' })).toBeInTheDocument();
  });

  it('should render 1 skeleton when count is 1', () => {
    render(<ChecklistSkeletonList count={1} />);

    const skeletons = screen.getAllByText('체크리스트 항목 로딩 중...');
    expect(skeletons).toHaveLength(1);
  });
});
