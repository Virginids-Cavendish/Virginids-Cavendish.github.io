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

async function moveCollisionTo(page, progress) {
  const stage = page.locator("[data-rr-collision-evidence]");
  const active = await stage.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight;
  });
  if (!active) {
    await stage.evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(32);
  }
  await stage.evaluate((element, targetProgress) => {
    const viewport = element.querySelector(".rr-collision__evidence-viewport");
    if (!(viewport instanceof HTMLElement)) return;
    const absoluteTop = window.scrollY + element.getBoundingClientRect().top;
    const stickyTop = Math.max(0, viewport.getBoundingClientRect().top);
    const travel = Math.max(1, element.getBoundingClientRect().height - viewport.getBoundingClientRect().height);
    window.scrollTo(0, absoluteTop - stickyTop + targetProgress * travel);
  }, progress);
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().collision.progress), { timeout: 2000 }).toBeCloseTo(progress, 1);
}

async function placeBookCoverAt(page, book, viewportRatio = 2 / 3) {
  await book.locator(".rr-book__cover img").evaluate(async (image) => {
    image.loading = "eager";
    if (!image.complete) {
      await new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }
    if (typeof image.decode === "function") await image.decode().catch(() => {});
  });
  // The page-strip images below each cover are lazy-loaded. Converge on the
  // contractual center line instead of trusting a single scroll calculation
  // that can be invalidated by the first lazy-image layout pass.
  await expect
    .poll(
      () =>
        book.evaluate((element, ratio) => {
          const cover = element.querySelector(".rr-book__cover");
          if (!(cover instanceof HTMLElement)) return Number.POSITIVE_INFINITY;
          const bounds = cover.getBoundingClientRect();
          const delta = bounds.top + bounds.height * 0.5 - window.innerHeight * ratio;
          if (Math.abs(delta) > 1) window.scrollBy(0, delta);
          return Math.abs(delta);
        }, viewportRatio),
      { timeout: 5000, intervals: [16, 32, 64, 128, 250] }
    )
    .toBeLessThanOrEqual(2);
  await page.waitForTimeout(32);
}

async function freshFieldCadence(page, renderedFrames = 190) {
  const baseline = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered), { timeout: 10000 })
    .toBeGreaterThanOrEqual(baseline + renderedFrames);
  return page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
}

async function evidenceGeometry(page, index) {
  return page
    .locator("[data-rr-evidence]")
    .nth(index)
    .evaluate((item) => {
      const image = item.querySelector("img");
      const viewport = item.closest(".rr-collision__evidence-viewport");
      const track = item.closest("[data-rr-evidence-track]");
      const itemBounds = item.getBoundingClientRect();
      const imageBounds = image?.getBoundingClientRect() || itemBounds;
      const viewportBounds = viewport?.getBoundingClientRect() || itemBounds;
      const itemStyle = getComputedStyle(item);
      const imageStyle = image ? getComputedStyle(image) : itemStyle;
      const visibleWidth = Math.max(0, Math.min(itemBounds.right, viewportBounds.right) - Math.max(itemBounds.left, viewportBounds.left));
      const visibleHeight = Math.max(0, Math.min(itemBounds.bottom, viewportBounds.bottom) - Math.max(itemBounds.top, viewportBounds.top));
      return {
        state: item.dataset.rrEvidenceState || "",
        itemTransform: itemStyle.transform,
        imageTransform: imageStyle.transform,
        clipPath: itemStyle.clipPath,
        clipValues: Array.from(itemStyle.clipPath.matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0])),
        clipVariable: item.style.getPropertyValue("--rr-evidence-clip"),
        opacity: Number.parseFloat(imageStyle.opacity),
        trackTranslate: Number.parseFloat(track?.style.getPropertyValue("--rr-evidence-translate") || "0"),
        left: itemBounds.left,
        top: itemBounds.top,
        width: itemBounds.width,
        height: itemBounds.height,
        imageLeft: imageBounds.left,
        imageTop: imageBounds.top,
        imageWidth: imageBounds.width,
        imageHeight: imageBounds.height,
        centerRatio: (itemBounds.left + itemBounds.width * 0.5 - viewportBounds.left) / Math.max(1, viewportBounds.width),
        visibleWidthRatio: visibleWidth / Math.max(1, itemBounds.width),
        visibleHeightRatio: visibleHeight / Math.max(1, itemBounds.height),
      };
    });
}

