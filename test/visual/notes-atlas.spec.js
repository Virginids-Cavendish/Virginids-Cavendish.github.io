const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { test, expect } = require("@playwright/test");

const repositoryRoot = path.resolve(__dirname, "../..");
const graph = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "assets/data/notes-semantic-graph.json"), "utf8"));
const runtime = fs.readFileSync(path.join(repositoryRoot, "assets/js/notes-atlas.js"), "utf8");
const styles = fs.readFileSync(path.join(repositoryRoot, "assets/css/notes-atlas.css"), "utf8");
const taxonomyTemplate = fs.readFileSync(path.join(repositoryRoot, "_pages/_notes-taxonomy.html"), "utf8");
const graphGeneratorUrl = pathToFileURL(path.join(repositoryRoot, "scripts/build-note-semantic-graph.mjs")).href;
const notes = graph.nodes.filter((node) => node.type === "note");

function atlasMarkup({ scopeType = "all", scopeValue = "all" } = {}) {
  const scopedNotes = notes.filter((node) => {
    if (scopeType === "tag") return node.tags.includes(scopeValue);
    if (scopeType === "category") return node.categories.includes(scopeValue);
    return true;
  });
  const graphNodes = scopedNotes
    .map(
      (node, index) => `
        <a class="notes-node notes-node--note notes-node--${node.kind}" href="${node.url}"
          data-notes-node data-node-id="${node.id}" data-note-id="${node.noteId}" data-note-kind="${node.kind}">
          <span class="notes-node__index">0${index + 1}</span>
          <strong>${node.title}</strong>
          <span class="notes-node__excerpt" data-notes-excerpt>${node.description}</span>
        </a>`
    )
    .join("");
  const indexItems = scopedNotes
    .map(
      (node, index) => `
        <li class="notes-index__item notes-index__item--${node.kind}" data-notes-index-item
          data-note-id="${node.noteId}" data-note-kind="${node.kind}" data-tags="${node.tags.join(" ")}"
          data-categories="${node.categories.join(" ")}" data-concepts="${node.concepts.join(" ")}">
          <article>
            <div class="notes-index__coordinate"><span>0${index + 1}</span><span>${node.kind}</span></div>
            <div class="notes-index__body">
             <h3><a href="${node.url}">${node.title}</a></h3>
             <p class="notes-index__thesis">${node.thesis}</p>
             <p class="notes-index__excerpt" data-notes-excerpt>${node.description}</p>
             <div class="notes-index__meta">
               ${node.categories.map((category) => `<a href="/blog/category/${category}/">△ ${category}</a>`).join("")}
               ${node.tags.map((tag) => `<a href="/blog/tag/${tag}/">#${tag}</a>`).join("")}
             </div>
           </div>
         </article>
        </li>`
    )
    .join("");

  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/assets/css/notes-atlas.css">
      </head>
      <body>
        <main class="notes-atlas notes-atlas--index" data-notes-atlas-root
          data-notes-scope-type="${scopeType}" data-notes-scope-value="${scopeValue}"
          data-notes-graph-url="/assets/data/notes-semantic-graph.json">
          <header class="notes-atlas__masthead">
            <p class="notes-atlas__plate">PLATE N</p><h1>Blog / Notes</h1><p>Conceptual cartography.</p>
          </header>
          <section class="notes-atlas__controls">
            <div class="notes-atlas__modes">
              <button type="button" data-notes-mode="all" aria-pressed="true">All</button>
              <button type="button" data-notes-mode="research" aria-pressed="false">Research</button>
              <button type="button" data-notes-mode="translation" aria-pressed="false">Translation</button>
            </div>
            <form data-notes-search-form><input data-notes-search><output data-notes-search-status></output></form>
          </section>
          <section class="notes-atlas__graph-section">
            <header><p>SEMANTIC FIELD</p><h2>根茎索引</h2><p>Stable topology.</p></header>
            <div class="notes-graph" data-notes-graph>
              <svg data-notes-edge-layer viewBox="0 0 1000 620"></svg>
              <div class="notes-graph__nodes" data-notes-node-layer>${graphNodes}</div>
              <p data-notes-graph-status></p>
            </div>
          </section>
          <section class="notes-index"><ol class="notes-index__list" data-notes-index>${indexItems}</ol>
            <p data-notes-empty hidden>Empty</p>
          </section>
        </main>
        <div style="height:1600px"></div>
        <script src="/assets/js/notes-atlas.js"></script>
      </body>
    </html>`;
}

function essayMarkup(noteId = "words-have-no-homeland") {
  const note = notes.find((candidate) => candidate.noteId === noteId);
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/assets/css/notes-atlas.css">
      </head>
      <body>
        <main>
          <article class="notes-essay notes-essay--${note.kind}" data-note-id="${note.noteId}" data-note-kind="${note.kind}">
            <p>第一个实质段落用来建立文章的场景与问题。</p>
            <h2>第一节</h2>
            <p>正文段落包含一个需要边注说明的判断。<sup><a class="footnote" href="#fn:1">1</a></sup></p>
            <div style="height:900px"></div>
            <h2>第二节</h2>
            <p>结尾重新进入开头的问题。</p>
            <nav class="notes-related" data-notes-related aria-label="语义相关札记"></nav>
          </article>
          <script defer src="/assets/js/notes-atlas.js"></script>
          <div class="footnotes"><ol><li id="fn:1">这是一条可核验的边注。<a href="https://example.test/source">来源</a> <a class="reversefootnote" href="#">↩</a></li></ol></div>
        </main>
      </body>
    </html>`;
}

async function routeNotesAssets(page, documentMarkup) {
  await page.route("http://notes.test/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/assets/css/notes-atlas.css") {
      await route.fulfill({ status: 200, contentType: "text/css", body: styles });
    } else if (url.pathname === "/assets/js/notes-atlas.js") {
      await route.fulfill({ status: 200, contentType: "text/javascript", body: runtime });
    } else if (url.pathname === "/assets/data/notes-semantic-graph.json") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(graph) });
    } else {
      await route.fulfill({ status: 200, contentType: "text/html", body: documentMarkup });
    }
  });
}

async function openAtlas(page, options = {}) {
  const markup = atlasMarkup(options);
  await routeNotesAssets(page, markup);
  await page.goto(`http://notes.test/blog/${options.stable ? "?notes-stable=1" : ""}`, { waitUntil: "networkidle" });
  await expect(page.locator("[data-notes-atlas-root]")).toHaveAttribute("data-notes-runtime", "ready");
  await expect.poll(() => page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot().length)).toBe(1);
}

