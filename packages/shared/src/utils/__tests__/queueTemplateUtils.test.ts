/**
 * Queue Template Utilities Tests
 * [Source: Story 15.5 - Task 8.1]
 */

import { describe, it, expect } from 'vitest';
import { extractStoryNumbers, generateQueueFromTemplate } from '../queueTemplateUtils';
import type { QueueStoryInfo } from '../../types/queue';

describe('extractStoryNumbers', () => {
  // TC-QT-1
  it('extracts ### Story N.N: Title patterns correctly', () => {
    const content = `
### Story 1.1: User Authentication
Some description here.
### Story 1.2: Login Flow
More description.
`;
    const result = extractStoryNumbers(content);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      storyNum: '1.1',
      epicNum: 1,
      storyIndex: 1,
      title: 'User Authentication',
    });
    expect(result[1]).toEqual({
      storyNum: '1.2',
      epicNum: 1,
      storyIndex: 2,
      title: 'Login Flow',
    });
  });

  // TC-QT-2
  it('extracts ## Story N.N patterns (no title)', () => {
    const content = `
## Story 2.1
Some content.
## Story 2.2
More content.
`;
    const result = extractStoryNumbers(content);
    expect(result).toHaveLength(2);
    expect(result[0].storyNum).toBe('2.1');
    expect(result[0].title).toBeUndefined();
    expect(result[1].storyNum).toBe('2.2');
  });

  // TC-QT-3
  it('returns sorted results by epicNum then storyIndex', () => {
    const content = `
### Story 3.2: Second
### Story 1.1: First
### Story 2.1: Middle
### Story 1.2: Also First
`;
    const result = extractStoryNumbers(content);
    expect(result.map((s) => s.storyNum)).toEqual(['1.1', '1.2', '2.1', '3.2']);
  });

  // TC-QT-4
  it('returns empty array for content with no stories', () => {
    const content = 'Just some regular markdown content without story headers.';
    const result = extractStoryNumbers(content);
    expect(result).toEqual([]);
  });

  it('handles dash separator in title', () => {
    const content = '### Story 5.1 - Dashboard Setup\n';
    const result = extractStoryNumbers(content);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Dashboard Setup');
  });

  it('handles en-dash separator in title', () => {
    const content = '### Story 5.1\u2013Dashboard Setup\n';
    const result = extractStoryNumbers(content);
    expect(result).toHaveLength(1);
    // The regex captures everything after the separator
    expect(result[0].title).toBe('Dashboard Setup');
  });
});

describe('generateQueueFromTemplate', () => {
  const stories: QueueStoryInfo[] = [
    { storyNum: '1.1', epicNum: 1, storyIndex: 1 },
    { storyNum: '1.2', epicNum: 1, storyIndex: 2 },
    { storyNum: '2.1', epicNum: 2, storyIndex: 1 },
  ];

  // TC-QT-5
  it('replaces {story_num} with each story number', () => {
    const template = '/dev {story_num} implement';
    const result = generateQueueFromTemplate(template, stories, false);
    expect(result).toContain('/dev 1.1 implement');
    expect(result).toContain('/dev 1.2 implement');
    expect(result).toContain('/dev 2.1 implement');
  });

  // TC-QT-6
  it('inserts @pause between different epic groups when enabled', () => {
    const template = '/dev {story_num}';
    const result = generateQueueFromTemplate(template, stories, true);
    const lines = result.split('\n');
    expect(lines).toEqual([
      '/dev 1.1',
      '/dev 1.2',
      '@pause Epic 1 완료',
      '/dev 2.1',
    ]);
  });

  // TC-QT-7
  it('does not insert @pause when disabled', () => {
    const template = '/dev {story_num}';
    const result = generateQueueFromTemplate(template, stories, false);
    expect(result).not.toContain('@pause');
    const lines = result.split('\n');
    expect(lines).toEqual(['/dev 1.1', '/dev 1.2', '/dev 2.1']);
  });

  // TC-QT-8
  it('handles single story correctly', () => {
    const single: QueueStoryInfo[] = [{ storyNum: '3.1', epicNum: 3, storyIndex: 1 }];
    const result = generateQueueFromTemplate('/dev {story_num}', single, true);
    expect(result).toBe('/dev 3.1');
  });

  // TC-QT-9
  it('handles multi-line template', () => {
    const template = '/dev {story_num} implement\n@pause review';
    const single: QueueStoryInfo[] = [
      { storyNum: '1.1', epicNum: 1, storyIndex: 1 },
      { storyNum: '1.2', epicNum: 1, storyIndex: 2 },
    ];
    const result = generateQueueFromTemplate(template, single, false);
    expect(result).toBe('/dev 1.1 implement\n@pause review\n/dev 1.2 implement\n@pause review');
  });

  // TC-QT-10
  it('preserves template content around {story_num}', () => {
    const template = 'prefix-{story_num}-suffix';
    const single: QueueStoryInfo[] = [{ storyNum: '4.2', epicNum: 4, storyIndex: 2 }];
    const result = generateQueueFromTemplate(template, single, false);
    expect(result).toBe('prefix-4.2-suffix');
  });

  it('returns empty string for empty stories array', () => {
    const result = generateQueueFromTemplate('/dev {story_num}', [], true);
    expect(result).toBe('');
  });
});
