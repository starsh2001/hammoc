/**
 * DirectoryBrowserDialog Tests (Epic 34, Story 34.2 - Task 6)
 * Home-expanded 2-call open, breadcrumb + "My PC" → drive-roots switch, select
 * confirmation, Esc/backdrop close, and responsive tokens (AC2/AC3/AC7/AC8).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowseResponse } from '@hammoc/shared';
import { DirectoryBrowserDialog } from '../DirectoryBrowserDialog.js';

vi.mock('../../../services/api/systemBrowse.js', () => ({
  systemBrowseApi: {
    browse: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
  },
}));

import { systemBrowseApi } from '../../../services/api/systemBrowse.js';

const HOME = '/home/me';

const driveRoots: BrowseResponse = {
  path: null,
  parent: null,
  home: HOME,
  isDriveRoots: true,
  entries: [{ name: 'Macintosh HD', path: '/', hasChildren: true }],
};

const homeResponse: BrowseResponse = {
  path: HOME,
  parent: '/home',
  home: HOME,
  isDriveRoots: false,
  entries: [
    { name: 'projects', path: '/home/me/projects', hasChildren: true },
    { name: 'docs', path: '/home/me/docs', hasChildren: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(systemBrowseApi.browse).mockImplementation((p?: string) => {
    if (!p) return Promise.resolve(driveRoots);
    if (p === HOME) return Promise.resolve(homeResponse);
    return Promise.resolve(homeResponse);
  });
});

describe('DirectoryBrowserDialog', () => {
  // AC2: open sequence is browse() then browse(home); home's children render.
  it('starts expanded at home via the 2-call open flow', async () => {
    render(<DirectoryBrowserDialog isOpen onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    expect(screen.getByText('docs')).toBeInTheDocument();
    expect(systemBrowseApi.browse).toHaveBeenCalledWith(); // dialog: learn home
    expect(systemBrowseApi.browse).toHaveBeenCalledWith(HOME); // tree: home children
  });

  // AC2: breadcrumb shows "My PC" + the home path segments.
  it('renders a breadcrumb with My PC and home segments', async () => {
    render(<DirectoryBrowserDialog isOpen onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    expect(screen.getByText('내 PC')).toBeInTheDocument();
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('me')).toBeInTheDocument();
  });

  // AC3: clicking "My PC" switches to the drive-roots view.
  it('switches to the drive-roots view when My PC is clicked', async () => {
    render(<DirectoryBrowserDialog isOpen onClose={vi.fn()} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    fireEvent.click(screen.getByText('내 PC'));

    await waitFor(() => expect(screen.getByText('Macintosh HD')).toBeInTheDocument());
  });

  // AC7: selecting a folder then "Select this path" fires onSelect + onClose.
  it('confirms the selected path and closes', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<DirectoryBrowserDialog isOpen onClose={onClose} onSelect={onSelect} />);

    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    fireEvent.click(screen.getByText('docs')); // select (no children → no expand)

    const selectBtn = screen.getByRole('button', { name: '이 경로 선택' });
    await waitFor(() => expect(selectBtn).toBeEnabled());
    fireEvent.click(selectBtn);

    expect(onSelect).toHaveBeenCalledWith('/home/me/docs');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<DirectoryBrowserDialog isOpen onClose={onClose} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    fireEvent.keyDown(screen.getByText('디렉토리 선택'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    render(<DirectoryBrowserDialog isOpen onClose={onClose} onSelect={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('dialog')); // backdrop (target === currentTarget)

    expect(onClose).toHaveBeenCalled();
  });

  // AC8: responsive bottom-sheet tokens + nested-modal z-index.
  it('uses responsive bottom-sheet tokens above the parent dialog', async () => {
    render(<DirectoryBrowserDialog isOpen onClose={vi.fn()} onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('projects')).toBeInTheDocument());

    const backdrop = screen.getByRole('dialog');
    expect(backdrop.className).toContain('items-end');
    expect(backdrop.className).toContain('sm:items-center');
    expect(backdrop.className).toContain('z-[60]'); // above parent NewProjectDialog (z-50)

    const container = backdrop.firstElementChild as HTMLElement;
    expect(container.className).toContain('rounded-t-2xl');
    expect(container.className).toContain('sm:max-w-lg');
    expect(container.className).toContain('animate-slide-up');
  });
});
