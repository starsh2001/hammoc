/**
 * Unit tests for bmadRecommendations — Phase detection & recommendation engine.
 */

import { describe, it, expect } from 'vitest';
import type { BmadStatusResponse, BmadSupplementaryDoc, BmadEpicStatus } from '@hammoc/shared';
import { detectPhase, computeNextSteps } from '../bmadRecommendations';

// ---------------------------------------------------------------------------
// Helpers for building test data
// ---------------------------------------------------------------------------

function makeSupp(key: string, exists: boolean): BmadSupplementaryDoc {
  return { key, label: key, exists, path: `docs/${key}.md` };
}

const DEFAULT_SUPP_KEYS = ['brainstorming', 'market-research', 'competitor-analysis', 'brief', 'front-end-spec', 'ui-architecture'];

function makeData(overrides: {
  prdExists?: boolean;
  archExists?: boolean;
  suppExisting?: string[];
  epics?: BmadEpicStatus[];
}): BmadStatusResponse {
  const {
    prdExists = false,
    archExists = false,
    suppExisting = [],
    epics = [],
  } = overrides;

  return {
    config: {},
    documents: {
      prd: { exists: prdExists, path: 'docs/prd.md' },
      architecture: { exists: archExists, path: 'docs/architecture.md' },
      supplementary: DEFAULT_SUPP_KEYS.map((k) => makeSupp(k, suppExisting.includes(k))),
    },
    auxiliaryDocuments: [],
    epics,
  };
}

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

describe('detectPhase', () => {
  it('returns pre-prd when PRD does not exist', () => {
    const data = makeData({ prdExists: false });
    expect(detectPhase(data).phase).toBe('pre-prd');
  });

  it('returns pre-architecture when PRD exists but architecture does not', () => {
    const data = makeData({ prdExists: true, archExists: false });
    expect(detectPhase(data).phase).toBe('pre-architecture');
  });

  it('returns implementation when both PRD and architecture exist', () => {
    const data = makeData({ prdExists: true, archExists: true });
    expect(detectPhase(data).phase).toBe('implementation');
  });
});

// ---------------------------------------------------------------------------
// Phase 1: pre-prd recommendations
// ---------------------------------------------------------------------------

