import { resolve } from "path";
import { execFileSync } from "node:child_process";

import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
// GitHub Pages serves this project from a sub-path (https://<user>.github.io/obs-effects/),
// while local dev and the Docker deploy serve it from the domain root. The CI workflow sets
// VITE_BASE=/obs-effects/ so every generated URL is prefixed correctly; everywhere else the
// default "/" keeps the current behaviour.

// Build inputs are derived, not hand-listed. The invariant is:
//   git-tracked root *.html  ==  Vite build inputs  ==  public/effects-meta.json records
// scripts/gen-metadata.js and scripts/check-effects-meta.js already use this same
// `git ls-files` source, so a page can no longer be catalogued and listed in the
// directory while silently missing from the built site.
const rootPages = execFileSync("git", ["ls-files", "*.html"], {
  cwd: __dirname,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((file) => file.endsWith(".html") && !file.includes("/"));

// Rollup entry key -> the name of the generated JS chunk only (dist/assets/<key>-<hash>.js).
// The emitted HTML keeps its own path, so page URLs are unaffected by this naming.
const entryKey = (file: string): string =>
  file
    .replace(/\.html$/, "")
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : "",
    )
    .replace(/^./, (c) => c.toLowerCase());

const pageInputs = Object.fromEntries(
  rootPages.map((file) => [entryKey(file), resolve(__dirname, file)]),
);

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [assetpackPlugin()],
  server: {
    port: 8080,
    open: "/main-web-cam-border.html",
  },
  build: {
    rollupOptions: {
      input: pageInputs,
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
