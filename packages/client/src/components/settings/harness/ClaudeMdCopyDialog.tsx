/**
 * Story 29.1 (AC3): Section append vs full overwrite copy modal.
 *
 * Two modes:
 *   - "section append" (default) — splits the source by ## H2 headings and
 *     lets the user pick which sections to append to the target. If the
 *     target already contains an H2 with the same heading text, the row is
 *     marked "already exists" (Hammoc does not auto-merge — the duplicated
 *     heading goes through verbatim, respecting user intent).
 *   - "overwrite" — replaces the target's full content with the source's.
 *     Destructive confirmation step + 5-line preview of the existing target.
 *
 * When the source has no H2 headings, the modal automatically switches to
 * overwrite mode and explains why.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { splitMarkdownByH2, type MarkdownH2Section } from '@hammoc/shared';
import { useClaudeMdStore } from '../../../stores/claudeMdStore';

interface Props {
  direction: 'toUser' | 'toProject';
  projectSlug: string;
  sourceContent: string;
  targetContent: string;
  targetExists: boolean;
  onClose(): void;
}

type CopyMode = 'append' | 'overwrite';

export function ClaudeMdCopyDialog({
  direction,
  projectSlug,
  sourceContent,
  targetContent,
  targetExists,
  onClose,
}: Props) {
  const { t } = useTranslation('settings');
  const copyAppendSections = useClaudeMdStore((s) => s.copyAppendSections);
  const copyOverwrite = useClaudeMdStore((s) => s.copyOverwrite);

  const sourceSections = useMemo(() => splitMarkdownByH2(sourceContent), [sourceContent]);
  const targetSections = useMemo(() => splitMarkdownByH2(targetContent), [targetContent]);
  const targetHeadings = useMemo(
    () => new Set(targetSections.map((s) => s.heading.trim())),
    [targetSections],
  );

  const noH2InSource = sourceSections.length === 0;
  const [mode, setMode] = useState<CopyMode>(noH2InSource ? 'overwrite' : 'append');
  // If the source's H2 set changes (e.g. external reload while modal open) and
  // no longer has any H2, switch the radio to overwrite automatically.
  useEffect(() => {
    if (noH2InSource && mode === 'append') setMode('overwrite');
  }, [noH2InSource, mode]);

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewLines = useMemo(
    () => targetContent.split('\n').slice(0, 5),
    [targetContent],
  );

  const toggleSelected = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (mode === 'append') {
        const sectionsToAppend: MarkdownH2Section[] = [...selected]
          .sort((a, b) => a - b)
          .map((i) => sourceSections[i])
          .filter(Boolean);
        if (sectionsToAppend.length === 0) {
          setError(
            t('harness.claudeMd.copy.errors.noSelection', {
              defaultValue: 'Pick at least one section to append.',
            }),
          );
          return;
        }
        await copyAppendSections(direction, sectionsToAppend, projectSlug);
      } else {
        await copyOverwrite(direction, projectSlug);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleKey =
    direction === 'toUser'
      ? 'harness.claudeMd.copy.toUser.dialogTitle'
      : 'harness.claudeMd.copy.toProject.dialogTitle';

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="claude-md-copy-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-900 p-5 shadow-lg flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t(titleKey, {
              defaultValue:
                direction === 'toUser' ? 'Copy → global CLAUDE.md' : 'Copy → project CLAUDE.md',
            })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">
            {t('harness.claudeMd.copy.modeLabel', { defaultValue: 'Copy mode' })}
          </legend>
          <label className={'flex items-start gap-2 ' + (noH2InSource ? 'opacity-60' : '')}>
            <input
              type="radio"
              name="copy-mode"
              value="append"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
              data-testid="claude-md-copy-mode-append"
              disabled={noH2InSource}
              className="mt-1"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {t('harness.claudeMd.copy.mode.append', {
                  defaultValue: 'Append sections (## H2 units)',
                })}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {t('harness.claudeMd.copy.mode.appendHint', {
                  defaultValue:
                    'Pick the H2 sections to append to the end of the target file.',
                })}
              </span>
            </div>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="copy-mode"
              value="overwrite"
              checked={mode === 'overwrite'}
              onChange={() => setMode('overwrite')}
              data-testid="claude-md-copy-mode-overwrite"
              className="mt-1"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-red-700 dark:text-red-300">
                {t('harness.claudeMd.copy.mode.overwrite', {
                  defaultValue: 'Overwrite (destructive)',
                })}
              </span>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {t('harness.claudeMd.copy.mode.overwriteHint', {
                  defaultValue: 'Replace the target file entirely with the source content.',
                })}
              </span>
            </div>
          </label>
        </fieldset>

        {noH2InSource && mode === 'overwrite' && (
          <div
            role="alert"
            data-testid="claude-md-copy-no-h2-banner"
            className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
          >
            {t('harness.claudeMd.copy.noH2Banner', {
              defaultValue:
                'The source file has no ## H2 headings, so section append is unavailable. Use overwrite or add headings first.',
            })}
          </div>
        )}

        {mode === 'append' && !noH2InSource && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-gray-700 dark:text-gray-300">
              {t('harness.claudeMd.copy.appendInstruction', {
                defaultValue: 'Select the sections to append:',
              })}
            </p>
            <ul
              data-testid="claude-md-copy-section-list"
              className="rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto"
            >
              {sourceSections.map((section, idx) => {
                const isDuplicate = targetHeadings.has(section.heading.trim());
                return (
                  <li
                    key={`${section.heading}#${idx}`}
                    data-testid={`claude-md-copy-section-${idx}`}
                    data-already-exists={isDuplicate ? 'true' : 'false'}
                    className="flex items-start gap-2 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleSelected(idx)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
                        {section.heading}
                      </span>
                      {isDuplicate && (
                        <span className="ml-2 inline-flex rounded px-1 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                          {t('harness.claudeMd.copy.alreadyExists', {
                            defaultValue: 'already exists',
                          })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {mode === 'overwrite' && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-red-700 dark:text-red-300">
              {t('harness.claudeMd.copy.overwriteWarning', {
                defaultValue:
                  'All current content of the target file will be replaced. Continue?',
              })}
            </p>
            {targetExists && (
              <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-2 text-xs font-mono text-gray-700 dark:text-gray-200">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  {t('harness.claudeMd.copy.targetPreview', {
                    defaultValue: 'Target preview (first 5 lines)',
                  })}
                </div>
                {previewLines.map((line, idx) => (
                  <div key={idx} className="truncate">
                    {line || ' '}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t('common.button.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            data-testid="claude-md-copy-submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={
              'px-3 py-1.5 text-sm rounded-md text-white ' +
              (mode === 'overwrite'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700') +
              ' disabled:opacity-50'
            }
          >
            {mode === 'overwrite'
              ? t('harness.claudeMd.copy.confirmOverwrite', { defaultValue: 'Confirm overwrite' })
              : t('harness.claudeMd.copy.confirmAppend', {
                  defaultValue: 'Append selected',
                })}
          </button>
        </div>
      </div>
    </div>
  );
}
