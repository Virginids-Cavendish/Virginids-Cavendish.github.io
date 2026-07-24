import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "README.md",
  "docs/prd.md",
  "docs/design.md",
  "docs/checklist.md",
  "report/final-report.md",
  "screenshots/homepage-desktop.png",
  "screenshots/homepage-mobile.png",
  "screenshots/github-pages.png",
  "screenshots/checklist.png",
];

const requiredHomepageTerms = [
  "阎光锋",
  "Virginids",
  "Hero",
  "About",
  "Skills",
  "Projects",
  "Contact",
  "Rhizome-Learn",
  "Translation Projects",
  "Mathematical Modeling",
  "Optimal Control",
  "Adaptive Learning",
  "Project Management",
];

const requiredDocsTerms = [
  "GitHub Pages",
  "Hero",
  "About",
  "Skills",
  "Projects",
  "Contact",
  "隐私",
  "Checklist",
];

const forbiddenTerms = [
  "Albert Einstein",
  "einstein@example.com",
  "Affiliations",
  "555 your office number",
  "123 your address street",
  "subreddit",
  "example_pdf.pdf",
  "Your City, State",
  "C:\\Users\\",
  "D:\\书籍",
];

const forbiddenPatterns = [
  /\b[A-Z0-9_]*(API|SECRET|TOKEN|KEY)[A-Z0-9_]*\s*[:=]\s*['"]?[A-Za-z0-9_\-]{12,}/i,
  /\b(password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s]{8,}/i,
];

function readIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      if ([".git", "node_modules", "_site", ".jekyll-cache", ".sass-cache"].includes(entry.name)) continue;
      walkFiles(full, acc);
    } else if (!/\.(png|jpe?g|gif|mp4|mp3|pdf|lock)$/i.test(entry.name)) {
      acc.push(relative);
    }
  }
  return acc;
}

function publicTextFiles() {
  const explicit = ["README.md", "_config.yml", "_data/socials.yml", "_data/cv.yml"];
  const folders = ["_pages", "_posts", "_projects", "docs", "report"];
  const files = explicit.filter((file) => fs.existsSync(path.join(root, file)));
  for (const folder of folders) walkFiles(path.join(root, folder), files);
  return [...new Set(files)];
}

const failures = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`Missing required file: ${file}`);
}

const homepage = readIfExists("_pages/about.md");
for (const term of requiredHomepageTerms) {
  if (!homepage.includes(term)) failures.push(`Homepage missing required term: ${term}`);
}

const docsBundle = ["docs/prd.md", "docs/design.md", "docs/checklist.md", "README.md"]
  .map(readIfExists)
  .join("\n");
for (const term of requiredDocsTerms) {
  if (!docsBundle.includes(term)) failures.push(`Docs/README missing required term: ${term}`);
}

for (const file of publicTextFiles()) {
  const body = readIfExists(file);
  for (const term of forbiddenTerms) {
    if (body.includes(term)) failures.push(`Forbidden term "${term}" found in ${file}`);
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(body)) failures.push(`Potential secret pattern found in ${file}: ${pattern}`);
  }
}

if (failures.length) {
  console.error("Assignment verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Assignment verification passed.");
