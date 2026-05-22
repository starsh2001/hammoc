/**
 * In-memory text-buffer overlay shared by the harness workbench panels
 * (SnippetEditor / ClaudeMdEditor / SkillEditor / CommandEditor / AgentEditor)
 * so a body CodeMirror can be popped open in the same fullscreen editor UX
 * the user already knows from the file editor.
 *
 * The host panel keeps owning persistence (debounced auto-save to its own
 * API). When the user edits inside the expansion, every keystroke flows
 * back through `onChange` so the host's draft state and save scheduler
 * stay authoritative — the expansion store only mirrors the latest text
 * for rendering. No mtime, no external-change tracking, no save button.
 */
import { create } from 'zustand';

export interface TextExpansionOpenOptions {
  /** Header label shown in the overlay (e.g. "Snippet body", "SKILL.md"). */
  label: string;
  /** Initial text shown in the editor. */
  content: string;
  /** Push every keystroke back to the host panel's draft state. */
  onChange: (next: string) => void;
  /** Render the markdown preview toggle in the header. */
  isMarkdown?: boolean;
  /** Disable typing (e.g. plugin scope, bundled snippets). */
  readOnly?: boolean;
  /** Optional context used by the markdown preview for relative links. */
  projectSlug?: string | null;
  basePath?: string;
}

interface TextExpansionState {
  isOpen: boolean;
  label: string;
  content: string;
  isMarkdown: boolean;
  readOnly: boolean;
  isMarkdownPreview: boolean;
  projectSlug: string | null;
  basePath: string;
  onChange: ((next: string) => void) | null;
}

interface TextExpansionActions {
  open(options: TextExpansionOpenOptions): void;
  setContent(next: string): void;
  toggleMarkdownPreview(): void;
  close(): void;
}

const initialState: TextExpansionState = {
  isOpen: false,
  label: '',
  content: '',
  isMarkdown: false,
  readOnly: false,
  isMarkdownPreview: false,
  projectSlug: null,
  basePath: '',
  onChange: null,
};

export const useTextExpansionStore = create<TextExpansionState & TextExpansionActions>((set, get) => ({
  ...initialState,

  open: (options) => {
    set({
      isOpen: true,
      label: options.label,
      content: options.content,
      isMarkdown: options.isMarkdown ?? false,
      readOnly: options.readOnly ?? false,
      isMarkdownPreview: false,
      projectSlug: options.projectSlug ?? null,
      basePath: options.basePath ?? '',
      onChange: options.onChange,
    });
  },

  setContent: (next) => {
    if (!get().isOpen) return;
    set({ content: next });
    const handler = get().onChange;
    if (handler) handler(next);
  },

  toggleMarkdownPreview: () => {
    set((s) => ({ isMarkdownPreview: !s.isMarkdownPreview }));
  },

  close: () => {
    set({ ...initialState });
  },
}));
