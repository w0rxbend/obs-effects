# Plan: Metadata-Backed OBS Effects Directory

## Goal

Replace the flat `index.html` effect list with a searchable, sortable, filterable directory backed by generated metadata, while preserving the repo's lightweight static-preview workflow.

## Current Status

Completed this iteration:

- [x] Added `scripts/gen-metadata.js`.
- [x] Added `scripts/effects-meta-overrides.json` with seed descriptions and enriched tags for 24 key effects.
- [x] Generated `public/effects-meta.json` with 251 effect records.
- [x] Rewrote `index.html` as a vanilla JS metadata-backed directory with search, sort, tag filters, highlight, cards, theme toggle, and responsive styling.
- [x] Verified `node scripts/gen-metadata.js`, `npm run lint`, and `npm run build` pass.

Known gaps from review:

- `public/effects-meta.json` currently includes `neon-ribbon-pattern.html`, but that effect page and its TS files are untracked. Either commit the full effect page set or remove/regenerate the metadata record before publishing.
- Static-file fallback is incomplete. `index.html` only falls back to five inline records, and browser `file://` fetch behavior means the committed JSON does not by itself make the full directory usable when opening `index.html` directly.
- Metadata generation is not fully reproducible from source. After the inline catalog was removed, categories and base tags for most effects are preserved from the previous `public/effects-meta.json`; deleting that file and regenerating would degrade many records to `Uncategorized` with sparse tags.
- `scripts/gen-metadata.js` parses JavaScript arrays from `index.html` using `Function(...)`, which is brittle now that `index.html` is no longer the durable catalog source.
- Tag normalization deduplicates case-insensitively, but does not lowercase output as the original plan specified.
- Only 24 of 251 records have descriptions; 227 descriptions are still empty.

## Phase 1 - Fix Catalog Correctness

Priority: high.

- [ ] Decide ownership of `neon-ribbon-pattern`: either commit `neon-ribbon-pattern.html`, `src/neon-ribbon-pattern.ts`, and `src/app/screens/NeonRibbonPatternScreen.ts`, or remove the page from `public/effects-meta.json` by regenerating after excluding untracked files.
- [ ] Add a metadata integrity check script that fails when `public/effects-meta.json` contains an `href` with no tracked root HTML file.
- [ ] Add the integrity check to the verification flow before `npm run build`.
- [ ] Update `loadEffects()` in `index.html` to try deployment-safe paths in order: `effects-meta.json`, `public/effects-meta.json`, then `/effects-meta.json`.
- [ ] Replace the five-item inline fallback with a generated embedded full fallback, or document that direct `file://` opening is intentionally degraded and make the notice explicit.

## Phase 2 - Make Metadata Generation Reproducible

Priority: high.

- [ ] Move category and base tag data into a durable source file, such as `scripts/effects-catalog.json`, instead of mining `index.html` or previous output.
- [ ] Let `scripts/effects-meta-overrides.json` optionally provide `category` as well as `description` and tags.
- [ ] Stop reading `public/effects-meta.json` as an input for category/tag preservation, or use it only behind an explicit `--preserve-existing` migration flag.
- [ ] Remove `Function(...)` parsing from `scripts/gen-metadata.js`.
- [ ] Emit stable ISO timestamps with `git log --format=%aI --diff-filter=A -- <file>` where possible.
- [ ] Normalize tags consistently: trim, collapse whitespace, deduplicate case-insensitively, and choose either canonical lowercase output or documented display-case output.

## Phase 3 - Improve Directory UX and Filtering

Priority: medium.

- [ ] Add a category sidebar or category chip row with counts and click-to-filter behavior.
- [ ] Keep selected filters represented in URL query params so catalog links can be shared.
- [ ] Add an "updated metadata source" timestamp or build identifier to the footer.
- [ ] Improve no-description cards by generating a better deterministic fallback sentence from category and tags.
- [ ] Harden highlight rendering so queries cannot split escaped HTML entities.

## Phase 4 - Expand Metadata Coverage

Priority: medium.

- [ ] Fill descriptions for the top 50 most useful or newest effects first.
- [ ] Add richer tags for all `Uncategorized` or low-tag records.
- [ ] Review category taxonomy and merge near-duplicates such as `3D`, `3D Models`, and `Full Scenes` if they are not intentionally distinct.

## Phase 5 - Future Thumbnail Pipeline

Priority: low.

- [ ] Add Playwright thumbnail capture for committed effect pages only.
- [ ] Save thumbnails to `public/thumbs/<slug>.jpg`.
- [ ] Display thumbnails in cards when available, with the current swatch preview as fallback.

## Verification Checklist

Run before considering the directory work complete:

```bash
node scripts/gen-metadata.js
npm run lint
npm run build
```

Additional checks to add next:

```bash
# no metadata href should point at an untracked or missing root HTML file
comm -23 <(jq -r '.[].href' public/effects-meta.json | sort) <(git ls-files '*.html' | grep -v '^index.html$' | sort)
```