test("semantic maintenance cleans model input and deterministically caps per-note edges", async () => {
  const { cleanSemanticBody, selectSemanticEdges } = await import(graphGeneratorUrl);
  const dirtyBody = `
    <link rel="stylesheet" href="/assets/notes.css">
    <article>
    保留下来的正文含有一个脚注标记。[^source]

    <nav><a href="/projects/example/">PROJECT / 01</a></nav>

    [^source]: 不应进入模型的脚注定义。

    \`\`\`js
    const privateScaffold = true;
    \`\`\`
    <script src="/assets/notes.js"></script>
    </article>
  `;
  const cleanedBody = cleanSemanticBody(dirtyBody);
  expect(cleanedBody).toContain("保留下来的正文含有一个脚注标记");
  expect(cleanedBody).not.toMatch(/PROJECT|脚注定义|privateScaffold|notes\.(?:css|js)|\[\^source\]|<(?:nav|script|link)/);

  const candidates = [
    { id: "semantic:a~b", source: "a", target: "b", weight: 0.99 },
    { id: "semantic:c~d", source: "c", target: "d", weight: 0.98 },
    { id: "semantic:a~c", source: "a", target: "c", weight: 0.97 },
    { id: "semantic:b~d", source: "b", target: "d", weight: 0.96 },
    { id: "semantic:a~d", source: "a", target: "d", weight: 0.95 },
    { id: "semantic:b~c", source: "b", target: "c", weight: 0.94 },
  ];
  const selected = selectSemanticEdges(candidates, 2);
  const selectedFromReverseOrder = selectSemanticEdges([...candidates].reverse(), 2);
  expect(selectedFromReverseOrder.map(({ id }) => id)).toEqual(selected.map(({ id }) => id));

  const degree = new Map();
  for (const edge of selected) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  expect(Math.max(...degree.values())).toBeLessThanOrEqual(2);
});

