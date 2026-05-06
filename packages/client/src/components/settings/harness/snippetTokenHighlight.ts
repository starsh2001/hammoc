/**
 * Story 29.2: CodeMirror visual highlight for the three dynamic-substitution
 * tokens that snippet bodies can contain.
 *
 *   %name%      — nested snippet reference          → indigo + solid    underline
 *   {arg1}…{argN} — positional argument             → blue   + solid    underline
 *   {context}   — context block injection           → green  + double   underline
 *
 * Shape mirrors `commandTokenHighlight.ts` (Story 28.5) so both editors share
 * the same visual grammar for substitution tokens.
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

export type SnippetTokenKind = 'snippetRef' | 'arg' | 'context';

interface PatternSpec {
  kind: SnippetTokenKind;
  source: string;
}

const PATTERNS: PatternSpec[] = [
  { kind: 'snippetRef', source: '%[a-zA-Z0-9._-]+%' },
  { kind: 'arg', source: '\\{arg\\d+\\}' },
  { kind: 'context', source: '\\{context\\}' },
];

interface TokenMatch {
  from: number;
  to: number;
  kind: SnippetTokenKind;
}

export function tokenizeSnippetBody(text: string): TokenMatch[] {
  const matches: TokenMatch[] = [];
  for (const { kind, source } of PATTERNS) {
    const re = new RegExp(source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ from: m.index, to: m.index + m[0].length, kind });
      if (m.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  matches.sort((a, b) => a.from - b.from || a.to - b.to);
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
    for (const m of tokenizeSnippetBody(text)) {
      builder.add(
        from + m.from,
        from + m.to,
        Decoration.mark({
          class: `cm-snip-token cm-snip-token-${m.kind}`,
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
  '.cm-snip-token': {
    fontWeight: '600',
    textDecorationLine: 'underline',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
  },
  '.cm-snip-token-snippetRef': {
    color: '#4338ca', // indigo-700
    textDecorationStyle: 'solid',
  },
  '.cm-snip-token-arg': {
    color: '#1d4ed8', // blue-700
    textDecorationStyle: 'solid',
  },
  '.cm-snip-token-context': {
    color: '#15803d', // green-700
    textDecorationStyle: 'double',
  },
  '&dark .cm-snip-token-snippetRef': { color: '#a5b4fc' /* indigo-300 */ },
  '&dark .cm-snip-token-arg': { color: '#60a5fa' /* blue-400 */ },
  '&dark .cm-snip-token-context': { color: '#4ade80' /* green-400 */ },
});

export const snippetTokenHighlightExtension: Extension = [
  tokenViewPlugin,
  tokenTheme,
];