async function installSyntheticHighRefresh(page, { mockLongTasks = false } = {}) {
  await page.addInitScript(
    ({ withLongTasks }) => {
      const syntheticTimers = new Map();
      let syntheticHandle = -1;
      let syntheticTime = performance.now();
      window.requestAnimationFrame = (callback) => {
        const handle = syntheticHandle--;
        const timer = window.setTimeout(() => {
          syntheticTimers.delete(handle);
          syntheticTime += 1000 / 120;
          callback(syntheticTime);
        }, 8);
        syntheticTimers.set(handle, timer);
        return handle;
      };
      window.cancelAnimationFrame = (handle) => {
        const timer = syntheticTimers.get(handle);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          syntheticTimers.delete(handle);
        }
      };

      if (!withLongTasks) return;
      const observers = [];
      class MockPerformanceObserver {
        static supportedEntryTypes = ["longtask"];

        constructor(callback) {
          this.callback = callback;
          this.type = "";
          this.disconnected = false;
          observers.push(this);
        }

        observe(options = {}) {
          this.type = options.type || "";
        }

        disconnect() {
          this.disconnected = true;
        }

        takeRecords() {
          return [];
        }
      }
      Object.defineProperty(window, "PerformanceObserver", {
        configurable: true,
        value: MockPerformanceObserver,
      });
      const emitPressure = () => {
        const entries = [
          { duration: 64, startTime: performance.now() },
          { duration: 72, startTime: performance.now() },
        ];
        observers
          .filter((observer) => !observer.disconnected && observer.type === "longtask")
          .forEach((observer) => observer.callback({ getEntries: () => entries }));
      };
      window.__rrStartLongTaskPressure = () => {
        if (window.__rrPressureTimer) return;
        emitPressure();
        window.__rrPressureTimer = window.setInterval(emitPressure, 12);
      };
      window.__rrStopLongTaskPressure = () => {
        window.clearInterval(window.__rrPressureTimer);
        window.__rrPressureTimer = 0;
      };
    },
    { withLongTasks: mockLongTasks }
  );
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
  await preparePage(page, "dark");
  await page.goto(`${homePath}&rr-debug=1&rr-force-webgl=1`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  await page.evaluate(() => window.__RR_VISUAL_API__.renderAt());

  const snapshot = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(snapshot.renderer).toBe("hybrid-webgl");
  expect(snapshot.frame.webgl).toBeGreaterThan(0);
  expect(snapshot.sample.webglAlpha).toBeGreaterThan(0);
  expect(snapshot.sample.webglFallback).toBe("none");
  expect(snapshot.sample.contextLost).toBe(false);
  const webglLayer = page.locator("[data-rr-webgl-layer]");
  await expect(webglLayer).toBeVisible();
  const webglComposite = await webglLayer.evaluate((canvas) => {
    const style = getComputedStyle(canvas);
    const bounds = canvas.getBoundingClientRect();
    return {
      display: style.display,
      opacity: Number(style.opacity),
      width: bounds.width,
      height: bounds.height,
    };
  });
  expect(webglComposite.display).not.toBe("none");
  expect(webglComposite.opacity).toBeGreaterThan(0);
  expect(webglComposite.width).toBeGreaterThan(0);
  expect(webglComposite.height).toBeGreaterThan(0);

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
  await page.evaluate(() => window.__RR_VISUAL_API__.renderAt());
  const repeated = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(repeated.renderer).toBe("hybrid-webgl");
  expect(repeated.sample.nodeChecksum).toBeCloseTo(snapshot.sample.nodeChecksum, 2);
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
  await page.evaluate(() => window.__RR_VISUAL_API__.renderAt());

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
  await page.evaluate(() => window.__RR_VISUAL_API__.renderAt());
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

test("wide-screen acceptance reproduces the 1920 × 1080 book geometry", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "wide-screen desktop acceptance");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  expect(page.viewportSize()).toEqual({ width: 1920, height: 1080 });

  const books = page.locator(".rr-book[data-rr-assembly]");
  for (let index = 0; index < 2; index += 1) {
    await placeBookCoverAt(page, books.nth(index));
    await expect(books.nth(index)).toHaveAttribute("data-rr-assembly", "settled");
    const terminal = await books.nth(index).evaluate((book) => {
      const cover = book.querySelector(".rr-book__cover");
      const coverBounds = cover?.getBoundingClientRect();
      return {
        centerRatio: coverBounds ? (coverBounds.top + coverBounds.height * 0.5) / window.innerHeight : 1,
        fragments: Array.from(book.querySelectorAll("[data-rr-assembly-fragment]")).map((fragment) => ({
          x: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-x") || "0"),
          y: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-y") || "0"),
          angle: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-angle") || "0"),
          depth: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-depth") || "0"),
          opacity: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-opacity") || "0"),
        })),
      };
    });
    expect(terminal.centerRatio).toBeLessThanOrEqual(0.668);
    expect(
      terminal.fragments.every(
        ({ x, y, angle, depth, opacity }) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(angle) <= 0.1 && depth <= 0.02 && opacity <= 0.01
      )
    ).toBeTruthy();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
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
  await expect.poll(() => page.locator("ninja-keys").evaluate((element) => element.visible)).toBe(true);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.locator("ninja-keys").evaluate((element) => element.visible)).toBe(false);

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

  const canvasBounds = await page.locator("#rr-field").boundingBox();
  expect(canvasBounds).not.toBeNull();
  await page.mouse.move(canvasBounds.x + canvasBounds.width * 0.5, canvasBounds.y + canvasBounds.height * 0.5);
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().nearest), { timeout: 2000 })
    .toMatchObject({ nodeX: expect.any(Number), nodeY: expect.any(Number) });
  const nearest = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().nearest);
  await page.mouse.move(canvasBounds.x + nearest.nodeX * canvasBounds.width, canvasBounds.y + nearest.nodeY * canvasBounds.height);
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-cursor", "sample");
  await expect(page.locator("[data-rr-cursor-label]")).toHaveText("SAMPLE");
  const sampledNearest = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().nearest);
  expect(sampledNearest.active).toBe(true);
  expect(sampledNearest.distancePx).toBeLessThanOrEqual(sampledNearest.thresholdPx);

  await page.locator("#translation-archive").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-field-visible", "false");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().scheduler.scheduled)).toBe(false);
  const offscreenAt = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  await page.waitForTimeout(500);
  const offscreenAfter = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(offscreenAfter.frame.rendered - offscreenAt.frame.rendered).toBeLessThanOrEqual(1);
  expect(offscreenAfter.scheduler.frames - offscreenAt.scheduler.frames).toBeLessThanOrEqual(1);
  expect(offscreenAfter.scheduler.scheduled).toBe(false);
  expect(offscreenAfter.scheduler.dirty).toEqual([]);

  await page.locator("#hero").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-field-visible", "true");
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered), { timeout: 2000 })
    .toBeGreaterThan(offscreenAt.frame.rendered);

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

