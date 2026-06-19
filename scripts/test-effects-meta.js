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
  return [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join("");
}

function assertIncludes(actual, expected, label) {
  if (!actual.includes(expected)) {
    throw new Error(
      `${label}\nExpected output to include:\n${expected}\n\nActual output:\n${actual}`,
    );
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `${label}\nExpected:\n${JSON.stringify(
        expected,
        null,
        2,
      )}\n\nActual:\n${JSON.stringify(actual, null, 2)}`,
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

function runScriptRequired(root, scriptName, args = []) {
  const result = runScript(root, scriptName, args);
  if (result.status !== 0) {
    throw new Error(
      `${scriptName} ${args.join(" ")} failed in ${root}\n${combinedOutput(
        result,
      )}`,
    );
  }

  return result;
}

function readGeneratedMetadata(root) {
  return JSON.parse(
    fs.readFileSync(path.join(root, "public", "effects-meta.json"), "utf8"),
  );
}

function expectHappyPath() {
  const root = createFixture("happy-path", ["alpha.html"]);
  writeCatalog(root, {
    effects: [
      {
        href: "alpha.html",
        category: "Catalog Category",
        tags: ["Fixture Tag", "OBS"],
      },
    ],
  });
  writeOverrides(root, {
    alpha: {
      category: "Override Category",
      description: "A generated fixture effect.",
      tags: ["Override Tag", "fixture tag"],
    },
  });

  runScriptRequired(root, "gen-metadata.js");

  const metadata = readGeneratedMetadata(root);
  assertEqual(metadata.length, 1, "happy-path record count");

  const [record] = metadata;
  assertDeepEqual(
    {
      slug: record.slug,
      title: record.title,
      href: record.href,
      category: record.category,
      tags: record.tags,
      description: record.description,
    },
    {
      slug: "alpha",
      title: "Alpha",
      href: "alpha.html",
      category: "Override Category",
      tags: ["fixture tag", "obs", "override tag"],
      description: "A generated fixture effect.",
    },
    "happy-path generated record content",
  );
  assertIncludes(
    record.createdAt,
    "T",
    "happy-path generated record timestamp shape",
  );

  runScriptRequired(root, "gen-metadata.js", ["--check"]);
  runScriptRequired(root, "check-effects-meta.js");
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
    expected:
      "beta.html is tracked but missing from scripts/effects-catalog.json.",
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
    expected:
      "overrides.alpha must be an object keyed by optional metadata fields.",
  },
  {
    name: "override-tag-whitespace",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog());
      writeOverrides(root, { alpha: { tags: ["fixture", " "] } });
    },
    expected: "overrides.alpha.tags[1] must be a non-empty string.",
  },
  {
    name: "catalog-category-whitespace",
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
    name: "catalog-tag-whitespace",
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
    name: "catalog-tag-non-string-value",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, {
        effects: [{ href: "alpha.html", category: "Fixture", tags: [42] }],
      });
      writeOverrides(root, {});
    },
    expected: "effects[0].tags[0] must be a string; received number.",
  },
  {
    name: "blank-override-description",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog());
      writeOverrides(root, { alpha: { description: " " } });
    },
    expected: "overrides.alpha.description must be a non-empty string.",
  },
  {
    name: "unknown-override-field",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, validCatalog());
      writeOverrides(root, { alpha: { descripton: "Typo" } });
    },
    expected:
      "overrides.alpha.descripton is not allowed; expected only category, description, tags.",
  },
  {
    name: "unknown-catalog-field",
    script: "gen-metadata.js",
    setup(root) {
      writeCatalog(root, {
        effects: [
          {
            href: "alpha.html",
            category: "Fixture",
            tags: ["fixture"],
            title: "Alpha",
          },
        ],
      });
      writeOverrides(root, {});
    },
    expected:
      "effects[0].title is not allowed; expected only href, category, tags.",
  },
  {
    name: "checker-non-object-record",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [null]);
    },
    expected: "entry 0 must be an object metadata record.",
  },
  {
    name: "checker-wrong-field-types",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        {
          slug: 42,
          title: false,
          href: 42,
          category: [],
          tags: "fixture",
          description: 42,
          createdAt: null,
        },
      ]);
    },
    expected: "entry 0.slug must be a string; received number.",
  },
  {
    name: "checker-blank-category",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), category: " " },
      ]);
    },
    expected: "entry 0.category must be a non-empty string.",
  },
  {
    name: "checker-blank-title",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), title: " " },
      ]);
    },
    expected: "entry 0.title must be a non-empty string.",
  },
  {
    name: "checker-non-array-tags",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), tags: "fixture" },
      ]);
    },
    expected: "entry 0.tags must be an array of non-empty strings.",
  },
  {
    name: "checker-blank-tag",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), tags: ["fixture", " "] },
      ]);
    },
    expected: "entry 0.tags[1] must be a non-empty string.",
  },
  {
    name: "checker-invalid-timestamp",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), createdAt: "not-a-date" },
      ]);
    },
    expected:
      'entry 0.createdAt must be an ISO-like timestamp such as 2026-05-02T12:02:12+03:00 or 2026-05-02T09:02:12.000Z; received "not-a-date".',
  },
  {
    name: "checker-invalid-slug",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), slug: "Alpha" },
      ]);
    },
    expected:
      'entry 0.slug must use lowercase letters, numbers, hyphen separators, and an optional numeric parenthesized suffix; received "Alpha".',
  },
  {
    name: "checker-slug-href-basename-mismatch",
    script: "check-effects-meta.js",
    setup(root) {
      writeMetadata(root, [
        { ...metadataRecord("alpha", "alpha.html"), slug: "alpha-copy" },
      ]);
    },
    expected:
      'entry 0.slug "alpha-copy" must exactly match href basename "alpha" from entry 0.href "alpha.html".',
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
    expected:
      'duplicate href "alpha.html" appears in public/effects-meta.json.',
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
  expectHappyPath();
  passed += 1;
  console.log("ok - happy-path");

  for (const testCase of failureCases) {
    expectFailure(testCase);
    passed += 1;
    console.log(`ok - ${testCase.name}`);
  }

  console.log(`Passed ${passed} effects metadata regression tests.`);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
