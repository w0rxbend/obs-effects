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
