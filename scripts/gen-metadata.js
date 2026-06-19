import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const catalogPath = path.join(__dirname, "effects-catalog.json");
const overridesPath = path.join(__dirname, "effects-meta-overrides.json");
const outputDir = path.join(repoRoot, "public");
const outputPath = path.join(outputDir, "effects-meta.json");
const checkMode = process.argv.includes("--check");
const preserveExisting = process.argv.includes("--preserve-existing") && !checkMode;
const catalogSource = path.relative(repoRoot, catalogPath);
const overridesSource = path.relative(repoRoot, overridesPath);
const trackedPagesSource = "git tracked root HTML pages";

function slugFromHref(href) {
  return path.basename(href, ".html");
}

function titleFromSlug(slug) {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeTag(tag) {
  return tag.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function normalizeTags(tags) {
  const seen = new Set();
  const normalized = [];

  for (const tag of tags) {
    if (typeof tag !== "string") continue;

    const displayTag = normalizeTag(tag);
    if (!displayTag) continue;

    if (seen.has(displayTag)) continue;

    seen.add(displayTag);
    normalized.push(displayTag);
  }

  return normalized;
}

function addDiagnostic(diagnostics, source, message) {
  if (!diagnostics.has(source)) {
    diagnostics.set(source, []);
  }

  diagnostics.get(source).push(message);
}

function printDiagnosticsAndExit(diagnostics) {
  const groups = [...diagnostics.entries()].filter(
    ([, messages]) => messages.length > 0,
  );

  if (groups.length === 0) {
    return;
  }

  console.error("Metadata generation failed due to invalid source inputs:");

  for (const [source, messages] of groups) {
    console.error(`\n${source}:`);
    for (const message of messages) {
      console.error(`  - ${message}`);
    }
  }

  process.exit(1);
}

function readRequiredJsonFile(filePath, source, diagnostics) {
  if (!fs.existsSync(filePath)) {
    addDiagnostic(diagnostics, source, "File is required but was not found.");
    return undefined;
  }

  const rawJson = fs.readFileSync(filePath, "utf8");
  if (!rawJson.trim()) {
    addDiagnostic(diagnostics, source, "File is required but is empty.");
    return undefined;
  }

  try {
    return JSON.parse(rawJson);
  } catch (error) {
    addDiagnostic(
      diagnostics,
      source,
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function readOptionalJsonObject(filePath, source, diagnostics) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const rawJson = fs.readFileSync(filePath, "utf8");
  if (!rawJson.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      addDiagnostic(diagnostics, source, "Expected a JSON object keyed by slug.");
      return {};
    }

    return parsed;
  } catch (error) {
    addDiagnostic(
      diagnostics,
      source,
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

function isRootHtmlFile(href) {
  return (
    typeof href === "string" &&
    href.endsWith(".html") &&
    href !== "index.html" &&
    !href.includes("/") &&
    !href.includes("\\")
  );
}

function readExistingMetadataEntries() {
  if (!fs.existsSync(outputPath)) {
    return new Map();
  }

  const rawMetadata = fs.readFileSync(outputPath, "utf8");
  if (!rawMetadata.trim()) {
    return new Map();
  }

  const entriesBySlug = new Map();
  const metadata = JSON.parse(rawMetadata);
  if (!Array.isArray(metadata)) {
    return entriesBySlug;
  }

  for (const entry of metadata) {
    if (!entry || typeof entry.slug !== "string") continue;

    entriesBySlug.set(entry.slug, {
      category:
        typeof entry.category === "string" ? entry.category : "Uncategorized",
      tags: Array.isArray(entry.tags) ? entry.tags : [],
    });
  }

  return entriesBySlug;
}

function validateCatalogEntry(entry, index, diagnostics) {
  const label = `effects[${index}]`;

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    addDiagnostic(diagnostics, catalogSource, `${label} must be an object.`);
    return undefined;
  }

  if (typeof entry.href !== "string") {
    addDiagnostic(
      diagnostics,
      catalogSource,
      `${label}.href must be a root-level .html file.`,
    );
  } else if (entry.href === "index.html") {
    addDiagnostic(
      diagnostics,
      catalogSource,
      `${label}.href must not be index.html.`,
    );
  } else if (!isRootHtmlFile(entry.href)) {
    addDiagnostic(
      diagnostics,
      catalogSource,
      `${label}.href must be a root-level .html file.`,
    );
  }

  if (typeof entry.category !== "string" || !entry.category.trim()) {
    addDiagnostic(
      diagnostics,
      catalogSource,
      `${label}.category must be a non-empty string.`,
    );
  }

  if (!Array.isArray(entry.tags)) {
    addDiagnostic(diagnostics, catalogSource, `${label}.tags must be an array.`);
  }

  if (
    !isRootHtmlFile(entry.href) ||
    typeof entry.category !== "string" ||
    !entry.category.trim() ||
    !Array.isArray(entry.tags)
  ) {
    return undefined;
  }

  return {
    href: entry.href,
    category: entry.category,
    tags: entry.tags,
  };
}

function readCatalogEntries(htmlFiles, diagnostics, validateTrackedPages) {
  const catalog = readRequiredJsonFile(catalogPath, catalogSource, diagnostics);
  if (!catalog) {
    return new Map();
  }

  if (!Array.isArray(catalog.effects)) {
    addDiagnostic(
      diagnostics,
      catalogSource,
      "Expected an `effects` array at the top level.",
    );
    return new Map();
  }

  const trackedHtmlFiles = new Set(htmlFiles);
  const entriesBySlug = new Map();
  const catalogHrefs = new Set();

  for (const [index, entry] of catalog.effects.entries()) {
    const validEntry = validateCatalogEntry(entry, index, diagnostics);
    if (!validEntry) {
      continue;
    }

    const slug = slugFromHref(validEntry.href);
    if (catalogHrefs.has(validEntry.href)) {
      addDiagnostic(
        diagnostics,
        catalogSource,
        `Duplicate catalog href ${validEntry.href}.`,
      );
      continue;
    }

    if (entriesBySlug.has(slug)) {
      addDiagnostic(
        diagnostics,
        catalogSource,
        `Duplicate catalog slug ${slug} from ${validEntry.href}.`,
      );
      continue;
    }

    catalogHrefs.add(validEntry.href);
    entriesBySlug.set(slug, {
      category: validEntry.category,
      tags: validEntry.tags,
    });
  }

  if (validateTrackedPages) {
    for (const fileName of htmlFiles) {
      if (!catalogHrefs.has(fileName)) {
        addDiagnostic(
          diagnostics,
          trackedPagesSource,
          `${fileName} is tracked but missing from ${catalogSource}.`,
        );
      }
    }

    for (const href of catalogHrefs) {
      if (!trackedHtmlFiles.has(href)) {
        addDiagnostic(
          diagnostics,
          trackedPagesSource,
          `${catalogSource} references ${href}, but it is not a tracked root effect page.`,
        );
      }
    }
  }

  return entriesBySlug;
}

function readOverrides(knownSlugs, diagnostics) {
  const overrides = readOptionalJsonObject(
    overridesPath,
    overridesSource,
    diagnostics,
  );

  for (const slug of Object.keys(overrides).sort((a, b) => a.localeCompare(b))) {
    if (!knownSlugs.has(slug)) {
      addDiagnostic(
        diagnostics,
        overridesSource,
        `Override key ${slug} does not match any generated effect slug.`,
      );
    }
  }

  return overrides;
}

function gitCreatedAt(fileName) {
  try {
    const output = execFileSync(
      "git",
      ["log", "--format=%aI", "--diff-filter=A", "--", fileName],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    const firstDate = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return firstDate ?? "";
  } catch {
    return "";
  }
}

function fileCreatedAt(fileName) {
  const stat = fs.statSync(path.join(repoRoot, fileName));
  return stat.birthtime.toISOString();
}

function createdAtFor(fileName) {
  return gitCreatedAt(fileName) || fileCreatedAt(fileName);
}

function listEffectHtmlFiles(diagnostics) {
  let output = "";
  try {
    output = execFileSync("git", ["ls-files", "*.html"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    addDiagnostic(
      diagnostics,
      trackedPagesSource,
      `Unable to list tracked HTML files with git ls-files: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }

  return output
    .split(/\r?\n/)
    .map((fileName) => fileName.trim())
    .filter(
      (fileName) =>
        fileName.endsWith(".html") &&
        fileName !== "index.html" &&
        !fileName.includes("/"),
    )
    .sort((a, b) => a.localeCompare(b));
}

function metadataForFile(fileName, catalogEntries, existingEntries, overrides) {
  const slug = slugFromHref(fileName);
  const catalogEntry = catalogEntries.get(slug);
  const existingEntry = existingEntries.get(slug);
  const override = overrides[slug] ?? {};
  const catalogTags = catalogEntry?.tags ?? [];
  const existingTags = preserveExisting ? (existingEntry?.tags ?? []) : [];
  const overrideTags = Array.isArray(override.tags) ? override.tags : [];
  const category =
    typeof override.category === "string"
      ? override.category
      : (catalogEntry?.category ??
        (preserveExisting ? existingEntry?.category : undefined) ??
        "Uncategorized");

  return {
    slug,
    title: titleFromSlug(slug),
    href: fileName,
    category,
    tags: normalizeTags([...catalogTags, ...existingTags, ...overrideTags]),
    description:
      typeof override.description === "string" ? override.description : "",
    createdAt: createdAtFor(fileName),
  };
}

function formatMetadata(metadata) {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

function checkMetadataFreshness(generatedMetadata) {
  const outputSource = path.relative(repoRoot, outputPath);

  if (!fs.existsSync(outputPath)) {
    console.error(
      `${outputSource} is missing. Run \`node scripts/gen-metadata.js\` to generate it.`,
    );
    process.exit(1);
  }

  const existingMetadata = fs.readFileSync(outputPath, "utf8");
  if (existingMetadata !== generatedMetadata) {
    console.error(
      `${outputSource} is stale. Run \`node scripts/gen-metadata.js\` and commit the updated metadata.`,
    );
    process.exit(1);
  }

  console.log(`${outputSource} is up to date.`);
}

function main() {
  const diagnostics = new Map();
  const htmlFiles = listEffectHtmlFiles(diagnostics) ?? [];
  const validateTrackedPages =
    !diagnostics.has(trackedPagesSource) ||
    diagnostics.get(trackedPagesSource).length === 0;
  const knownSlugs = new Set(htmlFiles.map((fileName) => slugFromHref(fileName)));
  const catalogEntries = readCatalogEntries(
    htmlFiles,
    diagnostics,
    validateTrackedPages,
  );
  const overrides = validateTrackedPages
    ? readOverrides(knownSlugs, diagnostics)
    : {};
  printDiagnosticsAndExit(diagnostics);

  const existingEntries = preserveExisting
    ? readExistingMetadataEntries()
    : new Map();
  const metadata = htmlFiles
    .map((fileName) =>
      metadataForFile(fileName, catalogEntries, existingEntries, overrides),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const generatedMetadata = formatMetadata(metadata);

  if (checkMode) {
    checkMetadataFreshness(generatedMetadata);
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, generatedMetadata);

  console.log(
    `Wrote ${metadata.length} records to ${path.relative(repoRoot, outputPath)}`,
  );
}

main();
