/**
 * BmadAgentButton Tests
 * [Source: Story 8.1 - Task 5, Story 8.2 - Task 4]
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BmadAgentButton } from '../BmadAgentButton';
import type { SlashCommand } from '@bmad-studio/shared';

// Mock useIsMobile
let mockIsMobile = false;
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

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
    mockIsMobile = false;
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

  // ===== Story 8.2 Tests =====

  // TC11: Hover tooltip shows full agent name
  it('shows full agent name in title attribute on hover', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const agentItem = screen.getByTestId('bmad-agent-item-0');
    const nameSpan = agentItem.querySelector('.truncate');
    expect(nameSpan).toHaveAttribute('title', 'PM (Product Manager)');
  });

  // TC12: Tooltip shows name + description when description exists
  it('shows name and description in title when description exists', () => {
    const agentsWithDescription: SlashCommand[] = [
      { ...mockAgents[0], description: 'Product Manager' },
      mockAgents[1],
    ];
    render(<BmadAgentButton {...defaultProps} agents={agentsWithDescription} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const agentItem0 = screen.getByTestId('bmad-agent-item-0');
    const nameSpan0 = agentItem0.querySelector('.truncate');
    expect(nameSpan0).toHaveAttribute('title', 'PM (Product Manager) - Product Manager');

    // Agent without description shows only name
    const agentItem1 = screen.getByTestId('bmad-agent-item-1');
    const nameSpan1 = agentItem1.querySelector('.truncate');
    expect(nameSpan1).toHaveAttribute('title', 'Dev (Developer)');
  });

  // TC13: Mobile bottom sheet renders instead of popup
  it('renders bottom sheet on mobile instead of popup', () => {
    mockIsMobile = true;
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    // Bottom sheet should be visible, not desktop popup
    expect(screen.queryByTestId('bmad-agent-popup')).not.toBeInTheDocument();
    expect(screen.getByTestId('bmad-bottom-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('bmad-bottom-sheet')).toHaveAttribute('role', 'dialog');
    expect(screen.getByTestId('bmad-bottom-sheet')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('bmad-bottom-sheet')).toHaveAttribute('aria-label', '에이전트 선택');
  });

  // TC14: Mobile backdrop click closes bottom sheet
  it('triggers close animation on mobile backdrop click', () => {
    mockIsMobile = true;
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByTestId('bmad-bottom-sheet')).toBeInTheDocument();

    // Click backdrop
    fireEvent.click(screen.getByTestId('bmad-bottom-sheet-backdrop'));

    // Should be in closing state (animate-bottomSheetDown)
    const bottomSheet = screen.getByTestId('bmad-bottom-sheet');
    expect(bottomSheet.className).toContain('animate-bottomSheetDown');

    // After animation ends, bottom sheet should be removed
    fireEvent.animationEnd(bottomSheet);
    expect(screen.queryByTestId('bmad-bottom-sheet')).not.toBeInTheDocument();
  });

  // TC15: Mobile bottom sheet has drag handle bar
  it('shows drag handle bar in mobile bottom sheet', () => {
    mockIsMobile = true;
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.getByTestId('bmad-bottom-sheet-handle')).toBeInTheDocument();
  });

  // TC16: Mobile bottom sheet has header and close button
  it('shows header text and close button in mobile bottom sheet', () => {
    mockIsMobile = true;
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.getByText('에이전트 선택')).toBeInTheDocument();
    expect(screen.getByTestId('bmad-bottom-sheet-close')).toBeInTheDocument();
    expect(screen.getByTestId('bmad-bottom-sheet-close')).toHaveAttribute('aria-label', '닫기');
  });

  // TC17: Mobile bottom sheet locks body scroll
  it('sets body overflow to hidden when bottom sheet opens and restores on close', () => {
    mockIsMobile = true;
    document.body.style.overflow = 'auto';

    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(document.body.style.overflow).toBe('hidden');

    // Trigger close
    fireEvent.click(screen.getByTestId('bmad-bottom-sheet-close'));
    fireEvent.animationEnd(screen.getByTestId('bmad-bottom-sheet'));

    expect(document.body.style.overflow).toBe('auto');
  });

  // TC18: Mobile close animation applies animate-bottomSheetDown then closes on animationEnd
  it('applies animate-bottomSheetDown on close and removes on animationEnd', () => {
    mockIsMobile = true;
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const bottomSheet = screen.getByTestId('bmad-bottom-sheet');
    expect(bottomSheet.className).toContain('animate-bottomSheetUp');

    // Trigger close via close button
    fireEvent.click(screen.getByTestId('bmad-bottom-sheet-close'));

    // Should now have close animation
    const closingSheet = screen.getByTestId('bmad-bottom-sheet');
    expect(closingSheet.className).toContain('animate-bottomSheetDown');

    // Fire animationEnd to complete close
    fireEvent.animationEnd(closingSheet);
    expect(screen.queryByTestId('bmad-bottom-sheet')).not.toBeInTheDocument();
  });

  // TC19: Focus trapping in mobile bottom sheet
  it('focuses close button on open and traps focus within bottom sheet', () => {
    mockIsMobile = true;
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const closeButton = screen.getByTestId('bmad-bottom-sheet-close');
    expect(document.activeElement).toBe(closeButton);

    const bottomSheet = screen.getByTestId('bmad-bottom-sheet');

    // Tab from last focusable wraps to first (close button is only focusable element)
    fireEvent.keyDown(bottomSheet, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    // Shift+Tab from first focusable wraps to last
    fireEvent.keyDown(bottomSheet, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeButton);
  });

  // ===== Story 8.4 Tests =====

  // TC21: No sections when recentAgentCommands is not provided (AC 5)
  it('shows flat list without sections when recentAgentCommands is not provided', () => {
    render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.queryByTestId('bmad-recent-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bmad-all-section')).not.toBeInTheDocument();
    expect(screen.getByText('PM (Product Manager)')).toBeInTheDocument();
  });

  // TC22: Sections displayed when recentAgentCommands is provided (AC 2)
  it('shows "최근 사용" and "전체" sections when recentAgentCommands is provided', () => {
    render(
      <BmadAgentButton
        {...defaultProps}
        recentAgentCommands={['/BMad:agents:pm', '/BMad:agents:dev']}
      />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.getByTestId('bmad-recent-section')).toBeInTheDocument();
    expect(screen.getByTestId('bmad-all-section')).toBeInTheDocument();
    expect(screen.getByText('최근 사용')).toBeInTheDocument();
    expect(screen.getByText('전체')).toBeInTheDocument();
  });

  // TC23: Recent agents displayed in correct order (AC 1)
  it('shows recent agents in the correct order', () => {
    render(
      <BmadAgentButton
        {...defaultProps}
        recentAgentCommands={['/BMad:agents:qa', '/BMad:agents:pm']}
      />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const recentSection = screen.getByTestId('bmad-recent-section');
    const recentItems = recentSection.querySelectorAll('[role="option"]');
    expect(recentItems).toHaveLength(2);
    expect(recentItems[0]).toHaveTextContent('QA (Quality Assurance)');
    expect(recentItems[1]).toHaveTextContent('PM (Product Manager)');
  });

  // TC24: Mobile bottom sheet also shows sections
  it('shows sections in mobile bottom sheet', () => {
    mockIsMobile = true;
    render(
      <BmadAgentButton
        {...defaultProps}
        recentAgentCommands={['/BMad:agents:dev']}
      />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.getByTestId('bmad-recent-section')).toBeInTheDocument();
    expect(screen.getByTestId('bmad-all-section')).toBeInTheDocument();
  });

  // TC25: No sections when recentAgentCommands is empty array (AC 5)
  it('shows flat list without sections when recentAgentCommands is empty', () => {
    render(<BmadAgentButton {...defaultProps} recentAgentCommands={[]} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    expect(screen.queryByTestId('bmad-recent-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bmad-all-section')).not.toBeInTheDocument();
  });

  // TC26: Keyboard navigation works across combined list (recent + all)
  it('keyboard navigation traverses recent + all combined list', () => {
    render(
      <BmadAgentButton
        {...defaultProps}
        recentAgentCommands={['/BMad:agents:pm']}
      />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const container = screen.getByTestId('bmad-agent-button').parentElement!;

    // Item 0 = recent PM, Item 1 = all PM, Item 2 = all Dev, Item 3 = all QA
    fireEvent.keyDown(container, { key: 'ArrowDown' }); // index 0 (recent PM)
    expect(screen.getByTestId('bmad-agent-item-0').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(container, { key: 'ArrowDown' }); // index 1 (all PM)
    expect(screen.getByTestId('bmad-agent-item-1').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(container, { key: 'ArrowDown' }); // index 2 (all Dev)
    expect(screen.getByTestId('bmad-agent-item-2').getAttribute('aria-selected')).toBe('true');

    // Enter selects the combined list item
    fireEvent.keyDown(container, { key: 'Enter' });
    expect(defaultProps.onAgentSelect).toHaveBeenCalledWith('/BMad:agents:dev');
  });

  // TC27: Sections have accessibility attributes
  it('has correct accessibility attributes on sections', () => {
    render(
      <BmadAgentButton
        {...defaultProps}
        recentAgentCommands={['/BMad:agents:pm']}
      />
    );
    fireEvent.click(screen.getByTestId('bmad-agent-button'));

    const recentSection = screen.getByTestId('bmad-recent-section');
    expect(recentSection).toHaveAttribute('role', 'group');
    expect(recentSection).toHaveAttribute('aria-label', '최근 사용');

    const allSection = screen.getByTestId('bmad-all-section');
    expect(allSection).toHaveAttribute('role', 'group');
    expect(allSection).toHaveAttribute('aria-label', '전체');
  });

  // TC20: Viewport change auto-closes bottom sheet
  it('auto-closes bottom sheet when viewport changes to desktop', () => {
    mockIsMobile = true;
    document.body.style.overflow = 'auto';

    const { rerender } = render(<BmadAgentButton {...defaultProps} />);
    fireEvent.click(screen.getByTestId('bmad-agent-button'));
    expect(screen.getByTestId('bmad-bottom-sheet')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    // Simulate viewport change to desktop
    mockIsMobile = false;
    rerender(<BmadAgentButton {...defaultProps} />);

    // Bottom sheet should be closed
    expect(screen.queryByTestId('bmad-bottom-sheet')).not.toBeInTheDocument();
    // body overflow should be restored
    expect(document.body.style.overflow).toBe('auto');
  });
});
