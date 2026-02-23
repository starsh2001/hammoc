/**
 * Queue script syntax highlighting utilities
 * Extracted from QueueEditor.tsx for reuse in QueueTemplateDialog
 * [Source: Story 15.5 - Task 5]
 */

/** Escape HTML special characters to prevent XSS */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Tokenize and highlight a queue script line */
export function highlightScript(script: string): string {
  const lines = script.split('\n');
  return lines.map((line) => {
    const trimmed = line.trim();

    // Comment line
    if (trimmed.startsWith('#')) {
      return `<span class="text-gray-500">${escapeHtml(line)}</span>`;
    }

    // Escaped directive
    if (trimmed.startsWith('\\@')) {
      return escapeHtml(line);
    }

    // Multiline markers
    if (trimmed.toLowerCase() === '@(' || trimmed.toLowerCase() === '@)') {
      return `<span class="text-blue-400">${escapeHtml(line)}</span>`;
    }

    // Directives
    if (trimmed.startsWith('@')) {
      const spaceIndex = trimmed.indexOf(' ');
      if (spaceIndex === -1) {
        return `<span class="text-purple-400">${escapeHtml(line)}</span>`;
      }
      // Find directive end in original line (preserving leading whitespace)
      const leadingSpaces = line.length - line.trimStart().length;
      const directivePart = line.slice(0, leadingSpaces + spaceIndex);
      const argPart = line.slice(leadingSpaces + spaceIndex);
      return `<span class="text-purple-400">${escapeHtml(directivePart)}</span><span class="text-emerald-400">${escapeHtml(argPart)}</span>`;
    }

    // Regular prompt text
    return `<span class="text-gray-100 dark:text-gray-200">${escapeHtml(line)}</span>`;
  }).join('\n');
}
