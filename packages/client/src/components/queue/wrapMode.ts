const QUEUE_WRAP_MODE_STORAGE_KEY = 'queue.wrapMode';

/** Normalize all line endings to LF for consistent rendering/parsing. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Read persisted queue wrap mode from localStorage. */
export function readQueueWrapMode(defaultValue = true): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(QUEUE_WRAP_MODE_STORAGE_KEY);
  if (stored === null) return defaultValue;
  return stored === 'auto';
}

/** Persist queue wrap mode for editor + template dialog consistency. */
export function writeQueueWrapMode(isAutoWrap: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_WRAP_MODE_STORAGE_KEY, isAutoWrap ? 'auto' : 'no');
}