test("FIDELITY measures high refresh and changes sampling without deleting material", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop high-refresh fidelity acceptance");
  await page.setViewportSize({ width: 1200, height: 800 });
  await installSyntheticHighRefresh(page);
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().scheduler.refreshHz), { timeout: 4000 }).toBeGreaterThan(100);

  const materialCount = await page.locator("[data-rr-assembly-fragment], [data-rr-evidence]").count();
  expect(materialCount).toBe(14);

  await page.locator("[data-rr-fidelity='3']").click();
  await expect(root).toHaveAttribute("data-rr-fidelity-level", "3");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().sample.nodes)).toBe(92);
  const high = await freshFieldCadence(page);
  expect(high.fidelity.targetHz).toBeGreaterThan(100);
  expect(high.fidelity.targetHz).toBeCloseTo(high.fidelity.refreshHz, 1);
  expect(high.frame.cadence.p90Ms).toBeLessThanOrEqual(1000 / high.fidelity.targetHz + 0.05);
  const highResolution = await page.locator("#rr-field").evaluate((canvas) => canvas.width / canvas.clientWidth);
  expect(highResolution).toBeCloseTo(1, 1);

  await page.locator("[data-rr-fidelity='2']").click();
  await expect(root).toHaveAttribute("data-rr-fidelity-level", "2");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().sample.nodes)).toBe(72);
  const medium = await freshFieldCadence(page);
  expect(medium.fidelity.targetHz).toBeCloseTo(medium.fidelity.refreshHz * 0.75, 1);
  expect(medium.frame.cadence.p90Ms).toBeGreaterThanOrEqual((1000 / medium.fidelity.targetHz) * 0.85);
  expect(medium.frame.cadence.p90Ms).toBeLessThanOrEqual((1000 / medium.fidelity.targetHz) * 1.5 + 0.05);
  const mediumResolution = await page.locator("#rr-field").evaluate((canvas) => canvas.width / canvas.clientWidth);
  expect(mediumResolution).toBeCloseTo(0.75, 1);

  await page.locator("[data-rr-fidelity='1']").click();
  await expect(root).toHaveAttribute("data-rr-fidelity-level", "1");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().sample.nodes)).toBe(52);
  const low = await freshFieldCadence(page);
  expect(low.fidelity.targetHz).toBeCloseTo(low.fidelity.refreshHz * 0.5, 1);
  expect(low.frame.cadence.p90Ms).toBeGreaterThanOrEqual((1000 / low.fidelity.targetHz) * 0.85);
  expect(low.frame.cadence.p90Ms).toBeLessThanOrEqual((1000 / low.fidelity.targetHz) * 1.5 + 0.05);
  const lowResolution = await page.locator("#rr-field").evaluate((canvas) => canvas.width / canvas.clientWidth);
  expect(lowResolution).toBeCloseTo(0.5, 1);
  expect(await page.locator("[data-rr-assembly-fragment], [data-rr-evidence]").count()).toBe(materialCount);

  await page.reload({ waitUntil: "networkidle" });
  await expect(root).toHaveAttribute("data-rr-fidelity-mode", "1");
  await page.locator("[data-rr-fidelity='auto']").click();
  await expect(root).toHaveAttribute("data-rr-fidelity-mode", "auto");

  await moveCollisionTo(page, 2 / 3);
  const collisionBeforeModeChange = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().collision);
  await page.locator("[data-rr-fidelity='2']").click();
  await expect(root).toHaveAttribute("data-rr-fidelity-level", "2");
  const collisionAfterModeChange = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().collision);
  expect(collisionAfterModeChange.progress).toBeCloseTo(collisionBeforeModeChange.progress, 3);
  expect(collisionAfterModeChange.states).toEqual(collisionBeforeModeChange.states);
});

