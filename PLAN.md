# Plan: Metadata-Backed OBS Effects Directory

## Goal

Replace the flat `index.html` effect list with a searchable, sortable, filterable directory backed by generated metadata, while preserving the repo's lightweight static-preview workflow.

## Current Status

Completed across the last two iterations:

- [x] Added `scripts/gen-metadata.js`.
- [x] Added `scripts/effects-meta-overrides.json` with seed descriptions and enriched tags for 24 key effects.
- [x] Added `scripts/effects-catalog.json` as the durable category/tag source for all 251 tracked root effect pages.
- [x] Refactored metadata generation to read the durable catalog instead of parsing `index.html`.
- [x] Stopped preserving `public/effects-meta.json` by default; previous output is only read with `--preserve-existing`.
- [x] Removed `Function(...)` parsing from `scripts/gen-metadata.js`.
- [x] Emit git ISO timestamps with `git log --format=%aI --diff-filter=A -- <file>` when possible.
- [x] Normalize tags by trimming, collapsing whitespace, deduplicating, and lowercasing generated output.
- [x] Generated `public/effects-meta.json` with 251 effect records.
- [x] Rewrote `index.html` as a vanilla JS metadata-backed directory with search, sort, tag filters, highlight, cards, theme toggle, and responsive styling.
- [x] Updated `loadEffects()` to try `effects-meta.json`, `public/effects-meta.json`, then `/effects-meta.json`.
- [x] Added an explicit degraded direct-file fallback notice for the five-item inline fallback.
- [x] Added `scripts/check-effects-meta.js` and wired it into `npm run build`.
- [x] Verified `node scripts/gen-metadata.js`, `node scripts/check-effects-meta.js`, `npm run lint`, and `npm run build` pass.

Review findings from iteration 2:

- High priority: `scripts/check-effects-meta.js` is one-way. It verifies every metadata `href` points at a tracked root HTML file, but it does not fail when tracked root HTML files are missing from metadata, when metadata has duplicate `href`s, or when generated output is stale.
- High priority: `scripts/gen-metadata.js` still treats a missing or malformed `scripts/effects-catalog.json` as an empty catalog and silently emits `Uncategorized` records. A durable source file should fail closed.
- Medium priority: catalog entries are not validated against the tracked root HTML set. A typo or stale catalog record is currently ignored instead of reported.
- Medium priority: `scripts/check-effects-meta.js` explicitly allows `index.html` as a metadata href, even though `index.html` is not an effect page.
- Medium priority: direct `file://` behavior is intentionally degraded to five fallback records. This is now documented in the UI, but it still does not provide a full static directory without a local server.
- Medium priority: metadata coverage is still shallow: 227 of 251 records have empty descriptions, 20 are `Uncategorized`, and 18 have no tags.
- Medium priority: highlight rendering can still match inside escaped HTML entities because highlighting runs after escaping.

## Phase 1 - Strengthen Catalog Verification

Priority: high.

- [ ] Extend `scripts/check-effects-meta.js` to compare tracked root HTML files and metadata hrefs bidirectionally.
- [ ] Fail the metadata check on duplicate `href` or duplicate `slug` records.
- [ ] Remove the `index.html` exception from the metadata check.
- [ ] Add a generated-output freshness check, either `node scripts/gen-metadata.js --check` or a `check:effects-meta:fresh` script that regenerates to a temp file and diffs against `public/effects-meta.json`.
- [ ] Keep the freshness check in `npm run build` so stale committed metadata cannot pass CI.

## Phase 2 - Validate Durable Source Inputs

Priority: high.

- [ ] Make `scripts/gen-metadata.js` fail if `scripts/effects-catalog.json` is missing, empty, invalid JSON, or missing an `effects` array.
- [ ] Validate every catalog entry has a root-level `.html` href, non-empty category, and array tags.
- [ ] Fail when a tracked root HTML file is absent from `scripts/effects-catalog.json`, unless a documented defaulting mode is explicitly requested.
- [ ] Fail when `scripts/effects-catalog.json` contains an href that is not a tracked root effect page.
- [ ] Validate `scripts/effects-meta-overrides.json` keys against known slugs so dead overrides are caught early.

## Phase 3 - Finish Static Directory Behavior

Priority: medium.

- [ ] Decide whether full direct `file://` usability is a product requirement or whether the documented degraded fallback is acceptable.
- [ ] If full direct-file support is required, generate an embedded fallback payload from `public/effects-meta.json` instead of hand-maintaining five inline records.
- [ ] If degraded fallback remains intentional, add a short repository note explaining that the full directory requires Vite or another local static server.
- [ ] Add an "updated metadata source" timestamp or build identifier to the footer.

## Phase 4 - Improve Directory UX and Filtering

Priority: medium.

- [ ] Add a category sidebar or category chip row with counts and click-to-filter behavior.
- [ ] Keep selected search, sort, category, and tag filters represented in URL query params so catalog links can be shared.
- [ ] Improve no-description cards by generating a better deterministic fallback sentence from category and tags.
- [ ] Harden highlight rendering so queries cannot split escaped HTML entities.

## Phase 5 - Expand Metadata Coverage

Priority: medium.

- [ ] Fill descriptions for the top 50 most useful or newest effects first.
- [ ] Add richer tags and categories for all current `Uncategorized` or no-tag records.
- [ ] Review category taxonomy and merge near-duplicates such as `3D`, `3D Models`, and `Full Scenes` if they are not intentionally distinct.
- [ ] Add a lightweight coverage report that counts empty descriptions, `Uncategorized`, no-tag records, and low-tag records.

## Phase 6 - Future Thumbnail Pipeline

Priority: low.

- [ ] Add Playwright thumbnail capture for committed effect pages only.
- [ ] Save thumbnails to `public/thumbs/<slug>.jpg`.
- [ ] Display thumbnails in cards when available, with the current swatch preview as fallback.

## Verification Checklist

Run before considering the directory work complete:

```bash
node scripts/gen-metadata.js
node scripts/check-effects-meta.js
npm run lint
npm run build
```

Additional checks to add next:

```bash
# metadata hrefs should exactly match tracked root effect pages
comm -3 \
  <(jq -r '.[].href' public/effects-meta.json | sort) \
  <(git ls-files '*.html' | grep -v '^index.html$' | grep -v '/' | sort)
```
