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

/**
 * Whether the model supports Anthropic's adaptive thinking mode
 * (`thinking: { type: 'adaptive' }`). Opus 4.7 requires adaptive;
 * Opus 4.6 and Sonnet 4.6 accept adaptive as the recommended mode.
 * Older models (Sonnet 4.5, Opus 4.5, Haiku, Sonnet 4, etc.) do NOT
 * support adaptive and must stay on the legacy `maxThinkingTokens` path.
 */
export function supportsAdaptiveThinking(model: string | undefined): boolean {
  if (!model) return false;
  return (
    model === 'opus' || model === 'sonnet' ||
    model.includes('opus-4-6') || model.includes('opus-4-7') || model.includes('sonnet-4-6')
  );
}
