/**
 * CodeBlock - Syntax highlighted code block component
 * Story 4.4: Markdown Rendering - Task 2
 *
 * Features:
 * - Shiki-powered syntax highlighting
 * - Copy to clipboard with feedback
 * - Language detection and display
 * - Dark/light theme support
 */

import { memo, useState, useEffect, useCallback } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { getHighlighter, isSupportedLanguage } from '../utils/shiki';

interface CodeBlockProps {
  /** Code content to display */
  code: string;
  /** Programming language for syntax highlighting */
  language?: string;
  /** Callback when code is copied */
  onCopy?: (code: string) => void;
}

type CopyState = 'idle' | 'copied' | 'error';

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  onCopy,
}: CodeBlockProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  // Normalize language name
  const normalizedLang = language?.toLowerCase() || 'text';
  const displayLang = language || 'text';

  // Shiki highlighting effect
  useEffect(() => {
    let mounted = true;

    async function highlight() {
      try {
        setIsLoading(true);
        const highlighter = await getHighlighter();

        if (!mounted) return;

        // Use supported language or fallback to 'text'
        const lang = isSupportedLanguage(normalizedLang) ? normalizedLang : 'text';
        const shikiTheme = isDark ? 'github-dark' : 'github-light';

        const html = highlighter.codeToHtml(code, {
          lang,
          theme: shikiTheme,
        });

        setHighlightedHtml(html);
      } catch (err) {
        console.error('Shiki highlighting failed:', err);
        if (mounted) {
          setHighlightedHtml(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    highlight();
    return () => {
      mounted = false;
    };
  }, [code, normalizedLang, isDark]);

  // Copy handler
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(code);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyState('copied');
      onCopy?.(code);
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [code, onCopy]);

  // Get aria-label based on copy state
  const getCopyAriaLabel = () => {
    switch (copyState) {
      case 'copied':
        return '복사됨';
      case 'error':
        return '복사 실패';
      default:
        return '코드 복사';
    }
  };

  // Render copy button icon
  const renderCopyIcon = () => {
    switch (copyState) {
      case 'copied':
        return <Check size={16} aria-hidden="true" />;
      case 'error':
        return <X size={16} aria-hidden="true" />;
      default:
        return <Copy size={16} aria-hidden="true" />;
    }
  };

  // Fallback rendering for loading or error states
  const renderFallback = () => (
    <pre
      className={`p-4 overflow-x-auto font-mono text-sm ${
        isDark ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      <code>{code}</code>
    </pre>
  );

  return (
    <div
      data-testid="code-block"
      role="region"
      aria-label={`${displayLang} 코드 블록`}
      className={`relative group rounded-lg overflow-hidden my-4 ${
        isDark ? 'bg-gray-900' : 'bg-gray-50'
      }`}
    >
      {/* Header with language and copy button */}
      <div
        className={`flex items-center justify-between px-4 py-2 text-xs ${
          isDark
            ? 'bg-gray-800 text-gray-400 border-b border-gray-700'
            : 'bg-gray-200 text-gray-600 border-b border-gray-300'
        }`}
      >
        <span aria-hidden="false">{displayLang}</span>
        <button
          onClick={handleCopy}
          aria-label={getCopyAriaLabel()}
          title={getCopyAriaLabel()}
          className={`p-1.5 rounded transition-all duration-200
            opacity-0 group-hover:opacity-100 focus:opacity-100
            md:opacity-0 md:group-hover:opacity-100
            max-md:opacity-100
            ${
              copyState === 'error'
                ? 'text-red-500'
                : copyState === 'copied'
                  ? 'text-green-500'
                  : isDark
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-300'
            }
          `}
        >
          {renderCopyIcon()}
        </button>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto">
        {isLoading || !highlightedHtml ? (
          renderFallback()
        ) : (
          <div
            className="shiki-container [&>pre]:p-4 [&>pre]:m-0 [&>pre]:overflow-x-auto [&>pre]:text-sm"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        )}
      </div>
    </div>
  );
});
