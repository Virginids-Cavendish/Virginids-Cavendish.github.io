const { test, expect } = require("@playwright/test");
const { preparePage } = require("./helpers");

const homePath = "/al-folio/?rr-stable=1";

function relativeLuminance(hexColor) {
  const channels = hexColor
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

async function openInstrument(page, options = {}) {
  await preparePage(page, options.theme || "dark");
  if (options.reducedMotion) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await page.goto(homePath, { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
}

test("homepage renders the full Renaissance Cyber-Rhizome material set", async ({ page }) => {
  await openInstrument(page);

  await expect(page.locator("[data-rr-section]")).toHaveCount(6);
  await expect(page.locator("#rr-field")).toBeVisible();
  await expect(page.locator("[data-rr-calligraphy-char]")).toHaveCount(3);
  const calligraphySources = await page.locator("[data-rr-calligraphy-char]").evaluateAll((images) =>
    images.map((image) => ({
      src: image.getAttribute("src"),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }))
  );
  expect(calligraphySources.map(({ src }) => src)).toEqual([
    "/al-folio/assets/img/renaissance-rhizome/name-yan-extracted.png",
    "/al-folio/assets/img/renaissance-rhizome/name-guang-extracted.png",
    "/al-folio/assets/img/renaissance-rhizome/name-feng-extracted.png",
  ]);
  expect(calligraphySources.every(({ naturalWidth, naturalHeight }) => naturalWidth > 700 && naturalHeight > 900)).toBeTruthy();

  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".rr-hero__wordmark")).toHaveCSS("font-family", /RR Unifraktur/);
  expect(await page.evaluate(() => document.fonts.check('700 64px "RR Unifraktur"', "Virginids"))).toBeTruthy();

  const interfaceImage = page.locator(".rr-interface__master img");
  await interfaceImage.scrollIntoViewIfNeeded();
  await expect(interfaceImage).toBeVisible();

  const coverImages = page.locator(".rr-book__cover img");
  await expect(coverImages).toHaveCount(2);
  for (const coverImage of await coverImages.all()) {
    await coverImage.scrollIntoViewIfNeeded();
    await expect(coverImage).toBeVisible();
    await expect.poll(() => coverImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  }

  await expect(page.locator("[data-rr-open-reader]")).toHaveCount(8);
  await expect(page.getByRole("heading", { name: "Rhizome-Learn" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Translation Projects" })).toBeVisible();

  const state = await page.locator("[data-rr-root]").evaluate((root) => ({
    renderer: root.dataset.rrRenderer,
    stable: root.dataset.rrStable,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(["hybrid-webgl", "2d-fallback"]).toContain(state.renderer);
  expect(state.stable).toBe("true");
  expect(state.overflow).toBeLessThanOrEqual(1);
});

test("WebGL contributes visible pixels to the hybrid field when available", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Chromium WebGL renderer acceptance");
  await openInstrument(page);

  const snapshot = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(snapshot.renderer).toBe("hybrid-webgl");
  expect(snapshot.frame.webgl).toBeGreaterThan(0);
  expect(snapshot.sample.webglAlpha).toBeGreaterThan(0);
  expect(snapshot.sample.webglFallback).toBe("none");
  expect(snapshot.sample.contextLost).toBe(false);

  const alphaPixels = await page.locator("#rr-field").evaluate((canvas) => {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext("2d");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) count += 1;
    }
    return count;
  });
  expect(alphaPixels).toBeGreaterThan(0);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  const repeated = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(repeated.renderer).toBe("hybrid-webgl");
  expect(repeated.sample.nodeChecksum).toBe(snapshot.sample.nodeChecksum);
});

test("Canvas 2D remains visible and deterministic when WebGL is unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Chromium fallback acceptance");
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...arguments_) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return originalGetContext.call(this, type, ...arguments_);
    };
  });
  await openInstrument(page);

  const first = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(first.renderer).toBe("2d-fallback");
  expect(first.sample.webglFallback).toBe("unavailable");
  expect(first.sample.contextLost).toBe(false);
  expect(first.frame.webgl).toBe(0);
  expect(first.frame.draws).toBeGreaterThan(0);

  const alphaPixels = await page.locator("#rr-field").evaluate((canvas) => {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext("2d");
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let count = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) count += 1;
    }
    return count;
  });
  expect(alphaPixels).toBeGreaterThan(0);

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  const second = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(second.renderer).toBe("2d-fallback");
  expect(second.sample.nodeChecksum).toBe(first.sample.nodeChecksum);
});

