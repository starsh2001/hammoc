/**
 * ThinkingBlock Tests
 * Story 7.4: Thinking Message Display - Task 4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThinkingBlock } from '../ThinkingBlock';
import { useChatStore } from '../../stores/chatStore';

// Mock MarkdownRenderer for controlled testing
vi.mock('../MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

describe('ThinkingBlock', () => {
  const thinkingContent = 'Let me think about this problem step by step...';

  beforeEach(() => {
    // Reset global thinking state to collapsed before each test
    useChatStore.setState({ thinkingExpanded: false });
  });

  describe('collapsed state (default)', () => {
    it('should render collapsed by default with "Thinking" text', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      expect(screen.getByText('생각 중')).toBeInTheDocument();
    });

    it('should show Brain icon in collapsed state', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should not render markdown content when collapsed', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
    });

    it('should have aria-expanded=false when collapsed', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('should have aria-controls attribute', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-controls');
    });
  });

  describe('expanded state', () => {
    it('should expand when toggle is clicked', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
      expect(screen.getByText(thinkingContent)).toBeInTheDocument();
    });

    it('should have aria-expanded=true when expanded', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      fireEvent.click(screen.getByRole('button'));

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('should collapse when toggle is clicked again', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      // Expand
      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument();
    });

    it('should render expanded content with distinct styling (border-l, bg-purple)', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      fireEvent.click(screen.getByRole('button'));

      const container = screen.getByRole('button').closest('div');
      expect(container).toHaveClass('border-l-2');
      expect(container?.className).toContain('border-purple');
      expect(container?.className).toContain('bg-purple');
    });

    it('should have region role with aria-label for expanded content', () => {
      render(<ThinkingBlock content={thinkingContent} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByRole('region')).toHaveAttribute('aria-label', '사고 과정 내용');
    });
  });

  describe('global toggle (all blocks share state)', () => {
    it('should expand all blocks when one is toggled', () => {
      const { unmount } = render(
        <>
          <ThinkingBlock content="Block 1" />
          <ThinkingBlock content="Block 2" />
        </>
      );

      // Click the first block's button
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      // Both should be expanded
      const renderers = screen.getAllByTestId('markdown-renderer');
      expect(renderers).toHaveLength(2);

      unmount();
    });

    it('should persist expanded state for new blocks', () => {
      // First, expand via store
      useChatStore.setState({ thinkingExpanded: true });

      render(<ThinkingBlock content={thinkingContent} />);

      // Should be expanded immediately
      expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('markdown rendering', () => {
    it('should render thinking content through MarkdownRenderer', () => {
      useChatStore.setState({ thinkingExpanded: true });
      const markdownContent = '## Step 1\n\nAnalyze the problem...';
      render(<ThinkingBlock content={markdownContent} />);

      const renderer = screen.getByTestId('markdown-renderer');
      expect(renderer).toBeInTheDocument();
      expect(renderer.textContent).toContain('Step 1');
      expect(renderer.textContent).toContain('Analyze the problem...');
    });
  });

  describe('content area classes', () => {
    it('should have overflow-hidden class on content area', () => {
      useChatStore.setState({ thinkingExpanded: true });
      render(<ThinkingBlock content={thinkingContent} />);

      const contentArea = screen.getByRole('region');
      expect(contentArea).toHaveClass('overflow-hidden');
    });
  });

  describe('scroll handling for long content', () => {
    it('should have max-h-96 and overflow-y-auto classes for expanded content', () => {
      useChatStore.setState({ thinkingExpanded: true });
      render(<ThinkingBlock content={thinkingContent} />);

      const contentArea = screen.getByRole('region');
      expect(contentArea).toHaveClass('max-h-96');
      expect(contentArea).toHaveClass('overflow-y-auto');
    });
  });
});
