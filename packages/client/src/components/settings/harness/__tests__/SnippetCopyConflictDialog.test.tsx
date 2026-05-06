/**
 * Story 29.2 (Task 6.3): SnippetCopyConflictDialog tests.
 *
 * Covers:
 *  - dialog renders three radio options (overwrite / rename / abort)
 *  - submitting "overwrite" returns the choice without a rename name
 *  - submitting "abort" closes the copy
 *  - rename flow validates an empty name (required)
 *  - rename flow validates the unchanged-name case (must differ from original)
 *  - rename flow rejects path-separator characters (reserved)
 *  - rename flow rejects characters outside NAME_RE (pattern)
 *  - rename flow accepts a valid distinct name and forwards it to onSubmit
 *  - clicking the close affordance triggers onClose
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', async (orig) => {
  const actual = await orig<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (opts && typeof opts === 'object' && opts.defaultValue) {
          return String(opts.defaultValue);
        }
        return key;
      },
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
  };
});

import { SnippetCopyConflictDialog } from '../SnippetCopyConflictDialog';

function renderDialog(overrides: Partial<Parameters<typeof SnippetCopyConflictDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <SnippetCopyConflictDialog
      snippetName="commit-and-done"
      targetScope="user"
      defaultRenameName="commit-and-done"
      onSubmit={onSubmit}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSubmit, onClose };
}

describe('SnippetCopyConflictDialog', () => {
  it('renders all three conflict-resolution radios', () => {
    renderDialog();
    expect(screen.getByTestId('snippet-conflict-overwrite')).toBeTruthy();
    expect(screen.getByTestId('snippet-conflict-rename')).toBeTruthy();
    expect(screen.getByTestId('snippet-conflict-abort')).toBeTruthy();
  });

  it('submits the overwrite choice with no rename name', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(onSubmit).toHaveBeenCalledWith('overwrite', undefined);
  });

  it('submits the abort choice when selected', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-abort'));
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(onSubmit).toHaveBeenCalledWith('abort', undefined);
  });

  it('flags an empty rename name with the required error', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-rename'));
    const input = screen.getByTestId('snippet-conflict-rename-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(screen.getByTestId('snippet-conflict-rename-error').textContent).toMatch(/required/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('flags an unchanged rename name with the unchanged error', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-rename'));
    // The default rename name equals the original — submitting must error.
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(screen.getByTestId('snippet-conflict-rename-error').textContent).toMatch(/distinct/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('flags path separators with the reserved error', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-rename'));
    const input = screen.getByTestId('snippet-conflict-rename-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'evil/path' } });
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(screen.getByTestId('snippet-conflict-rename-error').textContent).toMatch(/separator/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('flags characters outside NAME_RE with the pattern error', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-rename'));
    const input = screen.getByTestId('snippet-conflict-rename-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'has space' } });
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(screen.getByTestId('snippet-conflict-rename-error').textContent).toMatch(
      /letters, digits/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('forwards a valid distinct rename name to onSubmit', async () => {
    const { onSubmit } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-conflict-rename'));
    const input = screen.getByTestId('snippet-conflict-rename-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'commit-and-done-2' } });
    await user.click(screen.getByTestId('snippet-conflict-submit'));
    expect(onSubmit).toHaveBeenCalledWith('rename', 'commit-and-done-2');
  });

  it('triggers onClose when the backdrop is clicked', async () => {
    const { onClose } = renderDialog();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('snippet-copy-conflict-dialog'));
    expect(onClose).toHaveBeenCalled();
  });
});