test("desktop acceptance viewport is exactly 1440 × 1100", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop-only acceptance");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openInstrument(page);

  expect(page.viewportSize()).toEqual({ width: 1440, height: 1100 });
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    heroHeight: document.querySelector("#hero")?.getBoundingClientRect().height || 0,
  }));
  expect(geometry.clientWidth).toBe(1440);
  expect(geometry.scrollWidth).toBe(1440);
  expect(geometry.scrollHeight).toBeLessThan(32760);
  expect(geometry.heroHeight).toBeGreaterThanOrEqual(900);
});

test("small manuscript labels meet normal-text contrast requirements", async ({ page }) => {
  await openInstrument(page);

  await expect(page.locator(".rr-identity .rr-index__row > dt span").first()).toHaveCSS("color", "rgb(104, 65, 45)");
  await expect(page.locator(".rr-identity .rr-index__row > dd:first-of-type").first()).toHaveCSS("color", "rgb(104, 65, 45)");
  expect(contrastRatio("#68412d", "#d9cfb5")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#87442f", "#d9cfb5")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#72513a", "#d9cfb5")).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio("#d8d0bd", "#050706")).toBeGreaterThanOrEqual(4.5);
});

test("theme search and color-scheme controls remain operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop theme-shell acceptance");
  await openInstrument(page);

  await page.locator("#search-toggle").click();
  await expect(page.locator("ninja-keys")).toHaveAttribute("data-open", "true");

  const before = await page.locator("html").getAttribute("data-theme");
  await page.locator("#light-toggle").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", before || "");
});

test("motion, sound, and visual-freeze controls expose deterministic state", async ({ page }) => {
  await openInstrument(page);

  const root = page.locator("[data-rr-root]");
  const motion = page.locator("button[data-rr-motion]");
  const sound = page.locator("button[data-rr-sound]");

  await expect(motion).toHaveAttribute("aria-pressed", "true");
  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await expect(root).toHaveAttribute("data-rr-motion", "reduced");

  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveAttribute("data-rr-sound", "on");

  await page.evaluate(() => window.__RR_VISUAL_API__.freeze(4242));
  const snapshot = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(snapshot.stable).toBe("true");
});

test("audio is created only by a user gesture and the session sound choice persists", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop AudioContext acceptance");
  await page.addInitScript(() => {
    window.__rrAudioProbe = { constructed: 0, resumed: 0, started: 0, stopped: 0 };
    class MockAudioContext {
      constructor() {
        window.__rrAudioProbe.constructed += 1;
        this.currentTime = 1;
        this.destination = {};
        this.state = "suspended";
      }

      resume() {
        window.__rrAudioProbe.resumed += 1;
        this.state = "running";
        return Promise.resolve();
      }

      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {
            window.__rrAudioProbe.started += 1;
          },
          stop() {
            window.__rrAudioProbe.stopped += 1;
          },
        };
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: MockAudioContext });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: MockAudioContext });
  });
  await openInstrument(page);

  expect(await page.evaluate(() => window.__rrAudioProbe)).toEqual({ constructed: 0, resumed: 0, started: 0, stopped: 0 });
  await page.locator("button[data-rr-sound]").click();
  expect(await page.evaluate(() => window.__rrAudioProbe)).toEqual({ constructed: 1, resumed: 1, started: 1, stopped: 1 });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  await expect(page.locator("button[data-rr-sound]")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__rrAudioProbe.constructed)).toBe(0);

  const pageTrigger = page.locator("[data-rr-open-reader]").first();
  await pageTrigger.scrollIntoViewIfNeeded();
  await pageTrigger.click();
  expect(await page.evaluate(() => window.__rrAudioProbe.started)).toBe(1);
});