test("AUTO downgrades under sustained pressure and upgrades only after longer hysteresis without resetting assembly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop AUTO fidelity acceptance");
  await page.setViewportSize({ width: 1200, height: 800 });
  await installSyntheticHighRefresh(page, { mockLongTasks: true });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  const root = page.locator("[data-rr-root]");
  const firstBook = page.locator('.rr-book[data-rr-book="xenofeminism"]');
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await expect(root).toHaveAttribute("data-rr-fidelity-mode", "auto");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().scheduler.refreshHz), { timeout: 4000 }).toBeGreaterThan(100);

  await placeBookCoverAt(page, firstBook);
  await expect(firstBook).toHaveAttribute("data-rr-assembly", "settled");
  await page.locator("#hero").evaluate((hero) => hero.scrollIntoView({ block: "start" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "hero");
  const materialCount = await page.locator("[data-rr-assembly-fragment], [data-rr-evidence]").count();
  const beforePressure = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(beforePressure.fidelity.level).toBe(3);

  await page.evaluate(() => {
    const rootNode = document.querySelector("[data-rr-root]");
    window.__rrFidelityTransitions = [
      {
        level: Number(rootNode.dataset.rrFidelityLevel),
        rendered: window.__RR_VISUAL_API__.snapshot().frame.rendered,
      },
    ];
    window.__rrPressureReleased = null;
    window.__rrFidelityTransitionObserver = new MutationObserver(() => {
      const level = Number(rootNode.dataset.rrFidelityLevel);
      const previous = window.__rrFidelityTransitions.at(-1);
      if (!previous || previous.level !== level) {
        window.__rrFidelityTransitions.push({
          level,
          rendered: window.__RR_VISUAL_API__.snapshot().frame.rendered,
        });
      }
      if (level === 2 && !window.__rrPressureReleased) {
        window.__rrStopLongTaskPressure();
        window.__rrPressureReleased = {
          level,
          rendered: window.__RR_VISUAL_API__.snapshot().frame.rendered,
        };
      }
    });
    window.__rrFidelityTransitionObserver.observe(rootNode, {
      attributes: true,
      attributeFilter: ["data-rr-fidelity-level"],
    });
    window.__rrStartLongTaskPressure();
  });
  try {
    await expect.poll(() => page.evaluate(() => window.__rrPressureReleased?.level || 0), { timeout: 8000 }).toBe(2);
    const released = await page.evaluate(() => window.__rrPressureReleased);
    const downgraded = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
    const downgradedBook = downgraded.assembly.find(({ id }) => id === "xenofeminism");
    expect(downgraded.fidelity.level).toBe(2);
    expect(downgradedBook).toMatchObject({ state: "settled", settledEver: true, progress: 1 });
    expect(await page.locator("[data-rr-assembly-fragment], [data-rr-evidence]").count()).toBe(materialCount);

    await expect
      .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered), { timeout: 8000 })
      .toBeGreaterThanOrEqual(released.rendered + 54);
    expect(await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().fidelity.level)).toBe(2);
    expect(await page.evaluate(() => window.__rrFidelityTransitions.map(({ level }) => level))).not.toContain(1);

    await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().fidelity.level), { timeout: 10000 }).toBe(3);
    const upgraded = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
    const upgradedBook = upgraded.assembly.find(({ id }) => id === "xenofeminism");
    const transitions = await page.evaluate(() => window.__rrFidelityTransitions);
    const upgradedAt = transitions.find(({ level }, index) => level === 3 && index > 0)?.rendered;
    expect(upgradedBook).toMatchObject({ state: "settled", settledEver: true, progress: 1 });
    expect(transitions.map(({ level }) => level)).toEqual([3, 2, 3]);
    expect(upgradedAt - released.rendered).toBeGreaterThanOrEqual(18 * 6);
  } finally {
    await page.evaluate(() => {
      window.__rrStopLongTaskPressure();
      window.__rrFidelityTransitionObserver?.disconnect();
    });
  }
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
  expect(Number.parseFloat(transformedState.fragmentX)).toBeCloseTo(0, 2);
  expect(transformedState.fragmentOpacity).not.toBe("");
  expect(Number.parseFloat(transformedState.fragmentOpacity)).toBeCloseTo(0, 2);

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

test("each book assembles independently, latches its terminal geometry, and recovers from a fast local pass", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop fine-pointer assembly acceptance");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");

  const books = page.locator(".rr-book[data-rr-assembly]");
  await expect(books).toHaveCount(2);
  await expect(books.nth(0).locator("[data-rr-assembly-fragment]")).toHaveCount(3);
  await expect(books.nth(1).locator("[data-rr-assembly-fragment]")).toHaveCount(3);
  await placeBookCoverAt(page, books.nth(0));
  await expect(books.nth(0)).toHaveAttribute("data-rr-assembly", "settled");
  await expect(books.nth(1)).not.toHaveAttribute("data-rr-assembly", "settled");

  await page.locator("#hero").evaluate((hero) => hero.scrollIntoView({ block: "start" }));
  await page.setViewportSize({ width: 1360, height: 920 });
  await expect(books.nth(0)).toHaveAttribute("data-rr-assembly", "settled");

  await placeBookCoverAt(page, books.nth(1));
  await expect(books.nth(1)).toHaveAttribute("data-rr-assembly", "settled");
  const settledScrollY = await page.evaluate(() => window.scrollY);
  await page.evaluate(async (origin) => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    window.scrollTo(0, origin + 320);
    await nextFrame();
    window.scrollTo(0, Math.max(0, origin - 240));
    await nextFrame();
    window.scrollTo(0, origin);
    await nextFrame();
  }, settledScrollY);
  await expect(books.nth(0)).toHaveAttribute("data-rr-assembly", "settled");
  await expect(books.nth(1)).toHaveAttribute("data-rr-assembly", "settled");
  const terminal = await books.evaluateAll((elements) =>
    elements.map((book) => ({
      state: book.dataset.rrAssembly,
      moving: book.classList.contains("rr-is-moving"),
      fragments: Array.from(book.querySelectorAll("[data-rr-assembly-fragment]")).map((fragment) => ({
        x: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-x") || "0"),
        y: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-y") || "0"),
        angle: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-angle") || "0"),
        depth: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-depth") || "0"),
        opacity: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-opacity") || "0"),
        willChange: getComputedStyle(fragment).willChange,
      })),
    }))
  );
  for (const book of terminal) {
    expect(book.state).toBe("settled");
    expect(book.moving).toBe(false);
    expect(
      book.fragments.every(
        ({ x, y, angle, depth, opacity, willChange }) =>
          Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(angle) <= 0.1 && depth <= 0.02 && opacity <= 0.01 && willChange === "auto"
      )
    ).toBeTruthy();
  }

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  await expect.poll(() => page.evaluate((expected) => Math.abs(window.scrollY - expected), settledScrollY), { timeout: 3000 }).toBeLessThanOrEqual(4);
  await expect(books.nth(0)).toHaveAttribute("data-rr-assembly", "settled");
  await expect(books.nth(1)).toHaveAttribute("data-rr-assembly", "settled");

  const cover = books.nth(1).locator(".rr-book__cover");
  const bounds = await cover.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(8, 8);
  await page.waitForTimeout(100);
  await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.45, { steps: 240 });
  await page.mouse.move(bounds.x + bounds.width * 0.46, bounds.y + bounds.height * 0.45, { steps: 4 });
  await expect(books.nth(1)).toHaveAttribute("data-rr-assembly", "settled");

  await cover.evaluate((element) => {
    const root = element.closest("[data-rr-root]");
    const bounds = element.getBoundingClientRect();
    root?.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: Math.max(1, bounds.left - 160),
        clientY: bounds.top + bounds.height * 0.55,
        pointerType: "mouse",
      })
    );
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: bounds.left + bounds.width * 0.7,
        clientY: bounds.top + bounds.height * 0.55,
        pointerType: "mouse",
      })
    );
  });
  await expect.poll(() => books.nth(1).getAttribute("data-rr-assembly")).toMatch(/^(?:disturbed|recovering)$/);
  await expect.poll(() => books.nth(1).getAttribute("data-rr-assembly"), { timeout: 400, intervals: [16, 32, 64] }).toBe("settled");
  await expect(books.nth(0)).toHaveAttribute("data-rr-assembly", "settled");
});

