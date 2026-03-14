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
  it('always includes PRD creation as primary', () => {
    const { recommendations } = computeNextSteps(makeData({}));
    const prdRec = recommendations.find((r) => r.id === 'create-prd');
    expect(prdRec).toBeDefined();
    expect(prdRec!.variant).toBe('primary');
    expect(prdRec!.agentCommand).toBe('/BMad:agents:pm');
  });

  it('recommends all missing supplementary docs as secondary', () => {
    const { recommendations } = computeNextSteps(makeData({}));
    const secondaryIds = recommendations.filter((r) => r.variant === 'secondary').map((r) => r.id);
    expect(secondaryIds).toContain('brainstorming');
    expect(secondaryIds).toContain('market-research');
    expect(secondaryIds).toContain('competitor-analysis');
    expect(secondaryIds).toContain('brief');
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

  it('only returns PRD when all supplementary docs exist', () => {
    const { recommendations } = computeNextSteps(
      makeData({ suppExisting: ['brainstorming', 'market-research', 'competitor-analysis', 'brief'] }),
    );
    // Only PRD is expected (no secondary docs for pre-prd supplementary)
    // front-end-spec and ui-architecture are Phase 2 docs, not shown in Phase 1
    const primaryRecs = recommendations.filter((r) => r.variant === 'primary');
    expect(primaryRecs).toHaveLength(1);
    expect(primaryRecs[0].id).toBe('create-prd');
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
    expect(backendRec!.agentCommand).toBe('/BMad:agents:architect');
    expect(backendRec!.taskCommand).toBe('*create-backend-architecture');

    const fullstackRec = recommendations.find((r) => r.id === 'create-fullstack-arch');
    expect(fullstackRec).toBeDefined();
    expect(fullstackRec!.variant).toBe('primary');
    expect(fullstackRec!.taskCommand).toBe('*create-full-stack-architecture');
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
    expect(feArch!.taskCommand).toBe('*create-front-end-architecture');
  });

  it('recommends FE spec when not exists', () => {
    const { recommendations } = computeNextSteps(makeData({ prdExists: true }));
    const feRec = recommendations.find((r) => r.id === 'fe-spec');
    expect(feRec).toBeDefined();
    expect(feRec!.variant).toBe('secondary');
    expect(feRec!.agentCommand).toBe('/BMad:agents:ux-expert');
    expect(feRec!.taskCommand).toBe('*create-front-end-spec');
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
    expect(createRec!.agentCommand).toBe('/BMad:agents:sm');
    expect(createRec!.taskCommand).toBe('*draft 1.1');
  });

  it('recommends story validation when Draft stories exist', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Draft' }] }],
      }),
    );
    const validateRec = recommendations.find((r) => r.id === 'validate-story');
    expect(validateRec).toBeDefined();
    expect(validateRec!.variant).toBe('primary');
    expect(validateRec!.agentCommand).toBe('/BMad:agents:po');
    expect(validateRec!.taskCommand).toBe('*validate-story-draft 1.1');
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
    expect(devRec!.agentCommand).toBe('/BMad:agents:dev');
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
    expect(continueRec!.agentCommand).toBe('/BMad:agents:dev');
    expect(continueRec!.taskCommand).toBe('*develop-story 1.1');

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
    expect(fixRec!.agentCommand).toBe('/BMad:agents:dev');
    expect(fixRec!.taskCommand).toBe('*review-qa 1.1');
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
    expect(reviewRec!.agentCommand).toBe('/BMad:agents:qa');
    expect(reviewRec!.taskCommand).toBe('*review 1.1');
  });

  it('recommends completing story when Review + PASS gate', () => {
    const { recommendations } = computeNextSteps(
      makeData({
        ...baseOpts,
        epics: [{ number: 1, name: 'E1', stories: [{ file: '1.1.story.md', status: 'Review', gateResult: 'PASS' }] }],
      }),
    );
    const doneRec = recommendations.find((r) => r.id === 'mark-done');
    expect(doneRec).toBeDefined();
    expect(doneRec!.variant).toBe('primary');
    expect(doneRec!.agentCommand).toBe('/BMad:agents:dev');
    expect(doneRec!.taskCommand).toContain('Done');
    // Should also include re-request QA as secondary
    const qaRec = recommendations.find((r) => r.id === 'request-qa-review');
    expect(qaRec).toBeDefined();
    expect(qaRec!.variant).toBe('secondary');
    expect(qaRec!.agentCommand).toBe('/BMad:agents:qa');
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
    const doneRec = recommendations.find((r) => r.id === 'mark-done');
    expect(doneRec).toBeDefined();
    expect(doneRec!.variant).toBe('primary');
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
    expect(fixRec!.agentCommand).toBe('/BMad:agents:dev');
    expect(fixRec!.taskCommand).toBe('*review-qa 1.1');
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
    expect(reviewRec!.agentCommand).toBe('/BMad:agents:qa');
    expect(reviewRec!.taskCommand).toBe('*review 1.1');
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
    expect(doneRec!.agentCommand).toBe('/BMad:agents:dev');
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
    expect(createRec!.description).toContain('2');
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

    // validate-story should be secondary (In Progress takes priority)
    const validateRec = recommendations.find((r) => r.id === 'validate-story');
    expect(validateRec!.variant).toBe('secondary');

    // start-dev should be secondary
    const devRec = recommendations.find((r) => r.id === 'start-dev');
    expect(devRec!.variant).toBe('secondary');
  });

  it('also suggests creating next story as secondary when Draft exists and more are planned', () => {
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
    const validateRec = recommendations.find((r) => r.id === 'validate-story');
    expect(validateRec).toBeDefined();
    expect(validateRec!.variant).toBe('primary');

    const createRec = recommendations.find((r) => r.id === 'create-story');
    expect(createRec).toBeDefined();
    expect(createRec!.variant).toBe('secondary');
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
    expect(createRec!.description).toContain('2');
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
    expect(newEpic!.agentCommand).toBe('/BMad:agents:pm');
    expect(newEpic!.taskCommand).toBe('*brownfield-create-epic');

    const brainstorm = recommendations.find((r) => r.id === 'brainstorm-features');
    expect(brainstorm).toBeDefined();
    expect(brainstorm!.variant).toBe('primary');
    expect(brainstorm!.agentCommand).toBe('/BMad:agents:analyst');

    const addStory = recommendations.find((r) => r.id === 'add-brownfield-story');
    expect(addStory).toBeDefined();
    expect(addStory!.variant).toBe('secondary');
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
