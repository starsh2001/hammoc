/**
 * BmadAgentButton Tests
 * [Source: Story 8.1 - Task 5, Story 8.2 - Task 4]
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BmadAgentButton } from '../BmadAgentButton';
import type { SlashCommand } from '@bmad-studio/shared';

// Agents spanning planning + implementation categories
const mockAgents: SlashCommand[] = [
  { command: '/BMad:agents:pm', name: 'Bob', description: 'Product Manager', category: 'agent', icon: '📋' },
  { command: '/BMad:agents:dev', name: 'Mary', description: 'Developer', category: 'agent', icon: '💻' },
  { command: '/BMad:agents:qa', name: 'James', description: 'Quality Assurance', category: 'agent', icon: '🧪' },
];

// Extended agents with all categories for category tests
const fullMockAgents: SlashCommand[] = [
  { command: '/BMad:agents:analyst', name: 'Alice', description: 'Business Analyst', category: 'agent', icon: '🔍' },
  { command: '/BMad:agents:pm', name: 'Bob', description: 'Product Manager', category: 'agent', icon: '📋' },
  { command: '/BMad:agents:architect', name: 'Charlie', description: 'Solution Architect', category: 'agent', icon: '🏗️' },
  { command: '/BMad:agents:dev', name: 'Mary', description: 'Developer', category: 'agent', icon: '💻' },
  { command: '/BMad:agents:qa', name: 'James', description: 'Quality Assurance', category: 'agent', icon: '🧪' },
  { command: '/BMad:agents:bmad-master', name: 'BMad Master', description: 'Project Orchestrator', category: 'agent', icon: '⭐' },
  { command: '/BMad:agents:bmad-orchestrator', name: 'BMad Orchestrator', description: 'Workflow Orchestrator', category: 'agent', icon: '🎯' },
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

  // TC2: isBmadProject=true → icon button is shown
  it('renders agent button when isBmadProject is true', () => {
    render(<BmadAgentButton {...defaultProps} />);
    const button = screen.getByTestId('bmad-agent-button');
    expect(button).toBeInTheDocument();
  });

  // TC3: click opens agent list popup with role labels and descriptions
  it('shows agent list popup with role labels and descriptions', () => {
    render(<BmadAgentButton {...defaultProps} />);
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByTestId('bmad-agent-popup')).toBeInTheDocument();

    // Role labels displayed as main text
    const item0 = screen.getByTestId('bmad-agent-item-0');
    expect(item0).toHaveTextContent('PM');
    expect(item0).toHaveTextContent('Product Manager');

    const item1 = screen.getByTestId('bmad-agent-item-1');
    expect(item1).toHaveTextContent('Dev');
    expect(item1).toHaveTextContent('Developer');

    const item2 = screen.getByTestId('bmad-agent-item-2');
    expect(item2).toHaveTextContent('QA');
    expect(item2).toHaveTextContent('Quality Advisor');
  });

  // TC4: agent click calls onAgentSelect
  it('calls onAgentSelect when an agent is clicked', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    fireEvent.click(screen.getByTestId('bmad-agent-item-0'));

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

  // TC8: ModelSelector-matching neutral gray styling
  it('applies neutral gray styling matching ModelSelector', () => {
    render(<BmadAgentButton {...defaultProps} />);
    const button = screen.getByTestId('bmad-agent-button');
    expect(button.className).toContain('bg-white');
    expect(button.className).toContain('border-gray-300');
    expect(button.className).toContain('text-gray-600');
  });

  // TC9: keyboard navigation (ArrowDown/ArrowUp/Enter)
  it('navigates agents with ArrowDown/ArrowUp and selects with Enter', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const container = screen.getByTestId('bmad-agent-button').parentElement!;

    // ArrowDown selects first item (PM in Planning group)
    fireEvent.keyDown(container, { key: 'ArrowDown' });
    expect(screen.getByTestId('bmad-agent-item-0').getAttribute('aria-selected')).toBe('true');

    // ArrowDown again selects second item (Dev in Implementation group)
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
  it('closes popup when button is clicked again (toggle)', () => {
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
    fireEvent.click(screen.getByTestId('bmad-agent-item-1'));

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

  // ===== Story 8.2 Tests =====

  // TC11: Hover tooltip shows role label and description
  it('shows role label and description in title attribute', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const agentItem = screen.getByTestId('bmad-agent-item-0');
    expect(agentItem).toHaveAttribute('title', 'PM - Product Manager');
  });

  // TC12: Tooltip shows role label only when no description
  it('shows role label only in title when no description', () => {
    const agentsNoDesc: SlashCommand[] = [
      { command: '/BMad:agents:pm', name: 'Bob', category: 'agent', icon: '📋' },
    ];
    render(<BmadAgentButton {...defaultProps} agents={agentsNoDesc} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const agentItem = screen.getByTestId('bmad-agent-item-0');
    expect(agentItem).toHaveAttribute('title', 'PM');
  });

  // ===== Category Group Tests =====

  // Agents are grouped by workflow phase with English labels
  it('groups agents into Planning and Implementation categories', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const planningGroup = screen.getByTestId('bmad-group-planning');
    expect(planningGroup).toHaveAttribute('role', 'group');
    expect(planningGroup).toHaveAttribute('aria-label', 'Planning');
    expect(screen.getByText('Planning')).toBeInTheDocument();

    const implGroup = screen.getByTestId('bmad-group-implementation');
    expect(implGroup).toHaveAttribute('role', 'group');
    expect(implGroup).toHaveAttribute('aria-label', 'Implementation');
    expect(screen.getByText('Implementation')).toBeInTheDocument();
  });

  // Full agent set shows all three categories in correct order
  it('shows Planning, Implementation, Other groups with correct agent ordering', () => {
    render(<BmadAgentButton {...defaultProps} agents={fullMockAgents} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    // Planning group: Analyst(0), PM(1), Architect(2)
    const planningGroup = screen.getByTestId('bmad-group-planning');
    const planningItems = planningGroup.querySelectorAll('[role="option"]');
    expect(planningItems).toHaveLength(3);
    expect(planningItems[0]).toHaveTextContent('Analyst');
    expect(planningItems[1]).toHaveTextContent('PM');
    expect(planningItems[2]).toHaveTextContent('Architect');

    // Implementation group: Dev(3), QA(4)
    const implGroup = screen.getByTestId('bmad-group-implementation');
    const implItems = implGroup.querySelectorAll('[role="option"]');
    expect(implItems).toHaveLength(2);
    expect(implItems[0]).toHaveTextContent('Dev');
    expect(implItems[1]).toHaveTextContent('QA');

    // Other group: BMad Master(5), BMad Orchestrator(6)
    const otherGroup = screen.getByTestId('bmad-group-other');
    const otherItems = otherGroup.querySelectorAll('[role="option"]');
    expect(otherItems).toHaveLength(2);
    expect(otherItems[0]).toHaveTextContent('Bmad Master');
    expect(otherItems[1]).toHaveTextContent('Bmad Orchestrator');
  });

  // Description displayed as secondary text next to role label
  it('displays description as secondary text next to role label', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const item = screen.getByTestId('bmad-agent-item-0');
    const roleSpan = item.querySelector('.text-sm');
    const descSpan = item.querySelector('.text-xs');
    expect(roleSpan?.textContent).toBe('PM');
    expect(descSpan?.textContent).toBe('Product Manager');
  });

  // No description → only role label shown
  it('shows only role label when agent has no description', () => {
    const agentsNoDesc: SlashCommand[] = [
      { command: '/BMad:agents:dev', name: 'Mary', category: 'agent', icon: '💻' },
    ];
    render(<BmadAgentButton {...defaultProps} agents={agentsNoDesc} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const item = screen.getByTestId('bmad-agent-item-0');
    const descSpan = item.querySelector('.text-xs');
    expect(descSpan).toBeNull();
    expect(item).toHaveTextContent('Dev');
  });

  // ===== Active Agent Indicator Tests =====

  // Shows checkmark on active agent
  it('shows checkmark on the active agent', () => {
    render(
      <BmadAgentButton {...defaultProps} activeAgentCommand="/BMad:agents:dev" />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    // Dev (item-1) should have checkmark
    const devItem = screen.getByTestId('bmad-agent-item-1');
    expect(devItem.querySelector('[data-testid="bmad-agent-check"]')).toBeInTheDocument();

    // PM (item-0) should NOT have checkmark
    const pmItem = screen.getByTestId('bmad-agent-item-0');
    expect(pmItem.querySelector('[data-testid="bmad-agent-check"]')).not.toBeInTheDocument();
  });

  // Active agent has blue highlight styling
  it('applies blue highlight to active agent', () => {
    render(
      <BmadAgentButton {...defaultProps} activeAgentCommand="/BMad:agents:pm" />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const pmItem = screen.getByTestId('bmad-agent-item-0');
    expect(pmItem.className).toContain('bg-blue-50');

    const roleSpan = pmItem.querySelector('.text-sm');
    expect(roleSpan?.className).toContain('font-semibold');
    expect(roleSpan?.className).toContain('text-blue-700');
  });

  // No checkmark when no active agent
  it('shows no checkmark when activeAgentCommand is not set', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.queryByTestId('bmad-agent-check')).not.toBeInTheDocument();
  });

  // ===== Description Override Tests =====

  // QA shows "Quality Advisor" instead of original description
  it('overrides QA description to "Quality Advisor"', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const qaItem = screen.getByTestId('bmad-agent-item-2');
    expect(qaItem).toHaveTextContent('Quality Advisor');
    expect(qaItem).not.toHaveTextContent('Quality Assurance');
  });

  // BMad Master has no description displayed
  it('suppresses description for BMad Master', () => {
    render(<BmadAgentButton {...defaultProps} agents={fullMockAgents} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const otherGroup = screen.getByTestId('bmad-group-other');
    const otherItems = otherGroup.querySelectorAll('[role="option"]');
    const masterItem = otherItems[0];
    expect(masterItem).toHaveTextContent('Bmad Master');
    const descSpan = masterItem.querySelector('.text-xs');
    expect(descSpan).toBeNull();
  });

  // BMad Orchestrator has no description displayed
  it('suppresses description for BMad Orchestrator', () => {
    render(<BmadAgentButton {...defaultProps} agents={fullMockAgents} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const otherGroup = screen.getByTestId('bmad-group-other');
    const otherItems = otherGroup.querySelectorAll('[role="option"]');
    // BMad Orchestrator (index 1 in Other group)
    const orchestratorItem = otherItems[1];
    expect(orchestratorItem).toHaveTextContent('Bmad Orchestrator');
    const descSpan = orchestratorItem.querySelector('.text-xs');
    expect(descSpan).toBeNull();
  });

  // Category groups have accessibility attributes
  it('has correct accessibility attributes on category groups', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const planningGroup = screen.getByTestId('bmad-group-planning');
    expect(planningGroup).toHaveAttribute('role', 'group');
    expect(planningGroup).toHaveAttribute('aria-label', 'Planning');

    const implGroup = screen.getByTestId('bmad-group-implementation');
    expect(implGroup).toHaveAttribute('role', 'group');
    expect(implGroup).toHaveAttribute('aria-label', 'Implementation');
  });
});
