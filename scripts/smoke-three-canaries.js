import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const DEFAULT_HOST = "127.0.0.1";
const REQUEST_TIMEOUT_MS = 45_000;
const SERVER_READY_TIMEOUT_MS = 30_000;
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 960, height: 540 },
];

const canaries = [
  {
    name: "dji-fpv",
    path: "dji-fpv.html",
    expectDjiOverlayRemoved: true,
  },
];

const failureFixtures = [
  {
    name: "three-factory-init-fail",
    path: "three-factory-init-fail.html",
    kind: "init",
  },
  {
    name: "three-factory-frame-fail",
    path: "three-factory-frame-fail.html",
    kind: "frame",
  },
  {
    name: "three-factory-loader-fail",
    path: "three-factory-loader-fail.html",
    kind: "loader",
  },
];

function fail(message) {
  throw new Error(`[smoke:three] ${message}`);
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    fail(
      `Playwright is not available. Run "npm install" before "npm run smoke:three".\n${formatError(
        error,
      )}`,
    );
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function normalizeBaseUrl(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, DEFAULT_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a TCP port.")));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function startViteServer(port) {
  const viteBin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );

  return spawn(viteBin, ["--host", DEFAULT_HOST, "--port", String(port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BROWSER: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForServer(baseUrl, serverProcess) {
  const start = Date.now();
  let lastError = "";

  while (Date.now() - start < SERVER_READY_TIMEOUT_MS) {
    if (serverProcess?.exitCode !== null) {
      fail(
        `Vite exited before becoming ready with code ${serverProcess.exitCode}.`,
      );
    }

    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(250);
  }

  fail(`Timed out waiting for Vite at ${baseUrl}. Last error: ${lastError}`);
}

async function createTargetServer() {
  const externalBaseUrl = process.env.BASE_URL;
  if (externalBaseUrl) {
    return { baseUrl: normalizeBaseUrl(externalBaseUrl), serverProcess: null };
  }

  const port = await findAvailablePort();
  const baseUrl = `http://${DEFAULT_HOST}:${port}/`;
  const serverProcess = startViteServer(port);

  serverProcess.stdout.on("data", () => {});
  serverProcess.stderr.on("data", () => {});

  serverProcess.on("error", (error) => {
    fail(`Unable to start Vite: ${formatError(error)}`);
  });

  await waitForServer(baseUrl, serverProcess);
  console.log(`[smoke:three] Started Vite at ${baseUrl}`);

  return {
    baseUrl,
    serverProcess,
  };
}

async function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) return;

  serverProcess.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => serverProcess.once("exit", resolve)),
    sleep(2_000).then(() => {
      if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
    }),
  ]);
}

function pageUrl(baseUrl, pagePath) {
  return new URL(pagePath, baseUrl).toString();
}

async function waitForRenderableCanvas(page, label) {
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "attached", timeout: REQUEST_TIMEOUT_MS });
  await page.waitForFunction(
    () => {
      const candidate = document.querySelector("canvas");
      return (
        candidate instanceof HTMLCanvasElement &&
        candidate.width > 0 &&
        candidate.height > 0
      );
    },
    undefined,
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const started = Date.now();
  let latestStats = null;
  while (Date.now() - started < REQUEST_TIMEOUT_MS) {
    const box = await canvas.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      const screenshot = await page.screenshot({
        clip: box,
        omitBackground: true,
      });
      latestStats = pngStats(screenshot);
      if (isScreenshotNonblank(latestStats)) return latestStats;
    }

    await page.waitForTimeout(250);
  }

  fail(`${label} canvas stayed blank: ${JSON.stringify(latestStats)}`);
}

function pngStats(buffer) {
  const image = PNG.sync.read(buffer);
  let alphaSum = 0;
  let alphaSquareSum = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let visiblePixels = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3];
    const luma =
      image.data[i] * 0.2126 +
      image.data[i + 1] * 0.7152 +
      image.data[i + 2] * 0.0722;

    alphaSum += alpha;
    alphaSquareSum += alpha * alpha;
    lumaSum += luma;
    lumaSquareSum += luma * luma;
    if (alpha > 8 || luma > 8) visiblePixels += 1;
  }

  const pixelCount = image.width * image.height;
  const alphaMean = alphaSum / pixelCount;
  const lumaMean = lumaSum / pixelCount;
  const alphaVariance = alphaSquareSum / pixelCount - alphaMean * alphaMean;
  const variance = lumaSquareSum / pixelCount - lumaMean * lumaMean;

  return {
    alphaMean,
    alphaStdDev: Math.sqrt(Math.max(0, alphaVariance)),
    lumaMean,
    lumaStdDev: Math.sqrt(Math.max(0, variance)),
    visibleRatio: visiblePixels / pixelCount,
  };
}

