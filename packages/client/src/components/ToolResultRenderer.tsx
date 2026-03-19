/**
 * ToolResultRenderer - Tool result display by tool type
 * [Source: Story 7.3 - Task 1, Task 2]
 *
 * Renders tool execution results with type-specific formatting:
 * - Read: Syntax-highlighted code block (file extension-based language detection)
 * - Bash: Command header + output code block
 * - Glob: File path list
 * - Grep: Single code block with raw output
 * - Others: Plain text fallback
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { CodeBlock } from './CodeBlock';

const PREVIEW_MAX_LINES = 20;
const PREVIEW_MAX_CHARS = 2000;
const GLOB_PREVIEW_MAX_ITEMS = 20;

interface ToolResultRendererProps {
  toolName: string;
  toolInput?: Record<string, unknown>;
  result?: string;
}

/** Map file extension to language name for syntax highlighting */
function getLanguageFromPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const ext = filePath.split('.').pop()?.toLowerCase();
  const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    html: 'html', css: 'css', scss: 'scss', sql: 'sql', sh: 'bash',
    c: 'c', cpp: 'cpp', cc: 'cpp', rb: 'ruby', php: 'php',
    swift: 'swift', kt: 'kotlin', xml: 'xml', toml: 'toml',
  };
  return EXT_TO_LANG[ext ?? ''];
}

/** Check if content exceeds preview limits */
function shouldTruncate(content: string): boolean {
  return content.split('\n').length > PREVIEW_MAX_LINES || content.length > PREVIEW_MAX_CHARS;
}

/** Get preview of content (first N lines) */
function getPreview(content: string): string {
  return content.split('\n').slice(0, PREVIEW_MAX_LINES).join('\n');
}

/** Expand/collapse button */
function ExpandButton({ expanded, onToggle, totalCount }: { expanded: boolean; onToggle: () => void; totalCount?: number }) {
  const { t } = useTranslation('chat');
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 mt-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
      aria-expanded={expanded}
    >
      {expanded ? (
        <>
          <ChevronUp className="w-3 h-3" aria-hidden="true" />
          {t('tool.collapseContent')}
        </>
      ) : (
        <>
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
          {totalCount != null ? t('tool.showMore', { count: totalCount }) : t('tool.showMoreSimple')}
        </>
      )}
    </button>
  );
}

/** Read tool: syntax-highlighted code block with file extension language detection */
function ReadResult({ result, toolInput }: { result: string; toolInput?: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : undefined;
  const language = getLanguageFromPath(filePath);
  const truncated = shouldTruncate(result);
  const displayContent = !expanded && truncated ? getPreview(result) : result;

  return (
    <div data-testid="tool-result-read">
      <CodeBlock code={displayContent} language={language} />
      {truncated && (
        <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      )}
    </div>
  );
}

/** Bash tool: command header + output code block */
function BashResult({ result, toolInput }: { result: string; toolInput?: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const command = typeof toolInput?.command === 'string' ? toolInput.command : undefined;
  const truncated = shouldTruncate(result);
  const displayContent = !expanded && truncated ? getPreview(result) : result;

  // Prepend command as header
  const codeContent = command ? `$ ${command}\n${displayContent}` : displayContent;

  return (
    <div data-testid="tool-result-bash">
      <CodeBlock code={codeContent} language="bash" />
      {truncated && (
        <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      )}
    </div>
  );
}

/** Glob tool: file path list */
function GlobResult({ result }: { result: string }) {
  const [expanded, setExpanded] = useState(false);
  const files = result.split('\n').filter(Boolean);
  const truncated = files.length > GLOB_PREVIEW_MAX_ITEMS;
  const displayFiles = !expanded && truncated ? files.slice(0, GLOB_PREVIEW_MAX_ITEMS) : files;

  return (
    <div data-testid="tool-result-glob">
      <ul className="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
        {displayFiles.map((file, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            <span className="truncate font-mono">{file}</span>
          </li>
        ))}
      </ul>
      {truncated && (
        <ExpandButton
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
          totalCount={files.length}
        />
      )}
    </div>
  );
}

/** Grep tool: single code block with raw output */
function GrepResult({ result }: { result: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = shouldTruncate(result);
  const displayContent = !expanded && truncated ? getPreview(result) : result;

  return (
    <div data-testid="tool-result-grep">
      <CodeBlock code={displayContent} language="text" />
      {truncated && (
        <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      )}
    </div>
  );
}

/** Default fallback: plain text */
function DefaultResult({ result }: { result: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = shouldTruncate(result);
  const displayContent = !expanded && truncated ? getPreview(result) : result;

  return (
    <div data-testid="tool-result-default">
      <pre className="mt-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words font-mono">
        {displayContent}
      </pre>
      {truncated && (
        <ExpandButton expanded={expanded} onToggle={() => setExpanded(!expanded)} />
      )}
    </div>
  );
}

export function ToolResultRenderer({ toolName, toolInput, result }: ToolResultRendererProps) {
  if (!result) return null;

  switch (toolName) {
    case 'Read':
      return <ReadResult result={result} toolInput={toolInput} />;
    case 'Bash':
      return <BashResult result={result} toolInput={toolInput} />;
    case 'Glob':
      return <GlobResult result={result} />;
    case 'Grep':
      return <GrepResult result={result} />;
    default:
      return <DefaultResult result={result} />;
  }
}
