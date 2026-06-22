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
 * - Inline content expand/collapse per snippet
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SnippetItem, SnippetReadResponse } from '@hammoc/shared';
import { api } from '../services/api/client';

interface SnippetPaletteProps {
  /** Available snippets */
  snippets: SnippetItem[];
  /** Current filter string (without leading "%") */
  filter: string;
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when a snippet is selected */
  onSelect: (snippet: SnippetItem) => void;
  /** Project slug for fetching snippet content (required for project-scoped snippets) */
  projectSlug?: string;
}

const SOURCE_ORDER: SnippetItem['source'][] = ['project', 'global', 'bundled'];

const SOURCE_LABELS: Record<SnippetItem['source'], string> = {
  project: 'Project',
  global: 'Global',
  bundled: 'Bundled',
};

function sourceToScope(source: SnippetItem['source']): string {
  return source === 'global' ? 'user' : source;
}

function buildSnippetReadPath(snippet: SnippetItem, projectSlug?: string): string {
  const scope = sourceToScope(snippet.source);
  const name = encodeURIComponent(snippet.name);
  const qs = scope === 'project' && projectSlug
    ? `?projectSlug=${encodeURIComponent(projectSlug)}`
    : '';
  return `/snippets/${scope}/${name}${qs}`;
}

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

function snippetKey(snippet: SnippetItem): string {
  return `${snippet.source}-${snippet.name}`;
}

export function SnippetPalette({
  snippets,
  filter,
  selectedIndex,
  onSelect,
  projectSlug,
}: SnippetPaletteProps) {
  const { t } = useTranslation('common');
  const listRef = useRef<HTMLUListElement>(null);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [contentCache, setContentCache] = useState<Map<string, string>>(new Map());
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set());
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const filtered = useMemo(() => filterSnippets(snippets, filter), [snippets, filter]);
  const grouped = useMemo(() => groupSnippets(filtered), [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector('[aria-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleToggleExpand = useCallback(async (snippet: SnippetItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = snippetKey(snippet);

    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey(key);

    if (contentCache.has(key) && !errorKeys.has(key)) return;

    setErrorKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
    setLoadingKey(key);
    try {
      const path = buildSnippetReadPath(snippet, projectSlug);
      const resp = await api.get<SnippetReadResponse>(path);
      setContentCache((prev) => new Map(prev).set(key, resp.content));
    } catch (err) {
      console.error('[SnippetPalette] readSnippet failed:', err);
      setContentCache((prev) => new Map(prev).set(key, t('snippet.loadError')));
      setErrorKeys((prev) => new Set(prev).add(key));
    } finally {
      setLoadingKey(null);
    }
  }, [expandedKey, contentCache, errorKeys, projectSlug, t]);

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
                 max-h-[400px] overflow-y-auto z-50 py-1"
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
              const key = snippetKey(snippet);
              const isExpanded = expandedKey === key;
              const isLoading = loadingKey === key;
              const cachedContent = contentCache.get(key);

              return (
                <li
                  key={key}
                  role="option"
                  id={`snippet-option-${currentIndex}`}
                  aria-selected={isSelected}
                  aria-expanded={isExpanded}
                  onClick={() => onSelect(snippet)}
                  className={`cursor-pointer
                    ${isSelected
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100'
                      : 'hover:bg-gray-100 dark:hover:bg-[#253040] text-gray-900 dark:text-gray-100'
                    }`}
                >
                  <div className="px-3 py-2 flex items-start gap-2">
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
                    <button
                      type="button"
                      onClick={(e) => handleToggleExpand(snippet, e)}
                      aria-label={isExpanded ? t('snippet.collapseAria') : t('snippet.expandAria')}
                      className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-[#3a4d5e]
                                 text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200
                                 transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  {isExpanded && (
                    <div
                      className="mx-3 mb-2 rounded border border-gray-200 dark:border-[#3a4d5e]
                                 bg-gray-50 dark:bg-[#1a2530] max-h-[150px] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isLoading ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
                          {t('snippet.loading')}
                        </p>
                      ) : (
                        <pre className="text-xs leading-relaxed px-3 py-2 whitespace-pre-wrap break-words
                                        text-gray-700 dark:text-gray-200 font-mono">
                          {cachedContent}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