function isScreenshotNonblank(stats) {
  return stats.alphaStdDev > 1.2 || stats.lumaStdDev > 1.2;
}

async function assertViewportCoherence(page, viewport, label) {
  const metrics = await page.evaluate(() => {
    const candidate = document.querySelector("canvas");
    if (!(candidate instanceof HTMLCanvasElement)) {
      return null;
    }

    const rect = candidate.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      cssWidth: rect.width,
      cssHeight: rect.height,
      renderWidth: candidate.width,
      renderHeight: candidate.height,
      expectedRenderWidth: Math.round(rect.width * pixelRatio),
      expectedRenderHeight: Math.round(rect.height * pixelRatio),
    };
  });

  if (!metrics) fail(`${label} has no canvas metrics.`);

  const cssWidthDelta = Math.abs(metrics.cssWidth - viewport.width);
  const cssHeightDelta = Math.abs(metrics.cssHeight - viewport.height);
  const renderWidthDelta = Math.abs(
    metrics.renderWidth - metrics.expectedRenderWidth,
  );
  const renderHeightDelta = Math.abs(
    metrics.renderHeight - metrics.expectedRenderHeight,
  );

  if (cssWidthDelta > 2 || cssHeightDelta > 2) {
    fail(
      `${label} canvas CSS size is not viewport-coherent: ${JSON.stringify(
        metrics,
      )}`,
    );
  }

  if (renderWidthDelta > 2 || renderHeightDelta > 2) {
    fail(
      `${label} canvas render size is not DPR-coherent: ${JSON.stringify(
        metrics,
      )}`,
    );
  }
}

async function assertNoFactoryDiagnostic(page, label) {
  const diagnosticText = await page.evaluate(() => {
    const bodyText = document.body.textContent ?? "";
    if (bodyText.includes("Three.js scene failed")) return bodyText;
    return "";
  });

  if (diagnosticText) {
    fail(`${label} showed a factory diagnostic: ${diagnosticText.trim()}`);
  }
}

async function assertFactoryDiagnostic(page, label, expectedText) {
  await page.waitForFunction(
    (text) => (document.body.textContent ?? "").includes(text),
    expectedText,
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const diagnostics = await page.evaluate((text) => {
    return [...document.querySelectorAll("pre")]
      .map((node) => node.textContent ?? "")
      .filter((content) => content.includes(text));
  }, expectedText);

  if (diagnostics.length !== 1) {
    fail(
      `${label} expected one factory diagnostic containing "${expectedText}", got ${diagnostics.length}.`,
    );
  }
}

async function assertNoCanvas(page, label) {
  await page.waitForFunction(
    () => document.querySelectorAll("canvas").length === 0,
    undefined,
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const canvasCount = await page.locator("canvas").count();
  if (canvasCount !== 0) {
    fail(`${label} left ${canvasCount} canvas element(s) after failure.`);
  }
}

async function assertDjiOverlayRemoved(page) {
  await page.waitForFunction(
    () =>
      !document.getElementById("load-status") &&
      !document.getElementById("load-fill"),
    undefined,
    { timeout: REQUEST_TIMEOUT_MS },
  );
}

async function smokeCanary(browser, baseUrl, canary) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: VIEWPORTS[0],
  });
  const page = await context.newPage();
  const requestedUrls = [];

  page.on("request", (request) => {
    requestedUrls.push(request.url());
  });

  page.on("pageerror", (error) => {
    fail(`${canary.name} page error: ${formatError(error)}`);
  });

  try {
    console.log(`[smoke:three] Checking ${canary.path}`);
    await page.goto(pageUrl(baseUrl, canary.path), {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (canary.expectDjiOverlayRemoved) {
      await assertDjiOverlayRemoved(page);
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);
      const stats = await waitForRenderableCanvas(
        page,
        `${canary.name} ${viewport.width}x${viewport.height}`,
      );

      await assertViewportCoherence(
        page,
        viewport,
        `${canary.name} ${viewport.width}x${viewport.height}`,
      );

      console.log(
        `[smoke:three] ${canary.name} ${viewport.width}x${viewport.height} nonblank ` +
          `(visible=${stats.visibleRatio.toFixed(4)}, alpha=${stats.alphaMean.toFixed(
            2,
          )}, alphaStd=${stats.alphaStdDev.toFixed(
            2,
          )}, lumaStd=${stats.lumaStdDev.toFixed(2)})`,
      );
    }

    if (canary.expectEffectComposerRequest) {
      const hasComposerRequest = requestedUrls.some((url) =>
        url.includes("EffectComposer"),
      );

      if (!hasComposerRequest) {
        fail(
          `${canary.name} did not request the dynamic EffectComposer resource. Requests:\n${requestedUrls.join(
            "\n",
          )}`,
        );
      }
    }

    await assertNoFactoryDiagnostic(page, canary.name);
  } finally {
    await context.close();
  }
}