test("research assembles, collision evidence stays legible, and the field releases into negative space", async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1100 });
  await openInstrument(page);
  const root = page.locator("[data-rr-root]");

  await page.locator("#rhizome-learn").evaluate((section) => section.scrollIntoView({ block: "center" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "research");
  const master = page.locator(".rr-interface__master img");
  await expect(master).toBeVisible();
  await expect.poll(() => master.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator(".rr-interface__fragments")).toHaveCSS("opacity", "0");

  const collisionImages = page.locator(".rr-collision__evidence-item img");
  await expect(collisionImages).toHaveCount(4);
  for (const collisionImage of await collisionImages.all()) {
    await collisionImage.scrollIntoViewIfNeeded();
    await expect.poll(() => collisionImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  }
  await page.locator("#collision-field").evaluate((section) => section.scrollIntoView({ block: "center" }));
  await expect(root).toHaveAttribute("data-rr-chapter", "collision");
  if (testInfo.project.name === "mobile") {
    await page.locator("[data-rr-evidence-track]").scrollIntoViewIfNeeded();
  } else {
    await moveCollisionTo(page, 0);
  }
  const collisionMaterial = await collisionImages.evaluateAll((images) =>
    images.map((image) => ({
      opacity: Number.parseFloat(getComputedStyle(image).opacity),
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
    }))
  );
  expect(collisionMaterial.every(({ width, height }) => width > 0 && height > 0)).toBeTruthy();
  expect(collisionMaterial.some(({ opacity }) => opacity >= 0.7)).toBeTruthy();

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

test("desktop collision evidence follows a reversible cross-fading horizontal chain without empty frames", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop pinned evidence-chain acceptance");
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });

  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await expect(root).toHaveAttribute("data-rr-motion", "full");
  const evidence = page.locator("[data-rr-evidence]");
  await expect(evidence).toHaveCount(4);

  const span = 3;
  const lifecycleDensity = 0.4;
  const lifecycle = [
    ["scanning", 0.1],
    ["revealed", 0.28],
    ["holding", 0.5],
    ["receding", 0.82],
    ["passed", 1.05],
  ];
  const lifecycleItemIndex = 1;
  for (const [state, local] of lifecycle) {
    await moveCollisionTo(page, (lifecycleItemIndex + (local - 0.5) / lifecycleDensity) / span);
    await expect(evidence.nth(lifecycleItemIndex)).toHaveAttribute("data-rr-evidence-state", state);
  }

  await moveCollisionTo(page, 0);
  await expect(evidence.nth(0)).toHaveAttribute("data-rr-evidence-state", "holding");
  await moveCollisionTo(page, 1);
  await expect(evidence.nth(3)).toHaveAttribute("data-rr-evidence-state", "holding");

  const thirdHoldingProgress = 2 / span;
  await moveCollisionTo(page, thirdHoldingProgress);
  await expect(evidence.nth(2)).toHaveAttribute("data-rr-evidence-state", "holding");
  const forwardHolding = await evidenceGeometry(page, 2);
  expect(forwardHolding.itemTransform).toBe("none");
  expect(forwardHolding.imageTransform).toBe("none");
  expect(forwardHolding.clipVariable).toBe("inset(0 0.00% 0 0)");
  expect(forwardHolding.clipPath).toMatch(/^inset\(/);
  expect(forwardHolding.clipValues.length).toBeGreaterThan(0);
  expect(forwardHolding.clipValues.every((value) => Math.abs(value) <= 0.01)).toBeTruthy();
  expect(forwardHolding.opacity).toBeGreaterThanOrEqual(0.99);
  expect(Math.abs(forwardHolding.imageLeft - forwardHolding.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(forwardHolding.imageTop - forwardHolding.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(forwardHolding.imageWidth - forwardHolding.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(forwardHolding.imageHeight - forwardHolding.height)).toBeLessThanOrEqual(2);
  expect(forwardHolding.centerRatio).toBeGreaterThan(0.05);
  expect(forwardHolding.centerRatio).toBeLessThan(0.95);
  expect(forwardHolding.visibleWidthRatio).toBeGreaterThan(0.55);
  expect(forwardHolding.visibleHeightRatio).toBeGreaterThan(0.95);

  await moveCollisionTo(page, (2 + (0.86 - 0.5) / lifecycleDensity) / span);
  await expect(evidence.nth(2)).toHaveAttribute("data-rr-evidence-state", "receding");
  await moveCollisionTo(page, thirdHoldingProgress);
  const reverseHolding = await evidenceGeometry(page, 2);
  expect(reverseHolding.state).toBe("holding");
  for (const key of ["trackTranslate", "left", "top", "width", "height", "centerRatio", "visibleWidthRatio", "visibleHeightRatio"]) {
    expect(Math.abs(reverseHolding[key] - forwardHolding[key]), `${key} should reverse to the same geometry`).toBeLessThanOrEqual(1);
  }
  expect(reverseHolding.clipVariable).toBe(forwardHolding.clipVariable);
  expect(reverseHolding.itemTransform).toBe(forwardHolding.itemTransform);
  expect(reverseHolding.imageTransform).toBe(forwardHolding.imageTransform);

  await moveCollisionTo(page, (2 + (-0.08 - 0.5) / lifecycleDensity) / span);
  await expect(evidence.nth(2)).toHaveAttribute("data-rr-evidence-state", "queued");
  const geometry = await page.locator("[data-rr-collision-evidence]").evaluate((stage) => {
    const viewport = stage.querySelector(".rr-collision__evidence-viewport");
    const track = stage.querySelector("[data-rr-evidence-track]");
    return {
      travel: stage.getBoundingClientRect().height - (viewport?.getBoundingClientRect().height || 0),
      viewportHeight: viewport?.getBoundingClientRect().height || 0,
      translate: track ? getComputedStyle(track).transform : "none",
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.travel / geometry.viewportHeight).toBeGreaterThanOrEqual(1.75);
  expect(geometry.travel / geometry.viewportHeight).toBeLessThanOrEqual(2.2);
  expect(geometry.translate).not.toBe("none");
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);

  for (const progress of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
    await moveCollisionTo(page, progress);
    const visibleEvidence = await evidence.evaluateAll((items) => {
      const viewport = items[0]?.closest(".rr-collision__evidence-viewport");
      if (!(viewport instanceof HTMLElement)) return [];
      const viewportBounds = viewport.getBoundingClientRect();
      return items
        .map((item, index) => {
          const bounds = item.getBoundingClientRect();
          const image = item.querySelector("img");
          const horizontalIntersection = Math.max(0, Math.min(bounds.right, viewportBounds.right) - Math.max(bounds.left, viewportBounds.left));
          return {
            index,
            opacity: image ? Number.parseFloat(getComputedStyle(image).opacity) : 0,
            horizontalRatio: horizontalIntersection / Math.max(1, bounds.width),
          };
        })
        .filter(({ opacity, horizontalRatio }) => opacity >= 0.16 && horizontalRatio >= 0.12);
    });
    expect(visibleEvidence.length, `progress ${progress} should keep visual evidence in the viewport`).toBeGreaterThan(0);
  }
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

test("reader cursor remains visible in the dialog top layer and changes with the selected book", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop reader-cursor acceptance");
  await openInstrument(page);

  const dialog = page.locator("#rr-reader");
  const readerCursor = dialog.locator("[data-rr-reader-cursor]");
  const pageCursor = page.locator(".rr-cursor");
  const pointColors = [];
  for (const { index, theme } of [
    { index: 0, theme: "xenofeminism" },
    { index: 4, theme: "platform" },
  ]) {
    const trigger = page.locator("[data-rr-open-reader]").nth(index);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(dialog).toHaveAttribute("open", "");
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(dialog).toHaveAttribute("data-rr-reader-theme", theme);
    await expect(page.locator("body")).toHaveClass(/rr-reader-open/);
    await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-reader-open", "true");
    await expect(pageCursor).toHaveCSS("visibility", "hidden");

    const imageBounds = await dialog.locator("[data-rr-reader-image]").boundingBox();
    expect(imageBounds).not.toBeNull();
    const target = {
      x: imageBounds.x + Math.min(imageBounds.width - 8, Math.max(8, imageBounds.width * 0.44)),
      y: imageBounds.y + Math.min(imageBounds.height - 8, Math.max(8, imageBounds.height * 0.38)),
    };
    await page.mouse.move(target.x, target.y);
    await expect(readerCursor).toHaveClass(/is-visible/);
    await expect
      .poll(
        () =>
          readerCursor.evaluate((cursor, expected) => {
            const bounds = cursor.getBoundingClientRect();
            return Math.hypot(bounds.left - expected.x, bounds.top - expected.y);
          }, target),
        { timeout: 1200 }
      )
      .toBeLessThan(3);
    const readerState = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().reader);
    expect(readerState).toMatchObject({ open: true, theme, cursorInDialog: true, cursorVisible: true });
    await expect(dialog.locator("[data-rr-reader-image]")).toHaveCSS("cursor", "none");
    pointColors.push(await readerCursor.locator(".rr-reader__cursor-point").evaluate((point) => getComputedStyle(point).backgroundColor));

    const closeBounds = await dialog.locator("[data-rr-reader-close]").boundingBox();
    expect(closeBounds).not.toBeNull();
    await page.mouse.move(closeBounds.x + closeBounds.width * 0.5, closeBounds.y + closeBounds.height * 0.5);
    await expect(readerCursor).toHaveClass(/is-visible/);
    await dialog.locator("[data-rr-reader-close]").click();
    await expect(dialog).not.toHaveAttribute("open", "");
    await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-reader-open", "false");
    await expect(pageCursor).not.toHaveCSS("visibility", "hidden");
  }
  expect(pointColors).toEqual(["rgb(210, 107, 97)", "rgb(96, 216, 233)"]);
});

test("opening the reader in dynamic mode pauses the background field even while its top-layer cursor moves", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop dynamic reader acceptance");
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  const initialRendered = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered);
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered), { timeout: 2000 })
    .toBeGreaterThan(initialRendered);

  await page
    .locator("[data-rr-open-reader]")
    .first()
    .evaluate((trigger) => trigger.click());
  const dialog = page.locator("#rr-reader");
  await expect(dialog).toHaveAttribute("open", "");
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  const imageBounds = await dialog.locator("[data-rr-reader-image]").boundingBox();
  expect(imageBounds).not.toBeNull();
  await page.mouse.move(imageBounds.x + imageBounds.width * 0.4, imageBounds.y + Math.min(imageBounds.height - 8, imageBounds.height * 0.35));
  await expect(dialog.locator("[data-rr-reader-cursor]")).toHaveClass(/is-visible/);

  const pausedAt = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered);
  await page.mouse.move(imageBounds.x + imageBounds.width * 0.6, imageBounds.y + Math.min(imageBounds.height - 8, imageBounds.height * 0.45), {
    steps: 18,
  });
  await page.waitForTimeout(500);
  const pausedAfter = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  expect(pausedAfter.frame.rendered - pausedAt).toBeLessThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().scheduler.scheduled)).toBe(false);

  await dialog.locator("[data-rr-reader-close]").click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect
    .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered), { timeout: 2000 })
    .toBeGreaterThan(pausedAfter.frame.rendered);
});

