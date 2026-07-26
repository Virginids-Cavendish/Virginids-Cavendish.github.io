const { test, expect } = require("@playwright/test");
const { preparePage, compareWithBaseline } = require("./helpers");

const routes = [
  { path: "al-folio/", id: "home" },
  { path: "al-folio/projects/", id: "projects" },
  { path: "al-folio/blog/", id: "notes" },
  { path: "al-folio/cv/", id: "cv" },
];

test.beforeEach(async ({}, testInfo) => {
  test.skip(!process.env.BASELINE_URL, "BASELINE_URL is not configured for visual parity checks.");
});

for (const theme of ["light", "dark"]) {
  for (const route of routes) {
    test(`visual parity: ${route.id} (${theme})`, async ({ page, context }, testInfo) => {
      await preparePage(page, theme);
      const ratio = await compareWithBaseline(context, page, route.path, theme);
      const threshold = testInfo.project.name === "mobile" ? 0.08 : 0.04;
      expect(ratio).not.toBeNull();
      expect(ratio).toBeLessThan(threshold);
    });
  }
}
