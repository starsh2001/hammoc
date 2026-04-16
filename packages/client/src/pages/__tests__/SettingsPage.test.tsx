/**
 * SettingsPage Tests
 * [Source: Story 10.1 - Task 6]
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SettingsPage } from '../SettingsPage';

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderSettingsPage(initialRoute = '/settings') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:tab" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-1: SettingsPage renders with title
  it('renders with "설정" title', () => {
    renderSettingsPage();
    expect(screen.getByText('설정')).toBeInTheDocument();
  });

  // TC-2: All section navigation items are displayed
  it('displays all section navigation items', () => {
    renderSettingsPage();
    expect(screen.getAllByText('전역 설정').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('프로젝트 설정').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('알림').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('도움말').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('만든이').length).toBeGreaterThanOrEqual(1);
  });

  // TC-3: Back button navigates to home
  it('navigates to home when back button is clicked', () => {
    renderSettingsPage();
    const backButton = screen.getByLabelText('뒤로 가기');
    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  // TC-4: Section navigation click navigates to section
  it('navigates to section when nav item is clicked', () => {
    renderSettingsPage();
    // Click on "알림" in the desktop sidebar
    const notificationButtons = screen.getAllByText('알림');
    fireEvent.click(notificationButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/settings/notifications');
  });

  // TC-5: URL parameter activates correct section
  it('activates notifications section when navigated to /settings/notifications', () => {
    renderSettingsPage('/settings/notifications');
    // The desktop sidebar should show the active section with font-medium
    const notificationButtons = screen.getAllByText('알림');
    const hasActiveStyle = notificationButtons.some(
      (btn) => btn.closest('button')?.className.includes('font-medium')
    );
    expect(hasActiveStyle).toBe(true);
  });

  // TC-6: Header uses CSS variable for background (supports theme switching)
  it('applies proper header classes', () => {
    renderSettingsPage();
    const header = screen.getByText('설정').closest('header');
    expect(header?.className).toContain('bg-[var(--bg-footer)]');
  });

  // TC-7: Mobile accordion toggle works
  it('toggles mobile accordion section', () => {
    renderSettingsPage();
    // Find accordion buttons (mobile view has buttons with aria-expanded)
    const accordionButtons = screen.getAllByRole('button', { expanded: false });
    const notificationAccordion = accordionButtons.find((btn) =>
      btn.textContent?.includes('알림')
    );

    if (notificationAccordion) {
      fireEvent.click(notificationAccordion);
      expect(notificationAccordion.getAttribute('aria-expanded')).toBe('true');
    }
  });
});
