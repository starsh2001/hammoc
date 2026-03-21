# Story: Global Skills Support & ChipBar Scope Distinction

## Status

Done

## Story

**As a** Hammoc user,
**I want** global skills stored in `~/.claude/skills/` to be automatically loaded across all projects, and the chip bar to visually distinguish between project and global skills,
**So that** I can register frequently used general-purpose skills once and access them quickly from anywhere.

## Story Context

| Item | Detail |
|------|--------|
| **Integrates with** | `commandService.scanClaudeSkills`, `SlashCommand` type, `FavoritesChipBar`, `FavoritesPopup`, `CommandPalette`, `preferencesStore` |
| **Technology** | TypeScript, Express, React, Zustand |
| **Follows pattern** | Existing `scanClaudeSkills` directory scan + SKILL.md frontmatter parsing |
| **Touch points** | Server commandService → Shared types → Client hooks/components/stores |

## Acceptance Criteria

### Functional Requirements

1. `scanClaudeSkills` scans `~/.claude/skills/` in addition to the project-level `.claude/skills/` and returns combined results
2. `SlashCommand` type has a new `scope: 'project' | 'global'` field
3. Project skills are tagged with `scope: 'project'`, global skills with `scope: 'global'`
4. Same-named project/global skills can coexist (no conflict resolution needed); in ChipBar, same-name chips are distinguished by scope color and tooltip showing `(project)` or `(global)` prefix

### ChipBar Distinction Requirements

5. When registering a favorite, the command's `scope` info is stored alongside in the `commandFavorites` structure
6. Project skill chips retain current gray color (`bg-gray-100 dark:bg-[#253040]`) and are placed on the left
7. Global skill chips use purple color (`bg-purple-50 dark:bg-purple-900/30`, `text-purple-700 dark:text-purple-300`, `border border-purple-200 dark:border-purple-700`) and are placed on the right
8. A vertical line separator (`w-px h-5 bg-gray-300 dark:bg-gray-600`) is shown between project and global chip groups (when both exist), reusing the existing star/slash divider pattern

### Chip Validity Requirements

9. On chip render, validate each chip's `command` string against the currently loaded `commands` list using exact `command` string match
10. Non-matching (invalid) chips display dimmed styling (`opacity-50`) with an `AlertTriangle` icon from lucide-react; clicking an invalid chip is a no-op (disabled)

### Integration Requirements

11. Existing project skill scanning/loading works unchanged
12. Global skills appear in `CommandPalette` autocomplete grouped under "Skills" category (no code change needed — `category: 'skill'` grouping already works)
13. `FavoritesPopup` editing reflects scope distinction: global favorites show purple left-border accent and `(Global)` badge next to name
14. Graceful handling when `~/.claude/skills/` directory does not exist (no error)

## Tasks / Subtasks

- [x] Task 1: Add `scope` field to `SlashCommand` type (AC: 2)
  - In `packages/shared/src/types/command.ts`:
    - Add `scope?: 'project' | 'global'` to `SlashCommand` interface (after `icon` field)
    - Optional field to maintain backward compatibility with agents/tasks/builtin categories

- [x] Task 2: Extend `scanClaudeSkills` for global directory (AC: 1, 3, 4, 14)
  - In `packages/server/src/services/commandService.ts`:
    - Add `import os from 'os'` at top of file
    - Extract the existing scan logic in `scanClaudeSkills` into a private helper: `private async scanSkillsDir(skillsDir: string, scope: 'project' | 'global'): Promise<SlashCommand[]>`
    - The helper reuses the current for-loop body but adds the `scope` field to each pushed `SlashCommand`
    - Rewrite `scanClaudeSkills(projectPath: string)` to:
      1. Call `this.scanSkillsDir(path.join(projectPath, '.claude', 'skills'), 'project')`
      2. Call `this.scanSkillsDir(path.join(os.homedir(), '.claude', 'skills'), 'global')`
      3. Return `[...projectSkills, ...globalSkills]`
    - Both calls handle missing directories gracefully (existing try/catch pattern returns `[]`)

