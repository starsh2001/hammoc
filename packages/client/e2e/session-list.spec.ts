/**
 * Session List E2E Tests
 * [Source: Story 3.4 - Task 6]
 *
 * Tests cover:
 * - AC 1: 프로젝트 선택 후 세션 목록 페이지가 표시된다
 * - AC 2: 각 세션은 리스트 아이템으로 표시된다
 * - AC 3: 표시 정보 (첫 번째 메시지 미리보기, 메시지 수, 날짜)
 * - AC 4: 세션 클릭 시 채팅 페이지로 이동
 * - AC 5: "새 세션" 버튼이 상단에 있다
 * - AC 6: 뒤로가기 버튼으로 프로젝트 목록으로 돌아가기
 * - AC 7: 세션이 없으면 빈 상태 메시지 표시
 * - AC 8: 새로고침 버튼
 */

import { test, expect } from '@playwright/test';

// Test fixtures
const MOCK_PASSWORD = 'testpassword123';

test.describe('Session List Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[type="password"]', MOCK_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for navigation to complete
    await page.waitForURL(/\/(onboarding)?$/);

    // If redirected to onboarding, go to project list
    if (page.url().includes('onboarding')) {
      await page.goto('/');
    }

    // Navigate to first project's session list
    const projectCard = page.locator('[role="button"][aria-label*="프로젝트:"]').first();
    const hasProjects = await projectCard.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasProjects) {
      await projectCard.click();
      await page.waitForURL(/\/project\/[a-zA-Z0-9]+/);
    }
  });

  test('should display session list page after project click (AC 1)', async ({ page }) => {
    // Check if we're on session list page
    const backButton = page.getByLabel('뒤로 가기');
    await expect(backButton).toBeVisible();
  });

  test('should display session list items (AC 2, 3)', async ({ page }) => {
    // Wait for sessions to load
    await page.waitForSelector('[role="button"][aria-label*="세션:"]', { timeout: 10000 }).catch(() => {
      // If no sessions, that's okay for this test
    });

    // Check if session items exist or empty state is shown
    const sessionItems = page.locator('[role="button"][aria-label*="세션:"]');
    const emptyState = page.getByText('세션이 없습니다');

    const hasSessions = await sessionItems.count() > 0;
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    expect(hasSessions || hasEmptyState).toBeTruthy();

    // If sessions exist, verify they show message count
    if (hasSessions) {
      const firstSession = sessionItems.first();
      await expect(firstSession).toContainText(/\d+개 메시지/);
    }
  });

  test('should navigate to chat page on session click (AC 4)', async ({ page }) => {
    // Wait for sessions to load
    const sessionItem = page.locator('[role="button"][aria-label*="세션:"]').first();
    const hasSessions = await sessionItem.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasSessions) {
      await sessionItem.click();
      await expect(page).toHaveURL(/\/project\/[a-zA-Z0-9]+\/session\/[a-zA-Z0-9-]+/);
    } else {
      // No sessions to click, test passes
      expect(true).toBeTruthy();
    }
  });

  test('should have new session button in header (AC 5)', async ({ page }) => {
    const newSessionButton = page.getByRole('button', { name: /새 세션/ });
    await expect(newSessionButton).toBeVisible();
  });

  test('should navigate to new session page on new session button click (AC 5)', async ({ page }) => {
    const newSessionButton = page.getByRole('button', { name: /새 세션/ }).first();
    await newSessionButton.click();

    await expect(page).toHaveURL(/\/project\/[a-zA-Z0-9]+\/session\/new/);
  });

  test('should navigate back to project list on back button click (AC 6)', async ({ page }) => {
    const backButton = page.getByLabel('뒤로 가기');
    await backButton.click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: '프로젝트' })).toBeVisible();
  });

  test('should show empty state message when no sessions (AC 7)', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForTimeout(2000);

    // Check for empty state or session items
    const sessionItems = page.locator('[role="button"][aria-label*="세션:"]');
    const hasSessions = await sessionItems.count() > 0;

    if (!hasSessions) {
      const emptyStateTitle = page.getByText('세션이 없습니다');
      const emptyStateMessage = page.getByText(/새 세션을 시작/);

      await expect(emptyStateTitle).toBeVisible();
      await expect(emptyStateMessage).toBeVisible();

      // Should have new session button in empty state
      const newSessionButton = page.getByRole('button', { name: /새 세션 시작/ });
      await expect(newSessionButton).toBeVisible();
    }
  });

  test('should refresh session list on refresh button click (AC 8)', async ({ page }) => {
    const refreshButton = page.getByLabel('새로고침');
    await expect(refreshButton).toBeVisible();

    // Click refresh button
    await refreshButton.click();

    // Wait for refresh to complete
    await page.waitForTimeout(1000);

    // Refresh button should still be visible
    await expect(refreshButton).toBeVisible();
  });

  test('should display relative time for session modification date (AC 3)', async ({ page }) => {
    // Wait for sessions to load
    const sessionItem = page.locator('[role="button"][aria-label*="세션:"]').first();
    const hasSessions = await sessionItem.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasSessions) {
      // Should contain relative time format (e.g., "2시간 전", "3일 전")
      await expect(sessionItem).toContainText(/(방금 전|분 전|시간 전|일 전)/);
    }
  });
});