test("the live field breathes, samples nearby Canvas nodes, and pauses in the background", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "fine-pointer runtime acceptance");
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");

  const before = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().sample.nodeChecksum), { timeout: 3000 })
    .not.toBe(before.sample.nodeChecksum);
  const breathing = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(breathing.frame.rendered).toBeGreaterThan(before.frame.rendered);
  expect(breathing.sample.fieldEnergy).not.toBe(before.sample.fieldEnergy);

  const sampled = await page.evaluate(() => {
    const root = document.querySelector("[data-rr-root]");
    const canvas = document.querySelector("#rr-field");
    const bounds = canvas.getBoundingClientRect();
    const step = 36;
    for (let y = bounds.top + 18; y < bounds.bottom; y += step) {
      for (let x = bounds.left + 18; x < bounds.right; x += step) {
        root.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerType: "mouse",
            clientX: x,
            clientY: y,
          })
        );
        if (root.dataset.rrCursor === "sample") {
          return { found: true, x, y };
        }
      }
    }
    return { found: false, x: 0, y: 0 };
  });
  expect(sampled.found).toBeTruthy();
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-cursor", "sample");
  await expect(page.locator("[data-rr-cursor-label]")).toHaveText("SAMPLE");
  const nearest = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().nearest);
  expect(nearest.active).toBe(true);
  expect(nearest.distancePx).toBeLessThanOrEqual(nearest.thresholdPx);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const pausedAt = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.callbacks);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.callbacks)).toBe(pausedAt);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.callbacks), { timeout: 2000 }).toBeGreaterThan(pausedAt);
});

test("sustained slow frames reduce nodes, sampling rate, and transparent layers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop adaptive-quality acceptance");
  await page.setViewportSize({ width: 800, height: 600 });
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...arguments_) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return originalGetContext.call(this, type, ...arguments_);
    };
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const syntheticTimers = new Map();
    let syntheticHandle = -1;
    let syntheticTime = performance.now();
    let slowFrames = false;
    window.__RR_SET_SLOW_FRAMES__ = (enabled) => {
      slowFrames = enabled;
      syntheticTime = performance.now();
    };
    window.requestAnimationFrame = (callback) => {
      if (!slowFrames) return nativeRequestAnimationFrame(callback);
      const handle = syntheticHandle--;
      const timer = window.setTimeout(() => {
        syntheticTimers.delete(handle);
        syntheticTime += 42;
        callback(syntheticTime);
      }, 12);
      syntheticTimers.set(handle, timer);
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      const timer = syntheticTimers.get(handle);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        syntheticTimers.delete(handle);
        return;
      }
      nativeCancelAnimationFrame(handle);
    };
  });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await expect(root).toHaveAttribute("data-rr-quality", "high");
  await page.evaluate(() => window.__RR_SET_SLOW_FRAMES__(true));

  await expect.poll(() => root.getAttribute("data-rr-quality"), { timeout: 6000 }).toBe("medium");
  const medium = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(medium.sample.nodes).toBe(72);
  expect(medium.sample.targetFps).toBe(30);
  await expect(root).toHaveAttribute("data-rr-layer-budget", "reduced");

  await expect.poll(() => root.getAttribute("data-rr-quality"), { timeout: 6000 }).toBe("low");
  const low = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(low.sample.nodes).toBe(52);
  expect(low.sample.targetFps).toBe(20);
  expect(low.sample.intervalMs).toBe(50);
  expect(low.frame.skipped).toBeGreaterThan(0);
  await expect(root).toHaveAttribute("data-rr-layer-budget", "minimal");
  await expect(page.locator(".rr-interface__fragment-frame").nth(2)).toHaveCSS("opacity", "0.48");
  expect(await root.evaluate((element) => getComputedStyle(element).getPropertyValue("--rr-quality-layer-opacity").trim())).toBe("0.42");
});

