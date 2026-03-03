import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProjectStatusIndicators } from '../ProjectStatusIndicators';
import type { DashboardProjectStatus } from '@bmad-studio/shared';

const makeStatus = (overrides: Partial<DashboardProjectStatus> = {}): DashboardProjectStatus => ({
  projectSlug: 'test-project',
  activeSessionCount: 0,
  totalSessionCount: 0,
  queueStatus: 'idle',
  terminalCount: 0,
  ...overrides,
});

describe('ProjectStatusIndicators', () => {
  it('renders nothing when status is undefined', () => {
    const { container } = render(<ProjectStatusIndicators status={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all counts are zero and queue is idle', () => {
    const { container } = render(<ProjectStatusIndicators status={makeStatus()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows active session count format "N/M active" with green dot', () => {
    render(<ProjectStatusIndicators status={makeStatus({ activeSessionCount: 2, totalSessionCount: 5 })} />);
    expect(screen.getByText('2/5 active')).toBeInTheDocument();
    // Green dot should be present
    const container = screen.getByText('2/5 active').parentElement!;
    const dot = container.querySelector('.bg-green-500.rounded-full');
    expect(dot).not.toBeNull();
  });

  it('shows terminal count with icon when terminalCount > 0', () => {
    render(<ProjectStatusIndicators status={makeStatus({ totalSessionCount: 3, terminalCount: 2 })} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides terminal count when terminalCount === 0', () => {
    render(<ProjectStatusIndicators status={makeStatus({ totalSessionCount: 3 })} />);
    // Only session text should appear, no standalone number for terminals
    expect(screen.getByText('0/3 active')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders QueueStatusBadge with correct status prop', () => {
    render(<ProjectStatusIndicators status={makeStatus({ totalSessionCount: 3, queueStatus: 'running' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Running');
  });

  it('renders correct dynamic aria-label — full case', () => {
    render(
      <ProjectStatusIndicators
        status={makeStatus({
          activeSessionCount: 2,
          totalSessionCount: 5,
          queueStatus: 'running',
          terminalCount: 1,
        })}
      />
    );
    const container = screen.getByLabelText('프로젝트 상태: 2/5 active sessions, queue running, 1 terminal(s)');
    expect(container).toBeInTheDocument();
  });

  it('renders correct dynamic aria-label — minimal case', () => {
    render(
      <ProjectStatusIndicators
        status={makeStatus({ activeSessionCount: 0, totalSessionCount: 3 })}
      />
    );
    const container = screen.getByLabelText('프로젝트 상태: 0/3 active sessions');
    expect(container).toBeInTheDocument();
  });
});
