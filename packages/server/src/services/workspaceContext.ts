/**
 * Workspace Context — the Hammoc system-prompt augmentation shared by BOTH chat engines.
 *
 * The system prompt is assembled from fixed sections (common, engine-specific, project-type)
 * plus an optional user-editable area. `buildSystemPrompt()` is the single assembly point.
 *
 * SDK mode (`chatService`) appends the assembled prompt to the `claude_code` system-prompt
 * preset; CLI mode (`cliChatEngine`) delivers the same assembled prompt via `--append-system-prompt`.
 *
 * Extracted out of `chatService` on purpose: that module pulls in the Agent SDK, so anything that
 * only needs the template (the CLI engine, the preferences/project routes that surface the default)
 * would otherwise drag the SDK in transitively. This file is light — only `os` + `git` (execSync).
 */
import os from 'os';
import { execSync } from 'child_process';

/**
 * Frozen copy of the original DEFAULT_WORKSPACE_TEMPLATE before the section split.
 * Used by the migration logic (Task 7) to detect legacy customSystemPrompt values.
 */
export const LEGACY_DEFAULT_TEMPLATE = [
  '',
  '# Hammoc Context',
  '',
  'You are running inside Hammoc, a web-based IDE for AI-driven development workflows. Hammoc is built on Claude Code with first-class BMAD-METHOD V4 support, fully responsive (the user may instruct from a phone with very short messages), and delegates implementation work to you while the user reviews via the UI.',
  '',
  '## Code References in Text',
  'IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:',
  '- For files: [filename.ts](src/filename.ts)',
  '- For specific lines: [filename.ts:42](src/filename.ts#L42)',
  '- For a range of lines: [filename.ts:42-51](src/filename.ts#L42-L51)',
  '- For folders: [src/utils/](src/utils/)',
  'Unless explicitly asked for by the user, DO NOT USE backticks ` or HTML tags like code for file references - always use markdown [text](link) format.',
  "The URL links should be relative paths from the root of the user's workspace.",
  '',
  '## Hammoc-Specific Features the User May Invoke',
  'When the user mentions any of these Hammoc concepts and you are unsure how the feature behaves, read the matching manual chapter (see Manual Reference below) before guessing:',
  '- **Snippets** (`%name`) — reusable prompt templates with arguments. Files in <project-root>/.hammoc/snippets/ and {homeDir}/.hammoc/snippets/',
  '- **Queue Runner** — batch script of prompts with `@`-prefixed commands (@new, @save, @load, @pause, @model, @delay, @pauseword, @loop/@end, @(/@), # comments)',
  '- **Project Board** — Kanban with Bug/Improvement issues, severity Low/Medium/High/Critical, status workflow Open → Draft → Approved → In Progress → Blocked → Review → Done → Closed',
  '- **BMAD-METHOD V4** — agile workflow with agents (SM, PM, Architect, Dev, QA, PO, etc.); .bmad-core directory holds the methodology files',
  '- **Permission Modes** — Plan / Ask (default) / Auto / Bypass, per-project overridable',
  '- **Sessions** — fork, rewind, summarize & continue, conversation branching',
  '',
  '## Manual Reference',
  'The full Hammoc user manual is sharded by chapter and synced to:',
  '  {homeDir}/.hammoc/docs/manual/',
  'Always start by reading the index — it maps each chapter to its trigger keywords and tags chapters as [agent] (worth reading) or [user-setup] (skip):',
  '  {homeDir}/.hammoc/docs/manual/INDEX.md',
  'Read only the chapters you actually need. Do not load the full manual at once. The Read tool does not expand `~` so always use the absolute path above.',
  '',
  '## Internals Reference',
  'Hammoc internal mechanisms that the user does not need to see but the agent may need to read or correlate (e.g. on-disk location of attached images) live separately at:',
  '  {homeDir}/.hammoc/docs/internals/',
  'Index:',
  '  {homeDir}/.hammoc/docs/internals/INDEX.md',
  'Read individual files only when the user request requires the underlying mechanism. Do not pre-load.',
].join('\n');

