import { chromium } from "playwright-core";

const URL = process.env.CITY3D_SMOKE_URL || "http://127.0.0.1:5173";

const browser = await chromium.launch({
  channel: process.env.CITY3D_BROWSER_CHANNEL || "chrome",
  headless: true,
  args: [
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    "--disable-gpu-sandbox",
  ],
});

try {
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
  await page.waitForFunction(
    () => document.documentElement.dataset.forestReady === "true",
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(1_200);

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
      forestReady: document.documentElement.dataset.forestReady || null,
      forestTiles: Number(document.documentElement.dataset.forestTiles || 0),
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
  if (state.forestReady !== "true" || state.forestTiles < 24) {
    throw new Error(
      `Forest boundary did not initialize correctly (${state.forestTiles} tiles).`
    );
  }
} finally {
  await browser.close();
}
