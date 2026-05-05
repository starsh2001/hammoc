/**
 * Story 29.1: Markdown H2 split/append helpers shared between server and
 * client.
 *
 * Server uses these to perform a section-append copy (read source → split →
 * append selected sections → write target). Client uses them to render the
 * H2 checkbox preview list inside the copy modal without a server round-trip
 * (zero-latency UX). Both consumers MUST agree on what counts as an H2 and
 * how a section's body is bounded; placing the implementation in `@hammoc/shared`
 * is what guarantees that agreement.
 *
 * Rules:
 *   - An H2 is a line whose first non-CR characters match `## <heading text>`.
 *     Lines inside fenced code blocks (```...``` or ~~~...~~~) are NOT
 *     considered headings even if they start with `## `.
 *   - A section's body extends from the line AFTER its heading to the line
 *     BEFORE the next H2 (or end of file). Trailing newline normalization is
 *     preserved when appending so round-tripping is idempotent.
 *   - Heading text is the raw line including the `## ` prefix (preserved
 *     verbatim) so callers can render it identically to the source.
 */

export interface MarkdownH2Section {
  /** Full heading line (e.g. `## 언어 설정`) — preserved verbatim. */
  heading: string;
  /**
   * Body lines after the heading and up to (but not including) the next H2 line.
   * Joined with `\n`, no trailing newline.
   */
  body: string;
}

/**
 * Split a markdown string into its top-level H2 sections. Returns an empty
 * array when no H2 is found anywhere in the document — callers (the copy
 * modal) interpret this as "section append unavailable, switch to overwrite".
 */
export function splitMarkdownByH2(raw: string): MarkdownH2Section[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const sections: MarkdownH2Section[] = [];

  let inFence = false;
  let fenceMarker: '`' | '~' | null = null;

  let currentHeading: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      // Trim trailing empty lines from the section body so re-appending later
      // does not accumulate blank lines per round trip.
      while (currentBody.length > 0 && currentBody[currentBody.length - 1] === '') {
        currentBody.pop();
      }
      sections.push({ heading: currentHeading, body: currentBody.join('\n') });
    }
  };

  for (const line of lines) {
    // Track fenced code blocks first — headings inside fences must not split.
    const fenceMatch = /^(\s*)(```|~~~)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[2][0] as '`' | '~';
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = null;
      }
      // Fence delimiters belong to whichever section they're in.
      if (currentHeading !== null) {
        currentBody.push(line);
      }
      continue;
    }

    if (!inFence && /^##\s+\S/.test(line)) {
      // New H2 — finalize the previous section and start a new one.
      flush();
      currentHeading = line;
      currentBody = [];
      continue;
    }

    if (currentHeading !== null) {
      currentBody.push(line);
    }
    // Lines before the first H2 are document preamble (often the H1 +
    // intro paragraph) and are intentionally dropped — they are NOT a
    // section and the copy modal does not surface them. Callers wanting the
    // whole document use the overwrite mode, not section-append.
  }

  flush();
  return sections;
}

/**
 * Append the given sections to the end of `target`. The result preserves the
 * target's existing content verbatim and inserts a single blank line between
 * the existing content and the first appended heading (when the target is
 * non-empty and does not already end in a blank line). Sections themselves are
 * separated by exactly one blank line so they read as siblings, not nested.
 *
 * Output normalization:
 *   - Always ends with a single trailing newline.
 *   - Existing CRLF input is preserved as LF in the output (CRLF-only files
 *     are uncommon in CLAUDE.md; round-tripping LF is the simplest invariant).
 */
export function appendMarkdownSections(
  target: string,
  sections: MarkdownH2Section[],
): string {
  if (sections.length === 0) {
    // No-op — but normalize trailing newline so callers do not have to.
    if (target.length === 0) return '';
    return target.endsWith('\n') ? target : target + '\n';
  }

  const normalized = target.replace(/\r\n/g, '\n');
  const trailing = normalized.length === 0 || normalized.endsWith('\n\n')
    ? ''
    : normalized.endsWith('\n')
      ? '\n'
      : '\n\n';

  const sectionTexts = sections.map((s) =>
    s.body.length > 0 ? `${s.heading}\n${s.body}` : s.heading,
  );
  const appended = sectionTexts.join('\n\n');

  // Final newline ensures the file always ends in a newline (POSIX-friendly).
  return `${normalized}${trailing}${appended}\n`;
}
