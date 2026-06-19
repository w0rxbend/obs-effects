# Plan: Advanced Index Page with Search, Sort, and Metadata

## Goal

Replace the current flat `index.html` effect list with a fully searchable, sortable, filterable directory. Each effect gets a creation timestamp (from git history), a human description, and richer tags.

---

## Phase 1 — Metadata extraction script

**File: `scripts/gen-metadata.ts` (or `.js`)**

Run once (and on CI) to produce `public/effects-meta.json`.

```
node scripts/gen-metadata.js
```

What it does:

1. For every `*.html` at repo root (excluding `index.html`):
   - Run `git log --diff-filter=A --format="%ai" -- <file>` → first-commit date.
   - If not in git yet (untracked), use `fs.statSync(file).birthtime` as fallback.
2. Merge with a hand-authored `scripts/effects-meta-overrides.json` that holds per-effect descriptions and extended tags.
3. Output `public/effects-meta.json` — one record per effect:

```json
{
  "slug": "wavy-planet-mesh",
  "title": "Wavy Planet Mesh",
  "href": "wavy-planet-mesh.html",
  "category": "Backgrounds",
  "tags": ["3D", "Globe", "Mesh", "Fluid", "Blue"],
  "description": "Rotating latitude/longitude mesh sphere with layered wave displacement and depth-aware dot highlights.",
  "createdAt": "2026-05-17T15:34:25+03:00"
}
```

---

## Phase 2 — Hand-authored overrides file

**File: `scripts/effects-meta-overrides.json`**

Provides descriptions and extended tags for effects that need more context than the title alone conveys. Git dates are always sourced from the script; this file only supplies prose and tag enrichment.

Example entry:

```json
{
  "wavy-planet-mesh": {
    "description": "Rotating latitude/longitude mesh sphere with layered wave displacement. Nodes shift radially based on multi-octave surface waves; depth controls dot size and brightness.",
    "tags": ["3D", "Globe", "Mesh", "Fluid", "Blue", "Particle"]
  }
}
```

For effects without an override, the script auto-generates tags from the existing array in `index.html` and leaves description as `""`.

---

## Phase 3 — Rewrite `index.html` JavaScript section

The current `index.html` has a large inline JS array and a basic search filter. Replace it with:

### Data loading

```js
const meta = await fetch("/effects-meta.json").then((r) => r.json());
```

During development (no server) fall back to the inline array for backward compatibility.

### UI additions (pure CSS + vanilla JS, no framework)

**Sort bar:**

```
[Newest first ▾]  [Oldest first]  [A → Z]  [Z → A]
```

**Tag cloud / filter chips:**
Auto-generated from all unique tags. Clicking a chip filters to effects with that tag. Multiple chips = AND filter. Active chips highlighted in accent color.

**Search box** (already exists, extend):

- Search across: title, description, tags
- Debounce 150 ms
- Highlight matched text in results

**Effect cards** (upgrade from current link list):

- Show: thumbnail placeholder or color swatch, title, category badge, tag chips, description excerpt, creation date (`Jan 2026`)
- CSS grid, responsive columns

### Sort implementation

```js
function sortEffects(list, mode) {
  if (mode === "newest")
    return [...list].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
  if (mode === "oldest")
    return [...list].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    );
  if (mode === "az")
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  if (mode === "za")
    return [...list].sort((a, b) => b.title.localeCompare(a.title));
}
```

---

## Phase 4 — Category sidebar (optional, after Phase 3)

Left panel with category counts. Clicking a category filters the grid. Current categories already in the data: `Backgrounds`, `Webcam Borders`, `Particle Systems`, `Full Scenes`, `Overlays`, `Scenes`, `Text`, `3D Models`, `Boids`.

---

## Phase 5 — Thumbnail generation (future / optional)

Run headless Chromium via Playwright to capture a 400×225 screenshot of each effect after 2s. Save to `public/thumbs/<slug>.jpg`. Display in cards. This is a separate CI job, not blocking the search/sort work.

---

## Execution order

| Step | What                                                             | Files touched                         |
| ---- | ---------------------------------------------------------------- | ------------------------------------- |
| 1    | Write `gen-metadata.js` script                                   | `scripts/gen-metadata.js`             |
| 2    | Write `effects-meta-overrides.json` (start with ~20 key effects) | `scripts/effects-meta-overrides.json` |
| 3    | Run script → commit `public/effects-meta.json`                   | `public/effects-meta.json`            |
| 4    | Rewrite index.html JS + add sort/filter UI                       | `index.html`                          |
| 5    | Style card grid in `style.css` or inline                         | `index.html` / `style.css`            |
| 6    | Fill in remaining overrides over time                            | `scripts/effects-meta-overrides.json` |

---

## Notes

- `effects-meta.json` should be committed so the index works when opened as a static file (no build step needed).
- The existing inline array in `index.html` can be kept as a fallback and gradually replaced once the JSON approach is validated.
- Tag normalisation: lowercase, trim, deduplicate before writing JSON.
- Creation date for effects added in the same commit: use commit timestamp of that commit, not `Date.now()`.
