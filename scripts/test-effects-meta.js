import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "obs-effects-meta-tests-"),
);

const scriptsUnderTest = [
  "effects-meta-schema.js",
  "gen-metadata.js",
  "check-effects-meta.js",
];

const validTimestamp = "2026-05-02T09:02:12.000Z";

function writeText(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runRequired(command, args, cwd) {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}\n${combinedOutput(result)}`,
    );
  }
}

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) {
    throw new Error(
      `${label}\nExpected output to include:\n${expected}\n\nActual output:\n${actual}`,
    );
  }
}

function createFixture(name, trackedPages = ["alpha.html"]) {
  const root = path.join(fixtureRoot, name);
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "public"), { recursive: true });
  writeJson(path.join(root, "package.json"), { type: "module" });

  for (const scriptName of scriptsUnderTest) {
    fs.copyFileSync(
      path.join(repoRoot, "scripts", scriptName),
      path.join(root, "scripts", scriptName),
    );
  }

  runRequired("git", ["init", "-q"], root);
  runRequired("git", ["config", "user.email", "tests@example.invalid"], root);
  runRequired("git", ["config", "user.name", "Metadata Tests"], root);

  for (const page of trackedPages) {
    writeText(
      path.join(root, page),
      '<!doctype html><div id="pixi-container"></div>\n',
    );
    runRequired("git", ["add", page], root);
  }

  return root;
}

function validCatalog(pages = ["alpha.html"]) {
  return {
    effects: pages.map((href) => ({
      href,
      category: "Fixture",
      tags: ["fixture"],
    })),
  };
}

function metadataRecord(slug, href) {
  return {
    slug,
    title: slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" "),
    href,
    category: "Fixture",
    tags: ["fixture"],
    description: "",
    createdAt: validTimestamp,
  };
}

function writeCatalog(root, catalog) {
  writeJson(path.join(root, "scripts", "effects-catalog.json"), catalog);
}

function writeOverrides(root, overrides) {
  writeJson(
    path.join(root, "scripts", "effects-meta-overrides.json"),
    overrides,
  );
}

function writeMetadata(root, records) {
  writeJson(path.join(root, "public", "effects-meta.json"), records);
}

function runScript(root, scriptName, args = []) {
  return run("node", [path.join(root, "scripts", scriptName), ...args], root);
}

function expectFailure(testCase) {
  const root = createFixture(testCase.name, testCase.trackedPages);
  testCase.setup(root);

  const result = runScript(root, testCase.script, testCase.args);
  const output = combinedOutput(result);

  if (result.status === 0) {
    throw new Error(`${testCase.name} unexpectedly passed.\n${output}`);
  }

  assertIncludes(output, testCase.expected, testCase.name);
}

const failureCases = [
  {
    name: "missing-catalog-file",
    script: "gen-metadata.js",
    setup(root) {
      writeOverrides(root, {});
    },
    expected: "File is required but was not found.",
  },
  {
    name: "invalid-catalog-json",
    script: "gen-metadata.js",
    setup(root) {
      writeText(path.join(root, "scripts", "effects-catalog.json"), "{");
      writeOverrides(root, {});
    },
    expected: "Invalid JSON:",
  },
  {
    name: "missing-tracked-page-in-catalog",
    trackedPages: ["alpha.html", "beta.html"],
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog(["alpha.html"]));
      writeOverrides(root, {});
    },
    expected: "beta.html is tracked but missing from scripts/effects-catalog.json.",
  },
  {
    name: "stale-catalog-href",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog(["alpha.html", "ghost.html"]));
      writeOverrides(root, {});
    },
    expected:
      "scripts/effects-catalog.json references ghost.html, but it is not a tracked root effect page.",
  },
  {
    name: "dead-override-key",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog());
      writeOverrides(root, { ghost: { category: "Fixture" } });
    },
    expected: "Override key ghost does not match any generated effect slug.",
  },
  {
    name: "malformed-override-value",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog());
      writeOverrides(root, { alpha: "Fixture" });
    },
    expected: "overrides.alpha must be an object keyed by optional metadata fields.",
  },
  {
    name: "invalid-override-tag",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog());
      writeOverrides(root, { alpha: { tags: ["fixture", " "] } });
    },
    expected: "overrides.alpha.tags[1] must be a non-empty string.",
  },
  {
    name: "blank-catalog-category",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, {
        effects: [{ href: "alpha.html", category: " ", tags: ["fixture"] }],
      });
      writeOverrides(root, {});
    },
    expected: "effects[0].category must be a non-empty string.",
  },
  {
    name: "invalid-catalog-tag",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, {
        effects: [{ href: "alpha.html", category: "Fixture", tags: [" "] }],
      });
      writeOverrides(root, {});
    },
    expected: "effects[0].tags[0] must be a non-empty string.",
  },
  {
    name: "duplicate-generated-metadata-href",
    trackedPages: ["alpha.html", "beta.html"],
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        metadataRecord("alpha", "alpha.html"),
        metadataRecord("alpha-copy", "alpha.html"),
        metadataRecord("beta", "beta.html"),
      ]);
    },
    expected: 'duplicate href "alpha.html" appears in public/effects-meta.json.',
  },
  {
    name: "duplicate-generated-metadata-slug",
    trackedPages: ["alpha.html", "beta.html"],
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        metadataRecord("alpha", "alpha.html"),
        metadataRecord("alpha", "beta.html"),
      ]);
    },
    expected: 'duplicate slug "alpha" appears in public/effects-meta.json.',
  },
  {
    name: "stale-generated-output",
    trackedPages: ["alpha.html", "beta.html"],
    script: "gen-metadata.js",
    args: ["--check"],
    setup(root) {
      writeCatalog(root, validCatalog(["alpha.html", "beta.html"]));
      writeOverrides(root, {});
      writeMetadata(root, [metadataRecord("alpha", "alpha.html")]);
    },
    expected: "public/effects-meta.json is stale.",
  },
];

let passed = 0;

try {
  for (const testCase of failureCases) {
    expectFailure(testCase);
    passed += 1;
    console.log(`ok - ${testCase.name}`);
  }

  console.log(`Passed ${passed} effects metadata regression tests.`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
