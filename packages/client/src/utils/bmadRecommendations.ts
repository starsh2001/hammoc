/**
 * BMad workflow recommendation engine.
 * Pure functions that analyze BmadStatusResponse and return next-step recommendations.
 *
 * Every recommendation specifies an agentCommand (which agent to activate)
 * and a taskCommand (a star command to send after the agent is active).
 *
 * Workflow Phases:
 *  1. pre-prd        — PRD does not exist yet; offer supplementary docs + PRD creation
 *  2. pre-architecture — PRD exists but Architecture does not; offer arch + optional FE docs
 *  3. implementation  — Both gates (PRD + Architecture) exist; story-level cycle
 */

import type { BmadStatusResponse, BmadSupplementaryDoc, BmadStoryStatus } from '@bmad-studio/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 'pre-prd' | 'pre-architecture' | 'implementation';
export type ActionVariant = 'primary' | 'secondary';

export interface NextStepRecommendation {
  /** Unique key for React list rendering */
  id: string;
  /** Short title shown on the button */
  title: string;
  /** One-liner describing the action */
  description: string;
  /** Agent slash command — always present, e.g. "/BMad:agents:pm" */
  agentCommand: string;
  /** Star command sent after agent activation, e.g. "*create-prd" */
  taskCommand: string;
  variant: ActionVariant;
  /** Key used by the UI component to pick a lucide icon */
  iconKey: string;
  /** Related story file name (implementation phase only) */
  storyFile?: string;
}

export interface PhaseInfo {
  phase: Phase;
  /** Human-readable label for the UI */
  label: string;
}

