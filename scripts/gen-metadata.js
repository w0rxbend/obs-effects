import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const overridesPath = path.join(__dirname, "effects-meta-overrides.json");
const outputDir = path.join(repoRoot, "public");
const outputPath = path.join(outputDir, "effects-meta.json");

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
  return String(tag).trim().replace(/\s+/g, " ");
}

function normalizeTags(tags) {
  const seen = new Set();
  const normalized = [];

  for (const tag of tags) {
    const displayTag = normalizeTag(tag);
    if (!displayTag) continue;

    const key = displayTag.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(displayTag);
  }

  return normalized;
}

function extractArrayLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  const arrayStart = source.indexOf("[", markerIndex);
  if (arrayStart === -1) {
    throw new Error(`Could not find array literal after ${marker.trim()}`);
  }

  let depth = 0;
  let quote = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "[") depth += 1;

    if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(arrayStart, index + 1);
      }
    }
  }

  throw new Error(`Could not parse array literal after ${marker.trim()}`);
}

function readIndexEntries() {
  const source = fs.readFileSync(indexPath, "utf8");
  const entriesBySlug = new Map();
  const markers = ["const RAW =", "const FALLBACK_EFFECTS ="];

  for (const marker of markers) {
    const rawLiteral = extractArrayLiteral(source, marker);
    if (!rawLiteral) continue;

    const rawEntries = Function(`"use strict"; return (${rawLiteral});`)();

    for (const entry of rawEntries) {
      if (Array.isArray(entry)) {
        const [href, _label, category, tags] = entry;
        if (typeof href !== "string") continue;

        entriesBySlug.set(slugFromHref(href), {
          category: typeof category === "string" ? category : "Uncategorized",
          tags: Array.isArray(tags) ? tags : [],
        });
        continue;
      }

      if (!entry || typeof entry !== "object" || typeof entry.href !== "string") {
        continue;
      }

      entriesBySlug.set(slugFromHref(entry.href), {
        category:
          typeof entry.category === "string" ? entry.category : "Uncategorized",
        tags: Array.isArray(entry.tags) ? entry.tags : [],
      });
    }
  }

  return entriesBySlug;
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

function readOverrides() {
  if (!fs.existsSync(overridesPath)) {
    return {};
  }

  const rawOverrides = fs.readFileSync(overridesPath, "utf8");
  if (!rawOverrides.trim()) {
    return {};
  }

  return JSON.parse(rawOverrides);
}

function gitCreatedAt(fileName) {
  try {
    const output = execFileSync(
      "git",
      ["log", "--diff-filter=A", "--format=%ai", "--", fileName],
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

    return firstDate ? formatGitDate(firstDate) : "";
  } catch {
    return "";
  }
}

function formatGitDate(gitDate) {
  const match = gitDate.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
  );

  if (!match) {
    return gitDate;
  }

  const [, date, time, offsetHour, offsetMinute] = match;
  return `${date}T${time}${offsetHour}:${offsetMinute}`;
}

function fileCreatedAt(fileName) {
  const stat = fs.statSync(path.join(repoRoot, fileName));
  return stat.birthtime.toISOString();
}

function createdAtFor(fileName) {
  return gitCreatedAt(fileName) || fileCreatedAt(fileName);
}

function listEffectHtmlFiles() {
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (fileName) => fileName.endsWith(".html") && fileName !== "index.html",
    )
    .sort((a, b) => a.localeCompare(b));
}

function metadataForFile(fileName, indexEntries, existingEntries, overrides) {
  const slug = slugFromHref(fileName);
  const indexEntry = indexEntries.get(slug);
  const existingEntry = existingEntries.get(slug);
  const override = overrides[slug] ?? {};
  const baseTags = indexEntry?.tags ?? existingEntry?.tags ?? [];
  const overrideTags = Array.isArray(override.tags) ? override.tags : [];

  return {
    slug,
    title: titleFromSlug(slug),
    href: fileName,
    category: indexEntry?.category ?? existingEntry?.category ?? "Uncategorized",
    tags: normalizeTags([...baseTags, ...overrideTags]),
    description:
      typeof override.description === "string" ? override.description : "",
    createdAt: createdAtFor(fileName),
  };
}

function main() {
  const indexEntries = readIndexEntries();
  const existingEntries = readExistingMetadataEntries();
  const overrides = readOverrides();
  const htmlFiles = listEffectHtmlFiles();
  const metadata = htmlFiles
    .map((fileName) =>
      metadataForFile(fileName, indexEntries, existingEntries, overrides),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(
    `Wrote ${metadata.length} records to ${path.relative(repoRoot, outputPath)}`,
  );
}

main();