test("scroll, pointer, and session history transform the instrument", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "fine-pointer interaction");
  await openInstrument(page);

  const root = page.locator("[data-rr-root]");
  const collision = page.locator("#collision-field");
  await collision.scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute("data-rr-chapter", "collision");
  await expect(root).toHaveAttribute("data-phase", "collision");
  await expect(root).toHaveClass(/is-fragmented/);

  const transformedState = await page.evaluate(() => {
    const glyph = document.querySelector("[data-rr-calligraphy-char]");
    const fragment = document.querySelector("[data-rr-fragment]");
    return {
      glyphX: glyph?.style.getPropertyValue("--rr-char-x") || "",
      fragmentX: fragment?.style.getPropertyValue("--rr-fragment-x") || "",
      fragmentOpacity: fragment?.style.getPropertyValue("--rr-fragment-opacity") || "",
    };
  });
  expect(transformedState.glyphX).not.toBe("");
  expect(transformedState.glyphX).not.toBe("0.00px");
  expect(transformedState.fragmentX).not.toBe("");
  expect(transformedState.fragmentOpacity).not.toBe("");

  const researchLink = page.getByRole("link", { name: /Enter Rhizome-Learn record/i });
  await researchLink.hover();
  await expect(root).toHaveAttribute("data-rr-cursor", "read");
  await expect(page.locator("[data-rr-cursor-label]")).toHaveText("FOCUS");

  for (let index = 0; index < 16; index += 1) {
    await root.dispatchEvent("pointerdown", {
      pointerType: "mouse",
      clientX: 80 + index,
      clientY: 240,
    });
  }
  await expect(root).toHaveAttribute("data-rr-evolution", "intrusive");
  await page.waitForTimeout(750);
  await root.dispatchEvent("pointerdown", {
    pointerType: "mouse",
    clientX: 100,
    clientY: 240,
  });

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-evolution", "intrusive");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-chapter", "hero");
  await expect(page.locator("[data-rr-calligraphy]")).toHaveClass(/rr-is-reterritorialized/);
  const restoredOffsets = await page.locator("[data-rr-calligraphy-char]").evaluateAll((characters) =>
    characters.map((character) => ({
      x: Number.parseFloat(character.style.getPropertyValue("--rr-char-x") || "0"),
      y: Number.parseFloat(character.style.getPropertyValue("--rr-char-y") || "0"),
    }))
  );
  expect(restoredOffsets.every(({ x, y }) => Math.abs(x) <= 0.01 && Math.abs(y) <= 0.01)).toBeTruthy();
});

test("research assembles, collision overloads, and the field releases into negative space", async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1100 });
  await openInstrument(page);
  const root = page.locator("[data-rr-root]");

  await page.locator("#rhizome-learn").evaluate((section) => section.scrollIntoView({ block: "center" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "research");
  const master = page.locator(".rr-interface__master img");
  await expect(master).toBeVisible();
  await expect.poll(() => master.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".rr-interface__fragments")).toHaveCSS("opacity", "0");

  const collisionImages = page.locator(".rr-collision__fragments img");
  await expect(collisionImages).toHaveCount(4);
  for (const collisionImage of await collisionImages.all()) {
    await collisionImage.scrollIntoViewIfNeeded();
    await expect.poll(() => collisionImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await page.locator("#collision-field").evaluate((section) => section.scrollIntoView({ block: "center" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "collision");
  const collisionMaterial = await collisionImages.evaluateAll((images) =>
    images.map((image) => ({
      opacity: Number.parseFloat(getComputedStyle(image).opacity),
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    }))
  );
  expect(collisionMaterial.every(({ opacity, width, height }) => opacity >= 0.7 && width > 0 && height > 0)).toBeTruthy();

  const release = page.locator(".rr-release");
  await release.scrollIntoViewIfNeeded();
  await expect(release).toBeVisible();
  const releaseGeometry = await release.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
      background: style.backgroundImage,
    };
  });
  expect(releaseGeometry.height).toBeGreaterThanOrEqual(releaseGeometry.viewportHeight * 0.6);
  expect(releaseGeometry.background).not.toBe("none");

  const contact = page.locator("#contact");
  await contact.scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute("data-rr-chapter", "contact");
  const networkGeometry = await page.locator(".rr-contact__network").evaluate((network) => {
    const bounds = network.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      width: bounds.width,
      viewportWidth: window.innerWidth,
      pathCount: network.querySelectorAll("path").length,
    };
  });
  expect(networkGeometry.pathCount).toBe(4);
  expect(networkGeometry.width).toBeGreaterThan(networkGeometry.viewportWidth);
  expect(networkGeometry.left < 0 || networkGeometry.right > networkGeometry.viewportWidth).toBeTruthy();
});

