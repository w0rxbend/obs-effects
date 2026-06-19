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
const preserveExisting = process.argv.includes("--preserve-existing");

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

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const rawJson = fs.readFileSync(filePath, "utf8");
  if (!rawJson.trim()) {
    return fallback;
  }

  return JSON.parse(rawJson);
}

function readCatalogEntries() {
  const catalog = readJsonFile(catalogPath, { effects: [] });
  const entries = Array.isArray(catalog.effects) ? catalog.effects : [];
  const entriesBySlug = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || typeof entry.href !== "string") {
      continue;
    }

    const slug = slugFromHref(entry.href);
    if (entriesBySlug.has(slug)) {
      throw new Error(`Duplicate catalog entry for ${entry.href}`);
    }

    entriesBySlug.set(slug, {
      category:
        typeof entry.category === "string" ? entry.category : "Uncategorized",
      tags: Array.isArray(entry.tags) ? entry.tags : [],
    });
  }

  return entriesBySlug;
}

function readOverrides() {
  return readJsonFile(overridesPath, {});
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

function listEffectHtmlFiles() {
  const output = execFileSync("git", ["ls-files", "*.html"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

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

function main() {
  const catalogEntries = readCatalogEntries();
  const existingEntries = preserveExisting
    ? readExistingMetadataEntries()
    : new Map();
  const overrides = readOverrides();
  const htmlFiles = listEffectHtmlFiles();
  const metadata = htmlFiles
    .map((fileName) =>
      metadataForFile(fileName, catalogEntries, existingEntries, overrides),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(
    `Wrote ${metadata.length} records to ${path.relative(repoRoot, outputPath)}`,
  );
}

main();