test("reader cursor initialization failure restores the system cursor", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop fallback-cursor acceptance");
  await page.addInitScript(() => {
    const originalQuerySelector = Element.prototype.querySelector;
    Element.prototype.querySelector = function querySelector(selector) {
      if (this instanceof HTMLDialogElement && this.id === "rr-reader" && selector === "[data-rr-reader-cursor]") return null;
      return originalQuerySelector.call(this, selector);
    };
  });
  await openInstrument(page);
  const trigger = page.locator("[data-rr-open-reader]").first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.locator("#rr-reader");
  await expect(dialog).toHaveClass(/rr-reader--cursor-fallback/);
  await expect(dialog.locator("[data-rr-reader-image]")).toHaveCSS("cursor", "auto");
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
    await expect(dialog).toHaveAttribute("data-rr-reader-theme", index < 4 ? "xenofeminism" : "platform");
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
  expect(quality.sample.quality).toBe("high");
  expect(quality.sample.nodes).toBe(56);
  expect(quality.sample.targetFps).toBe(60);
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-layer-budget", "full-iii");
  expect(await page.locator("[data-rr-assembly-fragment], [data-rr-evidence]").count()).toBe(14);

  const evidenceTrack = page.locator("[data-rr-evidence-track]");
  await evidenceTrack.scrollIntoViewIfNeeded();
  const evidenceGeometry = await evidenceTrack.evaluate((track) => {
    const item = track.querySelector("[data-rr-evidence]");
    const viewport = track.closest(".rr-collision__evidence-viewport");
    const itemBounds = item?.getBoundingClientRect();
    const viewportBounds = viewport?.getBoundingClientRect();
    return {
      maximum: track.scrollWidth - track.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      itemAspect: itemBounds ? itemBounds.width / itemBounds.height : 0,
      viewportRatio: viewportBounds ? viewportBounds.height / window.innerHeight : 0,
    };
  });
  expect(evidenceGeometry.maximum).toBeGreaterThan(100);
  expect(evidenceGeometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(evidenceGeometry.itemAspect).toBeGreaterThanOrEqual(0.75);
  expect(evidenceGeometry.itemAspect).toBeLessThanOrEqual(0.85);
  expect(evidenceGeometry.viewportRatio).toBeLessThan(0.7);
  await evidenceTrack.evaluate((track) => {
    track.scrollLeft = (track.scrollWidth - track.clientWidth) * 0.72;
    track.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().collision.progress)).toBeGreaterThan(0.65);
  await evidenceTrack.evaluate((track) => {
    track.scrollLeft = 0;
    track.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().collision.progress)).toBeLessThan(0.05);

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

  await page.setViewportSize({ width: 667, height: 375 });
  await evidenceTrack.scrollIntoViewIfNeeded();
  const landscapeEvidence = await evidenceTrack.evaluate((track) => {
    const itemBounds = track.querySelector("[data-rr-evidence]")?.getBoundingClientRect();
    const viewportBounds = track.closest(".rr-collision__evidence-viewport")?.getBoundingClientRect();
    return {
      aspect: itemBounds ? itemBounds.width / itemBounds.height : 0,
      viewportRatio: viewportBounds ? viewportBounds.height / window.innerHeight : 0,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(landscapeEvidence.aspect).toBeGreaterThanOrEqual(0.75);
  expect(landscapeEvidence.aspect).toBeLessThanOrEqual(0.85);
  expect(landscapeEvidence.viewportRatio).toBeLessThan(0.9);
  expect(landscapeEvidence.documentOverflow).toBeLessThanOrEqual(1);
});

test("mobile books play their own assembly and recover after fast scrolls in both directions", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile book-state acceptance");
  await page.setViewportSize({ width: 390, height: 844 });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  const books = page.locator(".rr-book[data-rr-assembly]");
  await expect(books).toHaveCount(2);

  for (let index = 0; index < 2; index += 1) {
    const book = books.nth(index);
    await placeBookCoverAt(page, book, 0.9);
    await expect(book).toHaveAttribute("data-rr-assembly", "assembling");
    await placeBookCoverAt(page, book);
    await expect(book).toHaveAttribute("data-rr-assembly", "settled");
    const origin = await page.evaluate(() => window.scrollY);
    const delta = index === 0 ? 190 : -190;
    const transitionTrace = await page.evaluate(
      async ({ start, amount, bookIndex }) => {
        const targetBook = document.querySelectorAll(".rr-book[data-rr-assembly]")[bookIndex];
        const startedAt = performance.now();
        return new Promise((resolve) => {
          const states = [targetBook?.getAttribute("data-rr-assembly") || "missing"];
          let completed = false;
          const finish = (timedOut) => {
            if (completed) return;
            completed = true;
            observer.disconnect();
            window.clearTimeout(timeout);
            const snapshot = window.__RR_VISUAL_API__.snapshot();
            resolve({
              states,
              timedOut,
              elapsed: performance.now() - startedAt,
              assembly: snapshot.assembly.find((item) => item.id === targetBook?.dataset.rrBook),
            });
          };
          const observer = new MutationObserver(() => {
            const state = targetBook?.getAttribute("data-rr-assembly") || "missing";
            if (states.at(-1) !== state) states.push(state);
            const sawDisturbance = states.some((entry) => /^(?:disturbed|recovering)$/.test(entry));
            if (sawDisturbance && state === "settled") finish(false);
          });
          const timeout = window.setTimeout(() => finish(true), 1000);
          observer.observe(targetBook, {
            attributes: true,
            attributeFilter: ["data-rr-assembly"],
          });
          window.scrollTo(0, Math.max(0, start + amount));
        });
      },
      { start: origin, amount: delta, bookIndex: index }
    );
    const transitions = transitionTrace.states;
    expect(
      transitions.some((state) => /^(?:disturbed|recovering)$/.test(state)),
      transitions.join(" → ")
    ).toBeTruthy();
    expect(transitionTrace.timedOut, JSON.stringify(transitionTrace)).toBe(false);
    expect(transitionTrace.assembly?.lastRecoveryMs, JSON.stringify(transitionTrace)).toBeGreaterThan(0);
    expect(transitionTrace.assembly?.lastRecoveryMs, JSON.stringify(transitionTrace)).toBeLessThanOrEqual(400);
    await expect.poll(() => book.getAttribute("data-rr-assembly"), { timeout: 500, intervals: [16, 32, 64] }).toBe("settled");
    await page.evaluate(
      (start) =>
        new Promise((resolve) => {
          let quietTimer = 0;
          const hardTimer = window.setTimeout(finish, 2000);
          function finish() {
            window.clearTimeout(quietTimer);
            window.clearTimeout(hardTimer);
            window.removeEventListener("scroll", onScroll);
            resolve();
          }
          function onScroll() {
            window.clearTimeout(quietTimer);
            quietTimer = window.setTimeout(finish, 80);
          }
          window.addEventListener("scroll", onScroll, { passive: true });
          window.scrollTo(0, start);
          onScroll();
        }),
      origin
    );
    const recoveryTrace = await page.evaluate(async (bookIndex) => {
      const targetBook = document.querySelectorAll(".rr-book[data-rr-assembly]")[bookIndex];
      const samples = [];
      const startedAt = performance.now();
      while (performance.now() - startedAt < 900) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const snapshot = window.__RR_VISUAL_API__.snapshot();
        const assemblySnapshot = snapshot.assembly.find((item) => item.id === targetBook?.dataset.rrBook);
        samples.push({
          elapsed: Math.round(performance.now() - startedAt),
          state: targetBook?.getAttribute("data-rr-assembly") || "missing",
          scheduled: snapshot.scheduler.scheduled,
          dirty: snapshot.scheduler.dirty,
          frames: snapshot.scheduler.frames,
          velocity: snapshot.scrollVelocity,
          recoveryMs: assemblySnapshot?.lastRecoveryMs || 0,
        });
        if (samples.at(-1).state === "settled") break;
      }
      return samples;
    }, index);
    expect(recoveryTrace.at(-1)?.state, JSON.stringify(recoveryTrace)).toBe("settled");
    expect(recoveryTrace.at(-1)?.recoveryMs, JSON.stringify(recoveryTrace)).toBeGreaterThan(0);
    expect(recoveryTrace.at(-1)?.recoveryMs, JSON.stringify(recoveryTrace)).toBeLessThanOrEqual(400);
  }

  const terminal = await books.evaluateAll((elements) =>
    elements.map((book) =>
      Array.from(book.querySelectorAll("[data-rr-assembly-fragment]")).map((fragment) => ({
        x: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-x") || "0"),
        y: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-y") || "0"),
        angle: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-angle") || "0"),
        depth: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-depth") || "0"),
        opacity: Number.parseFloat(fragment.style.getPropertyValue("--rr-fragment-opacity") || "0"),
      }))
    )
  );
  expect(
    terminal.every((fragments) =>
      fragments.every(
        ({ x, y, angle, depth, opacity }) => Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(angle) <= 0.1 && depth <= 0.02 && opacity <= 0.01
      )
    )
  ).toBeTruthy();
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
        if (snapshot.nearest.active && snapshot.nearest.distancePx <= snapshot.nearest.thresholdPx) {
          return { found: true, x, y, nearest: snapshot.nearest };
        }
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
    await expect.poll(() => pageLink.locator("img").evaluate((image) => image.naturalWidth)).toBeGreaterThanOrEqual(350);
  }
  await expect(page.getByRole("link", { name: /Enter Rhizome-Learn record/i })).toHaveAttribute("href", /\/projects\/rhizome-learn\/$/);
  await expect(page.getByRole("link", { name: /Enter translation record/i })).toHaveAttribute("href", /\/projects\/translation-projects\/$/);
  await expect(page.getByRole("link", { name: "Projects", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Archive", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Email/i })).toBeVisible();
  await expect(page.locator("a[href='https://github.com/Virginids-Cavendish']")).toBeVisible();

  await context.close();
});