test("gold glitch feedback is confined to the collision chapter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop motion timing acceptance");
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });

  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await expect(root).toHaveAttribute("data-rr-motion", "full");
  await expect(root).not.toHaveClass(/rr-glitch-active/);

  await page.locator("#collision-field").evaluate((section) => section.scrollIntoView({ block: "center" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "collision");
  await page.waitForFunction(() => document.querySelector("[data-rr-root]")?.classList.contains("rr-glitch-active"), null, {
    polling: "raf",
    timeout: 8000,
  });

  await page.locator("#contact").evaluate((section) => section.scrollIntoView({ block: "center" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "contact");
  await expect(root).not.toHaveClass(/rr-glitch-active/);
});

test("late visual-test stabilizer injection freezes the Canvas field", async ({ page }) => {
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");

  await page.evaluate(() => {
    const style = document.createElement("style");
    style.id = "__alfolio_visual_stabilize";
    document.head.appendChild(style);
  });

  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-stable", "true");
  const snapshot = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(snapshot.stable).toBe("true");
});

test("page reader opens the selected page, traps focus, and returns focus on Escape", async ({ page }) => {
  await openInstrument(page);

  const trigger = page.locator("[data-rr-open-reader]").nth(2);
  const expectedSource = await trigger.getAttribute("data-rr-page-src");
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await trigger.press("Enter");

  const dialog = page.locator("#rr-reader");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(dialog.locator("[data-rr-reader-image]")).toHaveAttribute("src", expectedSource);
  await expect(dialog).toContainText("建构未来");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
});

test("all eight extracted pages enter a loaded, readable desktop or mobile plate", async ({ page }) => {
  await openInstrument(page);

  const triggers = page.locator("[data-rr-open-reader]");
  const dialog = page.locator("#rr-reader");
  const image = dialog.locator("[data-rr-reader-image]");
  for (let index = 0; index < 8; index += 1) {
    const trigger = triggers.nth(index);
    const expectedSource = await trigger.getAttribute("data-rr-page-src");
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(dialog).toHaveAttribute("open", "");
    await expect(image).toHaveAttribute("src", expectedSource);
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(800);

    const dimensions = await image.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(dimensions.width).toBeGreaterThanOrEqual(Math.min(320, dimensions.viewportWidth * 0.78));
    expect(dimensions.height).toBeGreaterThanOrEqual(Math.min(440, dimensions.viewportHeight * 0.55));

    await dialog.locator("[data-rr-reader-close]").click();
    await expect(dialog).not.toHaveAttribute("open", "");
  }
});

test("keyboard traversal reaches every homepage control and archive exit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop keyboard acceptance");
  await openInstrument(page);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  const focusableCount = await page.locator("a[href], button:not([disabled])").count();
  const seen = new Set();
  for (let index = 0; index < focusableCount + 4; index += 1) {
    await page.keyboard.press("Tab");
    const key = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return "";
      if (active.matches("[data-rr-open-reader]")) {
        return `page-${Array.from(document.querySelectorAll("[data-rr-open-reader]")).indexOf(active)}`;
      }
      if (active.hasAttribute("data-rr-motion")) return "motion";
      if (active.hasAttribute("data-rr-sound")) return "sound";
      if (active.hasAttribute("data-rr-tilt")) return "tilt";
      if (active.id) return `id:${active.id}`;
      if (active instanceof HTMLAnchorElement) return `href:${active.getAttribute("href")}`;
      return active.tagName.toLowerCase();
    });
    if (key) seen.add(key);
  }

  expect(seen).toContain("id:search-toggle");
  expect(seen).toContain("id:light-toggle");
  expect(seen).toContain("motion");
  expect(seen).toContain("sound");
  for (let index = 0; index < 8; index += 1) expect(seen).toContain(`page-${index}`);
  expect([...seen].some((key) => key.startsWith("href:mailto:"))).toBeTruthy();
  expect([...seen].some((key) => key.includes("github.com/Virginids-Cavendish"))).toBeTruthy();
  expect([...seen].some((key) => key.includes("/projects/rhizome-learn/"))).toBeTruthy();
  expect([...seen].some((key) => key.includes("/projects/translation-projects/"))).toBeTruthy();

  const motion = page.locator("button[data-rr-motion]");
  const sound = page.locator("button[data-rr-sound]");
  await motion.focus();
  await page.keyboard.press("Tab");
  await expect(sound).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(motion).toBeFocused();
  const focusStyle = await motion.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(1);
});

