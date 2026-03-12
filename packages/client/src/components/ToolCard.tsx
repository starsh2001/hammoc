/**
 * ToolCard - Unified tool call card for both streaming and history
 * Renders identical UI regardless of data source (StreamingSegment or HistoryMessage).
 * [Source: Story 3.5/4.8 refactor - Unified tool card]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, AlertCircle, ChevronRight, ChevronDown, Loader2, Files, ExternalLink, ShieldCheck, ShieldX } from 'lucide-react';
import { ToolPathDisplay } from './ToolPathDisplay';
import { DiffViewer } from './DiffViewer';
import { ToolResultRenderer } from './ToolResultRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { getToolIcon, getToolDisplayName, getToolDisplayInfo, formatDuration } from '../utils/toolUtils';
import { openProjectFile } from '../utils/fileOpenUtils';
import { isImagePath } from '../utils/languageDetect';
import { useProjectStore } from '../stores/projectStore';

export interface ToolCardProps {
  toolName: string;
  toolInput?: Record<string, unknown>;
  status: 'pending' | 'completed' | 'error' | 'denied';
  /** Real-time timer start (ms timestamp, streaming pending only) */
  startedAt?: number;
  /** Final duration in ms (streaming completed) */
  duration?: number;
  /** Tool output text */
  output?: string;
  /** Merged result output for collapsible display (Bash/Grep history) */
  resultOutput?: string;
  /** Whether the denial was user-initiated (vs tool failure) */
  isUserDenied?: boolean;
  /** Permission request status (streaming only) */
  permissionStatus?: 'waiting' | 'approved' | 'denied';
  /** Callback when user responds to permission request */
  onPermissionRespond?: (approved: boolean) => void;
  /** Callback for ExitPlanMode: approve with specific permission mode */
  onPlanModeExit?: (mode: 'bypassPermissions' | 'acceptEdits' | 'default') => void;
}

/** Real-time elapsed timer for pending tool calls */
function ToolTimer({ startedAt, hidden }: { startedAt: number; hidden?: boolean }) {
  const { t } = useTranslation('chat');
  const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);
  const pausedAtRef = useRef<number | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (hidden) {
      // Pause: remember when we paused
      pausedAtRef.current = Date.now();
      return;
    }
    // Resume: accumulate paused duration
    if (pausedAtRef.current != null) {
      offsetRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt - offsetRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, hidden]);

  if (hidden) return null;

  return (
    <span className="text-xs text-gray-400 dark:text-gray-400 ml-auto" aria-label={t('tool.executionTime', { duration: formatDuration(elapsed) })}>
      {formatDuration(elapsed)}
    </span>
  );
}

/** Collapsible tool result section */
function CollapsibleResult({ toolName, toolInput, result }: { toolName: string; toolInput?: Record<string, unknown>; result: string }) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 border-t border-gray-200 dark:border-[#2d3a4a] pt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
        <span>{t('tool.showResult')}</span>
      </button>
      {expanded && (
        <div className="mt-1">
          <ToolResultRenderer toolName={toolName} toolInput={toolInput} result={result} />
        </div>
      )}
    </div>
  );
}

/** Extract diff data from Edit/Write tool input */
function extractDiffData(toolName: string, toolInput?: Record<string, unknown>) {
  const filePath = typeof toolInput?.file_path === 'string' ? toolInput.file_path : '';
  if (toolName === 'Edit') {
    const original = typeof toolInput?.old_string === 'string' ? toolInput.old_string : '';
    const modified = typeof toolInput?.new_string === 'string' ? toolInput.new_string : '';
    return { filePath, original, modified };
  }
  // Write
  const modified = typeof toolInput?.content === 'string' ? toolInput.content : '';
  return { filePath, original: '', modified };
}

/** Compute approximate line changes */
function computeLineChanges(original: string, modified: string): { added: number; removed: number } {
  const countLines = (s: string) => (s ? s.split('\n').length : 0);
  return {
    added: countLines(modified),
    removed: countLines(original),
  };
}