test("committed graph has deterministic IDs, hashes, anchors, and semantic relations", async () => {
  expect(graph.meta.generatorVersion).toBe("2.1.0");
  expect(graph.meta.model).toMatchObject({
    id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    revision: "2c4055b12046f11709e9df2c122e59ffbdc2f900",
    task: "feature-extraction",
    dimensions: 384,
    quantized: true,
    pooling: "mean",
    normalize: true,
    license: "Apache-2.0",
    runtime: {
      package: "@xenova/transformers",
      version: "2.17.2",
      license: "Apache-2.0",
    },
    documentAggregation: {
      fullText: true,
      initialUnicodeCodepoints: 768,
      maximumTokensPerChunk: 512,
      chunkPooling: "unicode-codepoint-length-weighted mean",
      finalNormalization: "L2",
    },
  });
  expect(graph.meta.inputHash).toMatch(/^[a-f0-9]{64}$/);
  expect(graph.meta.topologyHash).toMatch(/^[a-f0-9]{64}$/);
  expect(graph.sources.map(({ noteId }) => noteId).sort()).toEqual(["map-after-error", "words-have-no-homeland"]);
  for (const source of graph.sources) expect(source.semanticInputHash).toMatch(/^[a-f0-9]{64}$/);
  expect(graph.projectSources.map(({ projectId }) => projectId).sort()).toEqual(["rhizome-learn", "translation-projects"]);
  expect(JSON.stringify(graph)).not.toMatch(/"(?:vectors?|embeddings?)"\s*:/i);
  expect(graph.nodes).toHaveLength(14);
  expect(new Set(graph.nodes.map(({ id }) => id)).size).toBe(graph.nodes.length);
  expect(new Set(graph.edges.map(({ id }) => id)).size).toBe(graph.edges.length);
  expect(graph.edges.some(({ kind }) => kind === "semantic")).toBeTruthy();
  const semanticDegree = new Map();
  for (const edge of graph.edges.filter(({ kind }) => kind === "semantic")) {
    semanticDegree.set(edge.source, (semanticDegree.get(edge.source) || 0) + 1);
    semanticDegree.set(edge.target, (semanticDegree.get(edge.target) || 0) + 1);
  }
  expect(Math.max(...semanticDegree.values())).toBeLessThanOrEqual(3);
  for (const note of notes) {
    expect(note.search.body).not.toMatch(/PROJECT\s*\/|SEMANTIC CONTINUATION|\[\^[^\]]+\]:|<(?:nav|script|link)\b/i);
  }
  for (const node of graph.nodes) {
    expect(node.anchor.x).toBeGreaterThanOrEqual(0);
    expect(node.anchor.x).toBeLessThanOrEqual(1);
    expect(node.anchor.y).toBeGreaterThanOrEqual(0);
    expect(node.anchor.y).toBeLessThanOrEqual(1);
  }
});

test("stable mode preserves topology while search and research/translation modes stay synchronized", async ({ page }) => {
  await openAtlas(page, { stable: true });
  const initial = await page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot()[0]);
  expect(initial.nodeIds).toHaveLength(14);
  expect(initial.edgeIds).toHaveLength(13);
  expect(initial.matches).toBe(2);

  const input = page.locator("[data-notes-search]");
  await input.fill("陌异");
  await expect(page.locator("[data-notes-index-item]:visible")).toHaveCount(1);
  await expect(page.locator('[data-notes-index-item][data-note-id="words-have-no-homeland"]')).toBeVisible();
  await expect(page.locator("[data-notes-search-status]")).toContainText("1");

  await input.fill("");
  await page.locator('[data-notes-mode="research"]').click();
  await expect(page.locator("[data-notes-index-item]:visible")).toHaveCount(1);
  await expect(page.locator('[data-notes-index-item][data-note-id="map-after-error"]')).toBeVisible();
  await expect(page.locator("[data-notes-atlas-root]")).toHaveAttribute("data-notes-mode", "research");

  const excerpt = await page.locator('[data-note-id="map-after-error"] [data-notes-excerpt]').first().textContent();
  expect(Array.from(excerpt)).toHaveLength(121);
  expect(excerpt.endsWith("…")).toBeTruthy();

  const beforeReload = await page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot()[0]);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("[data-notes-atlas-root]")).toHaveAttribute("data-notes-runtime", "ready");
  await expect.poll(() => page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot().length)).toBe(1);
  const afterReload = await page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot()[0]);
  expect(afterReload.topologyHash).toBe(beforeReload.topologyHash);
  expect(afterReload.nodeIds).toEqual(beforeReload.nodeIds);
  expect(afterReload.edgeIds).toEqual(beforeReload.edgeIds);
  expect(afterReload.anchors).toEqual(beforeReload.anchors);
});

