import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const HOST = "127.0.0.1";
const PORT = 5173;
const URL = `http://${HOST}:${PORT}`;
const START_TIMEOUT_MS = 30_000;

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const vite = spawn(
  npmCommand,
  ["run", "dev", "--", "--host", HOST, "--port", String(PORT), "--strictPort"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  }
);

let viteOutput = "";
vite.stdout.on("data", (chunk) => {
  viteOutput += chunk.toString();
});
vite.stderr.on("data", (chunk) => {
  viteOutput += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (vite.exitCode !== null) {
      throw new Error(`Vite exited before startup.\n${viteOutput}`);
    }

    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Vite did not start within ${START_TIMEOUT_MS} ms.\n${viteOutput}`);
}

async function stopVite() {
  if (vite.exitCode !== null) return;

  vite.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => vite.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (vite.exitCode === null) vite.kill("SIGKILL");
}

let browser;

try {
  await waitForServer();

  browser = await chromium.launch({
    channel: process.env.CITY3D_BROWSER_CHANNEL || "chrome",
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--disable-gpu-sandbox",
    ],
  });

  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  const runtimeErrors = [];

  page.on("pageerror", (error) => {
    runtimeErrors.push(`PAGEERROR: ${error.stack || error.message}`);
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource")
    ) {
      runtimeErrors.push(`CONSOLE: ${message.text()}`);
    }
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_800);

  const state = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")];
    const webglCanvas = canvases.find(
      (canvas) =>
        canvas.clientWidth === window.innerWidth &&
        canvas.clientHeight === window.innerHeight
    );
    const gl =
      webglCanvas?.getContext("webgl2") ||
      webglCanvas?.getContext("webgl") ||
      webglCanvas?.getContext("experimental-webgl");

    return {
      canvasCount: canvases.length,
      skyHud: document.querySelector("#real-sky-status")?.textContent?.trim() || null,
      webglCanvas: Boolean(webglCanvas),
      webglContextAlive: Boolean(gl && !gl.isContextLost()),
    };
  });

  console.log("Browser smoke state:", JSON.stringify(state, null, 2));

  if (runtimeErrors.length) {
    throw new Error(runtimeErrors.join("\n\n"));
  }
  if (state.canvasCount < 2) {
    throw new Error(`Expected at least 2 canvases, got ${state.canvasCount}.`);
  }
  if (!state.skyHud?.includes("Cielo real")) {
    throw new Error("Astronomical sky HUD did not initialize.");
  }
  if (!state.webglCanvas || !state.webglContextAlive) {
    throw new Error("Three.js WebGL canvas did not initialize correctly.");
  }
} finally {
  if (browser) await browser.close();
  await stopVite();
}