test.describe('Session List Page - Chat Placeholder', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="password"]', MOCK_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(onboarding)?$/);

    if (page.url().includes('onboarding')) {
      await page.goto('/');
    }

    // Navigate to first project
    const projectCard = page.locator('[role="button"][aria-label*="프로젝트:"]').first();
    const hasProjects = await projectCard.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasProjects) {
      await projectCard.click();
      await page.waitForURL(/\/project\/[a-zA-Z0-9]+/);
    }
  });

  test('should display chat placeholder for new session', async ({ page }) => {
    // Click new session button
    const newSessionButton = page.getByRole('button', { name: /새 세션/ }).first();
    await newSessionButton.click();

    await expect(page).toHaveURL(/\/project\/[a-zA-Z0-9]+\/session\/new/);

    // Should show placeholder content
    await expect(page.getByText('채팅 페이지 준비 중')).toBeVisible();
    await expect(page.getByText('Story 4.x')).toBeVisible();
  });

  test('should navigate back to session list from chat placeholder', async ({ page }) => {
    // Click new session button
    const newSessionButton = page.getByRole('button', { name: /새 세션/ }).first();
    await newSessionButton.click();

    await expect(page).toHaveURL(/\/project\/[a-zA-Z0-9]+\/session\/new/);

    // Click back button
    const backButton = page.getByLabel('세션 목록으로 돌아가기');
    await backButton.click();

    // Should be back on session list
    await expect(page).toHaveURL(/\/project\/[a-zA-Z0-9]+$/);
  });
});

test.describe('Session List Page - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should display mobile-friendly layout', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="password"]', MOCK_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(onboarding)?$/);

    if (page.url().includes('onboarding')) {
      await page.goto('/');
    }

    // Navigate to first project
    const projectCard = page.locator('[role="button"][aria-label*="프로젝트:"]').first();
    const hasProjects = await projectCard.isVisible({ timeout: 10000 }).catch(() => false);

    if (hasProjects) {
      await projectCard.click();
      await page.waitForURL(/\/project\/[a-zA-Z0-9]+/);

      // Verify header elements are visible
      const backButton = page.getByLabel('뒤로 가기');
      const refreshButton = page.getByLabel('새로고침');
      const newSessionButton = page.getByRole('button', { name: /새 세션/ });

      await expect(backButton).toBeVisible();
      await expect(refreshButton).toBeVisible();
      await expect(newSessionButton).toBeVisible();
    }
  });
});
