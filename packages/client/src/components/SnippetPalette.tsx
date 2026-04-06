/**
 * SnippetPalette - Autocomplete popup for %snippet references
 * [Source: ISSUE-54 - Snippet autocomplete]
 *
 * Features:
 * - Source-based grouping (Project, Global, Bundled)
 * - Filter-based matching (partial, case-insensitive)
 * - Keyboard navigation support
 * - ARIA accessibility (listbox pattern)
 * - First-line preview display
 */

import { useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SnippetItem } from '@hammoc/shared';

interface SnippetPaletteProps {
  /** Available snippets */
  snippets: SnippetItem[];
  /** Current filter string (without leading "%") */
  filter: string;
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when a snippet is selected */
  onSelect: (snippet: SnippetItem) => void;
}

const SOURCE_ORDER: SnippetItem['source'][] = ['project', 'global', 'bundled'];

const SOURCE_LABELS: Record<SnippetItem['source'], string> = {
  project: 'Project',
  global: 'Global',
  bundled: 'Bundled',
};

/**
 * Filter snippets by query string (case-insensitive, partial match).
 * Returns results in grouped display order (project → global → bundled)
 * so flat indices match the rendered palette.
 */
export function filterSnippets(snippets: SnippetItem[], query: string): SnippetItem[] {
  const base = query
    ? snippets.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.preview && s.preview.toLowerCase().includes(q))
        );
      })
    : snippets;

  // Sort to match groupSnippets display order (source group, then original order within group)
  return base.slice().sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
}

/**
 * Group snippets by source
 */
function groupSnippets(snippets: SnippetItem[]): Map<string, SnippetItem[]> {
  const groups = new Map<string, SnippetItem[]>();
  for (const s of snippets) {
    const key = SOURCE_LABELS[s.source];
    const group = groups.get(key) ?? [];
    group.push(s);
    groups.set(key, group);
  }
  return groups;
}

export function SnippetPalette({
  snippets,
  filter,
  selectedIndex,
  onSelect,
}: SnippetPaletteProps) {
  const { t } = useTranslation('common');
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => filterSnippets(snippets, filter), [snippets, filter]);
  const grouped = useMemo(() => groupSnippets(filtered), [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector('[aria-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Build flat index for aria-selected mapping
  let flatIndex = 0;

  if (filtered.length === 0) {
    return (
      <div
        data-testid="snippet-palette"
        className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#263240]
                   border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg
                   max-h-[300px] overflow-y-auto z-50"
      >
        <p className="text-center text-gray-500 dark:text-gray-300 text-sm py-4">
          {t('snippet.noMatch')}
        </p>
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      id="snippet-palette"
      aria-label={t('snippet.listAria')}
      data-testid="snippet-palette"
      className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-[#263240]
                 border border-gray-300 dark:border-[#3a4d5e] rounded-lg shadow-lg
                 max-h-[300px] overflow-y-auto z-50 py-1"
    >
      {Array.from(grouped.entries()).map(([category, items]) => (
        <li key={category} role="presentation">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
            {category}
          </div>
          <ul role="group" aria-label={category}>
            {items.map((snippet) => {
              const currentIndex = flatIndex++;
              const isSelected = currentIndex === selectedIndex;

              return (
                <li
                  key={`${snippet.source}-${snippet.name}`}
                  role="option"
                  id={`snippet-option-${currentIndex}`}
                  aria-selected={isSelected}
                  onClick={() => onSelect(snippet)}
                  className={`px-3 py-2 cursor-pointer flex items-start gap-2
                    ${isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-[#253040] text-gray-900 dark:text-gray-100'
                    }`}
                >
                  <span className="text-base flex-shrink-0" aria-hidden="true">
                    %
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{snippet.name}</div>
                    {snippet.preview && (
                      <div className="text-xs text-gray-500 dark:text-gray-300 truncate">
                        {snippet.preview}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
