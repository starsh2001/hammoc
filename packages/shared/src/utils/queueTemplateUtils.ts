/**
 * Queue Template Utilities — extract stories from PRD and generate queue scripts
 * [Source: Story 15.5 - Task 2]
 */

import type { QueueStoryInfo } from '../types/queue.js';

/**
 * Extract story numbers from PRD content by matching "## Story N.N" / "### Story N.N" headers.
 * Also matches standalone "## Story N" / "### Story N" when epicContext is provided.
 * Returns sorted array by epicNum then storyIndex.
 */
export function extractStoryNumbers(prdContent: string, epicContext?: number): QueueStoryInfo[] {
  const regex = /^#{2,3}\s+Story\s+(\d+)(?:\.(\d+))?(?:[: \t\u2013-]+(.+))?/gm;
  const stories: QueueStoryInfo[] = [];
  let match;

  while ((match = regex.exec(prdContent)) !== null) {
    let epicNum: number;
    let storyIndex: number;
    let title: string | undefined;

    if (match[2] != null) {
      // Dotted format: "Story 3.1" → epic 3, story index 1
      epicNum = parseInt(match[1], 10);
      storyIndex = parseInt(match[2], 10);
      title = match[3]?.trim() || undefined;
    } else if (epicContext != null) {
      // Standalone format: "Story 1" in an epic-specific file
      epicNum = epicContext;
      storyIndex = parseInt(match[1], 10);
      title = match[3]?.trim() || undefined;
    } else {
      // Standalone without context — can't determine epic, skip
      continue;
    }

    stories.push({
      storyNum: `${epicNum}.${storyIndex}`,
      epicNum,
      storyIndex,
      title,
    });
  }

  stories.sort((a, b) => a.epicNum - b.epicNum || a.storyIndex - b.storyIndex);

  return stories;
}

/**
 * Generate a queue script by replacing {story_num} in template for each selected story.
 * Optionally inserts @pause between different epic groups.
 */
export function generateQueueFromTemplate(
  template: string,
  stories: QueueStoryInfo[],
  insertPauseBetweenEpics: boolean,
): string {
  if (stories.length === 0) return '';

  // Normalize CRLF → LF and strip leading/trailing blank lines
  const trimmed = template.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '');
  const blocks: string[] = [];
  let prevEpicNum = stories[0].epicNum;

  for (const story of stories) {
    if (insertPauseBetweenEpics && story.epicNum !== prevEpicNum) {
      blocks.push(`@pause Epic ${prevEpicNum} 완료`);
      prevEpicNum = story.epicNum;
    }

    const replaced = trimmed.replace(/\{story_num\}/g, story.storyNum);
    blocks.push(replaced);
  }

  return blocks.join('\n');
}
