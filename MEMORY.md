[anti-pattern] Generated catalog files can be contaminated by unrelated untracked effect pages; verify every metadata href maps to a tracked root HTML file before commit.
[pattern] When a generated JSON becomes runtime source of truth, keep category/tag inputs in a durable source file instead of preserving them from prior generated output.
[learning] A committed JSON file does not guarantee direct `file://` usability because browser fetch restrictions can force the app onto its inline fallback path.
[anti-pattern] One-way generated-artifact checks catch bad references but can still pass stale or incomplete output; compare source and output sets bidirectionally.
[pattern] Durable catalog sources should fail closed when missing or malformed; silent fallback to defaults turns source breakage into plausible generated output.
[pattern] Put exact generated-output freshness checks in the build after validating durable source inputs, so stale artifacts cannot mask bad sources.
[learning] Validating override keys is not the same as validating override schema; known keys can still carry malformed values that get silently ignored.
[anti-pattern] Failure-only regression scripts can pass while the happy path is broken; include at least one valid fixture that proves the end-to-end command sequence succeeds.
[pattern] Shared metadata validators reduce schema drift, but the producer should validate generated records before writing so invalid output is blocked at the source.
