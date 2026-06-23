/**
 * AdvancedSettingsSection — Debug section gate (Story BS-6)
 *
 * The Debug / Diagnostics group is rendered ONLY when GET /api/server/info reports
 * isDebugMode (HAMMOC_DEBUG=1); otherwise it is entirely absent from the DOM (AC-3).
 *
 * i18n is forced to Korean in the test environment, so the group header is matched
 * against the ko/settings.json string.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdvancedSettingsSection } from '../AdvancedSettingsSection';
import { usePreferencesStore } from '../../../stores/preferencesStore';
import { useSessionStore } from '../../../stores/sessionStore';

const mockGet = vi.fn();
vi.mock('../../../services/api/client', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
}));
vi.mock('../../../services/api/preferences', () => ({
  preferencesApi: {
    getSystemPromptTemplate: vi.fn().mockResolvedValue({ sections: { common: '', sdk: '' }, variables: [] }),
    update: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('../../../services/api/projects', () => ({
  projectsApi: {
    getSystemPrompt: vi.fn().mockResolvedValue({ sections: { common: '', engineSpecific: '' }, resolved: '', variables: [] }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('AdvancedSettingsSection — debug section gate (Story BS-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePreferencesStore.setState({ preferences: {}, overrides: [], loaded: true });
    useSessionStore.setState({ currentProjectSlug: null });
  });

  it('renders the debug group when the server reports isDebugMode:true', async () => {
    mockGet.mockResolvedValue({ isDevMode: false, isDebugMode: true, version: '1.0.0' });
    render(<AdvancedSettingsSection />);
    await waitFor(() => expect(screen.getByText('디버그 / 진단')).toBeInTheDocument());
  });

  it('omits the debug group from the DOM when isDebugMode:false', async () => {
    mockGet.mockResolvedValue({ isDevMode: false, isDebugMode: false, version: '1.0.0' });
    render(<AdvancedSettingsSection />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/server/info'));
    expect(screen.queryByText('디버그 / 진단')).not.toBeInTheDocument();
  });
});