test("reduced motion starts in a readable deterministic state", async ({ page }) => {
  await preparePage(page, "dark");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");

  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-motion", "reduced");
  await expect(page.locator(".rr-interface__master")).toBeVisible();
  await expect(page.locator(".rr-book__cover")).toHaveCount(2);
  const before = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(after.frame.callbacks).toBe(before.frame.callbacks);
  expect(after.frame.rendered).toBe(before.frame.rendered);
  expect(after.sample.nodeChecksum).toBe(before.sample.nodeChecksum);
});

test("mobile keeps the full instrument and avoids horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only acceptance");
  await page.setViewportSize({ width: 390, height: 844 });
  await openInstrument(page);

  expect(page.viewportSize()).toEqual({ width: 390, height: 844 });
  await expect(page.locator("#rr-field")).toBeVisible();
  await expect(page.locator("[data-rr-calligraphy-char]")).toHaveCount(3);
  const tilt = page.locator("button[data-rr-tilt]");
  await expect(tilt).toBeVisible();
  await expect(page.locator(".rr-interface__master")).toBeVisible();
  await expect(page.locator(".rr-book__cover")).toHaveCount(2);
  await expect(page.locator(".rr-cursor")).toBeHidden();

  const touchFeedback = await page.evaluate(() => {
    document.querySelector("#rr-field")?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientX: 120,
        clientY: 240,
      })
    );
    const ripple = document.querySelector("[data-rr-root] > span.rr-touch-ripple:last-of-type");
    return {
      present: Boolean(ripple),
      left: ripple?.style.left || "",
      top: ripple?.style.top || "",
    };
  });
  expect(touchFeedback).toEqual({ present: true, left: "120px", top: "240px" });

  if (await tilt.isDisabled()) {
    await expect(tilt.locator("output")).toHaveText(/UNAVAILABLE|DENIED/);
  } else {
    await tilt.click();
    await expect(tilt).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-tilt", "enabled");
    await tilt.click();
    await expect(tilt).toHaveAttribute("aria-pressed", "false");
  }

  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector("#rr-field");
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      canvasCssWidth: canvas?.clientWidth || 0,
      canvasBackingWidth: canvas?.width || 0,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.canvasBackingWidth / metrics.canvasCssWidth).toBeLessThanOrEqual(1.51);
  expect(metrics.scrollHeight).toBeLessThan(32760);
  const quality = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(quality.sample.quality).toBe("medium");
  expect(quality.sample.nodes).toBe(44);
  expect(quality.sample.targetFps).toBe(30);
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-layer-budget", "reduced");
  await expect(page.locator(".rr-collision__fragments > .rr-picture").nth(3)).toHaveCSS("opacity", "0.76");

  const undersizedTargets = await page.evaluate(() => {
    const selectors = [".rr-controls button:not([disabled])", ".rr-hero__anchors a", ".rr-text-link", "[data-rr-open-reader]", ".rr-contact__exit"];
    return Array.from(document.querySelectorAll(selectors.join(",")))
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return { text: element.textContent?.trim().slice(0, 32), width: bounds.width, height: bounds.height };
      })
      .filter(({ width, height }) => width < 44 || height < 44);
  });
  expect(undersizedTargets).toEqual([]);
});

