# BMad QA-Fix Marker

A Hammoc-specific convention layered on top of standard BMad story files. It lets the project-overview Next Step Recommender (manual §11.5) and the board's "QA Fixed" badge (§10.7) know whether a developer has already addressed the **current** QA gate — without guessing from file modification times (the old, unreliable approach: `review-story` rewrites the story after the gate, which made a freshly-reviewed story look "stale").

## The marker

A single HTML comment inside the story markdown file:

```
<!-- hammoc:qa-fix gate="<the gate's `updated` value>" applied="true|false" -->
```

- It is an HTML comment, so standard BMad tooling ignores it and it never changes the story's Status or the gate file.
- `gate` is the QA gate's `updated:` value — it ties the marker to one specific gate. When QA later re-reviews, the gate's `updated` changes and any marker pointing at the old value becomes stale automatically.
- `applied="false"` → "QA flagged this gate; a fix is still needed." `applied="true"` → "Dev addressed this gate."

## Who writes it

- **QA review** (Hammoc's bundled `qa-review` snippet) appends `applied="false"` in the story's **QA Results** section when it issues a CONCERNS or FAIL gate.
- **Apply QA fixes** (the bundled `apply-qa-fixes` snippet) appends `applied="true"` in the story's **Completion Notes** after the fixes are made — without touching Status or the gate file.

If you perform a QA review or apply QA fixes **manually** (not through these snippets), append the matching marker yourself so the recommender and badge stay accurate.

## How it is read

The server (BMad status service) collects all markers in a story and matches them against the **current** gate's `updated` value to derive a per-story `gateFixState`:

- an `applied="true"` marker for the current gate → **`applied`** (Dev done; QA re-review is the next step)
- only an `applied="false"` marker for the current gate → **`needed`** (Dev must apply fixes)
- no marker for the current gate → **`undefined`** → the UI offers **both** actions (Apply QA fixes / Request QA review) and lets the user choose, because it can't tell whether fixes were applied (legacy story, external BMad project, or manually-edited gate)

An `applied` marker wins over a `needed` marker for the same gate. The board shows the sky-blue **QA Fixed** badge only when `gateFixState='applied'` for a FAIL/CONCERNS gate.