- [x] Task 3: Update `commandFavorites` storage to include scope (AC: 5)
  - In `packages/shared/src/types/preferences.ts`:
    - Add new interface:
      ```typescript
      export interface CommandFavoriteEntry {
        command: string;
        scope?: 'project' | 'global'; // undefined defaults to 'project'
      }
      ```
    - Change `commandFavorites` type from `string[]` to `Array<string | CommandFavoriteEntry>`
    - The union type allows backward-compatible deserialization of existing `string[]` data
  - In `packages/client/src/stores/preferencesStore.ts`:
    - Add a normalizer function `normalizeCommandFavorites(raw: Array<string | CommandFavoriteEntry>): CommandFavoriteEntry[]` that converts plain strings to `{ command: str, scope: 'project' }`
    - Apply normalizer in `init()` when loading from server and in localStorage migration path
    - `updatePreference('commandFavorites', ...)` writes `CommandFavoriteEntry[]` format
    - Maintain existing write-through cache pattern (localStorage + server PATCH sync)

- [x] Task 4: Update FavoritesChipBar for scope distinction (AC: 6, 7, 8)
  - In `packages/client/src/components/FavoritesChipBar.tsx`:
    - Update `FavoritesChipBarProps`:
      - Change `favoriteCommands: string[]` → `favoriteCommands: CommandFavoriteEntry[]`
    - Split `favoriteCommands` into `projectFavorites` and `globalFavorites` by `scope` field
    - Render order: star favorites → project slash favorites → divider → global slash favorites
    - Project chips: keep existing gray styling (`bg-gray-100 dark:bg-[#253040]`)
    - Global chips: purple styling (`bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700`)
    - Divider between project and global groups: reuse existing `<div className="flex-shrink-0 w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />` pattern (same as star/slash divider at line 116)
    - Add `title` attribute to chips showing `(project)` or `(global)` prefix for same-name disambiguation

- [x] Task 5: Add chip validity check (AC: 9, 10)
  - In `packages/client/src/components/FavoritesChipBar.tsx`:
    - Import `AlertTriangle` from `lucide-react`
    - In chip render, check `findCommand(entry.command)` — if `undefined`, the chip is invalid
    - Invalid chip styling: add `opacity-50` class, replace icon with `<AlertTriangle className="w-3 h-3 text-yellow-500" />`
    - Invalid chip behavior: set `disabled={true}` and `onClick` to no-op (do not call `onExecute`)
    - Valid chips render normally (no change)
    - Add i18n key `favorites.invalidChip` for the invalid chip tooltip (`t('favorites.invalidChip')`)

- [x] Task 6: Update FavoritesPopup for scope distinction (AC: 13)
  - In `packages/client/src/components/FavoritesPopup.tsx`:
    - Update props type: `favorites: CommandFavoriteEntry[]` (instead of `string[]`)
    - In each favorite list item, check `entry.scope`:
      - If `'global'`: add left-border accent (`border-l-2 border-purple-400`) and a `(Global)` badge (`<span className="text-xs text-purple-500 ml-1">(Global)</span>`) next to the name
      - If `'project'` or undefined: no visual change (existing gray style)
    - `onRemoveFavorite` and `onReorder` callbacks should pass `CommandFavoriteEntry` instead of plain string
    - Add i18n key `favorites.globalBadge` for the `(Global)` text

- [x] Task 7: Update parent components to pass new props (AC: 11, 12)
  - Identify and update all parent components that render `FavoritesChipBar` and `FavoritesPopup` to pass `CommandFavoriteEntry[]` instead of `string[]`
  - In the component that calls `preferencesStore` to get `commandFavorites`, apply `normalizeCommandFavorites()` before passing to child components
  - `CommandPalette` requires no code changes — global skills already appear with `category: 'skill'` which groups under "Skills" via existing `groupCommands()` logic

