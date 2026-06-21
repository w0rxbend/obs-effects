[anti-pattern] Generated catalog files can be contaminated by unrelated untracked effect pages; verify every metadata href maps to a tracked root HTML file before commit.
[pattern] When a generated JSON becomes runtime source of truth, keep category/tag inputs in a durable source file instead of preserving them from prior generated output.
[learning] A committed JSON file does not guarantee direct `file://` usability because browser fetch restrictions can force the app onto its inline fallback path.
[anti-pattern] One-way generated-artifact checks catch bad references but can still pass stale or incomplete output; compare source and output sets bidirectionally.
[pattern] Durable catalog sources should fail closed when missing or malformed; silent fallback to defaults turns source breakage into plausible generated output.
[pattern] Put exact generated-output freshness checks in the build after validating durable source inputs, so stale artifacts cannot mask bad sources.
[learning] Validating override keys is not the same as validating override schema; known keys can still carry malformed values that get silently ignored.
[anti-pattern] Failure-only regression scripts can pass while the happy path is broken; include at least one valid fixture that proves the end-to-end command sequence succeeds.
[pattern] Shared metadata validators reduce schema drift, but the producer should validate generated records before writing so invalid output is blocked at the source.
[pattern] Fast fixture regression suites should be wired into the standard check path once stable; otherwise schema guarantees remain optional in practice.
[learning] Normalized JSON diagnostics do not cover subprocess boundaries; checker scripts should also catch git discovery failures explicitly.
[pattern] A factory function for repeated bootstrap code eliminates boilerplate across many files while keeping each page independently loadable — the factory is a shared source, not a merged runtime.
[anti-pattern] A factory with a narrow options interface will stall migration of entries that use any option outside the interface; identify all option variants before designing the interface.
[learning] Entries using `document.fonts.load()` with specific families are not equivalent to `document.fonts.ready`; a `fonts?: string[]` option is needed to fully migrate font-preloading entries.
[pattern] When doing mass file migrations, first categorize exclusions by root cause (custom logic, unsupported options, wrong tech stack) so the next iteration knows exactly what gap to close.
[anti-pattern] Spreading named undefined fields after `extra` silently defeats the escape hatch: `{ ...extra, background: undefined }` overrides `extra.background`; filter undefined named fields before spreading.
[learning] `document.fonts.load()` for a specific font is sufficient — adding `document.fonts.ready` afterward is defensive but redundant; `fonts?: string[]` in the factory correctly drops the extra wait.
[anti-pattern] Creating a barrel export (`src/lib/index.ts`) without migrating existing deep imports (`from "../../lib/obsAudio"`) leaves the barrel unused; the barrel only compresses if callers adopt it.
[anti-pattern] Audit-only tasks can silently expand into full migrations when agents see obviously-related work nearby; planner constraints ("no implementation this iteration") are not enforced without explicit scope gates in the task description.
[learning] A shared audio bridge singleton (obsAudio.ts) with an idle simulation fallback is a cleaner pattern than per-screen private AudioAnalyser classes — it eliminates duplicate simulation code and enforces a single OBS protocol integration point.
[pattern] When committing a new shared library (obsAudio.ts) and all its consumers together, a single conventional commit with a broad scope keeps the git history coherent: `refactor(audio): migrate all screens to shared obsAudio bridge`.
[anti-pattern] Barrel migrations can miss newer shared helpers if the search only targets older module names; search for every exported barrel symbol before declaring deep imports gone.
[learning] Empty conventional commits can make a baseline look preserved while the actual code lives in earlier checkpoint commits; verify commit stats after baseline tasks.
[anti-pattern] Callback-style asset loaders inside a factory `onInit` bypass async initialization failure handling; return a Promise or use `loadAsync()` so diagnostics and loop gating work.
[pattern] Option-gated Three.js features should be dynamically imported at the exact option boundary; static imports in shared factories leak bundle cost into pages that do not use the feature.
[anti-pattern] Typing optional context fields with value imports can keep optional implementations in shared bundles; use type-only imports plus dynamic construction at the option boundary.
