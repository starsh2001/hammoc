/**
 * MarkdownPreview Component Tests
 * [Source: Story 11.4 - Task 4.2]
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MarkdownPreview } from '../MarkdownPreview';

vi.mock('../../MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

describe('MarkdownPreview', () => {
  it('TC-MP1: should render content via MarkdownRenderer', () => {
    render(<MarkdownPreview content="# Hello World" />);

    const renderer = screen.getByTestId('markdown-renderer');
    expect(renderer).toBeDefined();
    expect(renderer.textContent).toBe('# Hello World');
  });

  it('TC-MP2: should be wrapped in a scrollable container', () => {
    const { container } = render(<MarkdownPreview content="test" />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('overflow-y-auto');
    expect(wrapper.className).toContain('flex-1');
  });
});
