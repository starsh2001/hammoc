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
  /** Additional prompts to queue in the prompt chain after the task command */
  chainPrompts?: string[];
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

  // Check for epics with gaps (plannedStories > actual stories) first.
  // An earlier epic with unfilled planned slots takes priority over the latest epic.
  for (const epic of data.epics) {
    const epicNum = typeof epic.number === 'number' ? epic.number : parseInt(String(epic.number), 10);
    if (isNaN(epicNum)) continue;
    if (epic.plannedStories && epic.stories.length < epic.plannedStories) {
      // Find the highest existing story number in this epic
      let maxInEpic = 0;
      for (const s of epic.stories) {
        const m = s.file.match(/^(\d+)\.(\d+)/);
        if (m) maxInEpic = Math.max(maxInEpic, parseInt(m[2], 10));
      }
      return `${epicNum}.${maxInEpic + 1}`;
    }
  }

  // No gaps found — find the highest story number and increment
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

  // Check if the current epic's planned stories are exhausted
  const currentEpic = data.epics.find((ep) => ep.number === maxEpic);
  if (currentEpic) {
    const currentEpicStoryCount = currentEpic.stories.length;
    const planned = currentEpic.plannedStories ?? currentEpicStoryCount;
    if (currentEpicStoryCount >= planned) {
      // Current epic is full — find the next epic
      const numericEpics = data.epics
        .map((ep) => (typeof ep.number === 'number' ? ep.number : parseInt(String(ep.number), 10)))
        .filter((n) => !isNaN(n) && n > maxEpic)
        .sort((a, b) => a - b);
      if (numericEpics.length > 0) {
        return `${numericEpics[0]}.1`;
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

  const hasBrainstorming = suppExists(supp, 'brainstorming');
  const hasBrief = suppExists(supp, 'brief');

  // PRD is promoted to primary only after project brief exists
  const prdVariant: ActionVariant = hasBrief ? 'primary' : 'secondary';

  // Brainstorming & Brief are primary until their prerequisites are met
  if (!hasBrainstorming) {
    recs.push({
      id: 'brainstorming',
      title: i18n.t('common:rec.brainstorming'),
      description: i18n.t('common:rec.brainstormingDesc'),
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*brainstorm',
      variant: 'primary',
      iconKey: 'lightbulb',
    });
  }

  if (!hasBrief) {
    recs.push({
      id: 'brief',
      title: i18n.t('common:rec.projectBrief'),
      description: i18n.t('common:rec.projectBriefDesc'),
      agentCommand: '/BMad:agents:analyst',
      taskCommand: '*create-project-brief',
      variant: 'primary',
      iconKey: 'clipboard',
    });
  }

  // PRD creation (gate document)
  recs.push({
    id: 'create-prd',
    title: i18n.t('common:rec.createPrd'),
    description: i18n.t('common:rec.createPrdDesc'),
    agentCommand: '/BMad:agents:pm',
    taskCommand: '*create-prd',
    variant: prdVariant,
    iconKey: 'file-text',
  });

  // Secondary: other optional supplementary docs
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

/** Find the first review-status story matching specific gate results */
function firstReviewStoryByGate(data: BmadStatusResponse, ...gates: (string | undefined)[]): BmadStoryStatus | undefined {
  const reviewStatuses = ['Review', 'Ready for Review', 'Ready for Done'];
  for (const epic of data.epics) {
    const found = epic.stories.find(
      (s) => reviewStatuses.includes(s.status) && gates.includes(s.gateResult),
    );
    if (found) return found;
  }
  return undefined;
}

function buildImplementationRecommendations(data: BmadStatusResponse): NextStepRecommendation[] {
  const recs: NextStepRecommendation[] = [];

  // Discover stories at each workflow stage
  const qaDoneStory = firstReviewStoryByGate(data, 'PASS', 'WAIVED');
  const qaFixedStory = firstReviewStoryByGate(data, 'FIXED');
  const qaFailedStory = firstReviewStoryByGate(data, 'FAIL', 'CONCERNS');
  const reviewStory = firstReviewStoryByGate(data, undefined);
  const inProgressStory = firstStoryByStatus(data, 'In Progress', 'InProgress');
  const approvedStory = firstStoryByStatus(data, 'Approved');
  const draftStory = firstStoryByStatus(data, 'Draft');

  const stories = allStories(data);
  const totalPlanned = data.epics.reduce((s, e) => s + (e.plannedStories ?? e.stories.length), 0);
  const doneCount = countByStatus(data, 'Done');
  const nonDoneStories = stories.filter((s) => s.status !== 'Done');

  // Recommendations follow reverse workflow order (finish what's closest to done first)

  // Priority 1: QA passed/waived — mark Done
  if (qaDoneStory) {
    const num = storyNum(qaDoneStory.file);
    const label = qaDoneStory.title ? `${num}. ${qaDoneStory.title}` : qaDoneStory.file;

    recs.push({
      id: 'commit-and-mark-done',
      title: i18n.t('common:rec.commitAndMarkDone'),
      description: label,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `Please review the current changes with git diff, commit only the files related to story ${num}, then update the story status to Done.`,
      variant: 'primary',
      iconKey: 'git-commit',
      storyFile: qaDoneStory.file,
    });
    recs.push({
      id: 'mark-done',
      title: i18n.t('common:rec.markDone'),
      description: i18n.t('common:rec.markDoneDesc'),
      agentCommand: '/BMad:agents:dev',
      taskCommand: `Update story ${num} status to Done. The QA gate has passed.`,
      variant: 'secondary',
      iconKey: 'check-circle',
      storyFile: qaDoneStory.file,
    });
    recs.push({
      id: 'request-qa-review',
      title: i18n.t('common:rec.requestQAReview'),
      description: label,
      agentCommand: '/BMad:agents:qa',
      taskCommand: `*review ${num}`,
      variant: 'secondary',
      iconKey: 'rotate-ccw',
      storyFile: qaDoneStory.file,
    });
  }

  // Priority 2: QA fixed — re-review
  if (qaFixedStory) {
    const num = storyNum(qaFixedStory.file);
    const label = qaFixedStory.title ? `${num}. ${qaFixedStory.title}` : qaFixedStory.file;
    const hasPrior = recs.length > 0;

    recs.push({
      id: 'review-fixed',
      title: i18n.t('common:rec.qaReview'),
      description: i18n.t('common:rec.qaReviewDesc', { label }),
      agentCommand: '/BMad:agents:qa',
      taskCommand: `*review ${num}`,
      variant: hasPrior ? 'secondary' : 'primary',
      iconKey: 'check-circle',
      storyFile: qaFixedStory.file,
    });
  }

  // Priority 3: QA failed/concerns — apply fixes
  if (qaFailedStory) {
    const num = storyNum(qaFailedStory.file);
    const label = qaFailedStory.title ? `${num}. ${qaFailedStory.title}` : qaFailedStory.file;
    const hasPrior = recs.length > 0;

    recs.push({
      id: 'review-apply-fixes',
      title: i18n.t('common:rec.applyQaFixes'),
      description: label,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*review-qa ${num}\n\nAfter completing QA fixes, update the gate YAML file's gate field to 'FIXED'.`,
      variant: hasPrior ? 'secondary' : 'primary',
      iconKey: 'wrench',
      storyFile: qaFailedStory.file,
    });
  }

  // Priority 4: Ready for Review (no gate) — request QA
  if (reviewStory) {
    const num = storyNum(reviewStory.file);
    const label = reviewStory.title ? `${num}. ${reviewStory.title}` : reviewStory.file;
    const hasPrior = recs.length > 0;

    recs.push({
      id: 'review-story',
      title: i18n.t('common:rec.qaReview'),
      description: i18n.t('common:rec.qaReviewDesc', { label }),
      agentCommand: '/BMad:agents:qa',
      taskCommand: `*review ${num}`,
      variant: hasPrior ? 'secondary' : 'primary',
      iconKey: 'check-circle',
      storyFile: reviewStory.file,
    });
  }

  // Priority 5: In Progress — continue development
  if (inProgressStory) {
    const num = storyNum(inProgressStory.file);
    const label = inProgressStory.title ? `${num}. ${inProgressStory.title}` : inProgressStory.file;
    const hasPrior = recs.length > 0;

    recs.push({
      id: 'continue-dev',
      title: i18n.t('common:rec.continueDev'),
      description: label,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*develop-story ${num}`,
      variant: hasPrior ? 'secondary' : 'primary',
      iconKey: 'code',
      storyFile: inProgressStory.file,
    });
  }

  // Priority 6: Approved — validate (two variants) then start development
  if (approvedStory) {
    const num = storyNum(approvedStory.file);
    const label = approvedStory.title ? `${num}. ${approvedStory.title}` : approvedStory.file;
    const hasPrior = recs.length > 0;

    // 6a: Start development (primary action)
    recs.push({
      id: 'start-dev',
      title: i18n.t('common:rec.startDev'),
      description: label,
      agentCommand: '/BMad:agents:dev',
      taskCommand: `*develop-story ${num}`,
      variant: hasPrior ? 'secondary' : 'primary',
      iconKey: 'play',
      storyFile: approvedStory.file,
    });

    // 6b: Validate and fix — validate then fix all issues
    recs.push({
      id: 'validate-fix-approved-story',
      title: i18n.t('common:rec.validateAndFixStory'),
      description: label,
      agentCommand: '/BMad:agents:po',
      taskCommand: `*validate-story-draft ${num}`,
      variant: 'secondary',
      iconKey: 'shield-check',
      storyFile: approvedStory.file,
      chainPrompts: ['Please fix all Critical Issues, Should-Fix Issues, and Nice-to-Have Issues identified in the validation results above.', 'If the story status is not Approved, please change it to Approved now.'],
    });

    // 6c: Validate only — no fix, approve after user fixes
    recs.push({
      id: 'validate-approved-story',
      title: i18n.t('common:rec.validateStoryOnly'),
      description: label,
      agentCommand: '/BMad:agents:po',
      taskCommand: `*validate-story-draft ${num} After the user's requested fixes are complete, change the story status to Approved.`,
      variant: 'secondary',
      iconKey: 'shield-check',
      storyFile: approvedStory.file,
    });
  }

  // Priority 7: Draft — validate story (two variants)
  if (draftStory) {
    const num = storyNum(draftStory.file);
    const label = draftStory.title ? `${num}. ${draftStory.title}` : draftStory.file;
    const hasPrior = recs.length > 0;

    // 7a: Validate and fix — validate then fix all issues
    recs.push({
      id: 'validate-fix-story',
      title: i18n.t('common:rec.validateAndFixStory'),
      description: label,
      agentCommand: '/BMad:agents:po',
      taskCommand: `*validate-story-draft ${num}`,
      variant: hasPrior ? 'secondary' : 'primary',
      iconKey: 'shield-check',
      storyFile: draftStory.file,
      chainPrompts: ['Please fix all Critical Issues, Should-Fix Issues, and Nice-to-Have Issues identified in the validation results above.', 'If the story status is not Approved, please change it to Approved now.'],
    });

    // 7b: Validate only — no fix, approve after user fixes
    recs.push({
      id: 'validate-story',
      title: i18n.t('common:rec.validateStoryOnly'),
      description: label,
      agentCommand: '/BMad:agents:po',
      taskCommand: `*validate-story-draft ${num} After the user's requested fixes are complete, change the story status to Approved.`,
      variant: 'secondary',
      iconKey: 'shield-check',
      storyFile: draftStory.file,
    });
  }

  // Priority 8: Create next story — only when no in-progress stories exist
  const hasActionable = recs.length > 0;
  const hasMorePlanned = totalPlanned > stories.length;
  const allDone = stories.length > 0 && nonDoneStories.length === 0;

  if (nonDoneStories.length === 0 && (!hasActionable || hasMorePlanned)) {
    const nextNum = nextStoryNum(data);
    recs.push({
      id: 'create-story',
      title: stories.length === 0 ? i18n.t('common:rec.createFirstStory') : i18n.t('common:rec.createNextStory'),
      description: `Story ${nextNum}`,
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
