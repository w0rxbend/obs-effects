import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCatalogEntry as validateCatalogEntrySchema,
  validateGeneratedMetadataRecord,
  validateOverrideEntry,
} from "./effects-meta-schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const catalogPath = path.join(__dirname, "effects-catalog.json");
const overridesPath = path.join(__dirname, "effects-meta-overrides.json");
const outputDir = path.join(repoRoot, "public");
const outputPath = path.join(outputDir, "effects-meta.json");
const checkMode = process.argv.includes("--check");
const preserveExisting =
  process.argv.includes("--preserve-existing") && !checkMode;
const catalogSource = path.relative(repoRoot, catalogPath);
const overridesSource = path.relative(repoRoot, overridesPath);
const trackedPagesSource = "git tracked root HTML pages";
const generatedMetadataSource = "generated metadata records";

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

function writeStderr(message) {
  fs.writeSync(process.stderr.fd, `${message}\n`);
}

function printDiagnosticsAndExit(diagnostics) {
  const groups = [...diagnostics.entries()].filter(
    ([, messages]) => messages.length > 0,
  );

  if (groups.length === 0) {
    return false;
  }

  writeStderr("Metadata generation failed due to invalid source inputs:");

  for (const [source, messages] of groups) {
    writeStderr(`\n${source}:`);
    for (const message of messages) {
      writeStderr(`  - ${message}`);
    }
  }

  process.exitCode = 1;
  return true;
}

function validateGeneratedMetadataRecords(metadata, diagnostics) {
  for (const [index, record] of metadata.entries()) {
    for (const issue of validateGeneratedMetadataRecord(record, index)) {
      addDiagnostic(diagnostics, generatedMetadataSource, issue);
    }
  }
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
      addDiagnostic(
        diagnostics,
        source,
        "Expected a JSON object keyed by slug.",
      );
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
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
    });
  }

  return entriesBySlug;
}

function validateCatalogEntry(entry, index, diagnostics) {
  const issues = validateCatalogEntrySchema(entry, index);
  for (const issue of issues) {
    addDiagnostic(diagnostics, catalogSource, issue);
  }

  if (issues.length > 0) {
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

  for (const slug of Object.keys(overrides).sort((a, b) =>
    a.localeCompare(b),
  )) {
    if (!knownSlugs.has(slug)) {
      addDiagnostic(
        diagnostics,
        overridesSource,
        `Override key ${slug} does not match any generated effect slug.`,
      );
    }

    for (const issue of validateOverrideEntry(slug, overrides[slug])) {
      addDiagnostic(diagnostics, overridesSource, issue);
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

function createdAtFor(fileName, existingEntry) {
  if (checkMode && existingEntry?.createdAt) {
    return existingEntry.createdAt;
  }

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
    createdAt: createdAtFor(fileName, existingEntry),
  };
}

function formatMetadata(metadata) {
  const lines = ["["];

  for (const [index, record] of metadata.entries()) {
    lines.push("  {");
    lines.push(`    "slug": ${JSON.stringify(record.slug)},`);
    lines.push(`    "title": ${JSON.stringify(record.title)},`);
    lines.push(`    "href": ${JSON.stringify(record.href)},`);
    lines.push(`    "category": ${JSON.stringify(record.category)},`);
    lines.push(...formatTags(record.tags));
    lines.push(`    "description": ${JSON.stringify(record.description)},`);
    lines.push(`    "createdAt": ${JSON.stringify(record.createdAt)}`);
    lines.push(`  }${index === metadata.length - 1 ? "" : ","}`);
  }

  lines.push("]");

  return `${lines.join("\n")}\n`;
}

function formatTags(tags) {
  const compactTags = `[${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`;
  const compactLine = `    "tags": ${compactTags},`;
  if (compactLine.length <= 80) {
    return [compactLine];
  }

  return [
    '    "tags": [',
    ...tags.map(
      (tag, index) =>
        `      ${JSON.stringify(tag)}${index === tags.length - 1 ? "" : ","}`,
    ),
    "    ],",
  ];
}

function checkMetadataFreshness(generatedMetadata) {
  const outputSource = path.relative(repoRoot, outputPath);

  if (!fs.existsSync(outputPath)) {
    writeStderr(
      `${outputSource} is missing. Run \`node scripts/gen-metadata.js\` to generate it.`,
    );
    process.exitCode = 1;
    return true;
  }

  const existingMetadata = fs.readFileSync(outputPath, "utf8");
  if (existingMetadata !== generatedMetadata) {
    writeStderr(
      `${outputSource} is stale. Run \`node scripts/gen-metadata.js\` and commit the updated metadata.`,
    );
    process.exitCode = 1;
    return true;
  }

  console.log(`${outputSource} is up to date.`);
  return false;
}

function main() {
  const diagnostics = new Map();
  const htmlFiles = listEffectHtmlFiles(diagnostics) ?? [];
  const validateTrackedPages =
    !diagnostics.has(trackedPagesSource) ||
    diagnostics.get(trackedPagesSource).length === 0;
  const knownSlugs = new Set(
    htmlFiles.map((fileName) => slugFromHref(fileName)),
  );
  const catalogEntries = readCatalogEntries(
    htmlFiles,
    diagnostics,
    validateTrackedPages,
  );
  const overrides = validateTrackedPages
    ? readOverrides(knownSlugs, diagnostics)
    : {};
  if (printDiagnosticsAndExit(diagnostics)) {
    return;
  }

  const existingEntries =
    preserveExisting || checkMode ? readExistingMetadataEntries() : new Map();
  const metadata = htmlFiles
    .map((fileName) =>
      metadataForFile(fileName, catalogEntries, existingEntries, overrides),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
  validateGeneratedMetadataRecords(metadata, diagnostics);
  if (printDiagnosticsAndExit(diagnostics)) {
    return;
  }

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
