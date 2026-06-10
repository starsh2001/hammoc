/**
 * Interrupt / empty-turn filler texts injected by the Claude Code harness.
 *
 * When a user interrupts a request (or a turn yields no real response), the
 * harness records placeholder text that carries no conversational value:
 *
 *   - "No response requested."                       — emitted as an empty *assistant* turn
 *   - "[Request interrupted by user]"                — recorded as a *user* turn
 *   - "[Request interrupted by user for tool use]"   — user turn (interrupt during a tool call)
 *
 * These must never surface as a stray bubble. The check is shared by every
 * render path so the behavior can't drift between them:
 *   - server reload  (historyParser — both assistant AND user content)
 *   - client live    (MessageArea streaming text segment)
 *
 * Matching is EXACT-after-trim: a message is filler only when its entire
 * visible text is one of these phrases. A real message that merely *contains*
 * the phrase (e.g. the user quoting "No response requested." inside a question)
 * is left intact — we deliberately never strip a prefix, to avoid mangling
 * genuine content.
 */
export const INTERRUPT_FILLER_TEXTS: ReadonlySet<string> = new Set<string>([
  'No response requested.',
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
]);

/**
 * True when `text` is, in its entirety (after trim), a harness filler phrase.
 *
 * @param text Raw text content of a message or streaming segment
 * @returns Whether the whole message is pure interrupt/empty-turn filler
 */
export function isInterruptFillerText(text: string | undefined | null): boolean {
  if (!text) return false;
  return INTERRUPT_FILLER_TEXTS.has(text.trim());
}
