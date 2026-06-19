[anti-pattern] Generated catalog files can be contaminated by unrelated untracked effect pages; verify every metadata href maps to a tracked root HTML file before commit.
[pattern] When a generated JSON becomes runtime source of truth, keep category/tag inputs in a durable source file instead of preserving them from prior generated output.
[learning] A committed JSON file does not guarantee direct `file://` usability because browser fetch restrictions can force the app onto its inline fallback path.
[anti-pattern] One-way generated-artifact checks catch bad references but can still pass stale or incomplete output; compare source and output sets bidirectionally.
[pattern] Durable catalog sources should fail closed when missing or malformed; silent fallback to defaults turns source breakage into plausible generated output.