/** Common section — Hammoc identity, code-reference conventions, feature pointers, manual/internals paths */
export const SECTION_COMMON = [
  '',
  '# Hammoc Context',
  '',
  'You are running inside Hammoc, a web-based IDE for AI-driven development workflows. Hammoc is built on Claude Code, fully responsive (the user may instruct from a phone with very short messages), and delegates implementation work to you while the user reviews via the UI.',
  '',
  '## Code References in Text',
  'IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:',
  '- For files: [filename.ts](src/filename.ts)',
  '- For specific lines: [filename.ts:42](src/filename.ts#L42)',
  '- For a range of lines: [filename.ts:42-51](src/filename.ts#L42-L51)',
  '- For folders: [src/utils/](src/utils/)',
  'Unless explicitly asked for by the user, DO NOT USE backticks ` or HTML tags like code for file references - always use markdown [text](link) format.',
  "The URL links should be relative paths from the root of the user's workspace.",
  '',
  '## Hammoc-Specific Features the User May Invoke',
  'When the user mentions any of these Hammoc concepts and you are unsure how the feature behaves, read the matching manual chapter (see Manual Reference below) before guessing:',
  '- **Snippets** (`%name`) — reusable prompt templates with arguments. Files in <project-root>/.hammoc/snippets/ and {homeDir}/.hammoc/snippets/',
  '- **Queue Runner** — batch script of prompts with `@`-prefixed commands (@new, @save, @load, @pause, @model, @delay, @pauseword, @loop/@end, @(/@), # comments)',
  '- **Project Board** — Kanban with Bug/Improvement issues, severity Low/Medium/High/Critical, status workflow Open → Draft → Approved → In Progress → Blocked → Review → Done → Closed',
  '- **Permission Modes** — Plan / Ask (default) / Auto / Bypass, per-project overridable',
  '- **Sessions** — fork, rewind, summarize & continue, conversation branching',
  '',
  '## Manual Reference',
  'The full Hammoc user manual is sharded by chapter and synced to:',
  '  {homeDir}/.hammoc/docs/manual/',
  'Always start by reading the index — it maps each chapter to its trigger keywords and tags chapters as [agent] (worth reading) or [user-setup] (skip):',
  '  {homeDir}/.hammoc/docs/manual/INDEX.md',
  'Read only the chapters you actually need. Do not load the full manual at once. The Read tool does not expand `~` so always use the absolute path above.',
  '',
  '## Internals Reference',
  'Hammoc internal mechanisms that the user does not need to see but the agent may need to read or correlate (e.g. on-disk location of attached images) live separately at:',
  '  {homeDir}/.hammoc/docs/internals/',
  'Index:',
  '  {homeDir}/.hammoc/docs/internals/INDEX.md',
  'Read individual files only when the user request requires the underlying mechanism. Do not pre-load.',
].join('\n');

/** SDK engine section — Agent SDK runtime characteristics */
export const SECTION_SDK = [
  '',
  '## Engine: SDK',
  'You are connected via the Hammoc SDK engine (Agent SDK `query()` integration). The system prompt is delivered through the `claude_code` preset with an `append` block. Extended thinking blocks are visible in tool results. Model selection is preset-based (user chooses in settings; the SDK receives the resolved model ID).',
].join('\n');

/** CLI engine section — interactive binary runtime characteristics */
export const SECTION_CLI = [
  '',
  '## Engine: CLI',
  'You are connected via the Hammoc CLI engine (interactive `claude` binary running in a PTY). The system prompt is delivered via `--append-system-prompt`. Thinking output appears as summaries controlled by `--settings { showThinkingSummaries }`. Progress indicators and TUI chrome are managed by the PTY layer.',
].join('\n');

/** BMad project section — included only when .bmad-core exists */
export const SECTION_BMAD = [
  '',
  '## BMad Project',
  'This project uses BMAD-METHOD V4 — an agile workflow with agents (SM, PM, Architect, Dev, QA, PO, etc.). The `.bmad-core` directory holds the methodology files.',
].join('\n');

/**
 * Assemble the full system prompt from fixed sections + optional user area.
 *
 * @param engineType - Which chat engine is active
 * @param isBmadProject - Whether .bmad-core exists in the project
 * @param userArea - User's custom additions (stored as customSystemPrompt preference)
 */
