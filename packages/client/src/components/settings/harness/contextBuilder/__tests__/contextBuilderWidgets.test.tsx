// @vitest-environment jsdom
/**
 * Story 31.2 (Task C.4): unit tests for the 3 context-builder widgets —
 * FileListEditor (size/token display + missing placeholder + remove),
 * VariableToggleList (toggle + recentCommits count), CustomCommandBlock (AC5.a
 * acknowledge gate + AC5.c secret badge).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: unknown) => (typeof opts === 'string' ? opts : key) }),
}));
// Stub the picker so FileListEditor's "Add" can be asserted without fs calls.
vi.mock('../../bmad/BmadPathPickerDialog', () => ({
  BmadPathPickerDialog: ({ onSelect }: { onSelect: (p: string) => void }) => (
    <button data-testid="stub-picker" onClick={() => onSelect('docs/new.md')}>picker</button>
  ),
}));

import { FileListEditor } from '../FileListEditor';
import { VariableToggleList } from '../VariableToggleList';
import { CustomCommandBlock } from '../CustomCommandBlock';
import { createDefaultContextBuilderManifest } from '@hammoc/shared';

describe('FileListEditor', () => {
  it('shows byte size + approx tokens for known files and a missing badge otherwise', () => {
    const sizes = new Map([['docs/a.md', 4096]]);
    render(
      <FileListEditor
        projectSlug="slug"
        files={['docs/a.md', 'docs/gone.md']}
        sizes={sizes}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // 4096 bytes → "4.0 KB", ~1024 tokens (ceil 4096/4)
    expect(screen.getByText(/4\.0 KB/)).toBeTruthy();
    expect(screen.getByText(/~1024/)).toBeTruthy();
    // missing file shows the missing badge
    expect(screen.getByText('harness.contextBuilder.files.missingShort')).toBeTruthy();
  });

  it('calls onRemove and adds the picked path', () => {
    const onRemove = vi.fn();
    const onAdd = vi.fn();
    render(<FileListEditor projectSlug="slug" files={['docs/a.md']} sizes={new Map([['docs/a.md', 10]])} onAdd={onAdd} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId('context-builder-file-remove-docs/a.md'));
    expect(onRemove).toHaveBeenCalledWith('docs/a.md');
    fireEvent.click(screen.getByTestId('context-builder-file-add'));
    fireEvent.click(screen.getByTestId('stub-picker'));
    expect(onAdd).toHaveBeenCalledWith('docs/new.md');
  });
});

describe('VariableToggleList', () => {
  it('renders all 5 variables and toggles one', () => {
    const onToggle = vi.fn();
    render(
      <VariableToggleList
        variables={createDefaultContextBuilderManifest().variables}
        recentCommitsCount={5}
        onToggle={onToggle}
        onCountChange={vi.fn()}
      />,
    );
    for (const id of ['gitBranch', 'activeBmadStory', 'recentCommits', 'today', 'uncommittedCount']) {
      expect(screen.getByTestId(`context-builder-variable-${id}`)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId('context-builder-variable-toggle-gitBranch'));
    expect(onToggle).toHaveBeenCalledWith('gitBranch', true);
  });

  it('shows the recentCommits count input only when that variable is on', () => {
    const onCountChange = vi.fn();
    const vars = { ...createDefaultContextBuilderManifest().variables, recentCommits: true };
    render(
      <VariableToggleList variables={vars} recentCommitsCount={5} onToggle={vi.fn()} onCountChange={onCountChange} />,
    );
    const input = screen.getByTestId('context-builder-variable-recentCommits-count');
    fireEvent.change(input, { target: { value: '8' } });
    expect(onCountChange).toHaveBeenCalledWith(8);
  });
});

describe('CustomCommandBlock', () => {
  it('disables Add until the command is non-empty AND acknowledged (AC5.a)', () => {
    const onAdd = vi.fn();
    render(
      <CustomCommandBlock commands={[]} secretWarningIndices={[]} onAdd={onAdd} onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );
    const addBtn = screen.getByTestId('context-builder-command-add') as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('context-builder-command-input'), { target: { value: 'echo hi' } });
    expect(addBtn.disabled).toBe(true); // still not acknowledged
    fireEvent.click(screen.getByTestId('context-builder-command-acknowledge'));
    expect(addBtn.disabled).toBe(false);
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledWith('echo hi', true);
  });

  it('renders the secret badge for a flagged command (AC5.c)', () => {
    render(
      <CustomCommandBlock
        commands={[{ command: 'echo $TOKEN', acknowledged: true }]}
        secretWarningIndices={[0]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('context-builder-command-secret-0')).toBeTruthy();
  });
});
