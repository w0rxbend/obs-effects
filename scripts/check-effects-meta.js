import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateGeneratedMetadataRecord,
  validateRootHtmlHref,
} from "./effects-meta-schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const metadataPath = path.join(repoRoot, "public", "effects-meta.json");

function listTrackedRootEffectPages() {
  const output = execFileSync("git", ["ls-files", "*.html"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return new Set(
    output
      .split(/\r?\n/)
      .map((fileName) => fileName.trim())
      .filter(
        (fileName) =>
          fileName.endsWith(".html") &&
          fileName !== "index.html" &&
          !fileName.includes("/"),
      ),
  );
}

function readMetadata() {
  const rawMetadata = fs.readFileSync(metadataPath, "utf8");
  const metadata = JSON.parse(rawMetadata);

  if (!Array.isArray(metadata)) {
    throw new Error("public/effects-meta.json must contain a JSON array.");
  }

  return metadata;
}

function issueForTrackedHref(entry, index, trackedPages) {
  const label = `entry ${index}`;

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return "";
  }

  const { href } = entry;

  if (validateRootHtmlHref(href, `${label}.href`).length > 0) {
    return "";
  }

  if (trackedPages.has(href)) {
    return "";
  }

  const absolutePath = path.join(repoRoot, href);
  if (fs.existsSync(absolutePath)) {
    return `${label}: href "${href}" exists but is not tracked by git.`;
  }

  return `${label}: href "${href}" does not exist as a root-level HTML file.`;
}

function collectDuplicateValues(metadata, fieldName) {
  const seen = new Set();
  const duplicates = new Set();

  for (const entry of metadata) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const value = entry[fieldName];
    if (typeof value !== "string") {
      continue;
    }

    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort((a, b) => a.localeCompare(b));
}

function listMetadataHrefs(metadata) {
  return new Set(
    metadata
      .map((entry) => (entry && typeof entry === "object" ? entry.href : ""))
      .filter((href) => typeof href === "string" && href.trim() === href),
  );
}

function main() {
  const metadata = readMetadata();
  const trackedPages = listTrackedRootEffectPages();
  const issues = metadata.flatMap((entry, index) => [
    ...validateGeneratedMetadataRecord(entry, index),
    issueForTrackedHref(entry, index, trackedPages),
  ]).filter(Boolean);
  const metadataHrefs = listMetadataHrefs(metadata);

  const duplicateHrefs = collectDuplicateValues(metadata, "href");
  for (const href of duplicateHrefs) {
    issues.push(`duplicate href "${href}" appears in public/effects-meta.json.`);
  }

  const duplicateSlugs = collectDuplicateValues(metadata, "slug");
  for (const slug of duplicateSlugs) {
    issues.push(`duplicate slug "${slug}" appears in public/effects-meta.json.`);
  }

  const missingMetadataPages = [...trackedPages].filter(
    (href) => !metadataHrefs.has(href),
  );
  for (const href of missingMetadataPages.sort((a, b) => a.localeCompare(b))) {
    issues.push(`tracked root effect page "${href}" is missing from metadata.`);
  }

  if (issues.length > 0) {
    console.error("Effects metadata integrity check failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Effects metadata integrity check passed for ${metadata.length} records.`,
  );
}

main();
