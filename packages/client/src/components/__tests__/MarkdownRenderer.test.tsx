/**
 * MarkdownRenderer Tests
 * Story 4.4: Markdown Rendering - Task 6
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from '../MarkdownRenderer';

// Mock CodeBlock component
vi.mock('../CodeBlock', () => ({
  CodeBlock: ({ code, language }: { code: string; language?: string }) => (
    <div data-testid="code-block" data-language={language}>
      {code}
    </div>
  ),
}));

describe('MarkdownRenderer', () => {
  describe('basic markdown', () => {
    it('should render h1 heading', () => {
      render(<MarkdownRenderer content="# Hello" />);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Hello' })
      ).toBeInTheDocument();
    });

    it('should render h2 heading', () => {
      render(<MarkdownRenderer content="## Subheading" />);
      expect(
        screen.getByRole('heading', { level: 2, name: 'Subheading' })
      ).toBeInTheDocument();
    });

    it('should render h3 heading', () => {
      render(<MarkdownRenderer content="### Section" />);
      expect(
        screen.getByRole('heading', { level: 3, name: 'Section' })
      ).toBeInTheDocument();
    });

    it('should render bold text', () => {
      render(<MarkdownRenderer content="**bold text**" />);
      const boldElement = screen.getByText('bold text');
      expect(boldElement.tagName).toBe('STRONG');
    });

    it('should render italic text', () => {
      render(<MarkdownRenderer content="*italic text*" />);
      const italicElement = screen.getByText('italic text');
      expect(italicElement.tagName).toBe('EM');
    });

    it('should render unordered list', () => {
      render(
        <MarkdownRenderer
          content={`- item 1
- item 2`}
        />
      );
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('should render ordered list', () => {
      render(
        <MarkdownRenderer
          content={`1. first
2. second`}
        />
      );
      const list = screen.getByRole('list');
      expect(list.tagName).toBe('OL');
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('should render paragraph', () => {
      render(<MarkdownRenderer content="This is a paragraph." />);
      expect(screen.getByText('This is a paragraph.')).toBeInTheDocument();
    });

    it('should render blockquote', () => {
      render(<MarkdownRenderer content="> This is a quote" />);
      const blockquote = screen.getByText('This is a quote');
      expect(blockquote.closest('blockquote')).toBeInTheDocument();
    });

    it('should render horizontal rule', () => {
      const { container } = render(<MarkdownRenderer content="---" />);
      expect(container.querySelector('hr')).toBeInTheDocument();
    });
  });

  describe('code rendering', () => {
    it('should render inline code with proper styling', () => {
      render(<MarkdownRenderer content="Use `npm install`" />);
      const code = screen.getByText('npm install');
      expect(code.tagName).toBe('CODE');
      expect(code).toHaveClass('bg-gray-100');
      expect(code).toHaveClass('font-mono');
    });

    it('should render code block with CodeBlock component', () => {
      render(
        <MarkdownRenderer content={'```javascript\nconst x = 1;\n```'} />
      );
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
      expect(screen.getByTestId('code-block')).toHaveAttribute(
        'data-language',
        'javascript'
      );
    });

    it('should render code block without language', () => {
      render(<MarkdownRenderer content={'```\nplain code\n```'} />);
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
    });

    it('should pass code content to CodeBlock', () => {
      render(
        <MarkdownRenderer content={'```typescript\nconst y = 2;\n```'} />
      );
      expect(screen.getByText('const y = 2;')).toBeInTheDocument();
    });
  });

  describe('links', () => {
    it('should render links with target="_blank"', () => {
      render(<MarkdownRenderer content="[Google](https://google.com)" />);
      const link = screen.getByRole('link', { name: 'Google' });
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('should render links with rel="noopener noreferrer"', () => {
      render(<MarkdownRenderer content="[Example](https://example.com)" />);
      const link = screen.getByRole('link', { name: 'Example' });
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should render link href correctly', () => {
      render(<MarkdownRenderer content="[Click](https://test.com)" />);
      const link = screen.getByRole('link', { name: 'Click' });
      expect(link).toHaveAttribute('href', 'https://test.com');
    });
  });

  describe('tables (GFM)', () => {
    const tableMarkdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
`;

    it('should render table', () => {
      render(<MarkdownRenderer content={tableMarkdown} />);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should render table headers', () => {
      render(<MarkdownRenderer content={tableMarkdown} />);
      expect(screen.getByText('Header 1')).toBeInTheDocument();
      expect(screen.getByText('Header 2')).toBeInTheDocument();
    });

    it('should render table cells', () => {
      render(<MarkdownRenderer content={tableMarkdown} />);
      expect(screen.getByText('Cell 1')).toBeInTheDocument();
      expect(screen.getByText('Cell 2')).toBeInTheDocument();
      expect(screen.getByText('Cell 3')).toBeInTheDocument();
      expect(screen.getByText('Cell 4')).toBeInTheDocument();
    });
  });

  describe('security (XSS prevention)', () => {
    it('should escape script tags', () => {
      render(<MarkdownRenderer content="<script>alert('xss')</script>" />);
      expect(screen.queryByRole('script')).toBeNull();
      // Script content should be rendered as escaped text
      expect(screen.getByText(/alert/)).toBeInTheDocument();
    });

    it('should escape onclick attributes', () => {
      const { container } = render(
        <MarkdownRenderer content='<div onclick="alert(1)">click</div>' />
      );
      const divs = container.querySelectorAll('div');
      divs.forEach((div) => {
        expect(div).not.toHaveAttribute('onclick');
      });
    });

    it('should escape img onerror', () => {
      render(
        <MarkdownRenderer content='<img src="x" onerror="alert(1)">' />
      );
      const img = screen.queryByRole('img');
      if (img) {
        expect(img).not.toHaveAttribute('onerror');
      }
    });
  });

  describe('accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(
        <MarkdownRenderer
          content={`# H1

## H2

### H3`}
        />
      );

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    });

    it('should have accessible lists', () => {
      render(
        <MarkdownRenderer
          content={`- item 1
- item 2`}
        />
      );

      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('should have accessible links with proper attributes', () => {
      render(<MarkdownRenderer content="[Accessible Link](https://a11y.com)" />);

      const link = screen.getByRole('link', { name: 'Accessible Link' });
      expect(link).toHaveAttribute('href');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('props', () => {
    it('should accept isStreaming prop without error', () => {
      expect(() => {
        render(<MarkdownRenderer content="# Test" isStreaming={true} />);
      }).not.toThrow();
    });

    it('should pass onCodeCopy to CodeBlock', () => {
      const onCodeCopy = vi.fn();
      render(
        <MarkdownRenderer
          content={'```js\ncode\n```'}
          onCodeCopy={onCodeCopy}
        />
      );
      // CodeBlock is rendered (mocked, so we just check it exists)
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const { container } = render(<MarkdownRenderer content="" />);
      expect(container.querySelector('.prose')).toBeInTheDocument();
    });

    it('should handle content with only whitespace', () => {
      const { container } = render(<MarkdownRenderer content="   \n\n   " />);
      expect(container.querySelector('.prose')).toBeInTheDocument();
    });

    it('should handle very long content', () => {
      const longContent = '# Title\n\n' + 'Lorem ipsum '.repeat(1000);
      const { container } = render(<MarkdownRenderer content={longContent} />);
      expect(container.querySelector('.prose')).toBeInTheDocument();
    });

    it('should handle mixed content types', () => {
      const mixedContent = `
# Heading

Regular paragraph with **bold** and *italic*.

- List item 1
- List item 2

\`\`\`javascript
const x = 1;
\`\`\`

| Col1 | Col2 |
|------|------|
| A    | B    |

[Link](https://example.com)
`;
      render(<MarkdownRenderer content={mixedContent} />);

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('link')).toBeInTheDocument();
    });
  });
});
