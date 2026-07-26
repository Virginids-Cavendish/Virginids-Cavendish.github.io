const base = require("./playwright.config");

module.exports = {
  ...base,
  testIgnore: undefined,
  testMatch: /homepage-performance\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  projects: base.projects.filter(({ name }) => name === "desktop"),
};
