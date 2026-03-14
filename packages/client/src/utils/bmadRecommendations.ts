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

import type { BmadStatusResponse, BmadSupplementaryDoc, BmadStoryStatus } from '@hammoc/shared';
import i18n from '../i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Phase = 'pre-prd' | 'pre-architecture' | 'implementation' | 'completed';
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

/** Find the first story matching a status (or any of multiple statuses) */
function firstStoryByStatus(data: BmadStatusResponse, ...statuses: string[]): BmadStoryStatus | undefined {
  for (const epic of data.epics) {
    const found = epic.stories.find((s) => statuses.includes(s.status));
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
    return { phase: 'pre-prd', label: i18n.t('common:phase.prePrd') };
  }
  if (!data.documents.architecture.exists) {
    return { phase: 'pre-architecture', label: i18n.t('common:phase.preArchitecture') };
  }

  // Check if all planned work is complete
  const stories = allStories(data);
  const totalPlanned = data.epics.reduce((s, e) => s + (e.plannedStories ?? e.stories.length), 0);
  const nonDoneStories = stories.filter((s) => s.status !== 'Done');
  if (stories.length > 0 && nonDoneStories.length === 0 && totalPlanned <= stories.length) {
    return { phase: 'completed', label: i18n.t('common:phase.completed') };
  }

  return { phase: 'implementation', label: i18n.t('common:phase.implementation') };
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
    title: i18n.t('common:rec.createPrd'),
    description: i18n.t('common:rec.createPrdDesc'),
    agentCommand: '/BMad:agents:pm',
    taskCommand: '*create-prd',
    variant: 'primary',
    iconKey: 'file-text',
  });

  // Secondary: optional supplementary docs that don't exist yet
  if (!suppExists(supp, 'brainstorming')) {
    recs.push({
      id: 'brainstorming',
      title: i18n.t('common:rec.brainstorming'),
      description: i18n.t('common:rec.brainstormingDesc'),
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*brainstorm',
      variant: 'secondary',
      iconKey: 'lightbulb',
    });
  }

  if (!suppExists(supp, 'market-research')) {
    recs.push({
      id: 'market-research',
      title: i18n.t('common:rec.marketResearch'),
      description: i18n.t('common:rec.marketResearchDesc'),
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*perform-market-research',
      variant: 'secondary',
      iconKey: 'search',
    });
  }

  if (!suppExists(supp, 'competitor-analysis')) {
    recs.push({
      id: 'competitor-analysis',
      title: i18n.t('common:rec.competitorAnalysis'),
      description: i18n.t('common:rec.competitorAnalysisDesc'),
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*create-competitor-analysis',
      variant: 'secondary',
      iconKey: 'users',
    });
  }

  if (!suppExists(supp, 'brief')) {
    recs.push({
      id: 'brief',
      title: i18n.t('common:rec.projectBrief'),
      description: i18n.t('common:rec.projectBriefDesc'),
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
    title: i18n.t('common:rec.backendArch'),
    description: i18n.t('common:rec.backendArchDesc'),
    agentCommand: '/BMad:agents:architect',
    taskCommand: '*create-backend-architecture',
    variant: 'primary',
    iconKey: 'blocks',
  });

  // Frontend architecture (only when FE spec exists)
  if (hasFESpec) {
    recs.push({
      id: 'create-frontend-arch',
      title: i18n.t('common:rec.feArch'),
      description: i18n.t('common:rec.feArchDesc'),
      agentCommand: '/BMad:agents:architect',
      taskCommand: '*create-front-end-architecture',
      variant: 'primary',
      iconKey: 'layout',
    });
  }

  // Full-stack architecture (always available)
  recs.push({
    id: 'create-fullstack-arch',
    title: i18n.t('common:rec.fullstackArch'),
    description: i18n.t('common:rec.fullstackArchDesc'),
    agentCommand: '/BMad:agents:architect',
    taskCommand: '*create-full-stack-architecture',
    variant: 'primary',
    iconKey: 'blocks',
  });

  // Secondary: FE spec (if not exists)
  if (!hasFESpec) {
    recs.push({
      id: 'fe-spec',
      title: i18n.t('common:rec.feSpec'),
      description: i18n.t('common:rec.feSpecDesc'),
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

  const inProgressStory = firstStoryByStatus(data, 'In Progress', 'InProgress');
  const reviewStory = firstStoryByStatus(data, 'Review', 'Ready for Review', 'Ready for Done');
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

    // In-progress — primary action is continuing development
    recs.push({
      id: 'continue-dev',
      title: i18n.t('common:rec.continueDev'),
      description: label,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*develop-story ${num}`,
      variant: 'primary',
      iconKey: 'code',
      storyFile: inProgressStory.file,
    });
  }

  // Priority 2: Review story — branch on gate result
  if (reviewStory) {
    const num = storyNum(reviewStory.file);
    const label = reviewStory.title
      ? `${num}. ${reviewStory.title}`
      : reviewStory.file;
    const gate = reviewStory.gateResult;

    if (gate === 'PASS' || gate === 'WAIVED') {
      // QA passed — recommend marking the story as Done
      recs.push({
        id: 'mark-done',
        title: i18n.t('common:rec.markDone'),
        description: i18n.t('common:rec.markDoneDesc'),
        agentCommand: '/BMad:agents:dev',
        taskCommand: `Update story ${num} status to Done. The QA gate has passed.`,
        variant: inProgressStory ? 'secondary' : 'primary',
        iconKey: 'check-circle',
        storyFile: reviewStory.file,
      });
      // Secondary: re-request QA review
      recs.push({
        id: 'request-qa-review',
        title: i18n.t('common:rec.requestQAReview'),
        description: label,
        agentCommand: '/BMad:agents:qa',
        taskCommand: `*review ${num}`,
        variant: 'secondary',
        iconKey: 'rotate-ccw',
        storyFile: reviewStory.file,
      });
    } else if (gate === 'FAIL' || gate === 'CONCERNS') {
      // QA failed — recommend applying fixes
      recs.push({
        id: 'review-apply-fixes',
        title: i18n.t('common:rec.applyQaFixes'),
        description: label,
        agentCommand: '/BMad:agents:dev',
        taskCommand: `*review-qa ${num}`,
        variant: inProgressStory ? 'secondary' : 'primary',
        iconKey: 'wrench',
        storyFile: reviewStory.file,
      });
    } else {
      // No gate yet — recommend QA review
      recs.push({
        id: 'review-story',
        title: i18n.t('common:rec.qaReview'),
        description: i18n.t('common:rec.qaReviewDesc', { label }),
        agentCommand: '/BMad:agents:qa',
        taskCommand: `*review ${num}`,
        variant: inProgressStory ? 'secondary' : 'primary',
        iconKey: 'check-circle',
        storyFile: reviewStory.file,
      });
    }
  }

  // Priority 3: Draft story (needs validation)
  if (draftStory) {
    const num = storyNum(draftStory.file);
    const label = draftStory.title
      ? `${num}. ${draftStory.title}`
      : draftStory.file;

    recs.push({
      id: 'validate-story',
      title: i18n.t('common:rec.validateStory'),
      description: `${label}`,
      agentCommand: '/BMad:agents:po',
      taskCommand: `*validate-story-draft ${num}`,
      variant: (inProgressStory || reviewStory) ? 'secondary' : 'primary',
      iconKey: 'shield-check',
      storyFile: draftStory.file,
    });
  }

  // Priority 4: Approved story (ready for development)
  if (approvedStory) {
    const num = storyNum(approvedStory.file);
    const label = approvedStory.title
      ? `${num}. ${approvedStory.title}`
      : approvedStory.file;

    recs.push({
      id: 'start-dev',
      title: i18n.t('common:rec.startDev'),
      description: `${label}`,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*develop-story ${num}`,
      variant: (inProgressStory || reviewStory) ? 'secondary' : 'primary',
      iconKey: 'play',
      storyFile: approvedStory.file,
    });
  }

  // Priority 5: Create next story
  // - Primary when no actionable stories exist
  // - Secondary when there are Draft/Approved stories (user might still want to queue up more)
  const hasActionable = !!(inProgressStory || reviewStory || draftStory || approvedStory);
  const hasMorePlanned = totalPlanned > stories.length;
  const allDone = stories.length > 0 && nonDoneStories.length === 0;

  if (!hasActionable || hasMorePlanned) {
    const nextNum = nextStoryNum(data);
    recs.push({
      id: 'create-story',
      title: allDone || stories.length === 0 ? (stories.length === 0 ? i18n.t('common:rec.createFirstStory') : i18n.t('common:rec.createNextStory')) : i18n.t('common:rec.createNextStory'),
      description: hasMorePlanned
        ? i18n.t('common:rec.storiesRemaining', { count: totalPlanned - doneCount })
        : i18n.t('common:rec.createStoryDesc'),
      agentCommand: '/BMad:agents:sm',
      taskCommand: `*draft ${nextNum}`,
      variant: hasActionable ? 'secondary' : 'primary',
      iconKey: 'plus-circle',
    });
  }

  return recs;
}

function buildCompletedRecommendations(data: BmadStatusResponse): NextStepRecommendation[] {
  const recs: NextStepRecommendation[] = [];
  const stories = allStories(data);
  const doneCount = countByStatus(data, 'Done');

  recs.push({
    id: 'brainstorm-features',
    title: i18n.t('common:rec.newFeatureBrainstorm'),
    description: i18n.t('common:rec.newFeatureBrainstormDesc'),
    agentCommand: '/BMad:agents:analyst',
    taskCommand: '*brainstorm',
    variant: 'primary',
    iconKey: 'lightbulb',
  });

  recs.push({
    id: 'new-epic',
    title: i18n.t('common:rec.addNewEpic'),
    description: i18n.t('common:rec.addNewEpicDesc'),
    agentCommand: '/BMad:agents:pm',
    taskCommand: '*brownfield-create-epic',
    variant: 'primary',
    iconKey: 'plus-circle',
  });

  recs.push({
    id: 'add-brownfield-story',
    title: i18n.t('common:rec.addStoryToEpic'),
    description: i18n.t('common:rec.addStoryToEpicDesc'),
    agentCommand: '/BMad:agents:sm',
    taskCommand: '*brownfield-create-story',
    variant: 'secondary',
    iconKey: 'file-text',
  });

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
    case 'completed':
      recommendations = buildCompletedRecommendations(data);
      break;
  }

  return { phase, recommendations };
}
