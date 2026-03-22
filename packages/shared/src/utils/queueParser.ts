import type { QueueItem, QueueParseResult, QueueParseWarning } from '../types/queue.js';

/** Convert QueueItem[] back into script text (inverse of parseQueueScript) */
export function serializeQueueItems(items: QueueItem[]): string {
  return items.map(item => {
    if (item.isBreakpoint) {
      return item.prompt ? `@pause ${item.prompt}` : '@pause';
    }
    if (item.saveSessionName) return `@save ${item.saveSessionName}`;
    if (item.loadSessionName) return `@load ${item.loadSessionName}`;
    if (item.delayMs != null) return `@delay ${item.delayMs}`;
    const parts: string[] = [];
    if (item.isNewSession) parts.push('@new');
    if (item.modelName) parts.push(`@model ${item.modelName}`);
    if (item.prompt) {
      if (item.isMultiline) {
        parts.push(`@(\n${item.prompt}\n@)`);
      } else {
        // Escape @ prefix so parser doesn't treat it as a directive
        parts.push(item.prompt.startsWith('@') ? `\\${item.prompt}` : item.prompt);
      }
    }
    return parts.join('\n');
  }).join('\n');
}

export function parseQueueScript(script: string): QueueParseResult {
  const items: QueueItem[] = [];
  const warnings: QueueParseWarning[] = [];

  if (!script) {
    return { items, warnings };
  }

  const lines = script.split('\n');

  let inMultilineBlock = false;
  let multilineContent: string[] = [];
  let multilineStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Inside multiline block
    if (inMultilineBlock) {
      if (trimmed.toLowerCase() === '@)') {
        items.push({
          prompt: multilineContent.join('\n'),
          isNewSession: false,
          isMultiline: true,
        });
        inMultilineBlock = false;
        multilineContent = [];
      } else {
        multilineContent.push(line);
      }
      continue;
    }

    // Empty line
    if (trimmed === '') {
      continue;
    }

    // Comment line
    if (trimmed.startsWith('#')) {
      continue;
    }

    // Escape handling: \\@ -> literal \@ prompt
    if (trimmed.startsWith('\\\\@')) {
      items.push({
        prompt: trimmed.slice(1), // remove first backslash
        isNewSession: false,
      });
      continue;
    }

    // Escape handling: \@ -> literal @ prompt
    if (trimmed.startsWith('\\@')) {
      items.push({
        prompt: trimmed.slice(1), // remove backslash
        isNewSession: false,
      });
      continue;
    }

    // Directive detection
    if (trimmed.startsWith('@')) {
      const spaceIndex = trimmed.indexOf(' ');
      const directive = spaceIndex === -1
        ? trimmed.toLowerCase()
        : trimmed.slice(0, spaceIndex).toLowerCase();
      const argStr = spaceIndex === -1
        ? ''
        : trimmed.slice(spaceIndex + 1).trim();

      switch (directive) {
        case '@new':
          items.push({
            prompt: '',
            isNewSession: true,
          });
          break;

        case '@save':
          if (!argStr) {
            warnings.push({ line: lineNum, message: '@save requires a session name' });
          } else {
            items.push({
              prompt: '',
              isNewSession: false,
              saveSessionName: argStr,
            });
          }
          break;

        case '@load':
          if (!argStr) {
            warnings.push({ line: lineNum, message: '@load requires a session name' });
          } else {
            items.push({
              prompt: '',
              isNewSession: false,
              loadSessionName: argStr,
            });
          }
          break;

        case '@pause': {
          items.push({
            prompt: argStr,
            isNewSession: false,
            isBreakpoint: true,
          });
          break;
        }

        case '@model':
          if (!argStr) {
            warnings.push({ line: lineNum, message: '@model requires a model name' });
          } else {
            items.push({
              prompt: '',
              isNewSession: false,
              modelName: argStr,
            });
          }
          break;

        case '@delay': {
          const ms = parseInt(argStr, 10);
          if (!argStr || isNaN(ms) || ms <= 0 || !Number.isInteger(ms) || argStr !== String(ms)) {
            warnings.push({ line: lineNum, message: '@delay requires a positive integer value' });
          } else {
            items.push({
              prompt: '',
              isNewSession: false,
              delayMs: ms,
            });
          }
          break;
        }

        case '@(':
          inMultilineBlock = true;
          multilineStartLine = lineNum;
          multilineContent = [];
          break;

        default:
          // Unknown directive
          warnings.push({ line: lineNum, message: `Unknown directive: ${directive}` });
          items.push({
            prompt: trimmed,
            isNewSession: false,
          });
          break;
      }
      continue;
    }

    // Regular line (prompt)
    items.push({
      prompt: trimmed,
      isNewSession: false,
    });
  }

  // Unclosed multiline block
  if (inMultilineBlock) {
    warnings.push({
      line: multilineStartLine,
      message: 'Unclosed multiline block: missing @)',
    });
    items.push({
      prompt: multilineContent.join('\n'),
      isNewSession: false,
      isMultiline: true,
    });
  }

  return { items, warnings };
}