test("graph drifts only while visible and stops under reduced motion", async ({ page }) => {
  await openAtlas(page);
  await page.evaluate(() => document.querySelector("[data-notes-graph]").scrollIntoView({ block: "center" }));
  await expect.poll(async () => Number(await page.locator("[data-notes-atlas-root]").getAttribute("data-notes-frame-count"))).toBeGreaterThan(2);
  const visibleCount = Number(await page.locator("[data-notes-atlas-root]").getAttribute("data-notes-frame-count"));

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "220vh";
    spacer.dataset.notesTestSpacer = "";
    document.body.append(spacer);
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(page.locator("[data-notes-atlas-root]")).toHaveAttribute("data-notes-graph-visible", "false");
  const pausedCount = Number(await page.locator("[data-notes-atlas-root]").getAttribute("data-notes-frame-count"));
  await page.waitForTimeout(550);
  const hiddenCount = Number(await page.locator("[data-notes-atlas-root]").getAttribute("data-notes-frame-count"));
  expect(pausedCount).toBeGreaterThanOrEqual(visibleCount);
  expect(hiddenCount - pausedCount).toBeLessThanOrEqual(1);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => document.querySelector("[data-notes-graph]").scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  const reducedSnapshot = await page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot()[0]);
  await page.waitForTimeout(400);
  const reducedAfterWait = await page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot()[0]);
  expect(reducedAfterWait.positions).toEqual(reducedSnapshot.positions);
});

test("tag and category scopes produce a local graph plus searchable text index", async ({ page }) => {
  await openAtlas(page, { scopeType: "tag", scopeValue: "terminology", stable: true });
  await expect(page.locator("[data-notes-index-item]")).toHaveCount(1);
  await expect(page.locator('[data-notes-index-item][data-note-id="words-have-no-homeland"]')).toBeVisible();
  const snapshot = await page.evaluate(() => window.__NOTES_ATLAS_API__.snapshot()[0]);
  expect(snapshot.nodeIds).toContain("words-have-no-homeland");
  expect(snapshot.nodeIds).toContain("concept:terminology");
  expect(snapshot.nodeIds).toContain("project:translation-projects");
  expect(snapshot.nodeIds).not.toContain("map-after-error");
});

test("taxonomy fallback exposes both category and tag metadata in semantic HTML", async ({ browser }) => {
  expect(taxonomyTemplate).toMatch(/\{% for category in post\.categories %\}/);
  expect(taxonomyTemplate).toContain("prepend: '/blog/category/'");
  expect(taxonomyTemplate).toMatch(/\{% for tag in post\.tags %\}/);

  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const markup = atlasMarkup({ scopeType: "tag", scopeValue: "terminology" });
  await routeNotesAssets(page, markup);
  await page.goto("http://notes.test/blog/tag/terminology/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "△ translation", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "#terminology", exact: true })).toBeVisible();
  await context.close();
});

test("essay mode adds reading ticks, desktop sidenotes, and semantic continuation", async ({ page }) => {
  const markup = essayMarkup();
  await routeNotesAssets(page, markup);
  await page.goto("http://notes.test/blog/2026/words-have-no-homeland/", { waitUntil: "networkidle" });
  await expect(page.locator("body")).toHaveClass(/notes-reading--translation/);
  await expect(page.locator(".notes-reading-progress span")).toHaveCount(5);
  await expect(page.locator(".notes-sidenote")).toHaveCount(1);
  await expect(page.locator("[data-notes-related] a")).toHaveCount(1);
  await expect(page.locator("[data-notes-related]")).toContainText("地图在错误之后");

  const reference = page.locator("a.footnote");
  const sidenotes = page.locator(".notes-sidenotes");
  const originalFootnotes = page.locator(".notes-essay > .footnotes");
  const sidenoteSource = sidenotes.locator('a[href="https://example.test/source"]');
  const originalSource = originalFootnotes.locator('a[href="https://example.test/source"]');

  await page.setViewportSize({ width: 760, height: 900 });
  await expect(sidenotes).toBeHidden();
  await expect(originalFootnotes).toBeVisible();
  await expect(originalSource).toBeVisible();
  await expect(reference).toHaveAttribute("href", "#fn:1");
  await expect(reference).not.toHaveAttribute("aria-describedby", /notes-sidenote/);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(sidenotes).toBeVisible();
  await expect(sidenotes).not.toHaveAttribute("aria-hidden", "true");
  await expect(originalFootnotes).toBeHidden();
  await expect(sidenoteSource).toBeVisible();
  await expect(reference).toHaveAttribute("href", "#notes-sidenote-words-have-no-homeland-1");
  await expect(reference).toHaveAttribute("aria-describedby", /notes-sidenote-words-have-no-homeland-1/);
  await sidenoteSource.focus();
  await expect(sidenoteSource).toBeFocused();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.locator(".notes-reading-progress span.is-read").count()).toBeGreaterThan(2);
});

test("semantic HTML remains a complete entry path without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const markup = atlasMarkup();
  await routeNotesAssets(page, markup);
  await page.goto("http://notes.test/blog/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-notes-index-item]")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "地图在错误之后", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "词语没有故乡", exact: true })).toBeVisible();
  await context.close();
});
