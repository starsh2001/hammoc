#!/usr/bin/env node
// Build sharded manual chapters from docs/MANUAL.md.
// Output: packages/server/resources/manual/{NN}-{slug}.md (+ INDEX.md chapter list block)

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MANUAL_PATH = join(ROOT, 'docs', 'MANUAL.md');
const OUT_DIR = join(ROOT, 'packages', 'server', 'resources', 'manual');

const CHAPTER_RE = /^## (\d+)\. (.+)$/gm;

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function main() {
  if (!existsSync(MANUAL_PATH)) {
    console.error(`✗ MANUAL.md not found at ${MANUAL_PATH}`);
    process.exit(1);
  }

  const src = readFileSync(MANUAL_PATH, 'utf8');
  const matches = [...src.matchAll(CHAPTER_RE)];
  if (matches.length === 0) {
    console.error('✗ No chapters found (expected `## N. ...` headings)');
    process.exit(1);
  }

  // Reset shard files but preserve INDEX.md so its hand-curated metadata survives
  if (existsSync(OUT_DIR)) {
    for (const f of readdirSync(OUT_DIR)) {
      if (f === 'INDEX.md') continue;
      rmSync(join(OUT_DIR, f));
    }
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const chapters = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const num = m[1].padStart(2, '0');
    const title = m[2].trim();
    const slug = slugify(title);
    const filename = `${num}-${slug}.md`;

    const start = m.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : src.length;
    // Drop the chapter-separator horizontal rule that lives at the end of each chapter
    const body = src.slice(start, end).trimEnd().replace(/\n+---\s*$/, '');

    writeFileSync(join(OUT_DIR, filename), body + '\n', 'utf8');
    chapters.push({ num: m[1], title, filename });
    console.log(`  wrote ${filename}`);
  }

  // Auto-update the chapter-list block inside INDEX.md
  const indexPath = join(OUT_DIR, 'INDEX.md');
  const listBlock = chapters
    .map((c) => `- ${c.num}. [${c.title}](./${c.filename})`)
    .join('\n');
  const wrappedBlock = `<!-- chapter-list:start -->\n${listBlock}\n<!-- chapter-list:end -->`;

  if (existsSync(indexPath)) {
    const idx = readFileSync(indexPath, 'utf8');
    if (idx.includes('<!-- chapter-list:start -->')) {
      const updated = idx.replace(
        /<!-- chapter-list:start -->[\s\S]*?<!-- chapter-list:end -->/,
        wrappedBlock,
      );
      writeFileSync(indexPath, updated, 'utf8');
      console.log('  updated INDEX.md chapter list');
    } else {
      console.warn('  INDEX.md exists but lacks <!-- chapter-list:start --> markers; left untouched');
    }
  } else {
    const seed = `# Hammoc Manual Index (Sharded)\n\n${wrappedBlock}\n`;
    writeFileSync(indexPath, seed, 'utf8');
    console.log('  seeded INDEX.md');
  }

  console.log(`\n✓ ${chapters.length} chapters built into ${OUT_DIR}`);
}

main();
