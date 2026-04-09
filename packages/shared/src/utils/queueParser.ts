import type { QueueItem, QueueParseResult, QueueParseWarning } from '../types/queue.js';

/** Convert QueueItem[] back into script text (inverse of parseQueueScript) */
export function serializeQueueItems(items: QueueItem[]): string {
  return items.map(item => {
    if (item.loop) {
      const parts: string[] = [];
      let header = `@loop max=${item.loop.max}`;
      if (item.loop.until != null) header += ` until="${item.loop.until}"`;
      if (item.loop.onExceed !== 'pause') header += ` on_exceed="${item.loop.onExceed}"`;
      parts.push(header);
      parts.push(serializeQueueItems(item.loop.items));
      parts.push('@end');
      return parts.join('\n');
    }
    if (item.pauseword != null) return `@pauseword "${item.pauseword}"`;
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

  // Loop block state
  let inLoopBlock = false;
  let loopItems: QueueItem[] = [];
  let loopStartLine = 0;
  let loopMax = 0;
  let loopUntil: string | undefined;
  let loopOnExceed: 'pause' | 'continue' = 'pause';
  let nestedLoopDepth = 0;

  // Track active pauseword for cross-validation
  let activePauseword: string | undefined;

  // Helper to push items to the correct target (top-level or loop inner)
  const pushItem = (item: QueueItem) => {
    (inLoopBlock ? loopItems : items).push(item);
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Inside rejected nested loop — only track @loop/@end depth
    if (inLoopBlock && nestedLoopDepth > 0) {
      const lower = trimmed.toLowerCase();
      if (lower.startsWith('@loop')) {
        nestedLoopDepth++;
      } else if (lower === '@end') {
        nestedLoopDepth--;
      }
      continue;
    }

    // Inside multiline block
    if (inMultilineBlock) {
      if (trimmed.toLowerCase() === '@)') {
        pushItem({
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
      pushItem({
        prompt: trimmed.slice(1), // remove first backslash
        isNewSession: false,
      });
      continue;
    }

    // Escape handling: \@ -> literal @ prompt
    if (trimmed.startsWith('\\@')) {
      pushItem({
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
          pushItem({
            prompt: '',
            isNewSession: true,
          });
          break;

        case '@save':
          if (!argStr) {
            warnings.push({ line: lineNum, message: '@save requires a session name' });
          } else {
            pushItem({
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
            pushItem({
              prompt: '',
              isNewSession: false,
              loadSessionName: argStr,
            });
          }
          break;

        case '@pause': {
          pushItem({
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
            pushItem({
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
            pushItem({
              prompt: '',
              isNewSession: false,
              delayMs: ms,
            });
          }
          break;
        }

        case '@pauseword': {
          if (!argStr) {
            warnings.push({ line: lineNum, message: '@pauseword requires a keyword' });
          } else {
            // Strip surrounding quotes if present; warn on mismatched quotes
            let keyword = argStr;
            if (argStr.startsWith('"')) {
              if (argStr.endsWith('"') && argStr.length > 1) {
                keyword = argStr.slice(1, -1);
              } else {
                warnings.push({ line: lineNum, message: '@pauseword has mismatched quotes' });
                break;
              }
            }
            // Track active pauseword for loop cross-validation
            activePauseword = keyword || undefined;
            // Empty string is valid — clears the active pauseword
            pushItem({
              prompt: '',
              isNewSession: false,
              pauseword: keyword,
            });
          }
          break;
        }

        case '@loop': {
          if (inLoopBlock) {
            // Nested loop — reject with warning
            nestedLoopDepth++;
            warnings.push({ line: lineNum, message: `Nested @loop is not allowed (line ${loopStartLine})` });
            break;
          }

          // Parse parameters: max=N, until="TOKEN", on_exceed="pause"|"continue"
          const tokens = argStr.split(/\s+/).filter(t => t !== '');
          let parsedMax: number | undefined;
          let parsedUntil: string | undefined;
          let parsedOnExceed: 'pause' | 'continue' = 'pause';
          let parsedOnExceedExplicit = false;

          for (const token of tokens) {
            const eqIdx = token.indexOf('=');
            if (eqIdx === -1) continue;
            const key = token.slice(0, eqIdx).toLowerCase();
            const val = token.slice(eqIdx + 1);

            switch (key) {
              case 'max': {
                const n = parseInt(val, 10);
                if (!isNaN(n) && n > 0 && Number.isInteger(n) && val === String(n)) {
                  parsedMax = n;
                }
                break;
              }
              case 'until': {
                if (val.startsWith('"') && val.endsWith('"') && val.length > 1) {
                  const inner = val.slice(1, -1);
                  if (inner) parsedUntil = inner;
                } else if (val.startsWith('"')) {
                  // Mismatched quotes — starts with " but no closing "
                  warnings.push({ line: lineNum, message: '@loop until has mismatched quotes' });
                } else if (val) {
                  parsedUntil = val;
                }
                break;
              }
              case 'on_exceed': {
                let v = val;
                if (v.startsWith('"') && v.endsWith('"') && v.length > 1) {
                  v = v.slice(1, -1);
                }
                if (v === 'pause' || v === 'continue') {
                  parsedOnExceed = v;
                  parsedOnExceedExplicit = true;
                }
                break;
              }
            }
          }

          // Validate max parameter
          if (parsedMax == null) {
            warnings.push({ line: lineNum, message: '@loop requires max=N parameter (positive integer)' });
            break;
          }

          // Cross-validation: on_exceed without until
          if (parsedOnExceedExplicit && parsedUntil == null) {
            warnings.push({ line: lineNum, message: 'on_exceed has no effect without until parameter' });
          }

          // Cross-validation: pauseword == until
          if (parsedUntil && activePauseword && activePauseword === parsedUntil) {
            warnings.push({
              line: lineNum,
              message: `@pauseword keyword "${activePauseword}" matches until token — pauseword will always fire first, making loop exit impossible`,
            });
          }

          // Enter loop-collecting mode
          inLoopBlock = true;
          loopStartLine = lineNum;
          loopItems = [];
          loopMax = parsedMax;
          loopUntil = parsedUntil;
          loopOnExceed = parsedOnExceed;
          nestedLoopDepth = 0;
          break;
        }

        case '@end': {
          if (!inLoopBlock) {
            warnings.push({ line: lineNum, message: '@end without matching @loop' });
            break;
          }

          // Finalize loop block
          items.push({
            prompt: '',
            isNewSession: false,
            loop: {
              max: loopMax,
              until: loopUntil,
              onExceed: loopOnExceed,
              items: loopItems,
            },
          });

          inLoopBlock = false;
          loopItems = [];
          nestedLoopDepth = 0;
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
          pushItem({
            prompt: trimmed,
            isNewSession: false,
          });
          break;
      }
      continue;
    }

    // Regular line (prompt)
    pushItem({
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
    pushItem({
      prompt: multilineContent.join('\n'),
      isNewSession: false,
      isMultiline: true,
    });
  }

  // Unclosed loop block
  if (inLoopBlock) {
    warnings.push({
      line: loopStartLine,
      message: `Unclosed @loop block: missing @end (started at line ${loopStartLine})`,
    });
    items.push({
      prompt: '',
      isNewSession: false,
      loop: {
        max: loopMax,
        until: loopUntil,
        onExceed: loopOnExceed,
        items: loopItems,
      },
    });
  }

  return { items, warnings };
}
