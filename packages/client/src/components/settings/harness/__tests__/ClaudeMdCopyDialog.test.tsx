/**
 * Story 29.1 (AC3): ClaudeMdCopyDialog tests.
 *
 * Covers:
 *  - mode radio toggling (append default, overwrite alternative)
 *  - "no H2 in source" auto-switches to overwrite mode + shows banner
 *  - duplicate H2 in target gets the "already exists" badge
 *  - submit fires copyAppendSections / copyOverwrite on the store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClaudeMdCopyDialog } from '../ClaudeMdCopyDialog';
import { useClaudeMdStore } from '../../../../stores/claudeMdStore';

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

const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Replace the two store actions with mocks per-test.
  useClaudeMdStore.setState({
    ...useClaudeMdStore.getState(),
    copyAppendSections: vi.fn(),
    copyOverwrite: vi.fn(),
  });
});

describe('ClaudeMdCopyDialog', () => {
  it('renders source H2 sections as a checkbox list (default mode = append)', () => {
    render(
      <ClaudeMdCopyDialog
        direction="toUser"
        projectSlug="slug"
        sourceContent={'## Alpha\nbody\n\n## Bravo\nb'}
        targetContent=""
        targetExists={false}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('claude-md-copy-mode-append')).toBeChecked();
    expect(screen.getByText('## Alpha')).toBeInTheDocument();
    expect(screen.getByText('## Bravo')).toBeInTheDocument();
  });

  it('marks duplicate H2 with "already exists"', () => {
    render(
      <ClaudeMdCopyDialog
        direction="toUser"
        projectSlug="slug"
        sourceContent={'## Alpha\nx'}
        targetContent={'## Alpha\nfrom-target'}
        targetExists={true}
        onClose={onClose}
      />,
    );
    const row = screen.getByTestId('claude-md-copy-section-0');
    expect(row.getAttribute('data-already-exists')).toBe('true');
    expect(row.textContent).toContain('already exists');
  });

  it('auto-switches to overwrite mode and shows the no-H2 banner when source has no H2', () => {
    render(
      <ClaudeMdCopyDialog
        direction="toProject"
        projectSlug="slug"
        sourceContent={'just a paragraph\nno headings here'}
        targetContent="anything"
        targetExists={true}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('claude-md-copy-mode-overwrite')).toBeChecked();
    expect(screen.getByTestId('claude-md-copy-mode-append')).toBeDisabled();
    expect(screen.getByTestId('claude-md-copy-no-h2-banner')).toBeInTheDocument();
  });

  it('overwrite mode shows the destructive warning + 5-line preview of the target', () => {
    render(
      <ClaudeMdCopyDialog
        direction="toUser"
        projectSlug="slug"
        sourceContent={'## Alpha\nx'}
        targetContent={'line1\nline2\nline3\nline4\nline5\nline6\nline7'}
        targetExists={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('claude-md-copy-mode-overwrite'));
    // Submit button color/text changes to "Confirm overwrite".
    expect(screen.getByTestId('claude-md-copy-submit').textContent).toContain('Confirm overwrite');
  });

  it('submitting append mode fires copyAppendSections with selected sections in order', async () => {
    const copyAppendSections = vi.fn().mockResolvedValue(undefined);
    useClaudeMdStore.setState({
      ...useClaudeMdStore.getState(),
      copyAppendSections,
    });
    render(
      <ClaudeMdCopyDialog
        direction="toUser"
        projectSlug="slug"
        sourceContent={'## Alpha\na\n\n## Bravo\nb\n\n## Charlie\nc'}
        targetContent=""
        targetExists={false}
        onClose={onClose}
      />,
    );
    // Pick Bravo + Charlie.
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // Bravo
    fireEvent.click(checkboxes[2]); // Charlie

    fireEvent.click(screen.getByTestId('claude-md-copy-submit'));
    // Wait microtask flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(copyAppendSections).toHaveBeenCalledTimes(1);
    const [direction, sections, slug] = copyAppendSections.mock.calls[0];
    expect(direction).toBe('toUser');
    expect(slug).toBe('slug');
    expect(sections.map((s: { heading: string }) => s.heading)).toEqual(['## Bravo', '## Charlie']);
  });

  it('submitting overwrite mode fires copyOverwrite', async () => {
    const copyOverwrite = vi.fn().mockResolvedValue(undefined);
    useClaudeMdStore.setState({
      ...useClaudeMdStore.getState(),
      copyOverwrite,
    });
    render(
      <ClaudeMdCopyDialog
        direction="toProject"
        projectSlug="slug"
        sourceContent={'all\nbody'}
        targetContent="old"
        targetExists={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('claude-md-copy-mode-overwrite'));
    fireEvent.click(screen.getByTestId('claude-md-copy-submit'));
    await Promise.resolve();
    await Promise.resolve();
    expect(copyOverwrite).toHaveBeenCalledWith('toProject', 'slug');
  });

  it('append-mode submit with zero selected sections shows an inline error', async () => {
    const copyAppendSections = vi.fn();
    useClaudeMdStore.setState({
      ...useClaudeMdStore.getState(),
      copyAppendSections,
    });
    render(
      <ClaudeMdCopyDialog
        direction="toUser"
        projectSlug="slug"
        sourceContent={'## Alpha\na'}
        targetContent=""
        targetExists={false}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('claude-md-copy-submit'));
    await Promise.resolve();
    await Promise.resolve();
    expect(copyAppendSections).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
