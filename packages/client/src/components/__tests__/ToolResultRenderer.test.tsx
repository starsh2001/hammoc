/**
 * ToolResultRenderer Tests
 * [Source: Story 7.3 - Task 5]
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolResultRenderer } from '../ToolResultRenderer';

// Mock CodeBlock to avoid Shiki dependency
vi.mock('../CodeBlock', () => ({
  CodeBlock: vi.fn(({ code, language }: { code: string; language?: string }) => (
    <div data-testid="mock-code-block" data-language={language ?? 'text'}>
      <pre>{code}</pre>
    </div>
  )),
}));

describe('ToolResultRenderer', () => {
  describe('empty result', () => {
    it('renders nothing when result is undefined', () => {
      const { container } = render(
        <ToolResultRenderer toolName="Read" />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when result is empty string', () => {
      const { container } = render(
        <ToolResultRenderer toolName="Read" result="" />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Read tool', () => {
    it('renders code block with file content', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/index.ts' }}
          result="const app = express();"
        />
      );

      expect(screen.getByTestId('tool-result-read')).toBeInTheDocument();
      expect(screen.getByTestId('mock-code-block')).toBeInTheDocument();
      expect(screen.getByText('const app = express();')).toBeInTheDocument();
    });

    it('detects language from file extension', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/app.py' }}
          result="print('hello')"
        />
      );

      const codeBlock = screen.getByTestId('mock-code-block');
      expect(codeBlock).toHaveAttribute('data-language', 'python');
    });

    it('detects TypeScript from .tsx extension', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/App.tsx' }}
          result="export default App;"
        />
      );

      const codeBlock = screen.getByTestId('mock-code-block');
      expect(codeBlock).toHaveAttribute('data-language', 'tsx');
    });

    it('handles missing file_path gracefully', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          result="some content"
        />
      );

      const codeBlock = screen.getByTestId('mock-code-block');
      expect(codeBlock).toHaveAttribute('data-language', 'text');
    });
  });

  describe('Bash tool', () => {
    it('renders command header + output', () => {
      render(
        <ToolResultRenderer
          toolName="Bash"
          toolInput={{ command: 'npm test' }}
          result="All tests passed"
        />
      );

      expect(screen.getByTestId('tool-result-bash')).toBeInTheDocument();
      expect(screen.getByText(/\$ npm test/)).toBeInTheDocument();
      expect(screen.getByText(/All tests passed/)).toBeInTheDocument();
    });

    it('uses bash language for code block', () => {
      render(
        <ToolResultRenderer
          toolName="Bash"
          toolInput={{ command: 'ls' }}
          result="file.txt"
        />
      );

      const codeBlock = screen.getByTestId('mock-code-block');
      expect(codeBlock).toHaveAttribute('data-language', 'bash');
    });

    it('renders output without command when toolInput is missing', () => {
      render(
        <ToolResultRenderer
          toolName="Bash"
          result="output only"
        />
      );

      expect(screen.getByText('output only')).toBeInTheDocument();
    });
  });

  describe('Glob tool', () => {
    it('renders file list', () => {
      const result = 'src/index.ts\nsrc/app.ts\nsrc/utils.ts';
      render(
        <ToolResultRenderer toolName="Glob" result={result} />
      );

      expect(screen.getByTestId('tool-result-glob')).toBeInTheDocument();
      expect(screen.getByText('src/index.ts')).toBeInTheDocument();
      expect(screen.getByText('src/app.ts')).toBeInTheDocument();
      expect(screen.getByText('src/utils.ts')).toBeInTheDocument();
    });

    it('filters out empty lines', () => {
      const result = 'file1.ts\n\nfile2.ts\n';
      render(
        <ToolResultRenderer toolName="Glob" result={result} />
      );

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
    });
  });

  describe('Grep tool', () => {
    it('renders search results in code block', () => {
      const result = 'src/app.ts:1:import express\nsrc/app.ts:5:const app = express()';
      render(
        <ToolResultRenderer toolName="Grep" result={result} />
      );

      expect(screen.getByTestId('tool-result-grep')).toBeInTheDocument();
      expect(screen.getByTestId('mock-code-block')).toBeInTheDocument();
    });
  });

  describe('unknown tool (fallback)', () => {
    it('renders plain text for unknown tools', () => {
      render(
        <ToolResultRenderer toolName="SomeUnknownTool" result="some output" />
      );

      expect(screen.getByTestId('tool-result-default')).toBeInTheDocument();
      expect(screen.getByText('some output')).toBeInTheDocument();
    });
  });

  describe('"more" expand/collapse', () => {
    const longContent = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n');

    it('shows "more" button for long Read result', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/long.ts' }}
          result={longContent}
        />
      );

      const expandBtn = screen.getByRole('button', { name: /더 보기/ });
      expect(expandBtn).toBeInTheDocument();
    });

    it('shows only preview lines when collapsed', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/long.ts' }}
          result={longContent}
        />
      );

      // Only first 20 lines shown
      expect(screen.getByText(/line 20/)).toBeInTheDocument();
      expect(screen.queryByText('line 25')).not.toBeInTheDocument();
    });

    it('shows all content when expanded', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/long.ts' }}
          result={longContent}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /더 보기/ }));

      expect(screen.getByText(/line 25/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /접기/ })).toBeInTheDocument();
    });

    it('collapses back when "collapse" is clicked', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/long.ts' }}
          result={longContent}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /더 보기/ }));
      fireEvent.click(screen.getByRole('button', { name: /접기/ }));

      expect(screen.queryByText('line 25')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /더 보기/ })).toBeInTheDocument();
    });

    it('does not show "more" button for short result', () => {
      render(
        <ToolResultRenderer
          toolName="Read"
          toolInput={{ file_path: '/src/short.ts' }}
          result="short content"
        />
      );

      expect(screen.queryByRole('button', { name: /더 보기/ })).not.toBeInTheDocument();
    });

    it('shows "more" button for long Glob result (>20 items)', () => {
      const manyFiles = Array.from({ length: 25 }, (_, i) => `file-${i + 1}.ts`).join('\n');
      render(
        <ToolResultRenderer toolName="Glob" result={manyFiles} />
      );

      const expandBtn = screen.getByRole('button', { name: /더 보기/ });
      expect(expandBtn).toBeInTheDocument();

      // Only 20 items shown
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(20);
    });

    it('shows all Glob items when expanded', () => {
      const manyFiles = Array.from({ length: 25 }, (_, i) => `file-${i + 1}.ts`).join('\n');
      render(
        <ToolResultRenderer toolName="Glob" result={manyFiles} />
      );

      fireEvent.click(screen.getByRole('button', { name: /더 보기/ }));

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(25);
    });

    it('shows "more" for Bash with long output', () => {
      render(
        <ToolResultRenderer
          toolName="Bash"
          toolInput={{ command: 'cat bigfile' }}
          result={longContent}
        />
      );

      expect(screen.getByRole('button', { name: /더 보기/ })).toBeInTheDocument();
    });

    it('truncates by char count when content exceeds PREVIEW_MAX_CHARS', () => {
      const longChars = 'x'.repeat(2500);
      render(
        <ToolResultRenderer toolName="Grep" result={longChars} />
      );

      expect(screen.getByRole('button', { name: /더 보기/ })).toBeInTheDocument();
    });
  });
});