async function smokeInitFailureFixture(page, fixture) {
  await assertFactoryDiagnostic(
    page,
    fixture.name,
    "Three.js scene failed to initialize.",
  );
  await assertNoCanvas(page, fixture.name);

  const state = await page.evaluate(() => window.threeFactoryInitFail);
  if (!state?.settled || !state.rejected) {
    fail(`${fixture.name} did not observe the expected rejected init state.`);
  }

  if (state.frames !== 0) {
    fail(`${fixture.name} started the render loop (${state.frames} frames).`);
  }
}

async function smokeFrameFailureFixture(page, fixture) {
  await assertFactoryDiagnostic(
    page,
    fixture.name,
    "Three.js scene failed during rendering.",
  );

  await page.waitForFunction(
    () => {
      const state = window.threeFactoryFrameFail;
      return Boolean(state?.initialized && state.frames > 0);
    },
    undefined,
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const before = await page.evaluate(() => window.threeFactoryFrameFail);
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.threeFactoryFrameFail);

  if (!before?.initialized || !after?.initialized) {
    fail(`${fixture.name} did not finish fixture initialization.`);
  }

  if (before.frames !== after.frames) {
    fail(
      `${fixture.name} kept scheduling frames after failure (${before.frames} -> ${after.frames}).`,
    );
  }

  if (after.rejected) {
    fail(`${fixture.name} unexpectedly rejected createThreeScene().`);
  }
}

async function smokeLoaderFailureFixture(page, fixture) {
  await assertFactoryDiagnostic(
    page,
    fixture.name,
    "Three.js scene failed to initialize.",
  );
  await assertNoCanvas(page, fixture.name);

  await page.waitForFunction(
    () =>
      document.getElementById("fixture-load-status")?.textContent ===
      "Fixture model failed to load",
    undefined,
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const state = await page.evaluate(() => window.threeFactoryLoaderFail);
  if (!state?.settled || !state.rejected) {
    fail(`${fixture.name} did not observe the expected loader rejection.`);
  }
}

async function smokeFailureFixture(browser, baseUrl, fixture) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: VIEWPORTS[0],
  });
  const page = await context.newPage();

  page.on("pageerror", (error) => {
    fail(`${fixture.name} page error: ${formatError(error)}`);
  });

  try {
    console.log(`[smoke:three] Checking ${fixture.path}`);
    await page.goto(pageUrl(baseUrl, fixture.path), {
      waitUntil: "domcontentloaded",
      timeout: REQUEST_TIMEOUT_MS,
    });

    if (fixture.kind === "init") {
      await smokeInitFailureFixture(page, fixture);
    } else if (fixture.kind === "frame") {
      await smokeFrameFailureFixture(page, fixture);
    } else if (fixture.kind === "loader") {
      await smokeLoaderFailureFixture(page, fixture);
    } else {
      fail(`${fixture.name} has unknown fixture kind "${fixture.kind}".`);
    }
  } finally {
    await context.close();
  }
}

async function main() {
  const { chromium } = await importPlaywright();
  const target = await createTargetServer();
  let browser;

  try {
    await waitForServer(target.baseUrl, target.serverProcess);

    browser = await chromium.launch({
      args: ["--disable-dev-shm-usage", "--use-gl=swiftshader"],
    });

    for (const canary of canaries) {
      await smokeCanary(browser, target.baseUrl, canary);
    }

    for (const fixture of failureFixtures) {
      await smokeFailureFixture(browser, target.baseUrl, fixture);
    }

    console.log("[smoke:three] Three.js canary smoke passed.");
  } finally {
    if (browser) await browser.close();
    await stopServer(target.serverProcess);
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
