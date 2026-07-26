(() => {
  "use strict";

  const scriptElement = document.currentScript;
  const scriptUrl = scriptElement?.src ? new URL(scriptElement.src, window.location.href) : null;
  const basePath = scriptUrl ? scriptUrl.pathname.replace(/\/assets\/js\/notes-atlas\.js$/, "") : "";
  const defaultGraphUrl = `${basePath}/assets/data/notes-semantic-graph.json`;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stableMode = new URLSearchParams(window.location.search).has("notes-stable");
  let graphPromise;

  const normalize = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/\s+/g, " ")
      .trim();

  const graphUrlFor = (root) => root?.dataset.notesGraphUrl || defaultGraphUrl;

  const loadGraph = (root = null) => {
    if (!graphPromise) {
      graphPromise = fetch(graphUrlFor(root), { credentials: "same-origin" }).then((response) => {
        if (!response.ok) throw new Error(`notes graph request failed: ${response.status}`);
        return response.json();
      });
    }
    return graphPromise;
  };

  const localUrl = (path) => {
    if (!path) return "#";
    if (/^(?:https?:|mailto:|#)/.test(path)) return path;
    return `${basePath}${path.startsWith("/") ? path : `/${path}`}`.replace(/\/{2,}/g, "/");
  };

  const hashUnit = (value) => {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
  };

  const fieldScore = (field, terms, weight) => {
    const haystack = normalize(Array.isArray(field) ? field.join(" ") : field);
    if (!haystack) return 0;
    return terms.reduce((score, term) => {
      if (!term || !haystack.includes(term)) return score;
      const occurrences = Math.min(4, haystack.split(term).length - 1);
      const exactBonus = haystack === term ? weight * 0.45 : 0;
      return score + weight * (1 + occurrences * 0.12) + exactBonus;
    }, 0);
  };

  const noteSearchScore = (node, query) => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return 1;
    const search = node.search || {};
    const matchedTerms = terms.filter((term) =>
      [search.title, search.concepts, search.tags, search.thesis, search.description, search.body].some((field) =>
        normalize(Array.isArray(field) ? field.join(" ") : field).includes(term)
      )
    );
    if (matchedTerms.length !== terms.length) return 0;
    return (
      fieldScore(search.title, terms, 12) +
      fieldScore(search.concepts, terms, 8) +
      fieldScore(search.tags, terms, 6) +
      fieldScore([search.thesis, search.description], terms, 4) +
      fieldScore(search.body, terms, 1)
    );
  };

  function scopeGraph(graph, root) {
    const scopeType = root.dataset.notesScopeType || "all";
    const scopeValue = root.dataset.notesScopeValue || "all";
    if (scopeType === "all" || scopeValue === "all") {
      return {
        nodes: graph.nodes,
        edges: graph.edges,
      };
    }

    const matchingNotes = new Set(
      graph.nodes
        .filter((node) => {
          if (node.type !== "note") return false;
          const values = scopeType === "tag" ? node.tags || [] : node.categories || [];
          return values.includes(scopeValue);
        })
        .map((node) => node.id)
    );
    const allowed = new Set(matchingNotes);
    const nodeTypes = new Map(graph.nodes.map((node) => [node.id, node.type]));
    for (const edge of graph.edges) {
      if (matchingNotes.has(edge.source) && nodeTypes.get(edge.target) !== "note") allowed.add(edge.target);
      if (matchingNotes.has(edge.target) && nodeTypes.get(edge.source) !== "note") allowed.add(edge.source);
    }
    return {
      nodes: graph.nodes.filter((node) => allowed.has(node.id)),
      edges: graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target)),
    };
  }

  function createGraphNode(node) {
    const element = document.createElement(node.url ? "a" : "button");
    if (node.url) element.href = localUrl(node.url);
    else element.type = "button";
    element.className = `notes-node notes-node--${node.type} notes-node--${node.kind || "neutral"}`;
    element.dataset.notesNode = "";
    element.dataset.nodeId = node.id;
    if (node.noteId) {
      element.dataset.noteId = node.noteId;
      element.dataset.noteKind = node.kind;
    }

    const coordinate = document.createElement("span");
    coordinate.className = "notes-node__index";
    coordinate.textContent = node.type.toUpperCase();
    const title = document.createElement("strong");
    title.textContent = node.label || node.title || node.id;
    element.append(coordinate, title);

    if (node.type === "note") {
      const excerpt = document.createElement("span");
      excerpt.className = "notes-node__excerpt";
      excerpt.dataset.notesExcerpt = "";
      excerpt.textContent = node.excerpt || node.description || "";
      element.append(excerpt);
    }
    if (node.type === "concept") {
      element.setAttribute("aria-label", `以概念“${node.label}”筛选札记`);
      element.dataset.notesConcept = node.label;
    }
    return element;
  }

  function initAtlas(root, graph) {
    const graphElement = root.querySelector("[data-notes-graph]");
    const nodeLayer = root.querySelector("[data-notes-node-layer]");
    const edgeLayer = root.querySelector("[data-notes-edge-layer]");
    if (!graphElement || !nodeLayer || !edgeLayer) return null;

    const scoped = scopeGraph(graph, root);
    const nodesById = new Map(scoped.nodes.map((node) => [node.id, node]));
    const noteNodes = scoped.nodes.filter((node) => node.type === "note");
    const indexItems = new Map(Array.from(root.querySelectorAll("[data-notes-index-item]")).map((element) => [element.dataset.noteId, element]));
    const elementsById = new Map();
    const positions = new Map();
    const edgeElements = new Map();
    const status = root.querySelector("[data-notes-graph-status]");
    const searchInput = root.querySelector("[data-notes-search]");
    const searchStatus = root.querySelector("[data-notes-search-status]");
    const emptyState = root.querySelector("[data-notes-empty]");
    const modeControls = Array.from(root.querySelectorAll("[data-notes-mode]"));
    let currentMode = "all";
    let activeNodeId = null;
    let graphVisible = false;
    let documentVisible = !document.hidden;
    let frameHandle = 0;
    let frameCount = 0;
    let geometryDirty = true;
    let latestWidth = 0;
    let latestHeight = 0;
    let lastTimestamp = 0;

    for (const node of scoped.nodes) {
      let element = nodeLayer.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
      if (!element) {
        element = createGraphNode(node);
        nodeLayer.append(element);
      }
      elementsById.set(node.id, element);
      if (node.type === "note") {
        for (const excerptElement of root.querySelectorAll(`[data-note-id="${CSS.escape(node.noteId)}"] [data-notes-excerpt]`)) {
          excerptElement.textContent = node.excerpt || node.description || "";
        }
      }
    }

    for (const edge of scoped.edges) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("notes-edge", `notes-edge--${edge.kind}`);
      path.dataset.edgeId = edge.id;
      path.dataset.edgeSource = edge.source;
      path.dataset.edgeTarget = edge.target;
      edgeLayer.append(path);
      edgeElements.set(edge.id, path);
    }

    const updateGeometry = (timestamp = performance.now()) => {
      const bounds = graphElement.getBoundingClientRect();
      latestWidth = Math.max(1, bounds.width);
      latestHeight = Math.max(1, bounds.height);
      edgeLayer.setAttribute("viewBox", `0 0 ${latestWidth} ${latestHeight}`);
      const animated = graphVisible && documentVisible && !stableMode && !reducedMotion.matches;
      const time = animated ? timestamp * 0.000085 : 0;

      for (const node of scoped.nodes) {
        const element = elementsById.get(node.id);
        if (!element) continue;
        const amplitude = node.type === "concept" ? 8 : node.type === "project" ? 5 : 6;
        const phase = Number(node.phase) || hashUnit(node.id) * Math.PI * 2;
        const driftX = animated ? Math.cos(time + phase) * amplitude : 0;
        const driftY = animated ? Math.sin(time * 0.83 + phase * 1.31) * amplitude * 0.72 : 0;
        const x = node.anchor.x * latestWidth + driftX;
        const y = node.anchor.y * latestHeight + driftY;
        element.style.setProperty("--notes-node-x", `${x.toFixed(2)}px`);
        element.style.setProperty("--notes-node-y", `${y.toFixed(2)}px`);
        positions.set(node.id, { x, y });
      }

      for (const edge of scoped.edges) {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        const path = edgeElements.get(edge.id);
        if (!source || !target || !path) continue;
        const middleX = (source.x + target.x) / 2;
        const middleY = (source.y + target.y) / 2;
        const normalX = target.y - source.y;
        const normalY = source.x - target.x;
        const normalLength = Math.hypot(normalX, normalY) || 1;
        const bend = (hashUnit(edge.id) - 0.5) * Math.min(72, Math.hypot(target.x - source.x, target.y - source.y) * 0.22);
        const controlX = middleX + (normalX / normalLength) * bend;
        const controlY = middleY + (normalY / normalLength) * bend;
        path.setAttribute(
          "d",
          `M ${source.x.toFixed(2)} ${source.y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${target.x.toFixed(
            2
          )} ${target.y.toFixed(2)}`
        );
      }

      frameCount += 1;
      root.dataset.notesFrameCount = String(frameCount);
      root.dataset.notesGraphVisible = graphVisible ? "true" : "false";
      geometryDirty = false;
    };

    const shouldAnimate = () => graphVisible && documentVisible && !stableMode && !reducedMotion.matches;
    const requestFrame = () => {
      if (frameHandle) return;
      if (!geometryDirty && !shouldAnimate()) return;
      frameHandle = window.requestAnimationFrame((timestamp) => {
        frameHandle = 0;
        lastTimestamp = timestamp;
        updateGeometry(timestamp);
        if (shouldAnimate()) requestFrame();
      });
    };

    const invalidate = () => {
      geometryDirty = true;
      requestFrame();
    };

    const connectedIds = (nodeId) => {
      const result = new Set([nodeId]);
      for (const edge of scoped.edges) {
        if (edge.source === nodeId) result.add(edge.target);
        if (edge.target === nodeId) result.add(edge.source);
      }
      return result;
    };

    const setActive = (nodeId) => {
      activeNodeId = nodeId;
      const connected = nodeId ? connectedIds(nodeId) : new Set();
      for (const [id, element] of elementsById) {
        element.classList.toggle("is-active", id === nodeId);
        element.classList.toggle("is-dimmed", Boolean(nodeId) && !connected.has(id));
      }
      for (const [edgeId, path] of edgeElements) {
        const edge = scoped.edges.find((candidate) => candidate.id === edgeId);
        const active = Boolean(nodeId) && (edge.source === nodeId || edge.target === nodeId);
        path.classList.toggle("is-active", active);
        path.classList.toggle("is-dimmed", Boolean(nodeId) && !active);
      }
      for (const [noteId, item] of indexItems) {
        const node = nodesById.get(noteId);
        item.classList.toggle("is-active", nodeId === noteId || (nodeId && connected.has(noteId)));
        item.classList.toggle("is-dimmed", Boolean(nodeId) && !connected.has(noteId) && node?.id !== nodeId);
      }
    };

    const modeMatches = (node) => currentMode === "all" || node.kind === currentMode;
    const updateFilter = () => {
      const query = searchInput?.value || "";
      const results = noteNodes
        .map((node) => ({
          node,
          score: modeMatches(node) ? noteSearchScore(node, query) : 0,
        }))
        .sort((first, second) => second.score - first.score || first.node.title.localeCompare(second.node.title, "zh-CN"));
      const matchingNoteIds = new Set(results.filter(({ score }) => score > 0).map(({ node }) => node.id));
      const visibleGraphIds = new Set(matchingNoteIds);
      for (const edge of scoped.edges) {
        if (matchingNoteIds.has(edge.source)) visibleGraphIds.add(edge.target);
        if (matchingNoteIds.has(edge.target)) visibleGraphIds.add(edge.source);
      }

      results.forEach(({ node, score }, index) => {
        const item = indexItems.get(node.noteId);
        const element = elementsById.get(node.id);
        const matches = score > 0;
        if (item) {
          item.hidden = !matches;
          item.style.setProperty("--notes-result-order", String(index));
          item.classList.toggle("is-filtered", !matches);
        }
        if (element) {
          element.hidden = false;
          element.classList.toggle("is-filtered", !matches);
        }
      });

      for (const node of scoped.nodes) {
        if (node.type === "note") continue;
        elementsById.get(node.id)?.classList.toggle("is-filtered", !visibleGraphIds.has(node.id));
      }
      for (const [edgeId, path] of edgeElements) {
        const edge = scoped.edges.find((candidate) => candidate.id === edgeId);
        path.classList.toggle(
          "is-filtered",
          !matchingNoteIds.has(edge.source) &&
            !matchingNoteIds.has(edge.target) &&
            (!visibleGraphIds.has(edge.source) || !visibleGraphIds.has(edge.target))
        );
      }

      const matchCount = matchingNoteIds.size;
      if (searchStatus) searchStatus.textContent = query ? `${matchCount} 条路径` : currentMode === "all" ? "全部札记" : `${matchCount} 条路径`;
      if (emptyState) emptyState.hidden = matchCount > 0;
      root.dataset.notesMode = currentMode;
      root.dataset.notesMatches = String(matchCount);
      if (activeNodeId && !visibleGraphIds.has(activeNodeId)) setActive(null);
    };

    nodeLayer.addEventListener("pointerover", (event) => {
      const target = event.target.closest("[data-notes-node]");
      if (target && nodeLayer.contains(target)) setActive(target.dataset.nodeId);
    });
    nodeLayer.addEventListener("pointerout", (event) => {
      const target = event.target.closest("[data-notes-node]");
      if (target && !target.contains(event.relatedTarget)) setActive(null);
    });
    nodeLayer.addEventListener("focusin", (event) => {
      const target = event.target.closest("[data-notes-node]");
      if (target) setActive(target.dataset.nodeId);
    });
    nodeLayer.addEventListener("focusout", (event) => {
      if (!nodeLayer.contains(event.relatedTarget)) setActive(null);
    });
    nodeLayer.addEventListener("click", (event) => {
      const concept = event.target.closest("[data-notes-concept]");
      if (!concept || !searchInput) return;
      searchInput.value = concept.dataset.notesConcept;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.focus();
    });

    for (const [noteId, item] of indexItems) {
      item.addEventListener("pointerenter", () => setActive(noteId));
      item.addEventListener("pointerleave", () => setActive(null));
      item.addEventListener("focusin", () => setActive(noteId));
      item.addEventListener("focusout", (event) => {
        if (!item.contains(event.relatedTarget)) setActive(null);
      });
    }

    searchInput?.addEventListener("input", updateFilter);
    root.querySelector("[data-notes-search-form]")?.addEventListener("submit", (event) => event.preventDefault());
    modeControls.forEach((control) => {
      control.addEventListener("click", () => {
        currentMode = control.dataset.notesMode;
        modeControls.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === control)));
        updateFilter();
      });
    });

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        graphVisible = entries.some((entry) => entry.isIntersecting);
        if (graphVisible) invalidate();
        else if (frameHandle) {
          window.cancelAnimationFrame(frameHandle);
          frameHandle = 0;
        }
        root.dataset.notesGraphVisible = graphVisible ? "true" : "false";
      },
      { rootMargin: "10% 0px", threshold: 0 }
    );
    visibilityObserver.observe(graphElement);

    const resizeObserver = new ResizeObserver(() => invalidate());
    resizeObserver.observe(graphElement);
    document.addEventListener("visibilitychange", () => {
      documentVisible = !document.hidden;
      if (documentVisible) invalidate();
      else if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
    });
    reducedMotion.addEventListener?.("change", invalidate);

    graphElement.classList.add("is-ready");
    root.dataset.notesRuntime = "ready";
    root.dataset.notesTopologyHash = graph.meta.topologyHash;
    if (status) status.textContent = stableMode || reducedMotion.matches ? "TOPOLOGY / FIXED" : "TOPOLOGY / DRIFTING";
    updateFilter();
    invalidate();

    return {
      snapshot: () => ({
        topologyHash: graph.meta.topologyHash,
        inputHash: graph.meta.inputHash,
        nodeIds: scoped.nodes.map(({ id }) => id),
        edgeIds: scoped.edges.map(({ id }) => id),
        anchors: Object.fromEntries(scoped.nodes.map(({ id, anchor }) => [id, anchor])),
        positions: Object.fromEntries(
          [...positions].map(([id, position]) => [id, { x: Number(position.x.toFixed(2)), y: Number(position.y.toFixed(2)) }])
        ),
        frameCount,
        visible: graphVisible,
        mode: currentMode,
        query: searchInput?.value || "",
        matches: Number(root.dataset.notesMatches || 0),
        size: { width: latestWidth, height: latestHeight },
        lastTimestamp,
      }),
      invalidate,
    };
  }

  function initReadingProgress(article) {
    const targets = Array.from(article.querySelectorAll("h2, p")).filter(
      (element) => !element.closest(".footnotes, .notes-project-return, .notes-related")
    );
    if (!targets.length) return;
    const progress = document.createElement("div");
    progress.className = "notes-reading-progress";
    progress.setAttribute("aria-hidden", "true");
    const ticks = targets.map(() => {
      const tick = document.createElement("span");
      progress.append(tick);
      return tick;
    });
    document.body.append(progress);

    let frameHandle = 0;
    const update = () => {
      frameHandle = 0;
      const threshold = window.innerHeight * 0.62;
      targets.forEach((target, index) => ticks[index].classList.toggle("is-read", target.getBoundingClientRect().top <= threshold));
    };
    const requestUpdate = () => {
      if (!frameHandle) frameHandle = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    requestUpdate();
  }

  function initSidenotes(article) {
    // Kramdown emits footnote definitions after the raw <article markdown="1">
    // block. Adopt that sibling into the reading surface before building the
    // responsive desktop projection.
    const footnoteList = article.querySelector(".footnotes") || article.parentElement?.querySelector(":scope > .footnotes");
    if (!footnoteList) return;
    if (footnoteList.parentElement !== article) article.append(footnoteList);
    const references = Array.from(article.querySelectorAll('a.footnote[href^="#"]'));
    if (!references.length) return;
    const desktopSidenotes = window.matchMedia("(min-width: 1180px)");

    const aside = document.createElement("aside");
    aside.className = "notes-sidenotes";
    aside.setAttribute("aria-label", "脚注边注");
    aside.hidden = true;
    const entries = [];
    references.forEach((reference, index) => {
      const originalHref = reference.getAttribute("href");
      const originalDescribedBy = reference.getAttribute("aria-describedby");
      const targetId = decodeURIComponent(originalHref.slice(1));
      const source = footnoteList.querySelector(`#${CSS.escape(targetId)}`);
      if (!source) return;
      const note = document.createElement("div");
      note.className = "notes-sidenote";
      note.id = `notes-sidenote-${article.dataset.noteId || "article"}-${index + 1}`;
      note.setAttribute("role", "doc-footnote");
      note.tabIndex = -1;
      note.dataset.noteNumber = String(index + 1).padStart(2, "0");
      note.innerHTML = source.innerHTML;
      note.querySelectorAll(".reversefootnote").forEach((backlink) => backlink.remove());
      aside.append(note);
      entries.push({ reference, note, originalHref, originalDescribedBy });
    });
    if (!entries.length) return;
    article.append(aside);

    let frameHandle = 0;
    let desktopActive = false;
    const place = () => {
      frameHandle = 0;
      if (!desktopActive) return;
      let nextTop = 0;
      const articleTop = article.getBoundingClientRect().top + window.scrollY;
      for (const { reference, note } of entries) {
        const referenceTop = reference.getBoundingClientRect().top + window.scrollY - articleTop;
        const top = Math.max(referenceTop - 10, nextTop);
        note.style.setProperty("--notes-sidenote-top", `${top.toFixed(1)}px`);
        nextTop = top + note.offsetHeight + 18;
      }
    };
    const requestPlace = () => {
      if (!frameHandle) frameHandle = window.requestAnimationFrame(place);
    };
    const syncMode = () => {
      desktopActive = desktopSidenotes.matches;
      article.classList.toggle("notes-essay--sidenotes-active", desktopActive);
      aside.hidden = !desktopActive;
      for (const { reference, note, originalHref, originalDescribedBy } of entries) {
        if (desktopActive) {
          reference.setAttribute("href", `#${note.id}`);
          reference.setAttribute("aria-describedby", [originalDescribedBy, note.id].filter(Boolean).join(" "));
        } else {
          reference.setAttribute("href", originalHref);
          if (originalDescribedBy) reference.setAttribute("aria-describedby", originalDescribedBy);
          else reference.removeAttribute("aria-describedby");
        }
      }
      if (desktopActive) requestPlace();
      else if (frameHandle) {
        window.cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
    };
    new ResizeObserver(requestPlace).observe(article);
    window.addEventListener("resize", requestPlace, { passive: true });
    if (desktopSidenotes.addEventListener) desktopSidenotes.addEventListener("change", syncMode);
    else desktopSidenotes.addListener?.(syncMode);
    syncMode();
  }

  function populateRelated(article, graph) {
    const target = article.querySelector("[data-notes-related]");
    const noteId = article.dataset.noteId;
    if (!target || !noteId) return;
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const related = graph.related?.[noteId] || [];
    target.replaceChildren();
    for (const relation of related) {
      const node = nodes.get(relation.noteId);
      if (!node) continue;
      const link = document.createElement("a");
      link.href = localUrl(node.url);
      const title = document.createElement("span");
      title.textContent = node.title;
      const score = document.createElement("span");
      score.textContent = `COS / ${Math.round(relation.score * 100)
        .toString()
        .padStart(2, "0")}`;
      link.append(title, score);
      target.append(link);
    }
    if (!target.children.length) {
      const fallback = document.createElement("span");
      fallback.textContent = "当前图谱尚无另一条达到阈值的语义路径。";
      target.append(fallback);
    }
  }

  function initEssay(article) {
    const kind = article.dataset.noteKind || "research";
    document.body.classList.add("notes-reading", `notes-reading--${kind}`);
    initReadingProgress(article);
    initSidenotes(article);
    loadGraph()
      .then((graph) => {
        populateRelated(article, graph);
        document.body.dataset.notesGraphHash = graph.meta.inputHash;
      })
      .catch(() => {
        const target = article.querySelector("[data-notes-related]");
        if (target) target.textContent = "语义图谱暂不可用；正文与项目入口不受影响。";
      });
  }

  const atlasRoots = Array.from(document.querySelectorAll("[data-notes-atlas-root]"));
  const atlasApis = [];
  for (const root of atlasRoots) {
    loadGraph(root)
      .then((graph) => {
        const api = initAtlas(root, graph);
        if (api) atlasApis.push(api);
      })
      .catch(() => {
        root.dataset.notesRuntime = "fallback";
        const status = root.querySelector("[data-notes-graph-status]");
        if (status) status.textContent = "TOPOLOGY / UNAVAILABLE";
      });
  }

  const essay = document.querySelector(".notes-essay[data-note-id][data-note-kind]");
  if (essay) initEssay(essay);

  window.__NOTES_ATLAS_API__ = {
    version: "1.0.0",
    snapshot: () => atlasApis.map((api) => api.snapshot()),
    graph: () => loadGraph(atlasRoots[0] || null),
  };
})();