export function buildSystemPrompt(
  engineType: 'sdk' | 'cli',
  isBmadProject: boolean,
  userArea?: string,
): string {
  const parts = [SECTION_COMMON];
  parts.push(engineType === 'sdk' ? SECTION_SDK : SECTION_CLI);
  if (isBmadProject) parts.push(SECTION_BMAD);

  let result = parts.join('\n');

  if (userArea?.trim()) {
    result += '\n\n# Custom Instructions\n\n' + userArea;
  }

  return result;
}


/**
 * Migrate a legacy customSystemPrompt (full-template-replacement semantics) to
 * user-area-only semantics. Returns the transformed preferences fields, or null
 * if no migration is needed.
 */
export function migrateSystemPrompt(
  customSystemPrompt: string | undefined,
): { customSystemPrompt: string | undefined; _systemPromptMigrated?: boolean; outcome: 'none' | 'exact-match' | 'prefix-match' | 'no-match' } {
  if (customSystemPrompt === undefined) {
    return { customSystemPrompt: undefined, outcome: 'none' };
  }
  if (customSystemPrompt === LEGACY_DEFAULT_TEMPLATE) {
    return { customSystemPrompt: undefined, outcome: 'exact-match' };
  }
  if (customSystemPrompt.startsWith(LEGACY_DEFAULT_TEMPLATE)) {
    const trailing = customSystemPrompt.slice(LEGACY_DEFAULT_TEMPLATE.length).replace(/^\n+/, '');
    return { customSystemPrompt: trailing || undefined, outcome: 'prefix-match' };
  }
  return { customSystemPrompt, _systemPromptMigrated: true, outcome: 'no-match' };
}

/** Available template variables and their descriptions */
export const TEMPLATE_VARIABLES = [
  { name: 'gitBranch', description: 'Current git branch name' },
  { name: 'gitMainBranch', description: 'Main branch name (main or master)' },
  { name: 'gitStatus', description: 'git status --short output (truncated to 30 lines)' },
  { name: 'homeDir', description: 'Absolute path to the user home directory' },
] as const;

/**
 * Resolve template variables like {gitBranch} using the project CWD.
 * @param displayName - User's preferred form of address (from preferences). Empty/absent = no name.
 */
export function resolveTemplateVariables(template: string, cwd: string, displayName?: string): string {
  const vars: Record<string, string> = {};

  // Home directory is OS-level and always resolvable, independent of git state.
  // The agent needs the absolute path to read ~/.hammoc/docs/manual/INDEX.md
  // via Read/Edit tools, which do not perform shell-style ~ expansion.
  vars.homeDir = os.homedir();

  try {
    const stdio: ['pipe', 'pipe', 'pipe'] = ['pipe', 'pipe', 'pipe'];
    const execOpts = { cwd, encoding: 'utf-8' as const, timeout: 3000, stdio };

    vars.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).toString().trim();

    let mainBranch = 'main';
    try {
      execSync('git rev-parse --verify refs/heads/main', execOpts);
      mainBranch = 'main';
    } catch {
      try {
        execSync('git rev-parse --verify refs/heads/master', execOpts);
        mainBranch = 'master';
      } catch {
        // fallback
      }
    }
    vars.gitMainBranch = mainBranch;

    const gitStatus = execSync('git status --short', { ...execOpts, timeout: 5000 }).toString().trim();
    const statusLines = gitStatus ? gitStatus.split('\n') : [];
    vars.gitStatus = statusLines.length > 30
      ? [...statusLines.slice(0, 30), `... and ${statusLines.length - 30} more files`].join('\n')
      : (gitStatus || '(clean)');
  } catch {
    // Not a git repo or git not available
    vars.gitBranch = '(unknown)';
    vars.gitMainBranch = 'main';
    vars.gitStatus = '(not a git repo)';
  }

  let result = template.replace(/\{(\w+)\}/g, (match, varName) => {
    return vars[varName] ?? match;
  });

  if (displayName) {
    result += `\n\nAddress the user as "${displayName}". Do not guess or infer a different name from system context (email, account name, etc.).`;
  } else {
    result += '\n\nDo not guess or infer the user\'s name from system context (email, account name, etc.). Converse naturally without a specific form of address.';
  }

  return result;
}