describe('computeNextSteps — Phase 1 (pre-prd)', () => {
  it('recommends brainstorming and brief as primary when neither exists', () => {
    const { recommendations } = computeNextSteps(makeData({}));
    const brainstormRec = recommendations.find((r) => r.id === 'brainstorming');
    expect(brainstormRec).toBeDefined();
    expect(brainstormRec!.variant).toBe('primary');

    const briefRec = recommendations.find((r) => r.id === 'brief');
    expect(briefRec).toBeDefined();
    expect(briefRec!.variant).toBe('primary');

    // PRD should be secondary (gray) until brief exists
    const prdRec = recommendations.find((r) => r.id === 'create-prd');
    expect(prdRec).toBeDefined();
    expect(prdRec!.variant).toBe('secondary');
  });

  it('recommends only brief as primary when brainstorming exists', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brainstorming'] }),
    );
    const ids = recommendations.map((r) => r.id);
    expect(ids).not.toContain('brainstorming');

    const briefRec = recommendations.find((r) => r.id === 'brief');
    expect(briefRec).toBeDefined();
    expect(briefRec!.variant).toBe('primary');

    const prdRec = recommendations.find((r) => r.id === 'create-prd');
    expect(prdRec!.variant).toBe('secondary');
  });

  it('promotes PRD to primary when brief exists', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brief'] }),
    );
    const prdRec = recommendations.find((r) => r.id === 'create-prd');
    expect(prdRec).toBeDefined();
    expect(prdRec!.variant).toBe('primary');

    // brainstorming still primary (not yet done)
    const brainstormRec = recommendations.find((r) => r.id === 'brainstorming');
    expect(brainstormRec).toBeDefined();
    expect(brainstormRec!.variant).toBe('primary');
  });

  it('recommends market-research and competitor-analysis as secondary', () => {
    const { recommendations } = computeNextSteps(makeData({}));
    const secondaryIds = recommendations.filter((r) => r.variant === 'secondary').map((r) => r.id);
    expect(secondaryIds).toContain('market-research');
    expect(secondaryIds).toContain('competitor-analysis');
    expect(secondaryIds).toContain('create-prd');
  });

  it('omits supplementary docs that already exist', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brainstorming', 'brief'] }),
    );
    const ids = recommendations.map((r) => r.id);
    expect(ids).not.toContain('brainstorming');
    expect(ids).not.toContain('brief');
    // Others should still be present
    expect(ids).toContain('market-research');
    expect(ids).toContain('competitor-analysis');
  });

  it('only returns PRD as primary when all supplementary docs exist', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brainstorming', 'market-research', 'competitor-analysis', 'brief'] }),
    );
    const primaryRecs = recommendations.filter((r) => r.variant === 'primary');
    expect(primaryRecs).toHaveLength(1);
    expect(primaryRecs[0].id).toBe('create-prd');
  });

  it('orders recommendations: brainstorming → brief → PRD → secondary docs', () => {
    const { recommendations } = computeNextSteps(makeData({}));
    const ids = recommendations.map((r) => r.id);
    expect(ids).toEqual(['brainstorming', 'brief', 'create-prd', 'market-research', 'competitor-analysis']);
  });

  it('orders recommendations: brief → PRD when only brainstorming exists', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brainstorming'] }),
    );
    const ids = recommendations.map((r) => r.id);
    expect(ids).toEqual(['brief', 'create-prd', 'market-research', 'competitor-analysis']);
  });

  it('orders recommendations: brainstorming → PRD when brief exists', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brief'] }),
    );
    const ids = recommendations.map((r) => r.id);
    expect(ids).toEqual(['brainstorming', 'create-prd', 'market-research', 'competitor-analysis']);
  });
});

// ---------------------------------------------------------------------------
// Phase 2: pre-architecture recommendations
// ---------------------------------------------------------------------------