- [x] Task 8: Update tests (AC: all)
  - In `packages/client/src/components/__tests__/FavoritesChipBar.test.tsx`:
    - Update test fixtures to use `CommandFavoriteEntry[]` format
    - Add test: project chips render with gray style
    - Add test: global chips render with purple style
    - Add test: divider shown between project and global groups
    - Add test: invalid chip shows AlertTriangle icon and is disabled
    - Add test: same-name chips from different scopes render with tooltip distinction
  - In `packages/client/src/components/__tests__/FavoritesPopup.test.tsx`:
    - Update test fixtures to use `CommandFavoriteEntry[]`
    - Add test: global favorites show purple border and `(Global)` badge
  - In `packages/server/src/services/__tests__/commandService.test.ts`:
    - Add test: `scanClaudeSkills` returns project skills with `scope: 'project'`
    - Add test: `scanClaudeSkills` returns global skills with `scope: 'global'`
    - Add test: missing `~/.claude/skills/` returns empty array (no error)
    - Add test: same-name skills from both directories are both included

## Dev Notes

### Relevant Source Tree

```
packages/
├── shared/src/types/
│   ├── command.ts              # SlashCommand interface (add scope field)
│   └── preferences.ts          # UserPreferences.commandFavorites (add CommandFavoriteEntry)
├── server/src/services/
│   ├── commandService.ts       # scanClaudeSkills (extend for global dir)
│   └── __tests__/
│       └── commandService.test.ts
└── client/src/
    ├── components/
    │   ├── FavoritesChipBar.tsx    # Chip bar (scope colors + validity)
    │   ├── FavoritesPopup.tsx      # Favorites editor (scope badge)
    │   ├── CommandPalette.tsx      # Autocomplete (no changes needed)
    │   └── __tests__/
    │       ├── FavoritesChipBar.test.tsx
    │       ├── FavoritesPopup.test.tsx
    │       └── CommandPalette.test.tsx
    └── stores/
        └── preferencesStore.ts     # Write-through cache (normalize + migrate)
```

### Server Changes (`commandService.ts`)

Current `scanClaudeSkills` signature (line 271):
```typescript
async scanClaudeSkills(projectPath: string): Promise<SlashCommand[]>
```

The method currently scans only `path.join(projectPath, '.claude', 'skills')`. Refactor by extracting the directory scan loop (lines 282–310) into a private helper `scanSkillsDir(skillsDir, scope)` that adds `scope` to each result. Then call the helper twice: once for project path, once for `path.join(os.homedir(), '.claude', 'skills')`.

Both `getCommands()` (line 69) and `getCommandsWithStarCommands()` (line 91) call `scanClaudeSkills(projectPath)` — no signature change needed, the method internally handles both directories.

### Shared Type Changes (`command.ts`)

Current `SlashCommand` interface (lines 6–17):
```typescript
export interface SlashCommand {
  command: string;
  name: string;
  description?: string;
  category: 'agent' | 'task' | 'builtin' | 'skill';
  icon?: string;
  // Add: scope?: 'project' | 'global';
}
```

The `scope` field is optional so agents, tasks, and builtin commands are unaffected.

### Client Storage Changes (`preferences.ts` + `preferencesStore.ts`)

Current `commandFavorites` type (line 22 of preferences.ts):
```typescript
commandFavorites?: string[];
```

New union type allows seamless backward compatibility:
```typescript
export interface CommandFavoriteEntry {
  command: string;
  scope?: 'project' | 'global';
}

// In UserPreferences:
commandFavorites?: Array<string | CommandFavoriteEntry>;
```

The normalizer in `preferencesStore.ts` converts plain `string` items to `{ command: str, scope: 'project' }` on load. Server API (`PATCH /api/preferences`) accepts both formats since it's a JSON field stored at `~/.hammoc/preferences.json`.

### FavoritesChipBar Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ★ │ [*star1] [*star2] │ [proj-cmd1] [proj-cmd2] │ [glob-cmd]   │
│   │   (yellow)        │   (gray)                │  (purple)     │
│   │                   │                    ↑ divider ↑          │
└──────────────────────────────────────────────────────────────────┘
```

Divider implementation: reuse the existing `<div className="flex-shrink-0 w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />` component already used between star and slash sections (line 116 of FavoritesChipBar.tsx). Only render when both project and global chips exist.

### FavoritesPopup Changes

