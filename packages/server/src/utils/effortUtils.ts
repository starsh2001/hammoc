/**
 * Effort Utilities
 * Shared resolution of ThinkingEffort levels against model capabilities.
 */

import type { ThinkingEffort } from '@hammoc/shared';

/**
 * Clamp unsupported effort levels:
 *   · 'max'   → 'high' unless model supports it (Opus 4.6+, Sonnet 4.6)
 *   · 'xhigh' → 'high' unless model supports it (Opus 4.7 only)
 * Other levels pass through unchanged.
 */
export function clampEffortForModel(effort: ThinkingEffort | undefined, model: string | undefined): ThinkingEffort | undefined {
  if (!effort) return effort;
  const supportsMax = !!model && (
    model === 'opus' || model === 'sonnet' ||
    model.includes('opus-4-6') || model.includes('opus-4-7') || model.includes('sonnet-4-6')
  );
  const supportsXHigh = !!model && (model === 'opus' || model.includes('opus-4-7'));
  if (effort === 'max' && !supportsMax) return 'high';
  if (effort === 'xhigh' && !supportsXHigh) return 'high';
  return effort;
}