test("mobile touch and authorized device tilt perturb the live field", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile input acceptance");
  await page.addInitScript(() => {
    class MockDeviceOrientationEvent extends Event {
      static requestPermission() {
        return Promise.resolve("granted");
      }

      constructor(type, init = {}) {
        super(type);
        this.beta = init.beta ?? 0;
        this.gamma = init.gamma ?? 0;
      }
    }
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: MockDeviceOrientationEvent,
    });
  });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await expect(root).toHaveAttribute("data-rr-motion", "full");

  const before = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  const touchSample = await page.evaluate(() => {
    const root = document.querySelector("[data-rr-root]");
    const canvas = document.querySelector("#rr-field");
    const bounds = canvas.getBoundingClientRect();
    const step = 30;
    for (let y = bounds.top + 15; y < bounds.bottom; y += step) {
      for (let x = bounds.left + 15; x < bounds.right; x += step) {
        root.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            pointerType: "touch",
            clientX: x,
            clientY: y,
          })
        );
        const snapshot = window.__RR_VISUAL_API__.snapshot();
        if (snapshot.nearest.active) return { found: true, x, y, nearest: snapshot.nearest };
      }
    }
    return { found: false, x: 0, y: 0, nearest: null };
  });
  expect(touchSample.found).toBeTruthy();
  expect(touchSample.nearest.active).toBe(true);
  expect(touchSample.nearest.distancePx).toBeLessThanOrEqual(touchSample.nearest.thresholdPx);
  await expect(page.locator("[data-rr-root] > .rr-touch-ripple").last()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().sample.fieldEnergy), { timeout: 2500 })
    .not.toBe(before.sample.fieldEnergy);

  const tilt = page.locator("button[data-rr-tilt]");
  await tilt.click();
  await expect(root).toHaveAttribute("data-rr-tilt", "enabled");
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { beta: 50, gamma: 12 }));
  });
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().tilt.targetX)).toBe(0.5);
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().tilt.targetY)).toBe(0.5);
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().tilt.x), { timeout: 2000 }).toBeGreaterThan(0);
  expect(await root.evaluate((element) => element.style.getPropertyValue("--rr-tilt-input-x"))).toBe("0.500");
});

test("core archive remains readable without JavaScript", async ({ browser, baseURL }, testInfo) => {
  const viewport = testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1100 };
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  const page = await context.newPage();
  await page.goto(new URL(homePath, baseURL).toString(), { waitUntil: "networkidle" });

  await expect(page.getByText("Virginids", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("阎光锋", { exact: true })).toHaveCount(1);
  await expect(page.locator("[data-rr-calligraphy-char]")).toHaveCount(3);
  await expect(page.locator("[data-rr-calligraphy-char]").first()).toBeVisible();
  await expect(page.locator(".rr-interface__master img")).toBeVisible();
  await expect(page.locator(".rr-book__cover img")).toHaveCount(2);
  const pageLinks = page.locator("a[data-rr-open-reader]");
  await expect(pageLinks).toHaveCount(8);
  for (const pageLink of await pageLinks.all()) {
    await expect(pageLink).toHaveAttribute("href", /\.png$/);
    await pageLink.scrollIntoViewIfNeeded();
    await expect.poll(() => pageLink.locator("img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(800);
  }
  await expect(page.getByRole("link", { name: /Enter Rhizome-Learn record/i })).toHaveAttribute("href", /\/projects\/rhizome-learn\/$/);
  await expect(page.getByRole("link", { name: /Enter translation record/i })).toHaveAttribute("href", /\/projects\/translation-projects\/$/);
  await expect(page.getByRole("link", { name: "Projects", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Archive", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Email/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub/i })).toBeVisible();

  await context.close();
});
