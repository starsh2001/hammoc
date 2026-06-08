/**
 * tool_result content sanitization (shared by server engines & client render).
 *
 * The SDK / CLI harness injects two kinds of noise into a tool_result's text
 * that must never be shown verbatim in the chat UI:
 *
 *   1. XML wrapper tags around the payload — `<tool_use_error>`, `<error>`,
 *      `<result>` — emitted by the SDK to frame the result.
 *   2. `<system-reminder>…</system-reminder>` blocks appended *after* the real
 *      output (e.g. "todo list not used recently" nudges, empty-file warnings).
 *      These are model-directed instructions, not user-facing content, so they
 *      must never reach a rendered tool card.
 *
 * Both are stripped here so the four render paths — SDK live (streamHandler),
 * SDK history (historyParser), CLI live (cliChatEngine) and the client
 * (ToolCard) — share one source of truth and can never drift apart.
 *
 * @param raw The raw tool_result string content
 * @returns Cleaned content safe to display
 */
export function sanitizeToolResultContent(raw: string): string {
  return raw
    // Drop <system-reminder> blocks entirely, including their inner content.
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    // Strip the SDK XML wrapper tags but keep the inner payload.
    .replace(/<\/?(?:tool_use_error|error|result)>/g, '')
    .trim();
}