export interface NextStepResult {
  phase: PhaseInfo;
  recommendations: NextStepRecommendation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSupp(supplementary: BmadSupplementaryDoc[], key: string): BmadSupplementaryDoc | undefined {
  return supplementary.find((d) => d.key === key);
}

function suppExists(supplementary: BmadSupplementaryDoc[], key: string): boolean {
  return findSupp(supplementary, key)?.exists ?? false;
}

/** Collect all stories across all epics */
function allStories(data: BmadStatusResponse): BmadStoryStatus[] {
  return data.epics.flatMap((e) => e.stories);
}

/** Find the first story matching a status */
function firstStoryByStatus(data: BmadStatusResponse, status: string): BmadStoryStatus | undefined {
  for (const epic of data.epics) {
    const found = epic.stories.find((s) => s.status === status);
    if (found) return found;
  }
  return undefined;
}

/** Count stories by status */
function countByStatus(data: BmadStatusResponse, status: string): number {
  return data.epics.reduce((sum, e) => sum + e.stories.filter((s) => s.status === status).length, 0);
}

/** Extract story number (e.g. "1.1") from file name (e.g. "1.1.story.md") */
function storyNum(file: string): string {
  return file.match(/^(\d+\.\d+)/)?.[1] ?? file;
}

/** Compute the next story number to draft based on existing stories */
function nextStoryNum(data: BmadStatusResponse): string {
  const stories = allStories(data);
  if (stories.length === 0) {
    // No stories yet — first epic's first story
    const firstEpic = data.epics[0];
    return firstEpic ? `${firstEpic.number}.1` : '1.1';
  }
  // Find the highest story number and increment the minor part
  let maxEpic = 0;
  let maxStory = 0;
  for (const s of stories) {
    const m = s.file.match(/^(\d+)\.(\d+)/);
    if (m) {
      const e = parseInt(m[1], 10);
      const n = parseInt(m[2], 10);
      if (e > maxEpic || (e === maxEpic && n > maxStory)) {
        maxEpic = e;
        maxStory = n;
      }
    }
  }
  return `${maxEpic}.${maxStory + 1}`;
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

export function detectPhase(data: BmadStatusResponse): PhaseInfo {
  if (!data.documents.prd.exists) {
    return { phase: 'pre-prd', label: 'PRD \uc791\uc131 \uc804' };
  }
  if (!data.documents.architecture.exists) {
    return { phase: 'pre-architecture', label: '\uc544\ud0a4\ud14d\ucc98 \uc791\uc131 \uc804' };
  }
  return { phase: 'implementation', label: '\uad6c\ud604 \ub2e8\uacc4' };
}

// ---------------------------------------------------------------------------
// Phase-specific recommendation builders
// ---------------------------------------------------------------------------

function buildPrePrdRecommendations(data: BmadStatusResponse): NextStepRecommendation[] {
  const supp = data.documents.supplementary;
  const recs: NextStepRecommendation[] = [];

  // Primary: PRD creation (always present as the gate)
  recs.push({
    id: 'create-prd',
    title: 'PRD \uc791\uc131',
    description: 'PM \uc5d0\uc774\uc804\ud2b8\uc640 \ud568\uaed8 \uc694\uad6c\uc0ac\ud56d \ubb38\uc11c\ub97c \uc791\uc131\ud569\ub2c8\ub2e4',
    agentCommand: '/BMad:agents:pm',
    taskCommand: '*create-prd',
    variant: 'primary',
    iconKey: 'file-text',
  });

  // Secondary: optional supplementary docs that don't exist yet
  if (!suppExists(supp, 'brainstorming')) {
    recs.push({
      id: 'brainstorming',
      title: '\ube0c\ub808\uc778\uc2a4\ud1a0\ubc0d',
      description: '\uc544\uc774\ub514\uc5b4\ub97c \uc790\uc720\ub86d\uac8c \ud0d0\uc0c9\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*brainstorm',
      variant: 'secondary',
      iconKey: 'lightbulb',
    });
  }

  if (!suppExists(supp, 'market-research')) {
    recs.push({
      id: 'market-research',
      title: '\ub9c8\ucf13 \ub9ac\uc11c\uce58',
      description: '\uc2dc\uc7a5 \ud658\uacbd\uacfc \ud2b8\ub80c\ub4dc\ub97c \ubd84\uc11d\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*perform-market-research',
      variant: 'secondary',
      iconKey: 'search',
    });
  }

  if (!suppExists(supp, 'competitor-analysis')) {
    recs.push({
      id: 'competitor-analysis',
      title: '\uacbd\uc7c1\uc0ac \ubd84\uc11d',
      description: '\uacbd\uc7c1 \uc81c\ud488\uc744 \uc870\uc0ac\ud558\uace0 \ube44\uad50\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*create-competitor-analysis',
      variant: 'secondary',
      iconKey: 'users',
    });
  }

  if (!suppExists(supp, 'brief')) {
    recs.push({
      id: 'brief',
      title: '\ud504\ub85c\uc81d\ud2b8 \ube0c\ub9ac\ud504',
      description: '\ud504\ub85c\uc81d\ud2b8 \uac1c\uc694\ub97c \uc815\ub9ac\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*create-project-brief',
      variant: 'secondary',
      iconKey: 'clipboard',
    });
  }

  return recs;
}

function buildPreArchitectureRecommendations(data: BmadStatusResponse): NextStepRecommendation[] {
  const supp = data.documents.supplementary;
  const recs: NextStepRecommendation[] = [];

  const hasFESpec = suppExists(supp, 'front-end-spec');

  // Primary: Backend architecture (always available)
  recs.push({
    id: 'create-backend-arch',
    title: '\ubc31\uc5d4\ub4dc \uc544\ud0a4\ud14d\ucc98',
    description: 'Architect \uc5d0\uc774\uc804\ud2b8\uc640 \ud568\uaed8 \ubc31\uc5d4\ub4dc \uc124\uacc4\ub97c \uc791\uc131\ud569\ub2c8\ub2e4',
    agentCommand: '/BMad:agents:architect',
    taskCommand: '*create-backend-architecture',
    variant: 'primary',
    iconKey: 'blocks',
  });

  // Frontend architecture (only when FE spec exists)
  if (hasFESpec) {
    recs.push({
      id: 'create-frontend-arch',
      title: 'FE \uc544\ud0a4\ud14d\ucc98',
      description: 'FE \uc2a4\ud399 \uae30\ubc18 \ud504\ub860\ud2b8\uc5d4\ub4dc \uc544\ud0a4\ud14d\ucc98\ub97c \uc791\uc131\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:architect',
      taskCommand: '*create-front-end-architecture',
      variant: 'primary',
      iconKey: 'layout',
    });
  }

  // Full-stack architecture (always available)
  recs.push({
    id: 'create-fullstack-arch',
    title: '\ud480\uc2a4\ud0dd \uc544\ud0a4\ud14d\ucc98',
    description: '\ud480\uc2a4\ud0dd \uc2dc\uc2a4\ud15c \uc124\uacc4\ub97c \ud55c\ubc88\uc5d0 \uc791\uc131\ud569\ub2c8\ub2e4',
    agentCommand: '/BMad:agents:architect',
    taskCommand: '*create-full-stack-architecture',
    variant: 'primary',
    iconKey: 'blocks',
  });

  // Secondary: FE spec (if not exists)
  if (!hasFESpec) {
    recs.push({
      id: 'fe-spec',
      title: 'FE \uc2a4\ud399 \uc791\uc131',
      description: 'UX Expert\uc640 \ud568\uaed8 \ud504\ub860\ud2b8\uc5d4\ub4dc \uc2a4\ud399\uc744 \uc791\uc131\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:ux-expert',
      taskCommand: '*create-front-end-spec',
      variant: 'secondary',
      iconKey: 'palette',
    });
  }

  return recs;
}

function buildImplementationRecommendations(data: BmadStatusResponse): NextStepRecommendation[] {
  const recs: NextStepRecommendation[] = [];

  const inProgressStory = firstStoryByStatus(data, 'In Progress');
  const draftStory = firstStoryByStatus(data, 'Draft');
  const approvedStory = firstStoryByStatus(data, 'Approved');
  const stories = allStories(data);
  const totalPlanned = data.epics.reduce((s, e) => s + (e.plannedStories ?? e.stories.length), 0);
  const doneCount = countByStatus(data, 'Done');
  const nonDoneStories = stories.filter((s) => s.status !== 'Done');

  // Priority 1: In Progress story
  if (inProgressStory) {
    const num = storyNum(inProgressStory.file);
    const label = inProgressStory.title
      ? `${num}. ${inProgressStory.title}`
      : inProgressStory.file;

    recs.push({
      id: 'continue-dev',
      title: '\uac1c\ubc1c \uc774\uc5b4\uac00\uae30',
      description: label,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*develop-story ${num}`,
      variant: 'primary',
      iconKey: 'code',
      storyFile: inProgressStory.file,
    });

    recs.push({
      id: 'qa-review',
      title: 'QA \ub9ac\ubdf0 \uc694\uccad',
      description: `${label} \uad6c\ud604 \uacb0\uacfc\ub97c \uac80\ud1a0\ud569\ub2c8\ub2e4`,
      agentCommand: '/BMad:agents:qa',
      taskCommand: `*review ${num}`,
      variant: 'secondary',
      iconKey: 'check-circle',
      storyFile: inProgressStory.file,
    });

    recs.push({
      id: 'apply-qa-fixes',
      title: 'QA \ubc18\uc601',
      description: 'QA \ud53c\ub4dc\ubc31\uc744 \ucf54\ub4dc\uc5d0 \ubc18\uc601\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*review-qa ${num}`,
      variant: 'secondary',
      iconKey: 'wrench',
      storyFile: inProgressStory.file,
    });
  }

  // Priority 2: Draft story (needs validation)
  if (draftStory) {
    const num = storyNum(draftStory.file);
    const label = draftStory.title
      ? `${num}. ${draftStory.title}`
      : draftStory.file;

    recs.push({
      id: 'validate-story',
      title: '\uc2a4\ud1a0\ub9ac \uac80\uc99d',
      description: `${label}`,
      agentCommand: '/BMad:agents:po',
      taskCommand: `*validate-story-draft ${num}`,
      variant: inProgressStory ? 'secondary' : 'primary',
      iconKey: 'shield-check',
      storyFile: draftStory.file,
    });
  }

  // Priority 3: Approved story (ready for development)
  if (approvedStory) {
    const num = storyNum(approvedStory.file);
    const label = approvedStory.title
      ? `${num}. ${approvedStory.title}`
      : approvedStory.file;

    recs.push({
      id: 'start-dev',
      title: '\uac1c\ubc1c \uc2dc\uc791',
      description: `${label}`,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*develop-story ${num}`,
      variant: inProgressStory ? 'secondary' : 'primary',
      iconKey: 'play',
      storyFile: approvedStory.file,
    });
  }

  // Priority 4: Create next story
  // - Primary when no actionable stories exist
  // - Secondary when there are Draft/Approved stories (user might still want to queue up more)
  const hasActionable = !!(inProgressStory || draftStory || approvedStory);
  const hasMorePlanned = totalPlanned > stories.length;
  const allDone = stories.length > 0 && nonDoneStories.length === 0;

  if (!hasActionable || hasMorePlanned) {
    const nextNum = nextStoryNum(data);
    recs.push({
      id: 'create-story',
      title: allDone || stories.length === 0 ? (stories.length === 0 ? '\uccab \uc2a4\ud1a0\ub9ac \uc0dd\uc131' : '\ub2e4\uc74c \uc2a4\ud1a0\ub9ac \uc0dd\uc131') : '\ub2e4\uc74c \uc2a4\ud1a0\ub9ac \uc0dd\uc131',
      description: hasMorePlanned
        ? `\uc608\uc815\ub41c \uc2a4\ud1a0\ub9ac ${totalPlanned - doneCount}\uac1c \ub0a8\uc74c`
        : 'SM \uc5d0\uc774\uc804\ud2b8\uac00 PRD \uae30\ubc18\uc73c\ub85c \uc2a4\ud1a0\ub9ac\ub97c \uc0dd\uc131\ud569\ub2c8\ub2e4',
      agentCommand: '/BMad:agents:sm',
      taskCommand: `*draft ${nextNum}`,
      variant: hasActionable ? 'secondary' : 'primary',
      iconKey: 'plus-circle',
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeNextSteps(data: BmadStatusResponse): NextStepResult {
  const phase = detectPhase(data);

  let recommendations: NextStepRecommendation[];
  switch (phase.phase) {
    case 'pre-prd':
      recommendations = buildPrePrdRecommendations(data);
      break;
    case 'pre-architecture':
      recommendations = buildPreArchitectureRecommendations(data);
      break;
    case 'implementation':
      recommendations = buildImplementationRecommendations(data);
      break;
  }

  return { phase, recommendations };
}