describe('computeNextSteps — Phase 2 (pre-architecture)', () => {
  it('includes backend and fullstack architecture as primary', () => {
    const { recommendations } = computeNextSteps(makeData({ prdExists: true }));
    const backendRec = recommendations.find((r) => r.id === 'create-backend-arch');
    expect(backendRec).toBeDefined();
    expect(backendRec!.variant).toBe('primary');
    expect(backendRec!.taskCommand).toBe('%create-backend-arch');

    const fullstackRec = recommendations.find((r) => r.id === 'create-fullstack-arch');
    expect(fullstackRec).toBeDefined();
    expect(fullstackRec!.variant).toBe('primary');
    expect(fullstackRec!.taskCommand).toBe('%create-fullstack-arch');
  });

  it('includes frontend architecture only when FE spec exists', () => {
    // Without FE spec: no frontend arch
    const { recommendations: withoutFE } = computeNextSteps(makeData({ prdExists: true }));
    expect(withoutFE.find((r) => r.id === 'create-frontend-arch')).toBeUndefined();

    // With FE spec: frontend arch available
    const { recommendations: withFE } = computeNextSteps(
      makeData({ prdExists: true, suppExisting: ['front-end-spec'] }),
    );
    const feArch = withFE.find((r) => r.id === 'create-frontend-arch');
    expect(feArch).toBeDefined();
    expect(feArch!.taskCommand).toBe('%create-frontend-arch');
  });

  it('recommends FE spec when not exists', () => {
    const { recommendations } = computeNextSteps(makeData({ prdExists: true }));
    const feRec = recommendations.find((r) => r.id === 'fe-spec');
    expect(feRec).toBeDefined();
    expect(feRec!.variant).toBe('secondary');
    expect(feRec!.taskCommand).toBe('%create-frontend-spec');
  });

  it('does not recommend FE spec when it exists', () => {
    const { recommendations } = computeNextSteps(
      makeData({ prdExists: true, suppExisting: ['front-end-spec'] }),
    );
    expect(recommendations.find((r) => r.id === 'fe-spec')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: implementation recommendations
// ---------------------------------------------------------------------------

describe('computeNextSteps — Phase 3 (implementation)', () => {
  const baseOpts = { prdExists: true, archExists: true };

  it('recommends creating first story when no epics have stories', () => {
    const { recommendations } = computeNextSteps(makeData({ ...baseOpts, epics: [] }));
    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeDefined();
    expect(createRec!.variant).toBe('primary');
    expect(createRec!.taskCommand).toBe('%draft-story 1.1');
  });

  it('recommends story validation when Draft stories exist', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Draft' }] }],
      }),
    );
    // validate-fix-story is primary (validate + fix)
    const validateFixRec = recommendations.find((r) => r.id === 'validate-fix-story');
    expect(validateFixRec).toBeDefined();
    expect(validateFixRec!.variant).toBe('primary');
    expect(validateFixRec!.taskCommand).toBe('%validate-and-fix 1.1');

  });

  it('recommends starting dev when Approved stories exist', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Approved' }] }],
      }),
    );
    const devRec = recommendations.find((r) => r.id === 'start-dev');
    expect(devRec).toBeDefined();
    expect(devRec!.variant).toBe('primary');
  });

  it('recommends continuing dev when In Progress stories exist (not rejected)', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'In Progress' }] }],
      }),
    );
    const continueRec = recommendations.find((r) => r.id === 'continue-dev');
    expect(continueRec).toBeDefined();
    expect(continueRec!.variant).toBe('primary');
    expect(continueRec!.taskCommand).toBe('%develop-story 1.1');

    // qa-review and apply-qa-fixes should NOT be shown for non-rejected stories
    expect(recommendations.find((r) => r.id === 'qa-review')).toBeUndefined();
    expect(recommendations.find((r) => r.id === 'apply-qa-fixes')).toBeUndefined();
  });

  it('recommends applying QA fixes when Review story has FAIL gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review', gateResult: 'FAIL' }] }],
      }),
    );
    const fixRec = recommendations.find((r) => r.id === 'review-apply-fixes');
    expect(fixRec).toBeDefined();
    expect(fixRec!.variant).toBe('primary');
    expect(fixRec!.taskCommand).toBe('%apply-qa-fixes 1.1');
  });

  it('recommends QA review when story is in Review status (no gate)', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review' }] }],
      }),
    );
    const reviewRec = recommendations.find((r) => r.id === 'review-story');
    expect(reviewRec).toBeDefined();
    expect(reviewRec!.variant).toBe('primary');
    expect(reviewRec!.taskCommand).toBe('%qa-review 1.1');
  });

  it('recommends completing story when Review + PASS gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review', gateResult: 'PASS' }] }],
      }),
    );
    // commit-and-mark-done is primary
    const commitDoneRec = recommendations.find((r) => r.id === 'commit-and-mark-done');
    expect(commitDoneRec).toBeDefined();
    expect(commitDoneRec!.variant).toBe('primary');
    // mark-done is secondary
    const doneRec = recommendations.find((r) => r.id === 'mark-done');
    expect(doneRec).toBeDefined();
    expect(doneRec!.variant).toBe('secondary');
    expect(doneRec!.taskCommand).toBe('%mark-done 1.1');
    // Should also include re-request QA as secondary
    const qaRec = recommendations.find((r) => r.id === 'request-qa-review');
    expect(qaRec).toBeDefined();
    expect(qaRec!.variant).toBe('secondary');
    // Should not show review-story
    expect(recommendations.find((r) => r.id === 'review-story')).toBeUndefined();
  });

  it('recommends completing story when Review + WAIVED gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review', gateResult: 'WAIVED' }] }],
      }),
    );
    const commitDoneRec2 = recommendations.find((r) => r.id === 'commit-and-mark-done');
    expect(commitDoneRec2).toBeDefined();
    expect(commitDoneRec2!.variant).toBe('primary');
  });

  it('recommends applying QA fixes when Review + FAIL gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review', gateResult: 'FAIL' }] }],
      }),
    );
    const fixRec = recommendations.find((r) => r.id === 'review-apply-fixes');
    expect(fixRec).toBeDefined();
    expect(fixRec!.variant).toBe('primary');
    expect(fixRec!.taskCommand).toBe('%apply-qa-fixes 1.1');
  });

  it('recommends QA review for Ready for Review raw status (no gate)', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Ready for Review' }] }],
      }),
    );
    const reviewRec = recommendations.find((r) => r.id === 'review-story');
    expect(reviewRec).toBeDefined();
    expect(reviewRec!.taskCommand).toBe('%qa-review 1.1');
  });

  it('recommends completing story for Ready for Done raw status with PASS gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Ready for Done', gateResult: 'PASS' }] }],
      }),
    );
    const doneRec = recommendations.find((r) => r.id === 'mark-done');
    expect(doneRec).toBeDefined();
    const qaRec = recommendations.find((r) => r.id === 'request-qa-review');
    expect(qaRec).toBeDefined();
  });

  it('recommends applying QA fixes when Review + CONCERNS gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review', gateResult: 'CONCERNS' }] }],
      }),
    );
    const fixRec = recommendations.find((r) => r.id === 'review-apply-fixes');
    expect(fixRec).toBeDefined();
    expect(fixRec!.variant).toBe('primary');
  });

  it('recommends creating next story when stories are Done but more are planned', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [
              { file: '1.1.story.md', status: 'Done' },
              { file: '1.2.story.md', status: 'Done' },
            ],
            plannedStories: 4,
          },
        ],
      }),
    );
    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeDefined();
    expect(createRec!.title).toBe('다음 스토리 생성');
    expect(createRec!.description).toBe('Story 1.3');
  });

  it('In Progress stories take priority — Draft/Approved are secondary', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [
              { file: '1.1.story.md', status: 'In Progress' },
              { file: '1.2.story.md', status: 'Draft' },
              { file: '1.3.story.md', status: 'Approved' },
            ],
          },
        ],
      }),
    );

    // continue-dev should be primary
    const continueRec = recommendations.find((r) => r.id === 'continue-dev');
    expect(continueRec!.variant).toBe('primary');

    // start-dev should be secondary
    const devRec = recommendations.find((r) => r.id === 'start-dev');
    expect(devRec!.variant).toBe('secondary');
  });

  it('does not suggest creating next story when non-Done stories exist (even if more are planned)', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [{ file: '1.1.story.md', status: 'Draft' }],
            plannedStories: 5,
          },
        ],
      }),
    );
    // validate-fix-story is primary
    const validateFixRec = recommendations.find((r) => r.id === 'validate-fix-story');
    expect(validateFixRec).toBeDefined();
    expect(validateFixRec!.variant).toBe('primary');

    // create-story should NOT appear — finish current story first
    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeUndefined();
  });

  it('recommends creating next story when all done but more are planned', () => {
    const { phase, recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [
              { file: '1.1.story.md', status: 'Done' },
              { file: '1.2.story.md', status: 'Done' },
            ],
            plannedStories: 4,
          },
        ],
      }),
    );
    // Still in implementation phase because more stories are planned
    expect(phase.phase).toBe('implementation');
    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeDefined();
    expect(createRec!.title).toBe('다음 스토리 생성');
    expect(createRec!.description).toBe('Story 1.3');
  });

  it('includes story file reference in recommendations', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [{ file: '1.1.story.md', status: 'In Progress', title: 'Setup Foundation' }],
          },
        ],
      }),
    );
    const continueRec = recommendations.find((r) => r.id === 'continue-dev');
    expect(continueRec!.storyFile).toBe('1.1.story.md');
    expect(continueRec!.description).toContain('Setup Foundation');
  });
});

