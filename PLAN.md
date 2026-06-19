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
- [x] Tightened catalog validation to require root-level `.html` hrefs, non-empty trimmed category strings, and tag arrays whose entries are non-empty trimmed strings.
- [x] Tightened override validation to require object values and typed `category`, `description`, and `tags` fields when present.
- [x] Extended `scripts/check-effects-meta.js` to validate full generated metadata record shape: `slug`, `title`, `href`, `category`, `tags`, `description`, `createdAt`, and exact `slug`/`href` basename consistency.
- [x] Added `scripts/test-effects-meta.js` fixture tests for missing catalog file, invalid catalog JSON, missing tracked page, stale catalog href, dead override key, malformed override value, invalid override tag, blank catalog category, invalid catalog tag, duplicate metadata href, duplicate metadata slug, and stale generated output.
- [x] Added `npm run test:effects-meta`.
- [x] Verified `npm run test:effects-meta`, `node scripts/gen-metadata.js --check`, `node scripts/check-effects-meta.js`, `npm run lint`, `npm run build`, and `git diff --check` pass after iteration 4.

Current review findings:

- No high-priority correctness regression was found in iteration 4. The schema module, generator validation, generated metadata checker, focused regression script, and build gate all pass on the current tree.
- Medium priority: `scripts/test-effects-meta.js` contains only expected-failure tests. It does not prove that a valid fixture can generate metadata, pass freshness checking, and pass integrity checking.
- Medium priority: `npm run test:effects-meta` exists but is not part of `npm run build` or `npm run check:effects-meta`, so the new regression suite is manual unless the verification checklist is followed.
- Medium priority: override `description: ""` is still accepted when the field is present, even though the plan called for normalizing or rejecting blank-only override descriptions.
- Medium priority: unknown override fields such as `descripton` are silently ignored. That leaves a typo path outside the new schema contract.
- Medium priority: the generator does not validate the records it is about to write with `validateGeneratedMetadataRecord`; invalid generated output is caught by `scripts/check-effects-meta.js` and the build, but direct generation can still write first and fail later.
- Medium priority: `scripts/check-effects-meta.js` still reports missing or invalid `public/effects-meta.json` as an uncaught Node error instead of grouped, actionable diagnostics.
- Medium priority: direct `file://` behavior remains intentionally degraded to five inline fallback records. The UI states this, but the repo still lacks a documented product decision.
- Medium priority: metadata coverage remains shallow: 227 of 251 records have empty descriptions, 20 are `Uncategorized`, and 18 have no tags.
- Medium priority: highlight rendering can still match inside escaped HTML entities because highlighting runs after escaping.

## Phase 1 - Strengthen Metadata Regression Tests

Priority: high.

- [ ] Add a happy-path fixture test that runs `node scripts/gen-metadata.js`, verifies the generated JSON content shape, then runs `node scripts/gen-metadata.js --check` and `node scripts/check-effects-meta.js` successfully.
- [ ] Add checker failure tests for full generated schema validation: non-object record, wrong field types, blank category/title, non-array tags, blank tag, invalid timestamp, invalid slug, and `slug`/`href` mismatch.
- [ ] Add generator failure tests for category whitespace, tag whitespace, non-string tag values, blank override description, and unknown override fields.
- [ ] Decide whether `npm run test:effects-meta` should be part of `npm run check:effects-meta` or `npm run build`; if not, document why it remains a manual regression suite.
- [ ] Add a top-level `npm test` script or equivalent if this repo should expose all regression tests through one command.

## Phase 2 - Close Remaining Schema Contract Edges

Priority: high.

- [ ] Decide whether an explicit override `description: ""` means "clear the description" or is invalid; implement that rule and test it.
- [ ] Reject unknown fields in `scripts/effects-meta-overrides.json` so typoed override keys cannot silently do nothing.
- [ ] Consider rejecting unknown fields in `scripts/effects-catalog.json` entries if the catalog should be a strict source contract.
- [ ] Validate generated metadata records inside `scripts/gen-metadata.js` before writing `public/effects-meta.json`, using the same generated-record schema used by `scripts/check-effects-meta.js`.
- [ ] Validate catalog href basenames against the accepted slug format, or rely on generator self-validation and document that decision in the script.
- [ ] Make checker diagnostics for missing, empty, invalid JSON, and non-array `public/effects-meta.json` consistent with the generator's grouped diagnostic style.

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
npm run test:effects-meta
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
