/**
 * DirectoryPickerTree Tests (Epic 34, Story 34.2 - Task 6)
 * Folder-only lazy-load tree: folders-only render, chevron from hasChildren,
 * lazy expand, selection, new-folder/rename via the imperative handle, and the
 * deliberate ABSENCE of any delete surface (AC4/AC5/AC6).
 */

import { createRef } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowseResponse } from '@hammoc/shared';
import { DirectoryPickerTree, type DirectoryPickerTreeHandle } from '../DirectoryPickerTree.js';

vi.mock('../../../services/api/systemBrowse.js', () => ({
  systemBrowseApi: {
    browse: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
  },
}));

import { systemBrowseApi } from '../../../services/api/systemBrowse.js';

const ROOT = '/home/me';

const homeResponse: BrowseResponse = {
  path: ROOT,
  parent: '/home',
  home: ROOT,
  isDriveRoots: false,
  entries: [
    { name: 'projects', path: '/home/me/projects', hasChildren: true },
    { name: 'empty', path: '/home/me/empty', hasChildren: false },
  ],
};

const projectsResponse: BrowseResponse = {
  path: '/home/me/projects',
  parent: ROOT,
  home: ROOT,
  isDriveRoots: false,
  entries: [{ name: 'app', path: '/home/me/projects/app', hasChildren: false }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(systemBrowseApi.browse).mockImplementation((p?: string) => {
    if (p === '/home/me/projects') return Promise.resolve(projectsResponse);
    return Promise.resolve(homeResponse); // ROOT or undefined
  });
});

describe('DirectoryPickerTree', () => {
  // AC4/AC5: only folders render; chevron affordance follows hasChildren.
  it('renders folder entries and shows the expand affordance only for hasChildren', async () => {
    render(<DirectoryPickerTree rootPath={ROOT} selectedPath={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(systemBrowseApi.browse).toHaveBeenCalledWith(ROOT);

    // aria-expanded present ⇔ expandable (chevron) ⇔ hasChildren
    const projectsRow = screen.getByText('projects').closest('[role="treeitem"]')!;
    const emptyRow = screen.getByText('empty').closest('[role="treeitem"]')!;
    expect(projectsRow).toHaveAttribute('aria-expanded', 'false');
    expect(emptyRow).not.toHaveAttribute('aria-expanded');
  });

  // AC4: expanding a folder lazy-loads its children.
  it('lazy-loads children when a folder is expanded', async () => {
    render(<DirectoryPickerTree rootPath={ROOT} selectedPath={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    fireEvent.click(screen.getByText('projects'));

    await waitFor(() => expect(screen.getByText('app')).toBeInTheDocument());
    expect(systemBrowseApi.browse).toHaveBeenCalledWith('/home/me/projects');
  });

  // Selection model: row click fires onSelect with the absolute path.
  it('fires onSelect with the absolute path on row click', async () => {
    const onSelect = vi.fn();
    render(<DirectoryPickerTree rootPath={ROOT} selectedPath={null} onSelect={onSelect} />);

    await waitFor(() => expect(screen.getByText('empty')).toBeInTheDocument());
    fireEvent.click(screen.getByText('empty'));

    expect(onSelect).toHaveBeenCalledWith('/home/me/empty');
  });

  // AC6: "new folder" via the imperative handle → mkdir(parent, name) + reload.
  it('creates a new folder under the root via beginCreate', async () => {
    vi.mocked(systemBrowseApi.mkdir).mockResolvedValue({ success: true, path: '/home/me/newdir' });
    const ref = createRef<DirectoryPickerTreeHandle>();
    render(<DirectoryPickerTree ref={ref} rootPath={ROOT} selectedPath={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    act(() => ref.current!.beginCreate());

    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'newdir' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(systemBrowseApi.mkdir).toHaveBeenCalledWith(ROOT, 'newdir'));
    // parent reloaded after create
    await waitFor(() =>
      expect(vi.mocked(systemBrowseApi.browse).mock.calls.filter((c) => c[0] === ROOT).length).toBeGreaterThanOrEqual(2),
    );
  });

  // AC6: "rename" via the imperative handle → rename(path, newName).
  it('renames the selected node via beginRename', async () => {
    vi.mocked(systemBrowseApi.rename).mockResolvedValue({
      success: true,
      oldPath: '/home/me/projects',
      newPath: '/home/me/renamed',
    });
    const ref = createRef<DirectoryPickerTreeHandle>();
    render(
      <DirectoryPickerTree
        ref={ref}
        rootPath={ROOT}
        selectedPath="/home/me/projects"
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    act(() => ref.current!.beginRename());

    const input = await screen.findByRole('textbox');
    expect((input as HTMLInputElement).value).toBe('projects');
    fireEvent.change(input, { target: { value: 'renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(systemBrowseApi.rename).toHaveBeenCalledWith('/home/me/projects', 'renamed'),
    );
  });

  // AC6 (latter half): there is NO delete surface anywhere.
  it('exposes no delete action (no delete text, no context menu)', async () => {
    const { container } = render(
      <DirectoryPickerTree rootPath={ROOT} selectedPath={null} onSelect={vi.fn()} />,
    );

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    expect(screen.queryByText('삭제')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[role="menuitem"]')).toBeNull();
    // Right-clicking a row opens nothing (no context menu wired).
    fireEvent.contextMenu(screen.getByText('projects'));
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  // AC5: visual tokens reused from FileTree (folder color + indentation).
  it('reuses FileTree visual tokens (folder color, depth indent)', async () => {
    render(<DirectoryPickerTree rootPath={ROOT} selectedPath={null} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    const row = screen.getByText('projects').closest('[role="treeitem"]') as HTMLElement;
    // depth-0 indent = 0*16 + 8 = 8px
    expect(row.style.paddingLeft).toBe('8px');
    // folder icon uses the blue token
    expect(row.querySelector('.text-blue-500')).not.toBeNull();
  });
});
