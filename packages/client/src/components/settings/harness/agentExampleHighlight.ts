/**
 * Story 28.6 AC2.b / AC4.b: CodeMirror visual highlight for `<example>...</example>`
 * blocks inside the sub-agent body markdown editor.
 *
 * Each `<example>` block is decorated with two channels so the visual cue
 * survives color-vision differences and theme switches:
 *
 *   1. Soft background tint — light mode uses a pale yellow, dark mode uses
 *      a saturated indigo, both clearing WCAG AA contrast on the editor
 *      surface beneath them.
 *   2. 4px left border in the same hue — adds a non-color channel (position +
 *      shape) so users with red/green color blindness still see the block.
 *
 * Imported lazily next to the markdown extension, so the CodeMirror runtime is
 * only paid for once the editor modal opens.
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

interface ExampleMatch {
  from: number;
  to: number;
}

const EXAMPLE_BLOCK_RE = /<example[\s>][\s\S]*?<\/example>/gi;

/**
 * Pure tokenizer over the body text — exported so unit tests can verify
 * matching without booting the CodeMirror runtime.
 */
export function tokenizeAgentExamples(text: string): ExampleMatch[] {
  const matches: ExampleMatch[] = [];
  EXAMPLE_BLOCK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXAMPLE_BLOCK_RE.exec(text)) !== null) {
    if (m.index === EXAMPLE_BLOCK_RE.lastIndex) {
      EXAMPLE_BLOCK_RE.lastIndex += 1;
      continue;
    }
    matches.push({ from: m.index, to: m.index + m[0].length });
  }
  return matches;
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const m of tokenizeAgentExamples(text)) {
      builder.add(
        from + m.from,
        from + m.to,
        Decoration.mark({
          class: 'cm-agent-example',
          attributes: { 'data-decoration-class': 'cm-agent-example' },
        }),
      );
    }
  }
  return builder.finish();
}

const exampleViewPlugin = ViewPlugin.fromClass(
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

const exampleTheme = EditorView.baseTheme({
  '.cm-agent-example': {
    backgroundColor: 'rgba(250, 204, 21, 0.10)',
    borderLeft: '4px solid #ca8a04',
    paddingLeft: '6px',
    borderRadius: '2px',
  },
  '&dark .cm-agent-example': {
    backgroundColor: 'rgba(129, 140, 248, 0.16)',
    borderLeft: '4px solid #818cf8',
  },
});

export const agentExampleHighlightExtension: Extension = [
  exampleViewPlugin,
  exampleTheme,
];
