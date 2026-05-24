/**
 * Story 30.1 (Task 6.7): SecretOnSharedDialog tests.
 *
 * Verifies all three actions wire to their respective callbacks, the
 * auto-create-sibling notice shows / hides correctly, and the listing
 * renders the secret locations the server reported.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SecretOnSharedDialog } from '../SecretOnSharedDialog';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object' && 'path' in opts) {
          return `${key}:${(opts as { path: string }).path}`;
        }
        return key;
      },
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

function renderDialog(overrides: Partial<React.ComponentProps<typeof SecretOnSharedDialog>> = {}) {
  const props: React.ComponentProps<typeof SecretOnSharedDialog> = {
    targetPath: '.claude/settings.json',
    siblingLocalPath: '.claude/settings.local.json',
    willAutoCreateSibling: true,
    secretLocations: ['env.GITHUB_TOKEN'],
    onMoveToLocal: vi.fn(),
    onMarkNotSecret: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<SecretOnSharedDialog {...props} />);
  return props;
}

describe('SecretOnSharedDialog', () => {
  it('renders the three primary actions', () => {
    renderDialog();
    expect(screen.getByTestId('secret-on-shared-move-to-local')).toBeInTheDocument();
    expect(screen.getByTestId('secret-on-shared-mark-not-secret')).toBeInTheDocument();
    expect(screen.getByTestId('secret-on-shared-cancel')).toBeInTheDocument();
  });

  it('invokes onMoveToLocal', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByTestId('secret-on-shared-move-to-local'));
    expect(props.onMoveToLocal).toHaveBeenCalledTimes(1);
  });

  it('invokes onMarkNotSecret', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByTestId('secret-on-shared-mark-not-secret'));
    expect(props.onMarkNotSecret).toHaveBeenCalledTimes(1);
  });

  it('invokes onCancel', () => {
    const props = renderDialog();
    fireEvent.click(screen.getByTestId('secret-on-shared-cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the auto-create notice with the sibling path interpolated', () => {
    renderDialog({ willAutoCreateSibling: true, siblingLocalPath: '.claude/foo.local.json' });
    expect(
      screen.getByText('harness.tools.secretOnShared.autoCreateSiblingNotice:.claude/foo.local.json'),
    ).toBeInTheDocument();
  });

  it('hides the auto-create notice when the sibling already exists', () => {
    renderDialog({ willAutoCreateSibling: false });
    expect(
      screen.queryByText(/autoCreateSiblingNotice/),
    ).not.toBeInTheDocument();
  });

  it('lists detected secret locations', () => {
    renderDialog({ secretLocations: ['env.AWS_KEY', 'env.STRIPE'] });
    expect(screen.getByText('env.AWS_KEY')).toBeInTheDocument();
    expect(screen.getByText('env.STRIPE')).toBeInTheDocument();
  });

  /**
   * Story 30.7 (Task C.6): the dialog now lets the caller (the workbench
   * mount, forwarded from the panel's secret-shared dialog payload) pick
   * the 1st-action label key. When unset, the v0.7 default kicks in so the
   * existing visual layout is preserved.
   */
  it('falls back to the default `action.moveToLocal` label when actionLabelKey is omitted (visual default)', () => {
    renderDialog();
    expect(
      screen.getByTestId('secret-on-shared-move-to-local').textContent,
    ).toContain('harness.tools.secretOnShared.action.moveToLocal');
  });

  it('uses the supplied actionLabelKey for the 1st-action label when provided', () => {
    renderDialog({
      actionLabelKey: 'harness.tools.secretOnShared.action.routeToLocalMcp',
    });
    expect(
      screen.getByTestId('secret-on-shared-move-to-local').textContent,
    ).toContain('harness.tools.secretOnShared.action.routeToLocalMcp');
  });
});
