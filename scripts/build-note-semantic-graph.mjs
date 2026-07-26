import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const GENERATOR_VERSION = "2.1.0";
const TRANSFORMERS_PACKAGE = "@xenova/transformers";
const TRANSFORMERS_VERSION = "2.17.2";
const TRANSFORMERS_LICENSE = "Apache-2.0";
const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const MODEL_REVISION = "2c4055b12046f11709e9df2c122e59ffbdc2f900";
const MODEL_LICENSE = "Apache-2.0";
const MODEL_SOURCE = `https://huggingface.co/${MODEL_ID}/tree/${MODEL_REVISION}`;
const MODEL_TASK = "feature-extraction";
const VECTOR_DIMENSIONS = 384;
const MODEL_MAX_TOKENS = 512;
const INITIAL_CHUNK_CHARACTERS = 768;
const INFERENCE_BATCH_SIZE = 8;
const GRAPH_SEED = "renaissance-notes-atlas-2026";
const RELATED_LIMIT = 3;
const RELATED_THRESHOLD = 0.18;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const postsDirectory = join(repositoryRoot, "_posts");
const projectsDirectory = join(repositoryRoot, "_projects");
const conceptsPath = join(repositoryRoot, "_data", "note_concepts.yml");
const outputPath = join(repositoryRoot, "assets", "data", "notes-semantic-graph.json");
const checkOnly = process.argv.includes("--check");

function fail(message) {
  process.stderr.write(`notes graph: ${message}\n`);
  process.exitCode = 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineList(value) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => unquote(item))
      .filter(Boolean);
  }
  return [unquote(trimmed)];
}

function parseFrontMatter(source, filePath) {
  if (!source.startsWith("---")) {
    throw new Error(`${relative(repositoryRoot, filePath)} has no YAML front matter`);
  }

  const closingIndex = source.indexOf("\n---", 3);
  if (closingIndex < 0) {
    throw new Error(`${relative(repositoryRoot, filePath)} has unterminated YAML front matter`);
  }

  const raw = source.slice(4, closingIndex).replace(/\r/g, "");
  const body = source.slice(closingIndex + 4).replace(/^\s+/, "");
  const lines = raw.split("\n");
  const data = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;

    const [, key, rawValue = ""] = match;
    const value = rawValue.trim();

    if (value === "|" || value === ">") {
      const chunks = [];
      while (index + 1 < lines.length && /^(?:\s{2,}|\s*$)/.test(lines[index + 1])) {
        index += 1;
        chunks.push(lines[index].trim());
      }
      data[key] = value === ">" ? chunks.join(" ") : chunks.join("\n");
      continue;
    }

    if (!value) {
      const values = [];
      while (index + 1 < lines.length) {
        const listMatch = lines[index + 1].match(/^\s+-\s+(.+)$/);
        if (!listMatch) break;
        index += 1;
        values.push(unquote(listMatch[1]));
      }
      data[key] = values;
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = parseInlineList(value);
    } else if (value === "true" || value === "false") {
      data[key] = value === "true";
    } else {
      data[key] = unquote(value);
    }
  }

  for (const key of ["tags", "categories", "project_ids", "concepts"]) {
    if (typeof data[key] === "string") {
      data[key] = data[key]
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(data[key])) data[key] = [];
  }

  return { data, body };
}

function parseConcepts(source) {
  const concepts = new Map();
  const lines = source.replace(/\r/g, "").split("\n");
  let current = null;
  let listKey = null;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const rootMatch = line.match(/^([a-z0-9-]+):\s*$/);
    if (rootMatch) {
      current = { id: rootMatch[1], aliases: [] };
      concepts.set(current.id, current);
      listKey = null;
      continue;
    }
    if (!current) continue;

    const propertyMatch = line.match(/^\s{2}([a-z_]+):(?:\s*(.*))?$/);
    if (propertyMatch) {
      const [, key, rawValue = ""] = propertyMatch;
      listKey = rawValue.trim() ? null : key;
      current[key] = rawValue.trim() ? unquote(rawValue) : [];
      continue;
    }

    const listMatch = line.match(/^\s{4}-\s+(.+)$/);
    if (listMatch && listKey) current[listKey].push(unquote(listMatch[1]));
  }

  return concepts;
}