/** Strip SDK XML wrapper tags (e.g. <tool_use_error>...</tool_use_error>) from tool output */
function stripXmlWrapperTags(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.replace(/<\/?(?:tool_use_error|error|result)>/g, '').trim();
}

/** ExitPlanMode: collapsible plan content and allowed prompts */
function ExitPlanModeContent({
  planContent,
  allowedPrompts,
  defaultExpanded = true,
}: {
  planContent: string | null;
  allowedPrompts: Array<{ tool: string; prompt: string }> | null;
  defaultExpanded?: boolean;
}) {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mt-2 border-t border-gray-200 dark:border-[#2d3a4a] pt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="w-3 h-3" aria-hidden="true" /> : <ChevronRight className="w-3 h-3" aria-hidden="true" />}
        <span>{t('tool.plan')}</span>
      </button>
      {expanded && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded border border-gray-200 dark:border-[#2d3a4a] bg-white dark:bg-[#1c2129] p-2">
          {planContent ? (
            <div className="text-xs">
              <MarkdownRenderer content={planContent} />
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-400 italic">
              {t('tool.planEmpty')}
            </p>
          )}
        </div>
      )}

      {allowedPrompts && allowedPrompts.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-gray-500 dark:text-gray-300 font-medium mb-1">
            {t('tool.requestedPermissions')}
          </p>
          <ul className="space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
            {allowedPrompts.map((ap, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="flex-shrink-0 mt-0.5">·</span>
                <span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">{ap.tool}</span>
                  {ap.prompt && <span className="ml-1 text-gray-500">— {ap.prompt}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ToolCard({
  toolName,
  toolInput,
  status,
  startedAt,
  duration,
  output: rawOutput,
  resultOutput: rawResultOutput,
  isUserDenied,
  permissionStatus,
  onPermissionRespond,
  onPlanModeExit,
}: ToolCardProps) {
  const { t } = useTranslation('chat');
  const { projectSlug } = useParams<{ projectSlug: string }>();
  const output = stripXmlWrapperTags(rawOutput);
  const resultOutput = stripXmlWrapperTags(rawResultOutput);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [isPathExpanded, setIsPathExpanded] = useState(false);

  const toolDisplayName = getToolDisplayName(toolName);
  const displayInfo = getToolDisplayInfo(toolName, toolInput);
  const ToolIcon = getToolIcon(toolName);

  const isEditWrite = toolName === 'Edit' || toolName === 'Write';
  const diffData = isEditWrite ? extractDiffData(toolName, toolInput) : null;
  const lineChanges = diffData ? computeLineChanges(diffData.original, diffData.modified) : null;

  // Open file in editor panel
  const projectRoot = useProjectStore((s) => {
    const proj = s.projects.find((p) => p.projectSlug === projectSlug);
    return proj?.originalPath || '';
  });

  const handleOpenFile = useCallback(() => {
    const filePath = diffData?.filePath;
    if (!filePath || !projectSlug) return;
    openProjectFile(projectSlug, filePath, projectRoot);
  }, [diffData?.filePath, projectSlug, projectRoot]);

  const isDenied = status === 'denied';
  const isError = status === 'error';
  const isPending = status === 'pending';
  const isCompleted = status === 'completed';

  // ExitPlanMode: plan content and allowed prompts
  const isExitPlanMode = toolName === 'ExitPlanMode';
  const planContent = isExitPlanMode && typeof toolInput?.plan === 'string' ? toolInput.plan : null;
  const allowedPrompts = isExitPlanMode && Array.isArray(toolInput?.allowedPrompts)
    ? (toolInput!.allowedPrompts as Array<{ tool: string; prompt: string }>)
    : null;

  // TodoWrite checklist
  const todos = toolName === 'TodoWrite' && Array.isArray(toolInput?.todos)
    ? (toolInput!.todos as Array<{ content: string; status: string }>)
    : null;

  // Collapsible result: for completed tools except Edit/Write/TodoWrite
  const showCollapsibleResult = isCompleted && output && !isEditWrite && toolName !== 'TodoWrite';

  // Bash/Grep/Glob result output (from history merged result)
  const showResultOutput = (toolName === 'Grep' || toolName === 'Bash' || toolName === 'Glob') && resultOutput;

  // Bash additionalParams for ToolPathDisplay (streaming completed)
  const bashAdditionalParams = toolName === 'Bash' && isCompleted && output
    ? [{ label: 'OUT', value: output }]
    : undefined;

  return (
    <>
      <div
        className="flex justify-start"
        role="listitem"
        aria-label={
          isDenied
            ? t('tool.rejectedAria', { name: toolDisplayName })
            : isError
              ? t('tool.failedAria', { name: toolDisplayName })
              : isPending
                ? t('tool.runningAria', { name: toolDisplayName })
                : t('tool.completedAria', { name: toolDisplayName })
        }
      >
        <div data-tool-card className={`max-w-[80%] bg-gray-100 dark:bg-[#263240] rounded-lg p-3 border ${
          isDenied || isError ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-[#253040]'
        }`}>
          {/* Header: icon + name + status + duration */}
          <div className="flex items-center gap-2">
            <ToolIcon className="w-4 h-4 text-blue-500" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {toolDisplayName}
            </span>
            {isDenied ? (
              <>
                <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
                <span className="text-xs text-red-500 dark:text-red-400">
                  {isUserDenied ? t('tool.rejected') : t('tool.failed')}
                </span>
              </>
            ) : isError ? (
              <XCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
            ) : isPending ? (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
            )}
            {/* Duration display */}
            {!isPending && duration != null && (
              <span className="text-xs text-gray-400 dark:text-gray-400 ml-auto" aria-label={t('tool.executionTime', { duration: formatDuration(duration) })}>
                {formatDuration(duration)}
              </span>
            )}
            {isPending && startedAt != null && (
              <ToolTimer startedAt={startedAt} hidden={permissionStatus !== undefined && permissionStatus !== 'approved'} />
            )}
          </div>

          {/* Path display for non-Edit/Write tools */}
          {displayInfo && !isEditWrite && (
            <ToolPathDisplay
              displayInfo={displayInfo}
              toolName={toolName}
              toolInput={toolInput}
              additionalParams={bashAdditionalParams}
            />
          )}

          {/* Edit/Write: collapsible file path + open in editor + diff button */}
          {isEditWrite && diffData && lineChanges && (
            <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-300 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPathExpanded(!isPathExpanded)}
                className="flex items-center gap-0.5 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left flex-shrink-0"
                aria-expanded={isPathExpanded}
                aria-label={isPathExpanded ? t('tool.collapse') : t('tool.showFullPath')}
              >
                {isPathExpanded ? (
                  <ChevronDown className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={handleOpenFile}
                className={`hover:text-blue-500 dark:hover:text-blue-400 hover:underline transition-colors text-left min-w-0 ${isPathExpanded ? 'break-all' : 'truncate'}`}
                title={diffData.filePath && isImagePath(diffData.filePath)
                  ? t('tool.openImage', { defaultValue: 'Open image' })
                  : t('tool.openInEditor', { defaultValue: 'Open in editor' })}
              >
                {isPathExpanded ? diffData.filePath : diffData.filePath.split(/[/\\]/).pop() || diffData.filePath}
              </button>
              <button
                onClick={() => setShowDiffViewer(true)}
                className="group flex items-center gap-0.5 whitespace-nowrap hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                aria-label={t('tool.showDiff')}
                title={t('tool.clickToShowDiff')}
              >
                <span className="text-green-600 dark:text-green-400">+{lineChanges.added}</span>
                <span className="text-gray-400">/</span>
                <span className="text-red-600 dark:text-red-400">-{lineChanges.removed}</span>
                <Files className="w-3.5 h-3.5 ml-1.5 text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 group-hover:scale-110 transition-all" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* TodoWrite checklist */}
          {todos && todos.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
              {todos.map((todo, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="flex-shrink-0 mt-0.5">
                    {todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '▸' : '○'}
                  </span>
                  <span className={todo.status === 'completed' ? 'line-through opacity-60' : ''}>
                    {todo.content}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Collapsible result (streaming completed) */}
          {showCollapsibleResult && (
            <CollapsibleResult toolName={toolName} toolInput={toolInput} result={output!} />
          )}

          {/* Collapsible result output (history Bash/Grep) */}
          {showResultOutput && (
            <CollapsibleResult toolName={toolName} toolInput={toolInput} result={resultOutput!} />
          )}

          {/* Error display */}
          {isError && (
            <div className="mt-2 text-xs text-red-500 border-t border-gray-200 dark:border-[#2d3a4a] pt-2 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {output ? output.slice(0, 500) : t('common:error.unknownError')}
            </div>
          )}

          {/* ExitPlanMode: plan content display */}
          {isExitPlanMode && (
            <ExitPlanModeContent
              planContent={planContent}
              allowedPrompts={allowedPrompts}
              defaultExpanded
            />
          )}

          {/* ExitPlanMode: mode selection buttons */}
          {permissionStatus === 'waiting' && isExitPlanMode && onPlanModeExit && onPermissionRespond && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-200 dark:border-[#2d3a4a] pt-2">
              <button
                type="button"
                onClick={() => onPlanModeExit('default')}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded border border-green-200 dark:border-green-800 transition-colors"
                aria-label={t('tool.approveAsk')}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                {t('tool.yesAsk')}
              </button>
              <button
                type="button"
                onClick={() => onPlanModeExit('acceptEdits')}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded border border-green-200 dark:border-green-800 transition-colors"
                aria-label={t('tool.approveAuto')}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                {t('tool.yesAuto')}
              </button>
              <button
                type="button"
                onClick={() => onPlanModeExit('bypassPermissions')}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded border border-green-200 dark:border-green-800 transition-colors"
                aria-label={t('tool.approveBypass')}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                {t('tool.yesBypass')}
              </button>
              <button
                type="button"
                onClick={() => onPermissionRespond(false)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded border border-red-200 dark:border-red-800 transition-colors"
                aria-label={t('tool.rejectContinuePlanning')}
              >
                <ShieldX className="w-3.5 h-3.5" aria-hidden="true" />
                No
              </button>
            </div>
          )}

          {/* Permission approve/deny buttons (non-ExitPlanMode tools) */}
          {permissionStatus === 'waiting' && !isExitPlanMode && onPermissionRespond && (
            <div className="mt-2 flex items-center gap-2 border-t border-gray-200 dark:border-[#2d3a4a] pt-2">
              <button
                type="button"
                onClick={() => onPermissionRespond(true)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 rounded border border-green-200 dark:border-green-800 transition-colors"
                aria-label={t('tool.allowTool')}
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                {t('tool.allow')}
              </button>
              <button
                type="button"
                onClick={() => onPermissionRespond(false)}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 rounded border border-red-200 dark:border-red-800 transition-colors"
                aria-label={t('tool.denyTool')}
              >
                <ShieldX className="w-3.5 h-3.5" aria-hidden="true" />
                {t('tool.deny')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen DiffViewer for Edit/Write */}
      {showDiffViewer && diffData && (
        <DiffViewer
          filePath={diffData.filePath}
          original={diffData.original}
          modified={diffData.modified}
          fullscreen={true}
          responsiveLayout={true}
          onClose={() => setShowDiffViewer(false)}
          onReopen={() => setShowDiffViewer(true)}
          readOnly={true}
        />
      )}
    </>
  );
}
