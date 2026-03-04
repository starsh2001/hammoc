import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardSummaryBar } from '../DashboardSummaryBar';

describe('DashboardSummaryBar', () => {
  it('renders all stat cards even when totals are zero', () => {
    render(
      <DashboardSummaryBar totals={{ totalSessions: 0, activeSessions: 0, queueRunning: 0, terminals: 0 }} projectCount={0} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByText('Terminals')).toBeInTheDocument();
  });

  it('shows correct values for each category', () => {
    render(
      <DashboardSummaryBar totals={{ totalSessions: 6, activeSessions: 3, queueRunning: 1, terminals: 2 }} projectCount={5} />
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show subValue on Active card', () => {
    render(
      <DashboardSummaryBar totals={{ totalSessions: 6, activeSessions: 3, queueRunning: 0, terminals: 0 }} projectCount={1} />
    );
    expect(screen.queryByText('/ 6')).toBeNull();
  });

  it('shows correct numbers for large values', () => {
    render(
      <DashboardSummaryBar totals={{ totalSessions: 23, activeSessions: 10, queueRunning: 5, terminals: 8 }} projectCount={12} />
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders role="status" and aria-label="Dashboard summary" on container', () => {
    render(
      <DashboardSummaryBar totals={{ totalSessions: 1, activeSessions: 1, queueRunning: 0, terminals: 0 }} projectCount={1} />
    );
    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-label', 'Dashboard summary');
  });
});
