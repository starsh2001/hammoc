import { describe, it, expect } from 'vitest';
import { parseQueueScript, serializeQueueItems } from '../queueParser.js';

describe('parseQueueScript', () => {
  // TC-QP-1: Single-line prompts are parsed correctly (AC: 1)
  it('TC-QP-1: parses single-line prompts correctly', () => {
    const result = parseQueueScript('hello world\ndo something');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ prompt: 'hello world', isNewSession: false });
    expect(result.items[1]).toEqual({ prompt: 'do something', isNewSession: false });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-2: Multiline block @( ... @) preserves indentation (AC: 2)
  it('TC-QP-2: parses multiline block preserving indentation', () => {
    const script = '@(\n  line one\n    line two\n  line three\n@)';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      prompt: '  line one\n    line two\n  line three',
      isNewSession: false,
      isMultiline: true,
    });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-3: Unclosed multiline block emits warning and treats content as single prompt (AC: 2)
  it('TC-QP-3: handles unclosed multiline block with warning', () => {
    const script = '@(\nline one\nline two';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      prompt: 'line one\nline two',
      isNewSession: false,
      isMultiline: true,
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].line).toBe(1);
    expect(result.warnings[0].message).toContain('Unclosed multiline block');
  });

  // TC-QP-4: All 7 directives are supported (AC: 3)
  it('TC-QP-4: supports all 7 directives', () => {
    const script = [
      '@new',
      'prompt after new',
      '@save my_session',
      '@load my_session',
      '@pause',
      '@model sonnet',
      '@delay 5000',
      '@(',
      'multiline content',
      '@)',
    ].join('\n');
    const result = parseQueueScript(script);
    expect(result.warnings).toHaveLength(0);

    // @new (standalone item)
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: true });
    // prompt after new
    expect(result.items[1]).toEqual({ prompt: 'prompt after new', isNewSession: false });
    // @save
    expect(result.items[2]).toEqual({ prompt: '', isNewSession: false, saveSessionName: 'my_session' });
    // @load
    expect(result.items[3]).toEqual({ prompt: '', isNewSession: false, loadSessionName: 'my_session' });
    // @pause
    expect(result.items[4]).toEqual({ prompt: '', isNewSession: false, isBreakpoint: true });
    // @model
    expect(result.items[5]).toEqual({ prompt: '', isNewSession: false, modelName: 'sonnet' });
    // @delay
    expect(result.items[6]).toEqual({ prompt: '', isNewSession: false, delayMs: 5000 });
    // @( ... @) multiline
    expect(result.items[7]).toEqual({ prompt: 'multiline content', isNewSession: false, isMultiline: true });
  });

  // TC-QP-5: Directive parsing is case-insensitive (AC: 4)
  it('TC-QP-5: directives are case-insensitive', () => {
    const script = '@NEW\nupper\n@Save session1\n@LOAD session2\n@PAUSE\n@Model opus\n@DELAY 1000';
    const result = parseQueueScript(script);
    expect(result.warnings).toHaveLength(0);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: true });
    expect(result.items[1]).toEqual({ prompt: 'upper', isNewSession: false });
    expect(result.items[2]).toEqual({ prompt: '', isNewSession: false, saveSessionName: 'session1' });
    expect(result.items[3]).toEqual({ prompt: '', isNewSession: false, loadSessionName: 'session2' });
    expect(result.items[4]).toEqual({ prompt: '', isNewSession: false, isBreakpoint: true });
    expect(result.items[5]).toEqual({ prompt: '', isNewSession: false, modelName: 'opus' });
    expect(result.items[6]).toEqual({ prompt: '', isNewSession: false, delayMs: 1000 });
  });

  // TC-QP-6: \@text escape produces literal @text, \\@text produces \@text (AC: 5)
  it('TC-QP-6: handles escape sequences correctly', () => {
    const script = '\\@hello\n\\\\@world';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ prompt: '@hello', isNewSession: false });
    expect(result.items[1]).toEqual({ prompt: '\\@world', isNewSession: false });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-7: @save/@load/@model without args are ignored, @delay with invalid value ignored (AC: 6)
  it('TC-QP-7: ignores directives with missing or invalid arguments', () => {
    const script = '@save\n@load\n@model\n@delay\n@delay -5\n@delay abc\n@delay 0';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(7);
    expect(result.warnings[0]).toEqual({ line: 1, message: '@save requires a session name' });
    expect(result.warnings[1]).toEqual({ line: 2, message: '@load requires a session name' });
    expect(result.warnings[2]).toEqual({ line: 3, message: '@model requires a model name' });
    expect(result.warnings[3]).toEqual({ line: 4, message: '@delay requires a positive integer value' });
    expect(result.warnings[4]).toEqual({ line: 5, message: '@delay requires a positive integer value' });
    expect(result.warnings[5]).toEqual({ line: 6, message: '@delay requires a positive integer value' });
    expect(result.warnings[6]).toEqual({ line: 7, message: '@delay requires a positive integer value' });
  });

  // TC-QP-8: Unknown @ directives warn and become regular prompts (AC: 7)
  it('TC-QP-8: treats unknown directives as regular prompts with warning', () => {
    const script = '@unknown some text';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: '@unknown some text', isNewSession: false });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].line).toBe(1);
    expect(result.warnings[0].message).toContain('Unknown directive');
  });

  // TC-QP-9: Empty lines and # comment lines are skipped (AC: 8)
  it('TC-QP-9: skips empty lines and comments', () => {
    const script = '\n# this is a comment\n\nprompt here\n   # indented comment\n';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: 'prompt here', isNewSession: false });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-10: Parse warnings include line numbers (AC: 9)
  it('TC-QP-10: warnings include correct line numbers', () => {
    const script = 'prompt\n\n@save\n# comment\n@unknown directive';
    const result = parseQueueScript(script);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0].line).toBe(3); // @save without arg
    expect(result.warnings[1].line).toBe(5); // @unknown
  });

  // TC-QP-11: @new creates a standalone session item (AC: 3)
  it('TC-QP-11: @new creates a standalone session item', () => {
    const script = '@new\nfirst prompt\nsecond prompt';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: true });
    expect(result.items[1]).toEqual({ prompt: 'first prompt', isNewSession: false });
    expect(result.items[2]).toEqual({ prompt: 'second prompt', isNewSession: false });
  });

  // TC-QP-12: @pause with reason includes reason in prompt field (AC: 3)
  it('TC-QP-12: @pause with reason includes reason in prompt', () => {
    const result = parseQueueScript('@pause Check results before continuing');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      prompt: 'Check results before continuing',
      isNewSession: false,
      isBreakpoint: true,
    });
  });

  // TC-QP-13: @delay with valid positive integer is parsed correctly (AC: 3)
  it('TC-QP-13: @delay with valid positive integer', () => {
    const result = parseQueueScript('@delay 3000');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: false, delayMs: 3000 });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-14: Multiple consecutive @new lines each create a standalone item
  it('TC-QP-14: multiple consecutive @new lines each create a standalone item', () => {
    const script = '@new\n@new\n@new\nmy prompt';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: true });
    expect(result.items[1]).toEqual({ prompt: '', isNewSession: true });
    expect(result.items[2]).toEqual({ prompt: '', isNewSession: true });
    expect(result.items[3]).toEqual({ prompt: 'my prompt', isNewSession: false });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-15: Real-world qlaude queue file (integration-style test)
  it('TC-QP-15: parses real-world qlaude queue file', () => {
    const script = [
      '# Comment line (ignored)',
      '@new',
      '/BMad:agents:sm',
      '*draft 15.1',
      '',
      '@new',
      '/BMad:agents:po',
      '*validate-story-draft 15.1 Check if a draft file exists...',
      '@save dev_15.1',
      '',
      '@load dev_15.1',
      '/BMad:agents:dev',
      '*review-qa 15.1',
      '@pause',
    ].join('\n');
    const result = parseQueueScript(script);
    expect(result.warnings).toHaveLength(0);
    expect(result.items).toHaveLength(11);

    // @new (standalone)
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: true });
    // /BMad:agents:sm
    expect(result.items[1]).toEqual({ prompt: '/BMad:agents:sm', isNewSession: false });
    // *draft 15.1
    expect(result.items[2]).toEqual({ prompt: '*draft 15.1', isNewSession: false });
    // @new (standalone)
    expect(result.items[3]).toEqual({ prompt: '', isNewSession: true });
    // /BMad:agents:po
    expect(result.items[4]).toEqual({ prompt: '/BMad:agents:po', isNewSession: false });
    // *validate-story-draft ...
    expect(result.items[5]).toEqual({
      prompt: '*validate-story-draft 15.1 Check if a draft file exists...',
      isNewSession: false,
    });
    // @save dev_15.1
    expect(result.items[6]).toEqual({ prompt: '', isNewSession: false, saveSessionName: 'dev_15.1' });
    // @load dev_15.1
    expect(result.items[7]).toEqual({ prompt: '', isNewSession: false, loadSessionName: 'dev_15.1' });
    // /BMad:agents:dev
    expect(result.items[8]).toEqual({ prompt: '/BMad:agents:dev', isNewSession: false });
    // *review-qa 15.1
    expect(result.items[9]).toEqual({ prompt: '*review-qa 15.1', isNewSession: false });
    // @pause
    expect(result.items[10]).toEqual({ prompt: '', isNewSession: false, isBreakpoint: true });
  });

  // TC-QP-16: @new followed by multiline block creates two separate items
  it('TC-QP-16: @new followed by multiline block creates two items', () => {
    const script = '@new\n@(\nline one\nline two\n@)';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: true });
    expect(result.items[1]).toEqual({
      prompt: 'line one\nline two',
      isNewSession: false,
      isMultiline: true,
    });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-19: @pauseword with quoted keyword
  it('TC-QP-19: parses @pauseword with quoted keyword', () => {
    const result = parseQueueScript('@pauseword "QUEUE_STOP"');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: false, pauseword: 'QUEUE_STOP' });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-20: @pauseword with unquoted keyword
  it('TC-QP-20: parses @pauseword with unquoted keyword', () => {
    const result = parseQueueScript('@pauseword STOP');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: false, pauseword: 'STOP' });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-21: @pauseword without keyword emits warning
  it('TC-QP-21: @pauseword without keyword emits warning', () => {
    const result = parseQueueScript('@pauseword');
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual({ line: 1, message: '@pauseword requires a keyword' });
  });

  // TC-QP-22: @pauseword with empty quoted string clears pauseword
  it('TC-QP-22: @pauseword with empty quoted string is valid (clears pauseword)', () => {
    const result = parseQueueScript('@pauseword ""');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: false, pauseword: '' });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-23: @pauseword with mismatched quotes emits warning
  it('TC-QP-23: @pauseword with mismatched quotes emits warning', () => {
    const result = parseQueueScript('@pauseword "STOP');
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toEqual({ line: 1, message: '@pauseword has mismatched quotes' });
  });

  // TC-QP-24: @pauseword is case-insensitive for directive name
  it('TC-QP-24: @pauseword directive is case-insensitive', () => {
    const result = parseQueueScript('@PAUSEWORD "HALT"');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({ prompt: '', isNewSession: false, pauseword: 'HALT' });
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-17: Empty input returns empty items array with no warnings
  it('TC-QP-17: empty input returns empty result', () => {
    const result = parseQueueScript('');
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  // TC-QP-18: @new at end of file creates a standalone session item
  it('TC-QP-18: @new at end of file creates a standalone item', () => {
    const script = 'first prompt\n@new';
    const result = parseQueueScript(script);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ prompt: 'first prompt', isNewSession: false });
    expect(result.items[1]).toEqual({ prompt: '', isNewSession: true });
    expect(result.warnings).toHaveLength(0);
  });
});

describe('serializeQueueItems', () => {
  it('serializes @pauseword item with quoted keyword', () => {
    const result = serializeQueueItems([{ prompt: '', isNewSession: false, pauseword: 'QUEUE_STOP' }]);
    expect(result).toBe('@pauseword "QUEUE_STOP"');
  });

  it('roundtrips @pauseword through parse and serialize', () => {
    const script = '@pauseword "HALT"\nprompt here';
    const parsed = parseQueueScript(script);
    const serialized = serializeQueueItems(parsed.items);
    const reparsed = parseQueueScript(serialized);
    expect(reparsed.items).toEqual(parsed.items);
  });
});
