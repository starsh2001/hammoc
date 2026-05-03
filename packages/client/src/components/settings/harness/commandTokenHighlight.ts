/**
 * Story 28.5 AC4(a): CodeMirror visual highlight for the five dynamic-substitution
 * tokens that the slash-command body can contain.
 *
 *   $1, $2, …      — positional argument          → blue   + solid    underline
 *   $ARGUMENTS     — full argument string         → cyan   + double   underline
 *   @path/to/file  — file content reference       → green  + dotted   underline
 *   !`shell cmd`   — shell execution result       → orange + wavy     underline
 *   ${CLAUDE_PLUGIN_ROOT} — plugin bundle root    → purple + dashed   underline
 *
 * The five underline styles are paired with five color hues so that color-blind
 * users can still distinguish tokens visually. Color values were picked to clear
 * WCAG AA (4.5:1) contrast on both light and dark editor backgrounds.
 *
 * This module is imported lazily next to the markdown extension, so the
 * CodeMirror runtime is only paid for once the editor modal opens.
 */

import { RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

export type CommandTokenKind =
  | 'args'
  | 'argumentsAll'
  | 'fileRefs'
  | 'bashExec'
  | 'pluginRoot';

interface PatternSpec {
  kind: CommandTokenKind;
  /**
   * Group index whose match is the actual token text. Used when the regex needs
   * to anchor on a non-token prefix (e.g. whitespace before `@path`).
   */
  captureGroup: number;
  source: string;
}

const PATTERNS: PatternSpec[] = [
  { kind: 'args', captureGroup: 0, source: '\\$[1-9]\\d*\\b' },
  { kind: 'argumentsAll', captureGroup: 0, source: '\\$ARGUMENTS\\b' },
  { kind: 'pluginRoot', captureGroup: 0, source: '\\$\\{CLAUDE_PLUGIN_ROOT\\}' },
  { kind: 'fileRefs', captureGroup: 1, source: '(?:^|\\s)(@[\\w./-]+)' },
  { kind: 'bashExec', captureGroup: 0, source: '!`[^`]+`' },
];

interface TokenMatch {
  from: number;
  to: number;
  kind: CommandTokenKind;
}

/**
 * Pure function over the body text — exported so that unit tests can verify the
 * tokenizer without booting the full CodeMirror editor.
 */
export function tokenizeCommandBody(text: string): TokenMatch[] {
  const matches: TokenMatch[] = [];
  for (const { kind, captureGroup, source } of PATTERNS) {
    const re = new RegExp(source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const captured = m[captureGroup] ?? '';
      if (!captured) continue;
      const start =
        captureGroup === 0 ? m.index : m.index + m[0].indexOf(captured);
      matches.push({ from: start, to: start + captured.length, kind });
      // Guard against zero-length matches that would loop forever.
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  matches.sort((a, b) => a.from - b.from || a.to - b.to);
  // RangeSetBuilder rejects overlapping ranges. The five regexes are mutually
  // exclusive in practice, but we still drop any overlap defensively to keep
  // the editor from throwing on edge-case input.
  const filtered: TokenMatch[] = [];
  let lastTo = -1;
  for (const m of matches) {
    if (m.from < lastTo) continue;
    filtered.push(m);
    lastTo = m.to;
  }
  return filtered;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const m of tokenizeCommandBody(text)) {
      builder.add(
        from + m.from,
        from + m.to,
        Decoration.mark({
          class: `cm-cmd-token cm-cmd-token-${m.kind}`,
          attributes: { 'data-token-kind': m.kind },
        }),
      );
    }
  }
  return builder.finish();
}

const tokenViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const tokenTheme = EditorView.baseTheme({
  '.cm-cmd-token': {
    fontWeight: '600',
    textDecorationLine: 'underline',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
  },
  // Light mode — chosen so each color clears WCAG AA on white.
  '.cm-cmd-token-args': {
    color: '#1d4ed8', // blue-700
    textDecorationStyle: 'solid',
  },
  '.cm-cmd-token-argumentsAll': {
    color: '#0e7490', // cyan-700
    textDecorationStyle: 'double',
  },
  '.cm-cmd-token-fileRefs': {
    color: '#15803d', // green-700
    textDecorationStyle: 'dotted',
  },
  '.cm-cmd-token-bashExec': {
    color: '#c2410c', // orange-700
    textDecorationStyle: 'wavy',
  },
  '.cm-cmd-token-pluginRoot': {
    color: '#7e22ce', // purple-700
    textDecorationStyle: 'dashed',
  },
  // Dark mode — paler hues that clear WCAG AA on gray-900 (#111827).
  '&dark .cm-cmd-token-args': { color: '#60a5fa' /* blue-400 */ },
  '&dark .cm-cmd-token-argumentsAll': { color: '#22d3ee' /* cyan-400 */ },
  '&dark .cm-cmd-token-fileRefs': { color: '#4ade80' /* green-400 */ },
  '&dark .cm-cmd-token-bashExec': { color: '#fb923c' /* orange-400 */ },
  '&dark .cm-cmd-token-pluginRoot': { color: '#c084fc' /* purple-400 */ },
});

export const commandTokenHighlightExtension: Extension = [
  tokenViewPlugin,
  tokenTheme,
];
