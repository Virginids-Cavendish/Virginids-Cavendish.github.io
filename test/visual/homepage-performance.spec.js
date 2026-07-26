const { test, expect } = require("@playwright/test");
const { preparePage } = require("./helpers");

test.use({ trace: "off", screenshot: "off" });

function classifyRasterizer(snapshot) {
  const rendererName = String(snapshot.sample.webglRenderer || "");
  const softwarePattern = /swiftshader|llvmpipe|software|microsoft basic render/i;
  if (snapshot.renderer === "hybrid-webgl" && rendererName && !softwarePattern.test(rendererName)) {
    return { kind: "hardware", rendererName };
  }
  if (softwarePattern.test(rendererName)) {
    return { kind: "software", rendererName };
  }
  if (snapshot.renderer !== "hybrid-webgl") {
    return { kind: "fallback", rendererName: rendererName || snapshot.renderer };
  }
  return { kind: "unknown", rendererName: rendererName || "unreported WebGL renderer" };
}

async function collectFreshVisibleHeroWindow(page, minimumRenderedFrames = 64) {
  let lastAttempt = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await page.evaluate(() => {
      window.__RR_VISUAL_API__.resetPerformanceWindow();
      return window.__RR_VISUAL_API__.snapshot();
    });
    const requiredRendered = before.frame.rendered + minimumRenderedFrames;
    let reachedFreshWindow = true;
    try {
      await expect
        .poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().frame.rendered), { timeout: 20000 })
        .toBeGreaterThanOrEqual(requiredRendered);
    } catch {
      reachedFreshWindow = false;
    }
    const after = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
    const targetDrift = Math.abs(after.sample.intervalMs - before.sample.intervalMs);
    const targetTolerance = Math.max(0.5, after.sample.intervalMs * 0.05);
    const stable =
      reachedFreshWindow &&
      before.fidelity.mode === "auto" &&
      after.fidelity.mode === "auto" &&
      before.fidelity.level === after.fidelity.level &&
      targetDrift <= targetTolerance;
    lastAttempt = { before, after, requiredRendered, reachedFreshWindow, stable, targetDrift, targetTolerance };
    if (!reachedFreshWindow || stable) {
      return lastAttempt;
    }
  }
  return lastAttempt;
}

