/**
 * Snippet Resolver Tests
 * Story BS-2: Prompt Snippet System
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { parseSnippetRef, isSnippetRef, resolveSnippet, SnippetError } from '../snippetResolver.js';

// --- parseSnippetRef ---

describe('parseSnippetRef', () => {
  it('parses name and multiple args', () => {
    expect(parseSnippetRef('%commit_and_done story-3 PASSED')).toEqual({
      name: 'commit_and_done',
      args: ['story-3', 'PASSED'],
    });
  });

  it('parses name with no args', () => {
    expect(parseSnippetRef('%simple')).toEqual({ name: 'simple', args: [] });
  });

  it('parses name with dash and extension', () => {
    expect(parseSnippetRef('%with-dash.ext arg1')).toEqual({
      name: 'with-dash.ext',
      args: ['arg1'],
    });
  });

  it('returns null for regular text', () => {
    expect(parseSnippetRef('regular text')).toBeNull();
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseSnippetRef('  %spaced   ')).toEqual({ name: 'spaced', args: [] });
  });

  it('returns null for bare %', () => {
    expect(parseSnippetRef('%')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSnippetRef('')).toBeNull();
  });

  it('returns null for name with path separator', () => {
    expect(parseSnippetRef('%../etc/passwd')).toBeNull();
  });

  // BS-3: Quoted args
  it('parses quoted multi-word arg', () => {
    expect(parseSnippetRef('%fix "multi word" arg2')).toEqual({
      name: 'fix',
      args: ['multi word', 'arg2'],
    });
  });

  it('handles escaped quotes inside quoted arg', () => {
    expect(parseSnippetRef('%fix "say \\"hello\\""')).toEqual({
      name: 'fix',
      args: ['say "hello"'],
    });
  });

  it('handles escaped backslash inside quoted arg', () => {
    expect(parseSnippetRef('%fix "a\\\\b"')).toEqual({
      name: 'fix',
      args: ['a\\b'],
    });
  });

  it('parses mixed plain and quoted args', () => {
    expect(parseSnippetRef('%fix plain "quoted" plain2')).toEqual({
      name: 'fix',
      args: ['plain', 'quoted', 'plain2'],
    });
  });

  it('handles unclosed quote leniently', () => {
    expect(parseSnippetRef('%fix "no end')).toEqual({
      name: 'fix',
      args: ['no end'],
    });
  });

  it('handles empty quotes', () => {
    expect(parseSnippetRef('%fix ""')).toEqual({
      name: 'fix',
      args: [''],
    });
  });
});

// --- isSnippetRef ---

describe('isSnippetRef', () => {
  it('returns true for %name', () => {
    expect(isSnippetRef('%name')).toBe(true);
  });

  it('returns false for regular text', () => {
    expect(isSnippetRef('regular')).toBe(false);
  });

  it('returns true for spaced %name', () => {
    expect(isSnippetRef(' %spaced')).toBe(true);
  });

  it('returns false for bare %', () => {
    expect(isSnippetRef('%')).toBe(false);
  });
});

// --- resolveSnippet ---

describe('resolveSnippet', () => {
  let tmpDir: string;
  let snippetsDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snippet-test-'));
    snippetsDir = path.join(tmpDir, '.hammoc', 'snippets');
    await fs.mkdir(snippetsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('resolves single prompt snippet', async () => {
    await fs.writeFile(path.join(snippetsDir, 'hello'), 'Hello world');
    const result = await resolveSnippet('%hello', tmpDir);
    expect(result).toEqual(['Hello world']);
  });

  it('resolves multi-prompt snippet with --- separator', async () => {
    await fs.writeFile(path.join(snippetsDir, 'multi'), 'prompt one\n---\nprompt two');
    const result = await resolveSnippet('%multi', tmpDir);
    expect(result).toEqual(['prompt one', 'prompt two']);
  });

  it('substitutes {arg1} and {arg2}', async () => {
    await fs.writeFile(path.join(snippetsDir, 'greet'), 'Hello {arg1}, welcome to {arg2}');
    const result = await resolveSnippet('%greet Alice Wonderland', tmpDir);
    expect(result).toEqual(['Hello Alice, welcome to Wonderland']);
  });

  it('leaves unreplaced placeholders as-is', async () => {
    await fs.writeFile(path.join(snippetsDir, 'partial'), 'Hello {arg1} and {arg2}');
    const result = await resolveSnippet('%partial Alice', tmpDir);
    expect(result).toEqual(['Hello Alice and {arg2}']);
  });

  it('falls back to .md extension', async () => {
    await fs.writeFile(path.join(snippetsDir, 'readme.md'), 'Markdown content');
    const result = await resolveSnippet('%readme', tmpDir);
    expect(result).toEqual(['Markdown content']);
  });

  it('prefers exact name over .md extension', async () => {
    await fs.writeFile(path.join(snippetsDir, 'doc'), 'exact');
    await fs.writeFile(path.join(snippetsDir, 'doc.md'), 'md version');
    const result = await resolveSnippet('%doc', tmpDir);
    expect(result).toEqual(['exact']);
  });

  it('throws NOT_FOUND for missing snippet', async () => {
    await expect(resolveSnippet('%nonexistent', tmpDir)).rejects.toThrow(SnippetError);
    await expect(resolveSnippet('%nonexistent', tmpDir)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when snippets directory does not exist', async () => {
    const emptyDir = path.join(tmpDir, 'empty-project');
    await fs.mkdir(emptyDir, { recursive: true });
    await expect(resolveSnippet('%anything', emptyDir)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws PARSE_ERROR for path traversal attempt', async () => {
    await expect(resolveSnippet('%../etc/passwd', tmpDir)).rejects.toThrow(SnippetError);
    await expect(resolveSnippet('%../etc/passwd', tmpDir)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('throws SIZE_EXCEEDED for file exceeding 100KB', async () => {
    const bigContent = 'x'.repeat(102_401);
    await fs.writeFile(path.join(snippetsDir, 'big'), bigContent);
    await expect(resolveSnippet('%big', tmpDir)).rejects.toMatchObject({ code: 'SIZE_EXCEEDED' });
  });

  it('throws PARSE_ERROR for empty content after split', async () => {
    await fs.writeFile(path.join(snippetsDir, 'empty'), '---\n---');
    await expect(resolveSnippet('%empty', tmpDir)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('handles --- separator with surrounding whitespace', async () => {
    await fs.writeFile(path.join(snippetsDir, 'spaced'), 'first\n  ---  \nsecond');
    const result = await resolveSnippet('%spaced', tmpDir);
    expect(result).toEqual(['first', 'second']);
  });

  it('combines arg substitution with multi-prompt split', async () => {
    await fs.writeFile(
      path.join(snippetsDir, 'commit_and_done'),
      '{arg1}와 관련된 내용을 커밋해줘\n---\n{arg1}의 qa-gate 상태가 {arg2}이면 상태를 done으로 바꿔줘',
    );
    const result = await resolveSnippet('%commit_and_done story-3 PASSED', tmpDir);
    expect(result).toEqual([
      'story-3와 관련된 내용을 커밋해줘',
      'story-3의 qa-gate 상태가 PASSED이면 상태를 done으로 바꿔줘',
    ]);
  });

  // BS-3: Context block
  it('resolves {context} from ---context block', async () => {
    await fs.writeFile(path.join(snippetsDir, 'ctx'), '{context}\n\nIssue: {arg1}');
    const result = await resolveSnippet('%ctx myfile\n---context\nHello World', tmpDir);
    expect(result).toEqual(['Hello World\n\nIssue: myfile']);
  });

  it('leaves {context} as literal when no context block provided', async () => {
    await fs.writeFile(path.join(snippetsDir, 'noctx'), '{context} remains');
    const result = await resolveSnippet('%noctx', tmpDir);
    expect(result).toEqual(['{context} remains']);
  });

  it('context preserves newlines, quotes, and special chars', async () => {
    await fs.writeFile(path.join(snippetsDir, 'preserve'), 'Content: {context}');
    const contextContent = 'line1\nline2\n"quoted"\n---\nmore';
    const result = await resolveSnippet(`%preserve\n---context\n${contextContent}`, tmpDir);
    // --- in context should NOT split into extra prompts
    expect(result).toEqual([`Content: ${contextContent}`]);
  });

  it('---context only recognized in invocation, not in snippet file --- separators', async () => {
    await fs.writeFile(path.join(snippetsDir, 'twoprompt'), 'Prompt 1 {context}\n---\nPrompt 2 {context}');
    const result = await resolveSnippet('%twoprompt\n---context\nMyContext', tmpDir);
    expect(result).toEqual(['Prompt 1 MyContext', 'Prompt 2 MyContext']);
  });

  // BS-3: Fallback directory
  it('resolves from .bmad-core/snippets when .hammoc/snippets has no match', async () => {
    const fallbackDir = path.join(tmpDir, '.bmad-core', 'snippets');
    await fs.mkdir(fallbackDir, { recursive: true });
    await fs.writeFile(path.join(fallbackDir, 'framework'), 'From framework');
    const result = await resolveSnippet('%framework', tmpDir);
    expect(result).toEqual(['From framework']);
  });

  it('.hammoc/snippets takes precedence over .bmad-core/snippets', async () => {
    const fallbackDir = path.join(tmpDir, '.bmad-core', 'snippets');
    await fs.mkdir(fallbackDir, { recursive: true });
    await fs.writeFile(path.join(snippetsDir, 'both'), 'User version');
    await fs.writeFile(path.join(fallbackDir, 'both'), 'Framework version');
    const result = await resolveSnippet('%both', tmpDir);
    expect(result).toEqual(['User version']);
  });

  it('throws NOT_FOUND when file in neither directory', async () => {
    const fallbackDir = path.join(tmpDir, '.bmad-core', 'snippets');
    await fs.mkdir(fallbackDir, { recursive: true });
    await expect(resolveSnippet('%missing', tmpDir)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('propagates SIZE_EXCEEDED from .hammoc/snippets without falling back', async () => {
    const fallbackDir = path.join(tmpDir, '.bmad-core', 'snippets');
    await fs.mkdir(fallbackDir, { recursive: true });
    await fs.writeFile(path.join(snippetsDir, 'toobig'), 'x'.repeat(102_401));
    await fs.writeFile(path.join(fallbackDir, 'toobig'), 'Small fallback');
    await expect(resolveSnippet('%toobig', tmpDir)).rejects.toMatchObject({ code: 'SIZE_EXCEEDED' });
  });

  it('applies path traversal prevention to fallback directory too', async () => {
    await expect(resolveSnippet('%../etc/passwd', tmpDir)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('resolves .md extension from fallback directory', async () => {
    const fallbackDir = path.join(tmpDir, '.bmad-core', 'snippets');
    await fs.mkdir(fallbackDir, { recursive: true });
    await fs.writeFile(path.join(fallbackDir, 'readme.md'), 'Fallback MD');
    const result = await resolveSnippet('%readme', tmpDir);
    expect(result).toEqual(['Fallback MD']);
  });
});
