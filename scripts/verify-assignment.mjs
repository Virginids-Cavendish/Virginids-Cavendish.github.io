import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

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
  "_data/note_concepts.yml",
  "_pages/blog.md",
  "_posts/2026-07-23-map-after-error.md",
  "_posts/2026-07-23-words-have-no-homeland.md",
  "assets/css/notes-atlas.css",
  "assets/data/notes-semantic-graph.json",
  "assets/js/notes-atlas.js",
  "scripts/build-note-semantic-graph.mjs",
  "test/visual/notes-atlas.spec.js",
  "docs/superpowers/specs/2026-07-26-renaissance-cyber-rhizome-performance-motion-notes-refinement.md",
  "report/renaissance-rhizome-refinement-acceptance.md",
];

const retiredPostFiles = ["_posts/2026-07-23-rhizome-learning-methodology.md", "_posts/2026-07-23-translation-terminology-notes.md"];

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

const requiredDocsTerms = ["GitHub Pages", "Hero", "About", "Skills", "Projects", "Contact", "隐私", "Checklist"];

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
  /\b(api[_-]?key|secret|access[_-]?token|auth[_-]?token|github[_-]?token|openai[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{12,}/i,
  /\b(password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s]{8,}/i,
];

function readIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseFrontMatter(relativePath) {
  const source = readIfExists(relativePath).replace(/\r/g, "");
  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return { data: {}, body: source };

  const data = {};
  const lines = match[1].split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const property = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!property) continue;
    const [, key, rawValue = ""] = property;
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value) {
      data[key] =
        value.startsWith("[") && value.endsWith("]")
          ? value
              .slice(1, -1)
              .split(",")
              .map((item) => item.trim().replace(/^(['"])(.*)\1$/, "$2"))
              .filter(Boolean)
          : value;
      continue;
    }

    const values = [];
    while (index + 1 < lines.length) {
      const item = lines[index + 1].match(/^\s+-\s+(.+)$/);
      if (!item) break;
      index += 1;
      values.push(item[1].trim().replace(/^(['"])(.*)\1$/, "$2"));
    }
    data[key] = values;
  }

  return { data, body: source.slice(match[0].length) };
}

function asList(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function markdownFiles(directory) {
  if (!fs.existsSync(path.join(root, directory))) return [];
  return fs
    .readdirSync(path.join(root, directory))
    .filter((name) => /\.md$/i.test(name))
    .map((name) => `${directory}/${name}`);
}

function conceptIds() {
  return new Set(
    readIfExists("_data/note_concepts.yml")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.match(/^([a-z0-9-]+):\s*$/)?.[1])
      .filter(Boolean)
  );
}

function graphHasVectorPayload(value) {
  if (Array.isArray(value)) return value.some(graphHasVectorPayload);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => /^(?:embedding|embeddings|vector|vectors)$/i.test(key) || graphHasVectorPayload(child));
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

for (const file of retiredPostFiles) {
  if (fs.existsSync(path.join(root, file))) failures.push(`Retired post must not remain or redirect: ${file}`);
}

const homepage = readIfExists("_pages/about.md");
for (const term of requiredHomepageTerms) {
  if (!homepage.includes(term)) failures.push(`Homepage missing required term: ${term}`);
}

const docsBundle = ["docs/prd.md", "docs/design.md", "docs/checklist.md", "README.md"].map(readIfExists).join("\n");
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

const frontendDisclosurePatterns = [
  /本站.{0,8}(?:只|未|没有).{0,8}展示/u,
  /(?:哪些|什么).{0,8}(?:被|未被|没有).{0,8}展示/u,
  /(?:未展示|不予展示|不公开哪些)/u,
];
for (const file of [...markdownFiles("_pages"), ...markdownFiles("_posts"), ...markdownFiles("_projects")]) {
  const body = readIfExists(file);
  for (const pattern of frontendDisclosurePatterns) {
    if (pattern.test(body)) failures.push(`Front-end material disclosure language found in ${file}: ${pattern}`);
  }
}

const postFiles = markdownFiles("_posts");
const projectFiles = markdownFiles("_projects");
const parsedPosts = postFiles.map((file) => ({ file, ...parseFrontMatter(file) }));
const parsedProjects = projectFiles.map((file) => ({ file, ...parseFrontMatter(file) }));
const notes = parsedPosts.filter(({ data }) => data.note_id);
const projects = parsedProjects.filter(({ data }) => data.project_id);
const knownConcepts = conceptIds();
const knownNoteIds = new Set();
const knownProjectIds = new Set();

for (const { file, data, body } of notes) {
  const noteId = data.note_id;
  if (!/^[a-z0-9-]+$/.test(noteId)) failures.push(`Invalid note_id in ${file}: ${noteId}`);
  if (knownNoteIds.has(noteId)) failures.push(`Duplicate note_id: ${noteId}`);
  knownNoteIds.add(noteId);

  if (!["research", "translation"].includes(data.note_kind)) {
    failures.push(`Invalid or missing note_kind in ${file}`);
  }
  if (!data.thesis) failures.push(`Missing thesis in ${file}`);
  if (asList(data.project_ids).length === 0) failures.push(`Missing project_ids in ${file}`);
  if (asList(data.concepts).length === 0) failures.push(`Missing concepts in ${file}`);

  for (const conceptId of asList(data.concepts)) {
    if (!knownConcepts.has(conceptId)) failures.push(`Unknown concept "${conceptId}" referenced by ${file}`);
  }

  const hanCount = body.match(/\p{Script=Han}/gu)?.length ?? 0;
  if (hanCount < 3500 || hanCount > 4500) {
    failures.push(`${file} has ${hanCount} Chinese characters; expected 3500-4500`);
  }
  const sectionCount = body.match(/^##\s+\S+/gm)?.length ?? 0;
  if (sectionCount < 3) failures.push(`${file} has ${sectionCount} H2 sections; expected at least 3`);
}

for (const { file, data } of projects) {
  const projectId = data.project_id;
  if (!/^[a-z0-9-]+$/.test(projectId)) failures.push(`Invalid project_id in ${file}: ${projectId}`);
  if (knownProjectIds.has(projectId)) failures.push(`Duplicate project_id: ${projectId}`);
  knownProjectIds.add(projectId);
}

for (const { file, data } of notes) {
  for (const projectId of asList(data.project_ids)) {
    if (!knownProjectIds.has(projectId)) {
      failures.push(`Unknown project_id "${projectId}" referenced by ${file}`);
      continue;
    }
    const project = projects.find(({ data: projectData }) => projectData.project_id === projectId);
    if (project && !project.body.includes(`/blog/2026/${data.note_id}/`)) {
      failures.push(`Project ${project.file} is missing a backlink to note ${data.note_id}`);
    }
  }
  const expectedUrl = `/blog/2026/${data.note_id}/`;
  if (!readIfExists("_pages/blog.md").includes(expectedUrl) && !readIfExists("assets/data/notes-semantic-graph.json").includes(expectedUrl)) {
    failures.push(`Blog system is missing canonical note URL: ${expectedUrl}`);
  }

  for (const tag of asList(data.tags)) {
    if (!fs.existsSync(path.join(root, `_pages/blog-tag-${tag}.md`))) {
      failures.push(`Missing Notes Atlas tag page for "${tag}"`);
    }
  }
  for (const category of asList(data.categories)) {
    if (!fs.existsSync(path.join(root, `_pages/blog-category-${category}.md`))) {
      failures.push(`Missing Notes Atlas category page for "${category}"`);
    }
  }
}

const expectedDates = new Map([
  ["map-after-error", "2026-07-23 18:30:00 +0800"],
  ["words-have-no-homeland", "2026-07-23 19:15:00 +0800"],
]);
for (const { file, data } of notes) {
  const expectedDate = expectedDates.get(data.note_id);
  if (expectedDate && data.date !== expectedDate) {
    failures.push(`${file} changed the locked publication timestamp; expected ${expectedDate}`);
  }
}

const graphPath = path.join(root, "assets", "data", "notes-semantic-graph.json");
if (fs.existsSync(graphPath)) {
  try {
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    const nodeIds = new Set((graph.nodes || []).map(({ id }) => id));
    for (const noteId of knownNoteIds) {
      if (!nodeIds.has(noteId)) failures.push(`Semantic graph is missing note node: ${noteId}`);
    }
    for (const edge of graph.edges || []) {
      if (!nodeIds.has(edge.source)) failures.push(`Semantic graph edge ${edge.id} has dangling source ${edge.source}`);
      if (!nodeIds.has(edge.target)) failures.push(`Semantic graph edge ${edge.id} has dangling target ${edge.target}`);
    }
    for (const source of graph.sources || []) {
      const sourcePath = path.join(root, source.file);
      if (!fs.existsSync(sourcePath)) {
        failures.push(`Semantic graph source is missing: ${source.file}`);
      } else {
        const actualHash = sha256(fs.readFileSync(sourcePath));
        if (actualHash !== source.contentHash) failures.push(`Semantic graph is stale for ${source.file}`);
      }
    }
    if (graphHasVectorPayload(graph)) failures.push("Semantic graph must not ship full embedding vectors");
    if (!graph.meta?.model?.id || !graph.meta?.model?.revision) {
      failures.push("Semantic graph must record the pinned embedding model id and revision");
    }
  } catch (error) {
    failures.push(`Invalid semantic graph JSON: ${error.message}`);
  }
}

const graphCheck = spawnSync(process.execPath, [path.join(root, "scripts", "build-note-semantic-graph.mjs"), "--check"], {
  cwd: root,
  encoding: "utf8",
});
if (graphCheck.status !== 0) {
  failures.push(`Semantic graph verification failed: ${(graphCheck.stderr || graphCheck.stdout || "").trim()}`);
}

if (failures.length) {
  console.error("Assignment verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Assignment verification passed.");
