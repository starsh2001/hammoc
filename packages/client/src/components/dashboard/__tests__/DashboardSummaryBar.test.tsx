import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardSummaryBar } from '../DashboardSummaryBar';

describe('DashboardSummaryBar', () => {
  it('renders nothing when all totals are zero', () => {
    const { container } = render(
      <DashboardSummaryBar totals={{ activeSessions: 0, queueRunning: 0, terminals: 0 }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows correct totals format', () => {
    render(
      <DashboardSummaryBar totals={{ activeSessions: 3, queueRunning: 1, terminals: 2 }} />
    );
    expect(screen.getByText('Active Sessions: 3')).toBeInTheDocument();
    expect(screen.getByText('Queue Running: 1')).toBeInTheDocument();
    expect(screen.getByText('Terminals: 2')).toBeInTheDocument();
  });

  it('renders when at least one total is non-zero', () => {
    render(
      <DashboardSummaryBar totals={{ activeSessions: 0, queueRunning: 0, terminals: 1 }} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows correct numbers for each category', () => {
    render(
      <DashboardSummaryBar totals={{ activeSessions: 10, queueRunning: 5, terminals: 8 }} />
    );
    expect(screen.getByText('Active Sessions: 10')).toBeInTheDocument();
    expect(screen.getByText('Queue Running: 5')).toBeInTheDocument();
    expect(screen.getByText('Terminals: 8')).toBeInTheDocument();
  });

  it('renders role="status" and aria-label="Dashboard summary" on container', () => {
    render(
      <DashboardSummaryBar totals={{ activeSessions: 1, queueRunning: 0, terminals: 0 }} />
    );
    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-label', 'Dashboard summary');
  });
});
