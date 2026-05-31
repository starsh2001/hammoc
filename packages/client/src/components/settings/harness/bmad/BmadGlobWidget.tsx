/**
 * Story 31.1: glob key widget (1 key: prd.epicFilePattern). Text input + a
 * live match preview (AC2.d): on change, 500ms-debounced, it derives a literal
 * prefix from the glob, queries the existing `fileSystemApi.searchFiles`
 * (substring search — no new search API), then filters the results client-side
 * with a glob→regex (BMad `{n}` placeholder → `\d+`) and shows the match count
 * plus up to 5 sample filenames. The save itself routes through the store's
 * 300ms debounce like the other scalar widgets.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  useBmadCoreConfigStore,
  getAtPath,
  type BmadKeyDef,
} from '../../../../stores/bmadCoreConfigStore';
import { fileSystemApi } from '../../../../services/api/fileSystem';

const PREVIEW_DEBOUNCE_MS = 500;

/** Literal prefix up to the first glob metachar / `{` placeholder. */
function literalPrefix(glob: string): string {
  const m = glob.match(/^[^*?{[]*/);
  return m ? m[0] : '';
}

/** Convert a BMad epic glob (with the `{n}` number placeholder) to an anchored regex over a basename. */
function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (glob.startsWith('{n}', i)) {
      out += '\\d+';
      i += 2;
      continue;
    }
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '.';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

export function BmadGlobWidget({ keyDef, projectSlug }: { keyDef: BmadKeyDef; projectSlug: string }) {
  const { t } = useTranslation('settings');
  const value = useBmadCoreConfigStore((s) => getAtPath(s.knownKeys, keyDef.path)) as string | undefined;
  const patchKey = useBmadCoreConfigStore((s) => s.patchKey);
  const [draft, setDraft] = useState<string>(value ?? '');
  const [preview, setPreview] = useState<{ count: number; samples: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const glob = draft.trim();
    if (!glob) {
      setPreview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fileSystemApi.searchFiles(projectSlug, literalPrefix(glob) || glob);
        let re: RegExp;
        try {
          re = globToRegExp(glob);
        } catch {
          re = /$^/; // invalid glob → match nothing
        }
        const matches = res.results.filter((r) => r.type === 'file' && re.test(r.name));
        setPreview({ count: matches.length, samples: matches.slice(0, 5).map((m) => m.path) });
      } catch {
        setPreview(null);
      } finally {
        setLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, projectSlug]);

  return (
    <div className="py-1.5" data-testid={`bmad-key-${keyDef.id}`}>
      <label className="block text-sm font-medium text-gray-200">
        {t(`harness.bmad.keys.${keyDef.id}.label`)}
      </label>
      <p className="mt-0.5 mb-1 text-xs text-gray-500">
        {t(`harness.bmad.keys.${keyDef.id}.description`)}
      </p>
      <input
        type="text"
        className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          patchKey(keyDef.path, e.target.value);
        }}
        data-testid={`bmad-input-${keyDef.id}`}
      />
      <div className="mt-1 text-xs text-gray-400" data-testid="bmad-glob-preview">
        {loading ? (
          <span className="flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" />
            {t('harness.bmad.widgets.glob.matching')}
          </span>
        ) : preview ? (
          <>
            <span>{t('harness.bmad.widgets.glob.matchPreview', { count: preview.count })}</span>
            {preview.samples.length > 0 && (
              <span className="ml-1 text-gray-500">— {preview.samples.join(', ')}</span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