test("dynamic ten-second hot-zone scroll avoids periodic long tasks while the Hero still sleeps offscreen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop performance acceptance");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    window.__rrLongTasks = [];
    if (typeof PerformanceObserver === "function") {
      try {
        const observer = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) =>
            window.__rrLongTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
              scrollY: window.scrollY,
              chapter: document.querySelector("[data-rr-root]")?.dataset.rrChapter || "",
              attribution: Array.from(entry.attribution || [], (item) => ({
                name: item.name,
                entryType: item.entryType,
                containerType: item.containerType,
                containerName: item.containerName,
                containerId: item.containerId,
                containerSrc: item.containerSrc,
              })),
            })
          );
        });
        observer.observe({ type: "longtask", buffered: true });
        window.__rrLongTaskObserver = observer;
      } catch {
        window.__rrLongTaskObserver = null;
      }
    }
  });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });
  await expect(page.locator("[data-rr-root]")).toHaveAttribute("data-rr-runtime", "ready");
  const observerReady = await page.evaluate(() => Boolean(window.__rrLongTaskObserver));
  test.skip(!observerReady, "Long Task API is unavailable in this browser");

  await page.evaluate(async () => {
    const images = Array.from(document.images);
    images.forEach((image) => {
      image.loading = "eager";
    });
    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const baseline = await page.evaluate(() => {
    window.__rrLongTasks.length = 0;
    return {
      startedAt: performance.now(),
      snapshot: window.__RR_VISUAL_API__.snapshot(),
    };
  });
  const routeEvidence = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const start = performance.now();
        const duration = 10_000;
        const maximum = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const clampScroll = (value) => Math.max(0, Math.min(maximum, value));
        const coverPosition = (selector) => {
          const cover = document.querySelector(selector);
          if (!(cover instanceof HTMLElement)) return 0;
          const bounds = cover.getBoundingClientRect();
          return clampScroll(window.scrollY + bounds.top + bounds.height * 0.5 - window.innerHeight * (2 / 3));
        };
        const sectionPosition = (selector, viewportRatio = 0.12) => {
          const section = document.querySelector(selector);
          if (!(section instanceof HTMLElement)) return 0;
          const bounds = section.getBoundingClientRect();
          return clampScroll(window.scrollY + bounds.top - window.innerHeight * viewportRatio);
        };
        const stage = document.querySelector("[data-rr-collision-evidence]");
        const stageViewport = stage?.querySelector(".rr-collision__evidence-viewport");
        const stageBounds = stage?.getBoundingClientRect();
        const stageViewportBounds = stageViewport?.getBoundingClientRect();
        const stageTop = clampScroll(stageBounds ? window.scrollY + stageBounds.top : maximum * 0.72);
        const stageTravel = Math.max(1, (stageBounds?.height || window.innerHeight * 2) - (stageViewportBounds?.height || window.innerHeight));
        const waypoints = [
          0,
          sectionPosition("#rr-identity"),
          sectionPosition("#rhizome-learn"),
          coverPosition('[data-rr-book="xenofeminism"] .rr-book__cover'),
          sectionPosition("#translation-archive"),
          coverPosition('[data-rr-book="platform-socialism"] .rr-book__cover'),
          clampScroll(stageTop + stageTravel * 0.12),
          clampScroll(stageTop + stageTravel * 0.52),
          clampScroll(stageTop + stageTravel * 0.88),
          sectionPosition("#contact"),
          maximum,
          clampScroll(stageTop + stageTravel * 0.52),
          coverPosition('[data-rr-book="platform-socialism"] .rr-book__cover'),
          coverPosition('[data-rr-book="xenofeminism"] .rr-book__cover'),
          0,
        ];
        const visited = new Set();
        let collisionMinimum = Number.POSITIVE_INFINITY;
        let collisionMaximum = Number.NEGATIVE_INFINITY;
        const step = (now) => {
          const elapsed = now - start;
          const phase = Math.min(1, elapsed / duration);
          const route = phase * (waypoints.length - 1);
          const index = Math.min(waypoints.length - 2, Math.floor(route));
          const local = route - index;
          const eased = local * local * (3 - 2 * local);
          window.scrollTo(0, waypoints[index] + (waypoints[index + 1] - waypoints[index]) * eased);
          const root = document.querySelector("[data-rr-root]");
          const chapter = root?.dataset.rrChapter;
          if (chapter) visited.add(chapter);
          const collisionProgress = Number(document.querySelector("[data-rr-collision-evidence]")?.dataset.rrEvidenceProgress);
          if (Number.isFinite(collisionProgress)) {
            collisionMinimum = Math.min(collisionMinimum, collisionProgress);
            collisionMaximum = Math.max(collisionMaximum, collisionProgress);
          }
          if (elapsed < duration) requestAnimationFrame(step);
          else
            resolve({
              chapters: Array.from(visited),
              collisionMinimum: Number.isFinite(collisionMinimum) ? collisionMinimum : null,
              collisionMaximum: Number.isFinite(collisionMaximum) ? collisionMaximum : null,
              durationMs: performance.now() - start,
              endedAt: performance.now(),
            });
        };
        requestAnimationFrame(step);
      })
  );
  await page.waitForTimeout(100);
  const result = await page.evaluate(
    ({ start, end }) => {
      const snapshot = window.__RR_VISUAL_API__.snapshot();
      return {
        snapshot,
        longTasks: (window.__rrLongTasks || []).filter((entry) => entry.startTime >= start && entry.startTime <= end && entry.duration > 50),
      };
    },
    { start: baseline.startedAt, end: routeEvidence.endedAt }
  );
  const rasterizer = classifyRasterizer(result.snapshot);
  testInfo.annotations.push({
    type: "rasterizer",
    description: `${rasterizer.kind}: ${rasterizer.rendererName}`,
  });
  const longTaskSummary = result.longTasks.reduce(
    (summary, entry) => {
      summary.totalMs += entry.duration;
      summary.maxMs = Math.max(summary.maxMs, entry.duration);
      summary.byChapter[entry.chapter || "unknown"] = (summary.byChapter[entry.chapter || "unknown"] || 0) + 1;
      return summary;
    },
    { count: result.longTasks.length, totalMs: 0, maxMs: 0, byChapter: {} }
  );
  longTaskSummary.samples = result.longTasks
    .slice()
    .sort((first, second) => second.duration - first.duration)
    .slice(0, 8);

  await page.locator("#translation-archive").scrollIntoViewIfNeeded();
  const idleReached = await page
    .waitForFunction(() => !window.__RR_VISUAL_API__.snapshot().scheduler.scheduled, undefined, { timeout: 10000 })
    .then(
      () => true,
      () => false
    );
  const offscreenBefore = await page.evaluate(() => ({
    fieldVisible: document.querySelector("[data-rr-root]")?.dataset.rrFieldVisible,
    snapshot: window.__RR_VISUAL_API__.snapshot(),
  }));
  await page.waitForTimeout(500);
  const offscreenAfter = await page.evaluate(() => window.__RR_VISUAL_API__.snapshot());
  const offscreenEvidence = {
    fieldVisible: offscreenBefore.fieldVisible,
    idleReached,
    renderedDelta: offscreenAfter.frame.rendered - offscreenBefore.snapshot.frame.rendered,
    callbackDelta: offscreenAfter.frame.callbacks - offscreenBefore.snapshot.frame.callbacks,
    schedulerDelta: offscreenAfter.scheduler.frames - offscreenBefore.snapshot.scheduler.frames,
    scheduledAfter: offscreenAfter.scheduler.scheduled,
  };
  await testInfo.attach("ten-second-hot-zone.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          rasterizer,
          longTasks: longTaskSummary,
          route: routeEvidence,
          scheduler: result.snapshot.scheduler,
          frame: result.snapshot.frame,
          sample: result.snapshot.sample,
          offscreen: offscreenEvidence,
        },
        null,
        2
      )
    ),
    contentType: "application/json",
  });

  expect(
    result.longTasks.length,
    JSON.stringify(
      {
        longTasks: longTaskSummary,
        route: routeEvidence,
        scheduler: result.snapshot.scheduler,
        frame: result.snapshot.frame,
        sample: result.snapshot.sample,
        offscreen: offscreenEvidence,
      },
      null,
      2
    )
  ).toBeLessThanOrEqual(1);
  expect(routeEvidence.durationMs).toBeGreaterThanOrEqual(9_900);
  expect(result.snapshot.scheduler.frames - baseline.snapshot.scheduler.frames).toBeGreaterThan(120);
  expect(routeEvidence.chapters).toEqual(expect.arrayContaining(["hero", "identity", "research", "translation", "collision", "contact"]));
  expect(routeEvidence.collisionMinimum).toBeLessThanOrEqual(0.05);
  expect(routeEvidence.collisionMaximum).toBeGreaterThanOrEqual(0.8);
  expect(result.snapshot.frame.rendered - baseline.snapshot.frame.rendered).toBeGreaterThan(10);
  expect(offscreenEvidence.fieldVisible).toBe("false");
  expect(offscreenEvidence.idleReached).toBe(true);
  expect(offscreenEvidence.renderedDelta).toBeLessThanOrEqual(1);
  expect(offscreenEvidence.callbackDelta).toBeLessThanOrEqual(1);
  expect(offscreenEvidence.schedulerDelta).toBeLessThanOrEqual(1);
  expect(offscreenEvidence.scheduledAfter).toBe(false);
});

