import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function isRootHtmlHref(href) {
  return (
    href.endsWith(".html") &&
    href !== "index.html" &&
    !href.includes("/") &&
    !href.includes("\\")
  );
}

function issueForHref(entry, index, trackedPages) {
  const label = `entry ${index}`;

  if (!entry || typeof entry !== "object") {
    return `${label}: expected an object metadata record.`;
  }

  const { href } = entry;

  if (href === "index.html") {
    return "";
  }

  if (typeof href !== "string" || !href.trim()) {
    return `${label}: missing string href.`;
  }

  if (href !== href.trim()) {
    return `${label}: href "${href}" has leading or trailing whitespace.`;
  }

  if (!isRootHtmlHref(href)) {
    return `${label}: href "${href}" is not a root-level HTML effect page.`;
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

function main() {
  const metadata = readMetadata();
  const trackedPages = listTrackedRootEffectPages();
  const issues = metadata
    .map((entry, index) => issueForHref(entry, index, trackedPages))
    .filter(Boolean);

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
