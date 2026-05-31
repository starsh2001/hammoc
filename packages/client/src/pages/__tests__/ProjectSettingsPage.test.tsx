// @vitest-environment jsdom
/**
 * Story 31.1 (Task C.5 / F.1): ProjectSettingsPage BMad nav gate.
 *
 * Verifies the "BMad 설정" nav item appears only for BMad projects
 * (isBmadProject=true) and routes to the BmadConfigPanel, and that the existing
 * General / Harness nav items are unaffected.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { ProjectSettingsPage } from '../ProjectSettingsPage';
import { useProjectStore } from '../../stores/projectStore';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ projectSlug: 'test-slug' }) };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: unknown) => (typeof def === 'string' ? def : key),
  }),
}));

vi.mock('../../stores/projectStore', () => ({ useProjectStore: vi.fn() }));

vi.mock('../../components/settings/ProjectSettingsSection', () => ({
  ProjectSettingsSection: () => <div data-testid="general-section" />,
}));
vi.mock('../../components/settings/HarnessWorkbenchSection', () => ({
  HarnessWorkbenchSection: () => <div data-testid="harness-section" />,
}));
vi.mock('../../components/settings/BmadConfigPanel', () => ({
  BmadConfigPanel: () => <div data-testid="bmad-config-panel-mock" />,
}));

const mockUseProjectStore = useProjectStore as unknown as Mock;

function seedProjects(isBmadProject: boolean) {
  mockUseProjectStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ projects: [{ projectSlug: 'test-slug', isBmadProject }] }),
  );
}

describe('ProjectSettingsPage — BMad nav gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the BMad nav item for a BMad project', () => {
    seedProjects(true);
    render(<ProjectSettingsPage />);
    expect(screen.getByTestId('project-settings-nav-bmad')).toBeInTheDocument();
    // Existing nav items unaffected (regression guard).
    expect(screen.getByTestId('project-settings-nav-general')).toBeInTheDocument();
    expect(screen.getByTestId('project-settings-nav-harness')).toBeInTheDocument();
  });

  it('hides the BMad nav item for a non-BMad project', () => {
    seedProjects(false);
    render(<ProjectSettingsPage />);
    expect(screen.queryByTestId('project-settings-nav-bmad')).not.toBeInTheDocument();
    expect(screen.getByTestId('project-settings-nav-general')).toBeInTheDocument();
  });

  it('routes to BmadConfigPanel when the BMad nav item is clicked', () => {
    seedProjects(true);
    render(<ProjectSettingsPage />);
    fireEvent.click(screen.getByTestId('project-settings-nav-bmad'));
    expect(screen.getByTestId('bmad-config-panel-mock')).toBeInTheDocument();
  });
});
