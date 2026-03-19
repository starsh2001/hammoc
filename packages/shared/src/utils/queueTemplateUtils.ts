/**
 * Queue Template Utilities — extract stories from PRD and generate queue scripts
 * [Source: Story 15.5 - Task 2]
 */

import type { QueueStoryInfo } from '../types/queue.js';

/** Compare epic numbers for sorting: numbers first, then strings (BE-* before BS) */
function compareEpicNum(a: number | string, b: number | string): number {
  if (a === b) return 0;
  const aIsNum = typeof a === 'number';
  const bIsNum = typeof b === 'number';
  if (aIsNum && bIsNum) return (a as number) - (b as number);
  if (aIsNum) return -1;
  if (bIsNum) return 1;
  if (a === 'BS') return 1;
  if (b === 'BS') return -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

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

  stories.sort((a, b) => compareEpicNum(a.epicNum, b.epicNum) || a.storyIndex - b.storyIndex);

  return stories;
}

/**
 * Generate a queue script by replacing template variables for each selected story.
 * Supported variables: {story_num}, {epic_num}, {story_index}, {story_title}, {date}
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
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  for (const story of stories) {
    if (insertPauseBetweenEpics && story.epicNum !== prevEpicNum) {
      blocks.push(`@pause Epic ${prevEpicNum} completed`);
      prevEpicNum = story.epicNum;
    }

    const replaced = trimmed
      .replace(/\{story_num\}/g, story.storyNum)
      .replace(/\{epic_num\}/g, String(story.epicNum))
      .replace(/\{story_index\}/g, String(story.storyIndex))
      .replace(/\{story_title\}/g, story.title ?? '')
      .replace(/\{date\}/g, dateStr);
    blocks.push(replaced);
  }

  return blocks.join('\n');
}
