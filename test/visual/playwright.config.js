const path = require("path");
const { devices } = require("@playwright/test");

const repoRoot = path.resolve(__dirname, "../..");

const webServer = process.env.NO_WEBSERVER
  ? undefined
  : {
      command: "bundle exec jekyll serve --config _config.yml,test/visual/jekyll.test.yml --host 127.0.0.1 --port 4000 --baseurl /al-folio --quiet",
      cwd: repoRoot,
      url: "http://127.0.0.1:4000/al-folio/",
      // A stale Jekyll process on :4000 can make local acceptance green against
      // an older build. Final verification must always own the server it tests.
      reuseExistingServer: false,
      timeout: 300000,
    };

module.exports = {
  testDir: __dirname,
  // Performance sampling must own a fresh browser process. The acceptance
  // script runs it immediately after this functional suite with the dedicated
  // performance config below.
  testIgnore: /homepage-performance\.spec\.js/,
  timeout: 120000,
  expect: {
    timeout: 10000,
    toHaveScreenshot: {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4000/al-folio",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer,
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1366, height: 1800 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 12"],
      },
    },
  ],
};
