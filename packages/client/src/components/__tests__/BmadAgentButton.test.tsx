/**
 * BmadAgentButton Tests
 * [Source: Story 8.1 - Task 5]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BmadAgentButton } from '../BmadAgentButton';
import type { SlashCommand } from '@bmad-studio/shared';

const mockAgents: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'PM (Product Manager)', category: 'agent', icon: '📋' },
  { command: '/BMad:agents:dev', name: 'Dev (Developer)', category: 'agent', icon: '💻' },
  { command: '/BMad:agents:qa', name: 'QA (Quality Assurance)', category: 'agent', icon: '🧪' },
];

describe('BmadAgentButton', () => {
  const defaultProps = {
    isBmadProject: true,
    agents: mockAgents,
    onAgentSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC1: isBmadProject=false → button not rendered
  it('does not render when isBmadProject is false', () => {
    render(<BmadAgentButton {...defaultProps} isBmadProject={false} />);
    expect(screen.queryByTestId('bmad-agent-button')).not.toBeInTheDocument();
  });

  // TC2: isBmadProject=true → Ⓑ button is shown
  it('renders Ⓑ button when isBmadProject is true', () => {
    render(<BmadAgentButton {...defaultProps} />);
    const button = screen.getByTestId('bmad-agent-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Ⓑ');
  });

  // TC3: click opens agent list popup
  it('shows agent list popup when button is clicked', () => {
    render(<BmadAgentButton {...defaultProps} />);
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByTestId('bmad-agent-popup')).toBeInTheDocument();
    expect(screen.getByText('PM (Product Manager)')).toBeInTheDocument();
    expect(screen.getByText('Dev (Developer)')).toBeInTheDocument();
    expect(screen.getByText('QA (Quality Assurance)')).toBeInTheDocument();
  });

  // TC4: agent click calls onAgentSelect
  it('calls onAgentSelect when an agent is clicked', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    fireEvent.click(screen.getByText('PM (Product Manager)'));

    expect(defaultProps.onAgentSelect).toHaveBeenCalledWith('/BMad:agents:pm');
  });

  // TC5: outside click closes popup
  it('closes popup when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <BmadAgentButton {...defaultProps} />
      </div>
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByTestId('bmad-agent-popup')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();
  });

  // TC6: Escape key closes popup
  it('closes popup when Escape is pressed', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByTestId('bmad-agent-popup')).toBeInTheDocument();

    const container = screen.getByTestId('bmad-agent-button').parentElement!;
    fireEvent.keyDown(container, { key: 'Escape' });
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();
  });

  // TC7: disabled=true disables button
  it('disables button when disabled prop is true', () => {
    render(<BmadAgentButton {...defaultProps} disabled />);
    const button = screen.getByTestId('bmad-agent-button');
    expect(button).toBeDisabled();
  });

  // TC7b: disabled button does not open popup
  it('does not open popup when disabled button is clicked', () => {
    render(<BmadAgentButton {...defaultProps} disabled />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();
  });

  // TC8: dark/light mode styles applied
  it('applies neon purple styling', () => {
    render(<BmadAgentButton {...defaultProps} />);
    const button = screen.getByTestId('bmad-agent-button');
    expect(button.className).toContain('bg-purple-100');
    expect(button.className).toContain('border-purple-500');
    expect(button.className).toContain('text-purple-700');
  });

  // TC9: keyboard navigation (ArrowDown/ArrowUp/Enter)
  it('navigates agents with ArrowDown/ArrowUp and selects with Enter', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const container = screen.getByTestId('bmad-agent-button').parentElement!;

    // ArrowDown selects first item
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(screen.getByTestId('bmad-agent-item-0').getAttribute('aria-selected')).toBe('true');

    // ArrowDown again selects second item
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(screen.getByTestId('bmad-agent-item-1').getAttribute('aria-selected')).toBe('true');

    // ArrowUp goes back to first
    fireEvent.keyDown(container, { key: 'ArrowUp' });
    expect(screen.getByTestId('bmad-agent-item-0').getAttribute('aria-selected')).toBe('true');

    // Enter selects the current item
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(defaultProps.onAgentSelect).toHaveBeenCalledWith('/BMad:agents:pm');
  });

  // TC9b: ArrowDown wraps around from last to first
  it('wraps around with ArrowDown from last to first', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const container = screen.getByTestId('bmad-agent-button').parentElement!;

    // Navigate to last item
    fireEvent.keyDown(container, { key: 'ArrowDown' }); // 0
    fireEvent.keyDown(container, { key: 'ArrowDown' }); // 1
    fireEvent.keyDown(container, { key: 'ArrowDown' }); // 2
    fireEvent.keyDown(container, { key: 'ArrowDown' }); // wraps to 0
    expect(screen.getByTestId('bmad-agent-item-0').getAttribute('aria-selected')).toBe('true');
  });

  // TC10: empty agents shows message
  it('shows empty message when no agents are available', () => {
    render(<BmadAgentButton {...defaultProps} agents={[]} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByText('등록된 에이전트가 없습니다')).toBeInTheDocument();
  });

  // Toggle: re-click button closes popup
  it('closes popup when Ⓑ button is clicked again (toggle)', () => {
    render(<BmadAgentButton {...defaultProps} />);
    const button = screen.getByTestId('bmad-agent-button');

    fireEvent.click(button);
    expect(screen.getByTestId('bmad-agent-popup')).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();
  });

  // Agent click closes popup
  it('closes popup after selecting an agent', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    fireEvent.click(screen.getByText('Dev (Developer)'));

    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();
    expect(defaultProps.onAgentSelect).toHaveBeenCalledWith('/BMad:agents:dev');
  });

  // Agent icon display
  it('displays agent icons', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByText('📋')).toBeInTheDocument();
    expect(screen.getByText('💻')).toBeInTheDocument();
    expect(screen.getByText('🧪')).toBeInTheDocument();
  });
});
