/**
 * MarkdownRenderer - Renders markdown content with syntax highlighting
 * Story 4.4: Markdown Rendering - Task 3
 * Story 4.5: Real-time Streaming - Task 4 (streaming optimization)
 *
 * Features:
 * - GitHub Flavored Markdown support
 * - Syntax-highlighted code blocks
 * - Styled inline code
 * - Links open in new tabs
 * - Responsive tables
 * - XSS protection (built into react-markdown)
 * - Throttled rendering during streaming (50ms leading+trailing)
 * - Incomplete code block handling during streaming
 */

import { memo, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { useThrottle } from '../hooks/useThrottle';
import { useFileStore } from '../stores/fileStore';
import { useImageViewerStore } from '../stores/imageViewerStore';
import { useMessageStore } from '../stores/messageStore';
import { isImagePath } from '../utils/languageDetect';

/**
 * Check if a URL is an external link (not a relative file path).
 * External: http(s), mailto, tel, ftp, data, javascript, blob, ws(s) protocols, protocol-relative, anchors
 * Non-external: relative paths like "src/app.ts", "./README.md", "docs/guide.md"
 */
function isExternalUrl(href: string): boolean {
  return /^(?:https?|mailto|tel|ftp|data|javascript|blob|wss?):/i.test(href)
    || href.startsWith('//')
    || href.startsWith('#');
}

interface MarkdownRendererProps {
  /** Markdown content to render */
  content: string;
  /** Whether the content is currently streaming */
  isStreaming?: boolean;
  /** Callback when code block is copied */
  onCodeCopy?: (code: string) => void;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming = false,
  onCodeCopy,
}: MarkdownRendererProps) {
  const { t } = useTranslation('chat');
  // Throttle content during streaming (~20fps), immediate when complete.
  // Throttle (leading + trailing) renders the first change instantly, then
  // coalesces updates for 50ms — unlike debounce which never fires during
  // continuous input and causes "burst rendering".
  const throttledContent = useThrottle(content, isStreaming ? 50 : 0);

  // Process content for incomplete code blocks during streaming
  const processedContent = useMemo(() => {
    if (!isStreaming) return throttledContent;

    // Check for unclosed code blocks
    const codeBlockPattern = /```/g;
    const matches = throttledContent.match(codeBlockPattern) || [];

    // If odd number of ```, add closing ```
    if (matches.length % 2 !== 0) {
      return throttledContent + '\n```';
    }

    return throttledContent;
  }, [throttledContent, isStreaming]);

  // Memoize components object to prevent unnecessary re-renders
  const components = useMemo<Components>(
    () => ({
      // Code block or inline code
      code({ className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : undefined;
        const codeString = String(children).replace(/\n$/, '');

        // Determine if this is a code block or inline code
        // Code block: has language class OR contains newlines
        const hasLanguage = Boolean(className);
        const hasNewline = String(children).includes('\n');
        const isCodeBlock = hasLanguage || hasNewline;

        if (!isCodeBlock) {
          // Inline code
          return (
            <code
              className="bg-gray-100 dark:bg-[#253040] px-1.5 py-0.5 rounded text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          );
        }

        // Code block
        return <CodeBlock code={codeString} language={language} onCopy={onCodeCopy} />;
      },

      // Pre tag - CodeBlock handles its own wrapper
      pre({ children }) {
        return <>{children}</>;
      },

      // Links - file links open in editor, external links in new tab
      a({ href, children, ...props }) {
        // File link: relative path (not external URL)
        if (href && !isExternalUrl(href)) {
          // Parse fragment: #L42 or #L42-L51
          const hashIdx = href.indexOf('#');
          const filePath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
          let targetLine: number | undefined;
          if (hashIdx >= 0) {
            const fragment = href.slice(hashIdx + 1);
            const lineMatch = fragment.match(/^L(\d+)/);
            if (lineMatch) targetLine = parseInt(lineMatch[1], 10);
          }

          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                const projectSlug = useMessageStore.getState().currentProjectSlug;
                if (!projectSlug) return;
                if (isImagePath(filePath)) {
                  useImageViewerStore.getState().openImageViewer(projectSlug, filePath);
                } else {
                  useFileStore.getState().requestFileNavigation(projectSlug, filePath, targetLine);
                }
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              title={t('markdown.openFile', { href })}
              {...props}
            >
              {children}
            </a>
          );
        }

        // External link: open in new tab (existing behavior)
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
            {...props}
          >
            {children}
          </a>
        );
      },

      // Table - responsive with horizontal scroll
      table({ children }) {
        return (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
              {children}
            </table>
          </div>
        );
      },

      th({ children }) {
        return (
          <th className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-[#263240] px-4 py-2 text-left font-semibold">
            {children}
          </th>
        );
      },

      td({ children }) {
        return (
          <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
            {children}
          </td>
        );
      },

      // Headings with appropriate sizing and margins
      h1({ children }) {
        return (
          <h1 className="text-2xl font-bold mt-6 mb-4 first:mt-0">{children}</h1>
        );
      },

      h2({ children }) {
        return (
          <h2 className="text-xl font-bold mt-5 mb-3 first:mt-0">{children}</h2>
        );
      },

      h3({ children }) {
        return (
          <h3 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h3>
        );
      },

      h4({ children }) {
        return (
          <h4 className="text-base font-semibold mt-3 mb-2 first:mt-0">{children}</h4>
        );
      },

      h5({ children }) {
        return (
          <h5 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h5>
        );
      },

      h6({ children }) {
        return (
          <h6 className="text-sm font-medium mt-2 mb-1 first:mt-0">{children}</h6>
        );
      },

      // Lists with proper indentation
      ul({ children }) {
        return <ul className="list-disc list-outside pl-5 my-2 space-y-1">{children}</ul>;
      },

      ol({ children }) {
        return <ol className="list-decimal list-outside pl-5 my-2 space-y-1">{children}</ol>;
      },

      li({ children }) {
        return <li className="[&>p]:inline [&>p]:my-0">{children}</li>;
      },

      // Paragraph
      p({ children }) {
        return <p className="my-2 first:mt-0 last:mb-0">{children}</p>;
      },

      // Blockquote
      blockquote({ children }) {
        return (
          <blockquote className="border-l-4 border-gray-300 dark:border-[#455568] pl-4 my-4 italic text-gray-700 dark:text-gray-200">
            {children}
          </blockquote>
        );
      },

      // Horizontal rule
      hr() {
        return <hr className="my-2 border-gray-300 dark:border-gray-600" />;
      },

      // Strong (bold)
      strong({ children }) {
        return <strong className="font-bold">{children}</strong>;
      },

      // Emphasis (italic)
      em({ children }) {
        return <em className="italic">{children}</em>;
      },
    }),
    [onCodeCopy, t]
  );

  // Intercept copy to strip HTML tags from clipboard
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    e.preventDefault();
    const plainText = selection.toString();
    e.clipboardData.setData('text/plain', plainText);
  }, []);

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none break-words [&_code]:before:content-none [&_code]:after:content-none [&_hr]:my-2"
      onCopy={handleCopy}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
});