Current `FavoritesPopup` (FavoritesPopup.tsx) has two sections: Slash Favorites and Star Favorites. The Slash Favorites section renders each favorite as a draggable list item with icon, name, description, and remove button. Add a left-border accent and `(Global)` badge for `scope: 'global'` entries only.

### CommandPalette — No Changes Needed

`CommandPalette` groups commands by `category` using `groupCommands()`. Since global skills already have `category: 'skill'`, they will appear in the "Skills" group automatically. The `scope` field is informational and does not affect grouping or filtering.

### i18n Keys to Add

Add the following keys to all locale files under `packages/client/public/locales/*/common.json`:

| Key | English | Purpose |
|-----|---------|---------|
| `favorites.invalidChip` | `"This command is no longer available"` | Invalid chip tooltip |
| `favorites.globalBadge` | `"(Global)"` | Global favorites badge in FavoritesPopup |

### Key Constraints

- `scope` field must be optional to avoid breaking agents/tasks/builtin
- `commandFavorites` union type (`string | CommandFavoriteEntry`) ensures backward-compatible deserialization
- `~/.claude/skills/` absence must not cause errors (existing try/catch pattern)
- i18n keys must be added to all 6 locale files (en, ko, zh-CN, ja, es, pt)

### Testing

#### Test File Locations
- Server: `packages/server/src/services/__tests__/commandService.test.ts`
- Client: `packages/client/src/components/__tests__/FavoritesChipBar.test.tsx`
- Client: `packages/client/src/components/__tests__/FavoritesPopup.test.tsx`

#### Testing Framework & Patterns
- **Server tests**: Vitest + mock `fs` module (existing pattern in commandService.test.ts)
- **Client tests**: Vitest + React Testing Library (existing pattern)
- **Assertions**: Use `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveClass`, etc.)
- **i18n mocking**: Tests use `react-i18next` mock that returns the key as-is

#### Key Test Scenarios

**Server (`commandService.test.ts`)**:
1. `scanClaudeSkills` returns project skills with `scope: 'project'`
2. `scanClaudeSkills` returns global skills with `scope: 'global'`
3. Missing `~/.claude/skills/` directory returns `[]` without error
4. Same-name skills from both paths are both included (no dedup)
5. Existing `getCommands` / `getCommandsWithStarCommands` regression

**Client (`FavoritesChipBar.test.tsx`)**:
1. Project chips render with gray bg classes
2. Global chips render with purple bg/border classes
3. Divider appears between project and global groups
4. No divider when only one group exists
5. Invalid chip shows `AlertTriangle` icon and is disabled
6. Valid chip renders normally and triggers `onExecute`
7. Same-name chips show scope tooltip

**Client (`FavoritesPopup.test.tsx`)**:
1. Global favorites show purple left-border and `(Global)` badge
2. Project favorites show no badge (existing style)
3. Drag-and-drop reorder works with `CommandFavoriteEntry[]`
4. Remove callback passes `CommandFavoriteEntry`

## Risk Assessment

| Item | Detail |
|------|--------|
| **Primary risk** | `commandFavorites` storage structure change may break existing favorites data |
| **Mitigation** | Union type `string | CommandFavoriteEntry` + normalizer function ensures seamless migration. Plain string entries are converted to `{ command: str, scope: 'project' }` on load |
| **Rollback** | `scope` field is optional; code revert leaves existing data unaffected. Preferences JSON retains backward-compatible format |

## Definition of Done

- [x] `~/.claude/skills/` scanning and global skill loading works
- [x] `SlashCommand.scope` field added and tagged correctly
- [x] ChipBar visually distinguishes project/global skills (purple color + right placement)
- [x] `commandFavorites` stores scope info with migration for existing data
- [x] Invalid chips show `AlertTriangle` icon and are disabled
- [x] `FavoritesPopup` shows `(Global)` badge for global favorites
- [x] Graceful handling when `~/.claude/skills/` does not exist
- [x] i18n keys added to all locale files
- [x] All tests pass (server + client)
- [x] No regression in existing command functionality

