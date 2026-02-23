/**
 * queueHighlight Tests
 * [Source: Story 15.5 - Task 8.0]
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, highlightScript } from '../queueHighlight';

describe('escapeHtml', () => {
  // TC-QT-42
  it('escapes <, >, &, ", \' characters', () => {
    const input = `<script>alert("xss's")</script> & more`;
    const result = escapeHtml(input);
    expect(result).toBe('&lt;script&gt;alert(&quot;xss&#039;s&quot;)&lt;/script&gt; &amp; more');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('"xss');
    expect(result).not.toContain("'s");
  });
});

describe('highlightScript', () => {
  // TC-QT-43
  it('applies correct CSS classes to directives (@new, @pause, etc.)', () => {
    const result = highlightScript('@new\n@pause reason here\n@save mySession');
    expect(result).toContain('text-purple-400');
    expect(result).toContain('text-emerald-400');
  });

  it('highlights directive-only lines without args', () => {
    const result = highlightScript('@new');
    expect(result).toContain('text-purple-400');
    expect(result).toContain('@new');
  });

  it('highlights multiline markers', () => {
    const result = highlightScript('@(\n@)');
    expect(result).toContain('text-blue-400');
  });

  // TC-QT-44
  it('highlights # comment lines', () => {
    const result = highlightScript('# This is a comment');
    expect(result).toContain('text-gray-500');
  });

  it('handles escaped directives', () => {
    const result = highlightScript('\\@not-a-directive');
    expect(result).not.toContain('text-purple-400');
  });

  it('highlights regular prompt text', () => {
    const result = highlightScript('just a regular prompt');
    expect(result).toContain('text-gray-100');
  });
});