test("AUTO cadence uses a fresh Hero-visible window and the same strict budget on every rasterizer", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "desktop cadence acceptance");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await preparePage(page, "dark");
  await page.goto("/al-folio/", { waitUntil: "networkidle" });

  const root = page.locator("[data-rr-root]");
  await expect(root).toHaveAttribute("data-rr-runtime", "ready");
  await page.locator("#hero").evaluate((hero) => hero.scrollIntoView({ block: "start" }));
  await expect(root).toHaveAttribute("data-rr-field-visible", "true");
  await expect(root).toHaveAttribute("data-rr-fidelity-mode", "auto");
  await expect.poll(() => page.evaluate(() => window.__RR_VISUAL_API__.snapshot().scheduler.refreshMeasured), { timeout: 10000 }).toBe(true);

  const cadenceWindow = await collectFreshVisibleHeroWindow(page);
  const { before, after } = cadenceWindow;
  const rasterizer = classifyRasterizer(after);
  testInfo.annotations.push({
    type: "rasterizer",
    description: `${rasterizer.kind}: ${rasterizer.rendererName}`,
  });
  await testInfo.attach("hero-visible-cadence.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          rasterizer,
          collection: {
            requiredRendered: cadenceWindow.requiredRendered,
            reachedFreshWindow: cadenceWindow.reachedFreshWindow,
            stable: cadenceWindow.stable,
            targetDrift: cadenceWindow.targetDrift,
            targetTolerance: cadenceWindow.targetTolerance,
          },
          before: {
            rendered: before.frame.rendered,
            fidelity: before.fidelity,
          },
          after: {
            rendered: after.frame.rendered,
            cadence: after.frame.cadence,
            fidelity: after.fidelity,
            effectiveSample: {
              intervalMs: after.sample.intervalMs,
              targetFps: after.sample.targetFps,
            },
            schedulerWork: after.scheduler.work,
            fieldWork: after.scheduler.callbackWork.field,
          },
        },
        null,
        2
      )
    ),
    contentType: "application/json",
  });

  expect(cadenceWindow.reachedFreshWindow, JSON.stringify(cadenceWindow, null, 2)).toBe(true);
  expect(cadenceWindow.stable, JSON.stringify(cadenceWindow, null, 2)).toBe(true);
  expect(after.frame.rendered - before.frame.rendered).toBeGreaterThanOrEqual(64);
  expect(after.frame.cadence.samples).toBeGreaterThanOrEqual(60);
  expect(after.scheduler.work.samples).toBeGreaterThanOrEqual(60);
  expect(after.scheduler.callbackWork.field.p90Ms).toBeLessThanOrEqual(8);
  expect(after.scheduler.work.p90Ms).toBeLessThanOrEqual(8);
  const targetInterval = after.sample.intervalMs;
  expect(
    after.frame.cadence.p90Ms,
    `fresh Hero-visible p90 ${after.frame.cadence.p90Ms}ms exceeded 1.5 × effective sample interval ${targetInterval.toFixed(2)}ms (${after.sample.targetFps} FPS) on ${
      rasterizer.kind
    }: ${rasterizer.rendererName}`
  ).toBeLessThanOrEqual(targetInterval * 1.5);
});
