# Plan: Metadata-Backed OBS Effects Directory

## Goal

Replace the flat `index.html` effect list with a searchable, sortable, filterable directory backed by generated metadata, while preserving the repo's lightweight static-preview workflow.

## Current Status

Completed across the metadata directory work:

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
- [x] Made `scripts/check-effects-meta.js` compare tracked root HTML pages and metadata hrefs bidirectionally.
- [x] Made metadata checking fail on duplicate `href` and duplicate `slug` records.
- [x] Removed the `index.html` exception from metadata href validation.
- [x] Added `node scripts/gen-metadata.js --check` as a generated-output freshness check.
- [x] Wired freshness checking into `npm run build` through `npm run check:effects-meta`.
- [x] Made `scripts/gen-metadata.js` fail closed when `scripts/effects-catalog.json` is missing, empty, invalid JSON, or missing an `effects` array.
- [x] Validated catalog entries for root-level `.html` href, non-empty category, and array tags.
- [x] Made generation fail when tracked root HTML files are absent from `scripts/effects-catalog.json`.
- [x] Made generation fail when `scripts/effects-catalog.json` references a non-tracked root effect page.
- [x] Validated `scripts/effects-meta-overrides.json` keys against known effect slugs.
- [x] Verified `node scripts/gen-metadata.js --check`, `node scripts/check-effects-meta.js`, `npm run lint`, `npm run build`, and `git diff --check` pass.

Current review findings:

- No high-priority correctness regression was found in iteration 3. The metadata source contract, generated freshness check, and build wiring are now working on the current tree.
- Medium priority: override values are only checked by key. Malformed override objects, wrong field types, blank categories/descriptions, and non-string tags are silently ignored or accepted.
- Medium priority: catalog validation accepts category strings with surrounding whitespace and only checks that `tags` is an array, not that each tag is a non-empty string before normalization.
- Medium priority: `scripts/check-effects-meta.js` now validates href coverage and duplicate href/slug values, but it still does not validate the full public metadata record schema.
- Medium priority: direct `file://` behavior remains intentionally degraded to five inline fallback records. The UI states this, but the repo still lacks a documented product decision.
- Medium priority: metadata coverage remains shallow: 227 of 251 records have empty descriptions, 20 are `Uncategorized`, and 18 have no tags.
- Medium priority: highlight rendering can still match inside escaped HTML entities because highlighting runs after escaping.

## Phase 1 - Tighten Metadata Schemas

Priority: high.

- [ ] Validate each override value is an object.
- [ ] Validate override `category`, when present, is a non-empty trimmed string.
- [ ] Validate override `description`, when present, is a string and normalize or reject blank-only descriptions.
- [ ] Validate override `tags`, when present, is an array of non-empty strings.
- [ ] Validate every catalog tag is a non-empty string before generation.
- [ ] Reject or normalize catalog categories with leading/trailing whitespace.
- [ ] Add full generated metadata schema validation in `scripts/check-effects-meta.js`: `slug`, `title`, `href`, `category`, `tags`, `description`, and ISO-like `createdAt`.
- [ ] Check that each metadata `slug` exactly matches `href` basename.

## Phase 2 - Add Script-Level Regression Tests

Priority: high.

- [ ] Add focused tests or fixture-based checks for missing catalog file, invalid catalog JSON, missing tracked page, stale catalog href, duplicate metadata href, duplicate metadata slug, stale generated output, and dead override key.
- [ ] Keep tests independent of the 251-record real catalog where practical so failures identify the broken invariant quickly.
- [ ] Add a package script such as `test:effects-meta` and include it in the verification checklist.

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
node scripts/gen-metadata.js --check
node scripts/check-effects-meta.js
npm run lint
npm run build
git diff --check
```

Useful invariant spot-check:

```bash
comm -3 \
  <(jq -r '.[].href' public/effects-meta.json | sort) \
  <(git ls-files '*.html' | grep -v '^index.html$' | grep -v '/' | sort)
```