## File List

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/types/command.ts` | Modified | Added `scope?: 'project' \| 'global'` to `SlashCommand` |
| `packages/shared/src/types/preferences.ts` | Modified | Added `CommandFavoriteEntry` interface, changed `commandFavorites` type |
| `packages/shared/src/index.ts` | Modified | Exported `CommandFavoriteEntry` |
| `packages/server/src/services/commandService.ts` | Modified | Added `os` import, extracted `scanSkillsDir` helper, scans global skills |
| `packages/client/src/stores/preferencesStore.ts` | Modified | Added `normalizeCommandFavorites` export |
| `packages/client/src/hooks/useFavoriteCommands.ts` | Modified | Returns `CommandFavoriteEntry[]`, updated add/remove/reorder APIs |
| `packages/client/src/components/FavoritesChipBar.tsx` | Modified | Scope distinction (gray/purple), chip validity check, AlertTriangle |
| `packages/client/src/components/FavoritesPopup.tsx` | Modified | Scope distinction, purple left-border, (Global) badge |
| `packages/client/src/components/ChatInput.tsx` | Modified | Updated props types for `CommandFavoriteEntry` |
| `packages/client/src/pages/ChatPage.tsx` | Modified | Updated `handleToggleFavorite` for scope-aware add/remove |
| `packages/client/src/locales/en/common.json` | Modified | Added `favorites.invalidChip`, `favorites.globalBadge` |
| `packages/client/src/locales/ko/common.json` | Modified | Added `favorites.invalidChip`, `favorites.globalBadge` |
| `packages/client/src/locales/zh-CN/common.json` | Modified | Added `favorites.invalidChip`, `favorites.globalBadge` |
| `packages/client/src/locales/ja/common.json` | Modified | Added `favorites.invalidChip`, `favorites.globalBadge` |
| `packages/client/src/locales/es/common.json` | Modified | Added `favorites.invalidChip`, `favorites.globalBadge` |
| `packages/client/src/locales/pt/common.json` | Modified | Added `favorites.invalidChip`, `favorites.globalBadge` |
| `packages/client/src/components/__tests__/FavoritesChipBar.test.tsx` | Modified | Updated fixtures, added scope/validity tests |
| `packages/client/src/components/__tests__/FavoritesPopup.test.tsx` | Modified | Updated fixtures, added scope badge tests |
| `packages/client/src/components/__tests__/ChatInput.test.tsx` | Modified | Updated `favoriteCommands` fixtures |
| `packages/client/src/hooks/__tests__/useFavoriteCommands.test.ts` | Modified | Updated for `CommandFavoriteEntry` API |
| `packages/server/src/services/__tests__/commandService.test.ts` | Modified | Added `scanClaudeSkills` scope tests, os mock |

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-20 | 0.1 | Initial draft | Sarah (PO) |
| 2026-03-20 | 0.2 | Validation fixes: added Dev Notes with source tree, Testing section, CommandFavoriteEntry type definition, actionable tasks for FavoritesPopup/CommandPalette, chip validity details, i18n keys, Change Log | Sarah (PO) |
| 2026-03-20 | 1.0 | Implementation complete — all 8 tasks done, tests passing | James (Dev) |

## QA Results

### Review Date: 2026-03-20

### Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

Overall implementation quality is **excellent**. The code follows existing project patterns consistently:

- **Server**: `scanSkillsDir` helper extraction is clean; `Promise.all` parallelizes both directory scans. Graceful error handling via existing try/catch pattern.
- **Shared types**: `CommandFavoriteEntry` with union type `Array<string | CommandFavoriteEntry>` ensures seamless backward compatibility with existing `string[]` data.
- **Client**: `normalizeCommandFavorites` centralizes migration logic. `useFavoriteCommands` hook properly wraps scope-aware add/remove/reorder. Components (`FavoritesChipBar`, `FavoritesPopup`) implement scope distinction with clear visual hierarchy (gray/purple/yellow sections with dividers).
- **i18n**: All 6 locale files updated with `invalidChip` and `globalBadge` keys.

### Refactoring Performed

None required — implementation is already well-structured and follows project conventions.

### Compliance Check

- Coding Standards: ✓ TypeScript strict, consistent naming, proper exports
- Project Structure: ✓ Changes follow shared→server→client layering
- Testing Strategy: ✓ Unit tests for server logic + RTL component tests + hook tests
- All ACs Met: ✓ All 14 acceptance criteria verified (see traceability below)

### AC Traceability

| AC | Description | Implementation | Test Coverage |
|----|-------------|----------------|---------------|
| 1 | scanClaudeSkills scans ~/.claude/skills/ | commandService.ts:273-278 (scanClaudeSkills calls scanSkillsDir for both paths) | commandService.test.ts: TC "should return global skills with scope global" |
| 2 | SlashCommand has scope field | command.ts:18 (`scope?: 'project' \| 'global'`) | Type-checked at compile time |
| 3 | Skills tagged with correct scope | commandService.ts:316 (scope param passed through) | commandService.test.ts: TC "project skills with scope project", "global skills with scope global" |
| 4 | Same-name skills coexist | commandService.ts:274-278 (no dedup, concat) | commandService.test.ts: TC "same-name skills from both directories" |
| 5 | Scope stored in commandFavorites | preferences.ts:16-19 (CommandFavoriteEntry), preferencesStore.ts:20-27 (normalizer) | useFavoriteCommands.test.ts: TC10 "adds favorite with global scope", TC11 "normalizes plain string entries" |
| 6 | Project chips gray, left placement | FavoritesChipBar.tsx:105 (gray classes), :183 (rendered first) | FavoritesChipBar.test.tsx: TC-SC1 |
| 7 | Global chips purple, right placement | FavoritesChipBar.tsx:104 (purple classes), :192 (rendered after divider) | FavoritesChipBar.test.tsx: TC-SC2 |
| 8 | Divider between project/global groups | FavoritesChipBar.tsx:186-189 | FavoritesChipBar.test.tsx: TC-SC3, TC-SC4 |
| 9 | Chip validity check against commands | FavoritesChipBar.tsx:76 (`isInvalid = !cmd`) | FavoritesChipBar.test.tsx: TC-SC6 |
| 10 | Invalid chips dimmed + AlertTriangle | FavoritesChipBar.tsx:79-99 (opacity-50, AlertTriangle, disabled) | FavoritesChipBar.test.tsx: TC7, TC-SC6 |
| 11 | Existing project skill scanning unchanged | commandService.ts:275 (project path scan unchanged) | commandService.test.ts: TC9 regression test |
| 12 | Global skills in CommandPalette | No code change needed — category: 'skill' grouping works | Verified by code inspection (CommandPalette groups by category) |
| 13 | FavoritesPopup scope distinction | FavoritesPopup.tsx:318 (border-l-2 border-purple-400), :342 (Global badge) | FavoritesPopup.test.tsx: TC-G1, TC-G2, TC-G3, TC-G4 |
| 14 | Graceful handling when ~/.claude/skills/ missing | commandService.ts:290-292 (try/catch returns []) | commandService.test.ts: TC "missing ~/.claude/skills/ returns empty array" |

### Improvements Checklist

- [x] All implementations verified against acceptance criteria
- [x] All 87 tests passing (server: 28, client: 59)
- [x] i18n keys present in all 6 locale files (en, ko, zh-CN, ja, es, pt)
- [x] Backward compatibility verified (union type + normalizer)
- [ ] Consider adding integration test for end-to-end flow (server scan → client display) in future epic

### Security Review

No security concerns. The `os.homedir()` path is a standard Node.js API for reading user-level skill files. No user input is passed to file system operations beyond the controlled `projectPath`. Directory traversal is not possible as paths are constructed via `path.join`.

### Performance Considerations

No concerns. `Promise.all` parallelizes both directory scans. The `normalizeCommandFavorites` function is O(n) and runs only on preference load/update. No new network calls introduced.

### Files Modified During Review

None — no refactoring was necessary.

### Gate Status

Gate: PASS → docs/qa/gates/BS-1-global-skills-chipbar-scope.yml

### Recommended Status

✓ Ready for Done — All 14 ACs met, 87 tests passing, no blocking issues found.