export function cleanSemanticBody(markdown) {
  return String(markdown || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<link\b[^>]*>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/^[ \t]*\[\^[^\]]+\]:.*(?:\n(?: {2,}|\t).*)*/gm, " ")
    .replace(/^\s{0,3}>\s?.*$/gm, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\{\%[\s\S]*?\%\}|\{\{[\s\S]*?\}\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\^([^\]]+)\]/g, " ")
    .replace(/[*_~`>#|]/g, " ")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractExcerpt(markdown) {
  const withoutCode = markdown.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "");
  const blocks = withoutCode.replace(/\r/g, "").split(/\n\s*\n/);
  const paragraph =
    blocks
      .map((block) => block.trim())
      .find((block) => block.length >= 36 && !/^(?:#{1,6}\s|>|!\[|\[\^[^\]]+\]:|[-*_]{3,}\s*$|\{\%|\{\{)/.test(block) && !/^<[^>]+>/.test(block)) ||
    "";
  const plain = cleanSemanticBody(paragraph);
  const characters = Array.from(plain);
  return characters.length > 120 ? `${characters.slice(0, 120).join("")}…` : plain;
}

function hash32(value) {
  const digest = createHash("sha256").update(`${GRAPH_SEED}:${value}`).digest();
  return digest.readUInt32BE(0);
}

function hashUnit(value) {
  return hash32(value) / 0xffffffff;
}

function modelMetadata() {
  return {
    id: MODEL_ID,
    revision: MODEL_REVISION,
    task: MODEL_TASK,
    dimensions: VECTOR_DIMENSIONS,
    quantized: true,
    pooling: "mean",
    normalize: true,
    license: MODEL_LICENSE,
    source: MODEL_SOURCE,
    runtime: {
      package: TRANSFORMERS_PACKAGE,
      version: TRANSFORMERS_VERSION,
      license: TRANSFORMERS_LICENSE,
    },
    documentAggregation: {
      fullText: true,
      initialUnicodeCodepoints: INITIAL_CHUNK_CHARACTERS,
      maximumTokensPerChunk: MODEL_MAX_TOKENS,
      chunkPooling: "unicode-codepoint-length-weighted mean",
      finalNormalization: "L2",
    },
  };
}

function semanticDocument(note, concepts) {
  const conceptLines = note.concepts.map((conceptId) => {
    const concept = concepts.get(conceptId);
    return [concept.label, ...(concept.aliases || []), concept.description].filter(Boolean).join(" · ");
  });
  return [
    `标题\n${note.title}`,
    `命题\n${note.thesis}`,
    `说明\n${note.description}`,
    `概念\n${conceptLines.join("\n")}`,
    `标签\n${note.tags.join(" · ")}`,
    `正文\n${note.body}`,
  ]
    .join("\n\n")
    .normalize("NFKC")
    .replace(/\r/g, "")
    .trim();
}

function normalizeVector(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new Error("model produced an empty or non-finite document vector");
  return Array.from(values, (value) => value / norm);
}

function initialCharacterChunks(text) {
  const characters = Array.from(text);
  const chunks = [];
  for (let start = 0; start < characters.length; start += INITIAL_CHUNK_CHARACTERS) {
    chunks.push(characters.slice(start, start + INITIAL_CHUNK_CHARACTERS).join(""));
  }
  return chunks;
}

function tokenLength(tokenizer, text) {
  const encoded = tokenizer(text, {
    add_special_tokens: true,
    padding: false,
    truncation: false,
    return_tensor: false,
  });
  if (!Array.isArray(encoded.input_ids)) throw new Error("tokenizer did not return an input_ids array");
  return encoded.input_ids.length;
}

function splitAtSemanticBoundary(text) {
  const characters = Array.from(text);
  const midpoint = Math.floor(characters.length / 2);
  const minimum = Math.max(1, Math.floor(characters.length * 0.35));
  const maximum = Math.min(characters.length - 1, Math.ceil(characters.length * 0.65));
  const boundaryPattern = /[\s。！？；：,.!?;:，、）】》」』]/u;
  let splitIndex = midpoint;

  for (let radius = 0; radius <= maximum - minimum; radius += 1) {
    const right = midpoint + radius;
    const left = midpoint - radius;
    if (right <= maximum && boundaryPattern.test(characters[right - 1] || "")) {
      splitIndex = right;
      break;
    }
    if (left >= minimum && boundaryPattern.test(characters[left - 1] || "")) {
      splitIndex = left;
      break;
    }
  }

  return [characters.slice(0, splitIndex).join(""), characters.slice(splitIndex).join("")];
}

function tokenSafeChunks(text, tokenizer) {
  const pending = [...initialCharacterChunks(text)];
  const chunks = [];

  while (pending.length) {
    const chunk = pending.shift();
    if (tokenLength(tokenizer, chunk) <= MODEL_MAX_TOKENS) {
      chunks.push(chunk);
      continue;
    }
    if (Array.from(chunk).length <= 1) throw new Error("a single Unicode code point exceeds the model token limit");
    const [left, right] = splitAtSemanticBoundary(chunk);
    pending.unshift(left, right);
  }

  if (chunks.join("") !== text) throw new Error("chunking failed to preserve the complete semantic document");
  if (chunks.some((chunk) => tokenLength(tokenizer, chunk) > MODEL_MAX_TOKENS)) {
    throw new Error("chunking left an input that the model pipeline would truncate");
  }
  return chunks;
}

function validateRuntimeDependency({ requireInstalled = false } = {}) {
  const packageManifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  if (packageManifest.devDependencies?.[TRANSFORMERS_PACKAGE] !== TRANSFORMERS_VERSION) {
    throw new Error(`${TRANSFORMERS_PACKAGE} must be pinned exactly to ${TRANSFORMERS_VERSION}`);
  }
  if (!requireInstalled) return;

  const runtimeManifestPath = join(repositoryRoot, "node_modules", "@xenova", "transformers", "package.json");
  if (!existsSync(runtimeManifestPath)) throw new Error(`${TRANSFORMERS_PACKAGE} is not installed; run npm.cmd install`);
  const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, "utf8"));
  if (runtimeManifest.version !== TRANSFORMERS_VERSION) {
    throw new Error(`installed ${TRANSFORMERS_PACKAGE} version ${runtimeManifest.version} does not match ${TRANSFORMERS_VERSION}`);
  }
  if (runtimeManifest.license !== TRANSFORMERS_LICENSE) {
    throw new Error(`installed ${TRANSFORMERS_PACKAGE} license ${runtimeManifest.license} does not match ${TRANSFORMERS_LICENSE}`);
  }
}

async function loadExtractor() {
  validateRuntimeDependency({ requireInstalled: true });
  const { env, pipeline } = await import(TRANSFORMERS_PACKAGE);
  env.cacheDir = join(tmpdir(), "virginids-transformers-cache");
  const extractor = await pipeline(MODEL_TASK, MODEL_ID, {
    revision: MODEL_REVISION,
    quantized: true,
  });
  if (extractor.tokenizer.model_max_length !== MODEL_MAX_TOKENS) {
    await extractor.dispose?.();
    throw new Error(`${MODEL_ID}@${MODEL_REVISION} reports model_max_length=${extractor.tokenizer.model_max_length}; expected ${MODEL_MAX_TOKENS}`);
  }
  return extractor;
}

async function embedDocument(text, extractor, noteId) {
  const chunks = tokenSafeChunks(text, extractor.tokenizer);
  const aggregate = new Float64Array(VECTOR_DIMENSIONS);
  let totalWeight = 0;

  for (let start = 0; start < chunks.length; start += INFERENCE_BATCH_SIZE) {
    const batch = chunks.slice(start, start + INFERENCE_BATCH_SIZE);
    const output = await extractor(batch, { pooling: "mean", normalize: true });
    if (output.dims?.[0] !== batch.length || output.dims?.[1] !== VECTOR_DIMENSIONS) {
      output.dispose?.();
      throw new Error(`unexpected ${noteId} embedding shape ${JSON.stringify(output.dims)}`);
    }
    for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
      const weight = Array.from(batch[batchIndex]).length;
      totalWeight += weight;
      const offset = batchIndex * VECTOR_DIMENSIONS;
      for (let dimension = 0; dimension < VECTOR_DIMENSIONS; dimension += 1) {
        aggregate[dimension] += output.data[offset + dimension] * weight;
      }
    }
    output.dispose?.();
    process.stdout.write(`notes graph: embedded ${noteId} chunks ${Math.min(start + batch.length, chunks.length)}/${chunks.length}\r`);
  }
  process.stdout.write(`${" ".repeat(120)}\r`);
  if (totalWeight !== Array.from(text).length) throw new Error(`${noteId} aggregation did not cover the complete semantic document`);
  return normalizeVector(aggregate);
}

async function embedNotes(notes, concepts) {
  const extractor = await loadExtractor();
  try {
    const vectors = new Map();
    for (const note of notes) {
      vectors.set(note.noteId, await embedDocument(semanticDocument(note, concepts), extractor, note.noteId));
    }
    return vectors;
  } finally {
    await extractor.dispose?.();
  }
}

function cosine(first, second) {
  let result = 0;
  for (let index = 0; index < first.length; index += 1) result += first[index] * second[index];
  return Math.max(-1, Math.min(1, result));
}

function round(value, places = 6) {
  return Number(value.toFixed(places));
}

function noteAnchor(note, index, total) {
  const research = note.noteKind === "research";
  const baseX = research ? 0.29 : 0.71;
  const baseY = total <= 2 ? (research ? 0.37 : 0.63) : 0.2 + ((index + 0.5) / total) * 0.6;
  return {
    x: round(baseX + (hashUnit(`${note.noteId}:x`) - 0.5) * 0.1, 5),
    y: round(baseY + (hashUnit(`${note.noteId}:y`) - 0.5) * 0.12, 5),
  };
}

function offsetAnchor(origin, id, distance, angularOffset = 0) {
  const angle = hashUnit(`${id}:angle`) * Math.PI * 2 + angularOffset;
  return {
    x: round(Math.max(0.07, Math.min(0.93, origin.x + Math.cos(angle) * distance)), 5),
    y: round(Math.max(0.09, Math.min(0.91, origin.y + Math.sin(angle) * distance)), 5),
  };
}

function graphNodePhase(id) {
  return round(hashUnit(`${id}:phase`) * Math.PI * 2, 6);
}

function edgeId(kind, source, target) {
  return `${kind}:${[source, target].sort().join("~")}`;
}

export function selectSemanticEdges(candidates, limit = RELATED_LIMIT) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("semantic edge limit must be a positive integer");
  const degree = new Map();
  const selected = [];
  const ordered = [...candidates].sort((first, second) => second.weight - first.weight || first.id.localeCompare(second.id));

  for (const candidate of ordered) {
    const sourceDegree = degree.get(candidate.source) || 0;
    const targetDegree = degree.get(candidate.target) || 0;
    if (sourceDegree >= limit || targetDegree >= limit) continue;
    selected.push(candidate);
    degree.set(candidate.source, sourceDegree + 1);
    degree.set(candidate.target, targetDegree + 1);
  }

  return selected;
}

function graphInputHash(conceptsSource, sources, projectSources) {
  return sha256(
    JSON.stringify({
      generator: GENERATOR_VERSION,
      model: modelMetadata(),
      seed: GRAPH_SEED,
      concepts: sha256(conceptsSource.replace(/\r/g, "")),
      sources,
      projectSources,
    })
  );
}

async function buildGraph() {
  if (!existsSync(conceptsPath)) throw new Error(`missing ${relative(repositoryRoot, conceptsPath)}`);
  const conceptsSource = readFileSync(conceptsPath, "utf8");
  const concepts = parseConcepts(conceptsSource);
  const noteFiles = readdirSync(postsDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();
  const notes = [];

  for (const fileName of noteFiles) {
    const filePath = join(postsDirectory, fileName);
    const source = readFileSync(filePath, "utf8");
    const { data, body } = parseFrontMatter(source, filePath);
    if (!data.note_id) continue;

    const required = ["note_id", "note_kind", "title", "thesis", "description", "date"];
    for (const key of required) {
      if (!data[key]) throw new Error(`${fileName} is missing ${key}`);
    }
    if (!["research", "translation"].includes(data.note_kind)) {
      throw new Error(`${fileName} has invalid note_kind ${data.note_kind}`);
    }
    if (!data.project_ids.length) throw new Error(`${fileName} has no project_ids`);
    if (!data.concepts.length) throw new Error(`${fileName} has no concepts`);
    for (const conceptId of data.concepts) {
      if (!concepts.has(conceptId)) throw new Error(`${fileName} references unknown concept ${conceptId}`);
    }

    const dateMatch = fileName.match(/^(\d{4})-\d{2}-\d{2}-(.+)\.md$/);
    if (!dateMatch) throw new Error(`${fileName} does not follow the dated post naming convention`);
    const [, year, slug] = dateMatch;
    const plainBody = cleanSemanticBody(body);
    const note = {
      fileName,
      noteId: data.note_id,
      noteKind: data.note_kind,
      title: data.title,
      thesis: data.thesis,
      description: data.description,
      date: String(data.date),
      url: `/blog/${year}/${slug}/`,
      tags: [...new Set(data.tags)].sort(),
      categories: [...new Set(data.categories)].sort(),
      projectIds: [...new Set(data.project_ids)].sort(),
      concepts: [...new Set(data.concepts)].sort(),
      body: plainBody,
      excerpt: extractExcerpt(body),
    };
    note.contentHash = sha256(source);
    notes.push(note);
  }

  notes.sort((first, second) => first.noteId.localeCompare(second.noteId));
  if (!notes.length) throw new Error("no posts with note_id metadata were found");
  if (new Set(notes.map(({ noteId }) => noteId)).size !== notes.length) throw new Error("duplicate note_id values");

  const projectFiles = existsSync(projectsDirectory)
    ? readdirSync(projectsDirectory)
        .filter((fileName) => fileName.endsWith(".md"))
        .sort()
    : [];
  const projects = new Map();
  for (const fileName of projectFiles) {
    const filePath = join(projectsDirectory, fileName);
    const projectSource = readFileSync(filePath, "utf8");
    const { data } = parseFrontMatter(projectSource, filePath);
    const fallbackId = fileName.replace(/\.md$/, "");
    const projectId = data.project_id || fallbackId;
    projects.set(projectId, {
      projectId,
      fileName,
      title: data.title || projectId,
      url: `/projects/${fallbackId}/`,
      category: data.category || "",
      contentHash: sha256(projectSource),
    });
  }
  for (const note of notes) {
    for (const projectId of note.projectIds) {
      if (!projects.has(projectId)) throw new Error(`${note.fileName} references unknown project ${projectId}`);
    }
  }

  const vectors = await embedNotes(notes, concepts);

  const nodes = [];
  const anchors = new Map();
  notes.forEach((note, index) => {
    const anchor = noteAnchor(note, index, notes.length);
    anchors.set(note.noteId, anchor);
    nodes.push({
      id: note.noteId,
      type: "note",
      noteId: note.noteId,
      kind: note.noteKind,
      label: note.title,
      title: note.title,
      url: note.url,
      date: note.date,
      thesis: note.thesis,
      description: note.description,
      excerpt: note.excerpt,
      concepts: note.concepts,
      projectIds: note.projectIds,
      tags: note.tags,
      categories: note.categories,
      anchor,
      phase: graphNodePhase(note.noteId),
      search: {
        title: note.title,
        concepts: note.concepts.flatMap((id) => {
          const concept = concepts.get(id);
          return [concept.label, ...(concept.aliases || [])];
        }),
        tags: note.tags,
        thesis: note.thesis,
        description: note.description,
        body: note.body,
      },
    });
  });

  const referencedProjectIds = [...new Set(notes.flatMap(({ projectIds }) => projectIds))].sort();
  for (const projectId of referencedProjectIds) {
    const project = projects.get(projectId);
    const relatedNotes = notes.filter((note) => note.projectIds.includes(projectId));
    const origin = relatedNotes.reduce(
      (accumulator, note) => {
        const anchor = anchors.get(note.noteId);
        accumulator.x += anchor.x / relatedNotes.length;
        accumulator.y += anchor.y / relatedNotes.length;
        return accumulator;
      },
      { x: 0, y: 0 }
    );
    const id = `project:${projectId}`;
    const anchor = offsetAnchor(origin, id, 0.17);
    anchors.set(id, anchor);
    nodes.push({
      id,
      type: "project",
      projectId,
      kind: project.category || relatedNotes[0]?.noteKind || "research",
      label: project.title,
      title: project.title,
      url: project.url,
      anchor,
      phase: graphNodePhase(id),
    });
  }

  const referencedConceptIds = [...new Set(notes.flatMap(({ concepts: ids }) => ids))].sort();
  for (const conceptId of referencedConceptIds) {
    const concept = concepts.get(conceptId);
    const relatedNotes = notes.filter((note) => note.concepts.includes(conceptId));
    const origin = relatedNotes.reduce(
      (accumulator, note) => {
        const anchor = anchors.get(note.noteId);
        accumulator.x += anchor.x / relatedNotes.length;
        accumulator.y += anchor.y / relatedNotes.length;
        return accumulator;
      },
      { x: 0, y: 0 }
    );
    const id = `concept:${conceptId}`;
    const distance = 0.115 + hashUnit(`${id}:distance`) * 0.075;
    const anchor = offsetAnchor(origin, id, distance);
    anchors.set(id, anchor);
    nodes.push({
      id,
      type: "concept",
      conceptId,
      kind: concept.kind,
      label: concept.label,
      title: concept.label,
      description: concept.description,
      aliases: concept.aliases,
      anchor,
      phase: graphNodePhase(id),
    });
  }

  const edges = [];
  const semanticCandidates = [];
  const related = Object.fromEntries(notes.map(({ noteId }) => [noteId, []]));
  for (let firstIndex = 0; firstIndex < notes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < notes.length; secondIndex += 1) {
      const first = notes[firstIndex];
      const second = notes[secondIndex];
      const similarity = round(cosine(vectors.get(first.noteId), vectors.get(second.noteId)), 6);
      const sharedTags = first.tags.filter((tag) => second.tags.includes(tag));
      if (similarity >= RELATED_THRESHOLD || notes.length === 2) {
        semanticCandidates.push({
          id: edgeId("semantic", first.noteId, second.noteId),
          kind: "semantic",
          source: first.noteId,
          target: second.noteId,
          weight: similarity,
        });
      }
      if (sharedTags.length) {
        edges.push({
          id: edgeId("tag", first.noteId, second.noteId),
          kind: "tag",
          source: first.noteId,
          target: second.noteId,
          weight: round(Math.min(1, sharedTags.length / 3), 4),
          tags: sharedTags,
        });
      }
    }
  }

  for (const edge of selectSemanticEdges(semanticCandidates)) {
    edges.push(edge);
    related[edge.source].push({ noteId: edge.target, score: edge.weight });
    related[edge.target].push({ noteId: edge.source, score: edge.weight });
  }

  for (const note of notes) {
    for (const projectId of note.projectIds) {
      edges.push({
        id: edgeId("project", note.noteId, `project:${projectId}`),
        kind: "project",
        source: note.noteId,
        target: `project:${projectId}`,
        weight: 1,
      });
    }
    for (const conceptId of note.concepts) {
      edges.push({
        id: edgeId("concept", note.noteId, `concept:${conceptId}`),
        kind: "concept",
        source: note.noteId,
        target: `concept:${conceptId}`,
        weight: 1,
      });
    }
  }

  for (const noteId of Object.keys(related)) {
    related[noteId] = related[noteId]
      .sort((first, second) => second.score - first.score || first.noteId.localeCompare(second.noteId))
      .slice(0, RELATED_LIMIT);
  }

  nodes.sort((first, second) => first.id.localeCompare(second.id));
  edges.sort((first, second) => first.id.localeCompare(second.id));
  const sources = notes.map((note) => ({
    noteId: note.noteId,
    file: `_posts/${note.fileName}`,
    contentHash: note.contentHash,
    semanticInputHash: sha256(semanticDocument(note, concepts)),
  }));
  const projectSources = referencedProjectIds.map((projectId) => {
    const project = projects.get(projectId);
    return {
      projectId,
      file: `_projects/${project.fileName}`,
      contentHash: project.contentHash,
    };
  });
  const inputHash = graphInputHash(conceptsSource, sources, projectSources);

  return {
    meta: {
      schemaVersion: 1,
      generatorVersion: GENERATOR_VERSION,
      model: modelMetadata(),
      seed: GRAPH_SEED,
      inputHash,
      topologyHash: sha256(JSON.stringify({ nodes: nodes.map(({ id, anchor }) => ({ id, anchor })), edges })),
    },
    sources,
    projectSources,
    nodes,
    edges,
    related,
  };
}

function currentSourceState() {
  validateRuntimeDependency();
  if (!existsSync(conceptsPath)) throw new Error(`missing ${relative(repositoryRoot, conceptsPath)}`);
  const conceptsSource = readFileSync(conceptsPath, "utf8");
  const concepts = parseConcepts(conceptsSource);
  const notes = [];

  for (const fileName of readdirSync(postsDirectory)
    .filter((name) => name.endsWith(".md"))
    .sort()) {
    const filePath = join(postsDirectory, fileName);
    const source = readFileSync(filePath, "utf8");
    const { data, body } = parseFrontMatter(source, filePath);
    if (!data.note_id) continue;

    const required = ["note_id", "note_kind", "title", "thesis", "description", "date"];
    for (const key of required) {
      if (!data[key]) throw new Error(`${fileName} is missing ${key}`);
    }
    if (!["research", "translation"].includes(data.note_kind)) {
      throw new Error(`${fileName} has invalid note_kind ${data.note_kind}`);
    }
    if (!data.project_ids.length) throw new Error(`${fileName} has no project_ids`);
    if (!data.concepts.length) throw new Error(`${fileName} has no concepts`);
    for (const conceptId of data.concepts) {
      if (!concepts.has(conceptId)) throw new Error(`${fileName} references unknown concept ${conceptId}`);
    }

    const dateMatch = fileName.match(/^(\d{4})-\d{2}-\d{2}-(.+)\.md$/);
    if (!dateMatch) throw new Error(`${fileName} does not follow the dated post naming convention`);
    const [, year, slug] = dateMatch;
    const note = {
      fileName,
      noteId: data.note_id,
      noteKind: data.note_kind,
      title: data.title,
      thesis: data.thesis,
      description: data.description,
      date: String(data.date),
      url: `/blog/${year}/${slug}/`,
      tags: [...new Set(data.tags)].sort(),
      categories: [...new Set(data.categories)].sort(),
      projectIds: [...new Set(data.project_ids)].sort(),
      concepts: [...new Set(data.concepts)].sort(),
      body: cleanSemanticBody(body),
    };
    note.contentHash = sha256(source);
    notes.push(note);
  }

  notes.sort((first, second) => first.noteId.localeCompare(second.noteId));
  if (!notes.length) throw new Error("no posts with note_id metadata were found");
  if (new Set(notes.map(({ noteId }) => noteId)).size !== notes.length) throw new Error("duplicate note_id values");

  const projects = new Map();
  for (const fileName of readdirSync(projectsDirectory)
    .filter((name) => name.endsWith(".md"))
    .sort()) {
    const filePath = join(projectsDirectory, fileName);
    const source = readFileSync(filePath, "utf8");
    const { data } = parseFrontMatter(source, filePath);
    const projectId = data.project_id || fileName.replace(/\.md$/, "");
    projects.set(projectId, { projectId, fileName, contentHash: sha256(source) });
  }

  for (const note of notes) {
    for (const projectId of note.projectIds) {
      if (!projects.has(projectId)) throw new Error(`${note.fileName} references unknown project ${projectId}`);
    }
  }

  const sources = notes.map((note) => ({
    noteId: note.noteId,
    file: `_posts/${note.fileName}`,
    contentHash: note.contentHash,
    semanticInputHash: sha256(semanticDocument(note, concepts)),
  }));
  const projectSources = [...new Set(notes.flatMap(({ projectIds }) => projectIds))].sort().map((projectId) => {
    const project = projects.get(projectId);
    return {
      projectId,
      file: `_projects/${project.fileName}`,
      contentHash: project.contentHash,
    };
  });
  return {
    inputHash: graphInputHash(conceptsSource, sources, projectSources),
    sources,
    projectSources,
  };
}

function rawVectorPath(value, path = "$") {
  if (Array.isArray(value)) {
    if (value.length === VECTOR_DIMENSIONS && value.every((entry) => typeof entry === "number")) return path;
    for (let index = 0; index < value.length; index += 1) {
      const nested = rawVectorPath(value[index], `${path}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const forbiddenKeys = new Set(["vector", "vectors", "embedding", "embeddings"]);
  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) return `${path}.${key}`;
    const nested = rawVectorPath(nestedValue, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function assertUniqueIds(items, label) {
  const ids = items.map(({ id }) => id);
  if (ids.some((id) => typeof id !== "string" || !id)) throw new Error(`${label} contains a missing id`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate ids`);
}

function validateCommittedGraph(graph) {
  const expected = currentSourceState();
  if (!graph || typeof graph !== "object") throw new Error("committed graph root is not an object");
  if (!graph.meta || graph.meta.schemaVersion !== 1) throw new Error("committed graph has an unsupported schemaVersion");
  if (graph.meta.generatorVersion !== GENERATOR_VERSION) throw new Error("committed graph generatorVersion is stale");
  if (JSON.stringify(graph.meta.model) !== JSON.stringify(modelMetadata())) throw new Error("committed graph model metadata is stale or incomplete");
  if (graph.meta.seed !== GRAPH_SEED) throw new Error("committed graph seed is stale");
  if (graph.meta.inputHash !== expected.inputHash) throw new Error("committed graph inputHash is stale");
  if (JSON.stringify(graph.sources) !== JSON.stringify(expected.sources)) throw new Error("committed graph note source hashes are stale");
  if (JSON.stringify(graph.projectSources) !== JSON.stringify(expected.projectSources)) {
    throw new Error("committed graph project source hashes are stale");
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !graph.related || typeof graph.related !== "object") {
    throw new Error("committed graph is missing nodes, edges, or related topology");
  }

  const forbiddenPath = rawVectorPath(graph);
  if (forbiddenPath) throw new Error(`committed graph exposes a raw model vector at ${forbiddenPath}`);

  assertUniqueIds(graph.nodes, "nodes");
  assertUniqueIds(graph.edges, "edges");
  const nodeIds = new Set(graph.nodes.map(({ id }) => id));
  const noteIds = new Set(graph.nodes.filter(({ type }) => type === "note").map(({ noteId }) => noteId));
  const semanticDegree = new Map();
  for (const source of expected.sources) {
    if (!nodeIds.has(source.noteId) || !noteIds.has(source.noteId)) throw new Error(`committed graph is missing note node ${source.noteId}`);
  }
  for (const node of graph.nodes) {
    if (!["note", "project", "concept"].includes(node.type)) throw new Error(`node ${node.id} has invalid type ${node.type}`);
    if (!node.anchor || !Number.isFinite(node.anchor.x) || !Number.isFinite(node.anchor.y)) {
      throw new Error(`node ${node.id} has an invalid anchor`);
    }
  }
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`edge ${edge.id} has a dangling endpoint`);
    if (!["semantic", "tag", "project", "concept"].includes(edge.kind)) throw new Error(`edge ${edge.id} has invalid kind ${edge.kind}`);
    if (!Number.isFinite(edge.weight)) throw new Error(`edge ${edge.id} has a non-finite weight`);
    if (edge.kind === "semantic") {
      semanticDegree.set(edge.source, (semanticDegree.get(edge.source) || 0) + 1);
      semanticDegree.set(edge.target, (semanticDegree.get(edge.target) || 0) + 1);
    }
  }
  for (const [noteId, degree] of semanticDegree) {
    if (degree > RELATED_LIMIT) throw new Error(`note ${noteId} exceeds the semantic edge limit ${RELATED_LIMIT}`);
  }
  for (const [noteId, relations] of Object.entries(graph.related)) {
    if (!noteIds.has(noteId) || !Array.isArray(relations)) throw new Error(`related entry ${noteId} is invalid`);
    if (relations.length > RELATED_LIMIT) throw new Error(`related entry ${noteId} exceeds the relation limit ${RELATED_LIMIT}`);
    for (const relation of relations) {
      if (!noteIds.has(relation.noteId) || !Number.isFinite(relation.score)) {
        throw new Error(`related entry ${noteId} has a dangling or invalid relation`);
      }
    }
  }

  const topologyHash = sha256(
    JSON.stringify({
      nodes: graph.nodes.map(({ id, anchor }) => ({ id, anchor })),
      edges: graph.edges,
    })
  );
  if (graph.meta.topologyHash !== topologyHash) throw new Error("committed graph topologyHash does not match its topology");
  return graph;
}

async function main() {
  try {
    if (checkOnly) {
      if (!existsSync(outputPath)) {
        fail(`${relative(repositoryRoot, outputPath)} is missing; run npm.cmd run build:notes-graph`);
      } else {
        const graph = validateCommittedGraph(JSON.parse(readFileSync(outputPath, "utf8")));
        process.stdout.write(`notes graph: fresh (${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.meta.inputHash.slice(0, 12)})\n`);
      }
    } else {
      const graph = await buildGraph();
      const serialized = await prettier.format(JSON.stringify(graph), {
        parser: "json",
        printWidth: 150,
      });
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, serialized, "utf8");
      process.stdout.write(`notes graph: wrote ${relative(repositoryRoot, outputPath)} (${graph.nodes.length} nodes, ${graph.edges.length} edges)\n`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
