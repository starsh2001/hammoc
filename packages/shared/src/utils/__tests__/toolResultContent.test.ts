import { describe, it, expect } from 'vitest';
import { sanitizeToolResultContent } from '../toolResultContent.js';

describe('sanitizeToolResultContent', () => {
  it('removes a trailing <system-reminder> block, keeping the real output', () => {
    const raw =
      'File contents here\n\n<system-reminder>\nThe task tools have not been used recently.\n</system-reminder>';
    expect(sanitizeToolResultContent(raw)).toBe('File contents here');
  });

  it('removes multiple <system-reminder> blocks', () => {
    const raw = '<system-reminder>one</system-reminder>real<system-reminder>two</system-reminder>';
    expect(sanitizeToolResultContent(raw)).toBe('real');
  });

  it('handles multiline <system-reminder> content', () => {
    const raw = 'line1\n<system-reminder>\nmulti\nline\nreminder\n</system-reminder>\n';
    expect(sanitizeToolResultContent(raw)).toBe('line1');
  });

  it('returns empty string when content is only a <system-reminder>', () => {
    expect(sanitizeToolResultContent('<system-reminder>todo nudge</system-reminder>')).toBe('');
  });

  it('strips SDK XML wrapper tags but keeps the inner payload', () => {
    expect(sanitizeToolResultContent('<tool_use_error>boom</tool_use_error>')).toBe('boom');
    expect(sanitizeToolResultContent('<error>oops</error>')).toBe('oops');
    expect(sanitizeToolResultContent('<result>ok</result>')).toBe('ok');
  });

  it('strips wrapper tags and a system-reminder together', () => {
    const raw = '<result>actual output</result>\n<system-reminder>nudge</system-reminder>';
    expect(sanitizeToolResultContent(raw)).toBe('actual output');
  });

  it('leaves ordinary content untouched aside from trimming', () => {
    expect(sanitizeToolResultContent('  plain output  ')).toBe('plain output');
  });

  it('does not strip an unclosed <system-reminder> tag mention', () => {
    const raw = 'mentions <system-reminder> with no closing tag';
    expect(sanitizeToolResultContent(raw)).toBe('mentions <system-reminder> with no closing tag');
  });
});
