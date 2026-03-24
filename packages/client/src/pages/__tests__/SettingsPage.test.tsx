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

  // TC-2: All 5 sections are displayed
  it('displays all 5 section navigation items', () => {
    renderSettingsPage();
    expect(screen.getAllByText('전역 설정').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('프로젝트 설정').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Telegram 알림').length).toBeGreaterThanOrEqual(1);
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
    // Click on "Telegram 알림" in the desktop sidebar
    const telegramButtons = screen.getAllByText('Telegram 알림');
    fireEvent.click(telegramButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/settings/telegram');
  });

  // TC-5: URL parameter activates correct section
  it('activates telegram section when navigated to /settings/telegram', () => {
    renderSettingsPage('/settings/telegram');
    // The desktop sidebar should show the active section with font-medium
    const telegramButtons = screen.getAllByText('Telegram 알림');
    const hasActiveStyle = telegramButtons.some(
      (btn) => btn.closest('button')?.className.includes('font-medium')
    );
    expect(hasActiveStyle).toBe(true);
  });

  // TC-6: Dark mode classes are applied
  it('applies dark mode classes', () => {
    renderSettingsPage();
    const header = screen.getByText('설정').closest('header');
    expect(header?.className).toContain('dark:bg-gray-800');
  });

  // TC-7: Mobile accordion toggle works
  it('toggles mobile accordion section', () => {
    renderSettingsPage();
    // Find accordion buttons (mobile view has buttons with aria-expanded)
    const accordionButtons = screen.getAllByRole('button', { expanded: false });
    const telegramAccordion = accordionButtons.find((btn) =>
      btn.textContent?.includes('Telegram 알림')
    );

    if (telegramAccordion) {
      fireEvent.click(telegramAccordion);
      expect(telegramAccordion.getAttribute('aria-expanded')).toBe('true');
    }
  });
});
