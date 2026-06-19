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
- [x] Made generation fail when tracked root HTML files are absent from `scripts/effects-catalog.json`.
- [x] Made generation fail when `scripts/effects-catalog.json` references a non-tracked root effect page.
- [x] Validated `scripts/effects-meta-overrides.json` keys against known effect slugs.
- [x] Added `scripts/effects-meta-schema.js` as the shared validation vocabulary for catalog entries, override entries, generated metadata records, root HTML hrefs, slugs, and ISO-like timestamps.
- [x] Tightened catalog validation to require only `href`, `category`, and `tags`; root-level `.html` hrefs; non-empty trimmed category strings; and tag arrays whose entries are non-empty trimmed strings.
- [x] Tightened override validation to require only `category`, `description`, and `tags`; object values; typed optional fields; non-empty trimmed override descriptions; and non-empty trimmed tag strings.
- [x] Extended `scripts/check-effects-meta.js` to validate full generated metadata record shape: `slug`, `title`, `href`, `category`, `tags`, `description`, `createdAt`, and exact `slug`/`href` basename consistency.
- [x] Validated generated metadata records inside `scripts/gen-metadata.js` before writing `public/effects-meta.json`.
- [x] Normalized `scripts/check-effects-meta.js` diagnostics for missing, empty, invalid JSON, and non-array `public/effects-meta.json`.
- [x] Added `scripts/test-effects-meta.js` fixture tests for a valid end-to-end generation/check path plus catalog, override, generated-schema, duplicate, and stale-output failures.
- [x] Added `npm run test:effects-meta`.
- [x] Wired `npm run test:effects-meta` into `npm run check:effects-meta`, and added top-level `npm test`.
- [x] Verified `npm run test:effects-meta` and `npm run check:effects-meta` pass after iteration 5 review.

Current review findings:

- No high-priority correctness regression was found in iteration 5. The strict catalog/override rules, producer-side generated-record validation, normalized metadata-file diagnostics, expanded fixture suite, and standard check wiring all pass on the current tree.
- Medium priority: generated metadata validation still allows unknown extra fields on public records. That may be acceptable for forward-compatible consumers, but it is inconsistent with the now-strict catalog and override contracts and should be decided explicitly.
- Medium priority: `scripts/check-effects-meta.js` still lets `git ls-files` failures surface as uncaught subprocess errors. Metadata file diagnostics are normalized, but tracked-page discovery errors are not.
- Medium priority: several duplicate checker regression tests pass by finding the target duplicate message while also producing unrelated schema errors. The coverage is useful, but the fixtures are not fully isolated.
- Medium priority: direct `file://` behavior remains intentionally degraded to five inline fallback records. The UI states this, but the repo still lacks a documented product decision.
- Medium priority: metadata coverage remains shallow: most records still have empty descriptions, some are `Uncategorized`, and some have no tags.
- Medium priority: highlight rendering can still match inside escaped HTML entities because highlighting runs after escaping.

## Phase 1 - Close Remaining Contract Gaps

Priority: high.

- [ ] Decide whether generated metadata records should reject unknown fields. If strict output is desired, add allowed-field validation for generated records and cover it in `scripts/test-effects-meta.js`.
- [ ] Normalize `scripts/check-effects-meta.js` diagnostics for `git ls-files` failures, matching the grouped style used for metadata-file errors.
- [ ] Add checker regression coverage for tracked-page discovery failure if it can be simulated without brittle shell tricks; otherwise document the limitation in the test file.
- [ ] Make duplicate href/slug regression fixtures isolate the duplicate invariant without also triggering unrelated slug/href mismatch diagnostics.
- [ ] Add explicit tests for missing, empty, invalid JSON, and non-array `public/effects-meta.json` in `scripts/check-effects-meta.js`.

## Phase 2 - Finish Static Directory Behavior

Priority: medium.

- [ ] Decide whether full direct `file://` usability is a product requirement or whether the documented degraded fallback is acceptable.
- [ ] If full direct-file support is required, generate an embedded fallback payload from `public/effects-meta.json` instead of hand-maintaining five inline records.
- [ ] If degraded fallback remains intentional, add a short repository note explaining that the full directory requires Vite or another local static server.
- [ ] Add an "updated metadata source" timestamp or build identifier to the footer.

## Phase 3 - Improve Directory UX and Filtering

Priority: medium.

- [ ] Harden highlight rendering so queries cannot split escaped HTML entities.
- [ ] Keep selected search, sort, category, and tag filters represented in URL query params so catalog links can be shared.
- [ ] Add a category sidebar or category chip row with counts and click-to-filter behavior.
- [ ] Improve no-description cards by generating a better deterministic fallback sentence from category and tags.

## Phase 4 - Expand Metadata Coverage

Priority: medium.

- [ ] Fill descriptions for the top 50 most useful or newest effects first.
- [ ] Add richer tags and categories for all current `Uncategorized` or no-tag records.
- [ ] Review category taxonomy and merge near-duplicates such as `3D`, `3D Models`, and `Full Scenes` if they are not intentionally distinct.
- [ ] Add a lightweight coverage report that counts empty descriptions, `Uncategorized`, no-tag records, and low-tag records.
- [ ] Consider failing the coverage report only on regressions rather than enforcing a hard quality threshold immediately.

## Phase 5 - Future Thumbnail Pipeline

Priority: low.

- [ ] Add Playwright thumbnail capture for committed effect pages only.
- [ ] Save thumbnails to `public/thumbs/<slug>.jpg`.
- [ ] Display thumbnails in cards when available, with the current swatch preview as fallback.

## Verification Checklist

Run before considering the directory work complete:

```bash
npm test
npm run check:effects-meta
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