// ---------------------------------------------------------------------------
// Phase 4: completed recommendations
// ---------------------------------------------------------------------------

describe('computeNextSteps — Phase 4 (completed)', () => {
  const baseOpts = { prdExists: true, archExists: true };

  it('detects completed phase when all stories are Done and no more planned', () => {
    const data = makeData({
      ...baseOpts,
      epics: [
        {
          number: 1,
          name: 'E1',
          stories: [
            { file: '1.1.story.md', status: 'Done' },
            { file: '1.2.story.md', status: 'Done' },
          ],
        },
      ],
    });
    const { phase } = computeNextSteps(data);
    expect(phase.phase).toBe('completed');
    expect(phase.label).toBe('구현 완료');
  });

  it('stays in implementation when stories are Done but more are planned', () => {
    const data = makeData({
      ...baseOpts,
      epics: [
        {
          number: 1,
          name: 'E1',
          stories: [
            { file: '1.1.story.md', status: 'Done' },
            { file: '1.2.story.md', status: 'Done' },
          ],
          plannedStories: 5,
        },
      ],
    });
    const { phase } = computeNextSteps(data);
    expect(phase.phase).toBe('implementation');
  });

  it('recommends new epic and brainstorming when project is complete', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [
              { file: '1.1.story.md', status: 'Done' },
              { file: '1.2.story.md', status: 'Done' },
            ],
          },
        ],
      }),
    );

    const newEpic = recommendations.find((r) => r.id === 'new-epic');
    expect(newEpic).toBeDefined();
    expect(newEpic!.variant).toBe('primary');
    expect(newEpic!.taskCommand).toBe('%brownfield-create-epic');

    const brainstorm = recommendations.find((r) => r.id === 'brainstorm-features');
    expect(brainstorm).toBeDefined();
    expect(brainstorm!.variant).toBe('primary');

    const addStory = recommendations.find((r) => r.id === 'add-brownfield-story');
    expect(addStory).toBeDefined();
    expect(addStory!.variant).toBe('secondary');
  });

  it('advances to next epic when current epic stories are exhausted', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 5,
            name: 'E5',
            stories: [
              { file: '5.1.story.md', status: 'Done' },
              { file: '5.2.story.md', status: 'Done' },
              { file: '5.3.story.md', status: 'Done' },
              { file: '5.4.story.md', status: 'Done' },
              { file: '5.5.story.md', status: 'Done' },
            ],
            plannedStories: 5,
          },
          {
            number: 6,
            name: 'E6',
            stories: [],
            plannedStories: 3,
          },
        ],
      }),
    );
    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeDefined();
    // Should suggest 6.1, not 5.6
    expect(createRec!.taskCommand).toBe('%draft-story 6.1');
  });

  it('stays in current epic when planned stories remain', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 5,
            name: 'E5',
            stories: [
              { file: '5.1.story.md', status: 'Done' },
              { file: '5.2.story.md', status: 'Done' },
              { file: '5.3.story.md', status: 'Done' },
            ],
            plannedStories: 5,
          },
          {
            number: 6,
            name: 'E6',
            stories: [],
            plannedStories: 3,
          },
        ],
      }),
    );
    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeDefined();
    // Should suggest 5.4, not 6.1
    expect(createRec!.taskCommand).toBe('%draft-story 5.4');
  });

  it('does NOT recommend creating a story with *draft command', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [
          {
            number: 1,
            name: 'E1',
            stories: [{ file: '1.1.story.md', status: 'Done' }],
          },
        ],
      }),
    );
    const createStory = recommendations.find((r) => r.id === 'create-story');
    expect(createStory).toBeUndefined();
  });
});
