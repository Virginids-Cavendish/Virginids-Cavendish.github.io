(() => {
  "use strict";

  const ROOT_SELECTOR = "[data-rr-root]";
  const SESSION_KEY = "rr-instrument-session-v1";
  const FIXED_SEED = 0x71a4f3c9;
  const STABLE_FRAME_TIME = 4242;
  const TAU = Math.PI * 2;

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const ease = (value) => {
    const x = clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
  };

  const createRandom = (seed) => {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  };

  const hashString = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const pointOnQuadratic = (start, control, end, amount) => {
    const inverse = 1 - amount;
    return {
      x: inverse * inverse * start.x + 2 * inverse * amount * control.x + amount * amount * end.x,
      y: inverse * inverse * start.y + 2 * inverse * amount * control.y + amount * amount * end.y,
    };
  };

  const safeSessionStorage = {
    read() {
      try {
        return window.sessionStorage.getItem(SESSION_KEY);
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
      } catch {
        // The instrument remains fully functional when storage is unavailable.
      }
    },
  };

  const loadSession = () => {
    const fallback = {
      startedAt: Date.now(),
      interactionCount: 0,
      gestureInterval: 1100,
      lastGestureAt: 0,
      soundEnabled: false,
      motionOverride: null,
    };
    const stored = safeSessionStorage.read();
    if (!stored) return fallback;

    try {
      const parsed = JSON.parse(stored);
      return {
        startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : fallback.startedAt,
        interactionCount: clamp(Number(parsed.interactionCount) || 0, 0, 999),
        gestureInterval: clamp(Number(parsed.gestureInterval) || fallback.gestureInterval, 240, 5000),
        lastGestureAt: Number(parsed.lastGestureAt) || 0,
        soundEnabled: parsed.soundEnabled === true,
        motionOverride: typeof parsed.motionOverride === "boolean" ? parsed.motionOverride : null,
      };
    } catch {
      return fallback;
    }
  };

  const detectStableMode = (root) => {
    const parameters = new URLSearchParams(window.location.search);
    return Boolean(
      window.__RR_VISUAL_TEST__ ||
      document.getElementById("__alfolio_visual_stabilize") ||
      root.dataset.rrVisualTest === "true" ||
      document.documentElement.dataset.rrVisualTest === "true" ||
      parameters.has("rr-visual-test") ||
      parameters.has("visual-test") ||
      parameters.has("rr-stable")
    );
  };

  class WebGLDynamicLayer {
    constructor(root) {
      this.root = root;
      this.canvas = document.createElement("canvas");
      this.context = null;
      this.program = null;
      this.positionBuffer = null;
      this.positionLocation = -1;
      this.uniforms = {};
      this.available = false;
      this.contextLost = false;
      this.fallbackReason = "none";
      this.renderCount = 0;
      this.sampleAlpha = 0;
      this.version = null;

      this.handleContextLost = this.handleContextLost.bind(this);
      this.handleContextRestored = this.handleContextRestored.bind(this);
      this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
      this.initialize();
    }

    createShader(type, source) {
      const shader = this.context.createShader(type);
      if (!shader) throw new Error("shader-unavailable");
      this.context.shaderSource(shader, source);
      this.context.compileShader(shader);
      if (!this.context.getShaderParameter(shader, this.context.COMPILE_STATUS)) {
        this.context.deleteShader(shader);
        throw new Error("shader-compile-failed");
      }
      return shader;
    }

    initialize() {
      try {
        const options = {
          alpha: true,
          antialias: false,
          depth: false,
          failIfMajorPerformanceCaveat: false,
          powerPreference: "low-power",
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          stencil: false,
        };
        const context = this.canvas.getContext("webgl", options) || this.canvas.getContext("experimental-webgl", options);
        if (!context) {
          this.fail("unavailable");
          return;
        }

        this.context = context;
        this.version = 1;
        const vertexShader = this.createShader(
          context.VERTEX_SHADER,
          `
            attribute vec2 a_position;
            varying vec2 v_uv;

            void main() {
              v_uv = a_position * 0.5 + 0.5;
              gl_Position = vec4(a_position, 0.0, 1.0);
            }
          `
        );
        const fragmentShader = this.createShader(
          context.FRAGMENT_SHADER,
          `
            precision mediump float;

            varying vec2 v_uv;
            uniform vec2 u_resolution;
            uniform vec2 u_pointer;
            uniform vec2 u_tilt;
            uniform float u_time;
            uniform float u_chapter;
            uniform float u_quality;

            float strand(float phase, float width) {
              return 1.0 - smoothstep(width, width + 0.055, abs(sin(phase)));
            }

            void main() {
              vec2 centered = v_uv - 0.5;
              float aspect = u_resolution.x / max(1.0, u_resolution.y);
              centered.x *= aspect;
              float time = u_time * 0.00018;
              float tiltPhase = dot(u_tilt, vec2(0.7, -0.45));

              float organic = strand(
                centered.x * 8.3 + centered.y * 10.7 +
                sin(centered.y * 5.4 - time * 1.7) * 0.72 +
                time + tiltPhase,
                0.035
              );
              float research = strand(
                centered.x * 15.0 - centered.y * 6.1 +
                floor((time + centered.y * 0.7) * 2.0) * 0.34,
                0.026
              );
              float translation = strand(
                centered.x * 5.1 + centered.y * 13.4 +
                sin(centered.x * 8.0 + time * 0.8) * 0.58 -
                time * 0.62,
                0.042
              );

              vec2 pointerDelta = v_uv - u_pointer;
              pointerDelta.x *= aspect;
              float pointerField = u_pointer.x < -0.5
                ? 0.0
                : exp(-dot(pointerDelta, pointerDelta) * 42.0);
              float collision = step(3.5, u_chapter) * step(u_chapter, 4.5);
              float phaseMix = clamp(u_chapter / 5.0, 0.0, 1.0);
              float field = clamp(
                organic * 0.46 +
                research * (0.22 + step(1.5, u_chapter) * 0.18) +
                translation * (0.17 + step(2.5, u_chapter) * 0.2) +
                pointerField * 0.72 +
                collision * organic * research * 0.52,
                0.0,
                1.0
              );

              vec3 parchment = vec3(0.83, 0.76, 0.58);
              vec3 cyan = vec3(0.19, 0.86, 0.77);
              vec3 vermilion = vec3(0.78, 0.25, 0.14);
              vec3 color = mix(parchment, cyan, smoothstep(0.15, 0.52, phaseMix));
              color = mix(color, vermilion, smoothstep(0.48, 0.78, phaseMix));
              color = mix(color, parchment, collision * 0.34);

              float intensity = mix(0.36, 1.0, clamp(u_quality * 0.5, 0.0, 1.0));
              float alpha = (0.008 + field * 0.125 + pointerField * 0.045) * intensity;
              gl_FragColor = vec4(color, alpha);
            }
          `
        );
        const program = context.createProgram();
        if (!program) throw new Error("program-unavailable");
        context.attachShader(program, vertexShader);
        context.attachShader(program, fragmentShader);
        context.linkProgram(program);
        context.deleteShader(vertexShader);
        context.deleteShader(fragmentShader);
        if (!context.getProgramParameter(program, context.LINK_STATUS)) {
          context.deleteProgram(program);
          throw new Error("program-link-failed");
        }

        const positionBuffer = context.createBuffer();
        if (!positionBuffer) throw new Error("buffer-unavailable");
        context.bindBuffer(context.ARRAY_BUFFER, positionBuffer);
        context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), context.STATIC_DRAW);

        this.program = program;
        this.positionBuffer = positionBuffer;
        this.positionLocation = context.getAttribLocation(program, "a_position");
        this.uniforms = {
          resolution: context.getUniformLocation(program, "u_resolution"),
          pointer: context.getUniformLocation(program, "u_pointer"),
          tilt: context.getUniformLocation(program, "u_tilt"),
          time: context.getUniformLocation(program, "u_time"),
          chapter: context.getUniformLocation(program, "u_chapter"),
          quality: context.getUniformLocation(program, "u_quality"),
        };
        context.disable(context.DEPTH_TEST);
        context.disable(context.BLEND);
        context.clearColor(0, 0, 0, 0);
        this.available = true;
        this.contextLost = false;
        this.fallbackReason = "none";
        this.root.dataset.rrWebgl = "available";
        this.root.dataset.rrRenderer = "hybrid-webgl";
      } catch {
        this.fail("init-failed");
      }
    }

    fail(reason) {
      this.available = false;
      this.fallbackReason = reason;
      this.context = null;
      this.program = null;
      this.positionBuffer = null;
      this.sampleAlpha = 0;
      this.root.dataset.rrWebgl = reason === "context-lost" ? "lost" : "unavailable";
      this.root.dataset.rrRenderer = "2d-fallback";
    }

    resize(pixelWidth, pixelHeight) {
      if (!this.available || !this.context) return;
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      this.context.viewport(0, 0, pixelWidth, pixelHeight);
    }

    render(time, state) {
      if (!this.available || !this.context || !this.program || !this.positionBuffer) return false;
      try {
        const chapterIndex = {
          hero: 0,
          identity: 1,
          research: 2,
          translation: 3,
          collision: 4,
          contact: 5,
        }[state.chapter];
        const pointerX = state.pointer.active ? clamp((state.pointer.x - state.offsetLeft) / Math.max(1, state.width), 0, 1) : -1;
        const pointerY = state.pointer.active ? 1 - clamp((state.pointer.y - state.offsetTop) / Math.max(1, state.height), 0, 1) : -1;
        const context = this.context;
        context.viewport(0, 0, this.canvas.width, this.canvas.height);
        context.clear(context.COLOR_BUFFER_BIT);
        context.useProgram(this.program);
        context.bindBuffer(context.ARRAY_BUFFER, this.positionBuffer);
        context.enableVertexAttribArray(this.positionLocation);
        context.vertexAttribPointer(this.positionLocation, 2, context.FLOAT, false, 0, 0);
        context.uniform2f(this.uniforms.resolution, state.width, state.height);
        context.uniform2f(this.uniforms.pointer, pointerX, pointerY);
        context.uniform2f(this.uniforms.tilt, state.tilt.x, state.tilt.y);
        context.uniform1f(this.uniforms.time, time);
        context.uniform1f(this.uniforms.chapter, Number.isFinite(chapterIndex) ? chapterIndex : 0);
        context.uniform1f(this.uniforms.quality, state.quality);
        context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
        this.renderCount += 1;

        if (this.renderCount === 1 || this.renderCount % 120 === 0) {
          const pixel = new Uint8Array(4);
          context.readPixels(
            Math.max(0, Math.floor(this.canvas.width * 0.5)),
            Math.max(0, Math.floor(this.canvas.height * 0.5)),
            1,
            1,
            context.RGBA,
            context.UNSIGNED_BYTE,
            pixel
          );
          this.sampleAlpha = pixel[3];
        }
        return true;
      } catch {
        this.fail("render-failed");
        return false;
      }
    }

    handleContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
      this.fail("context-lost");
    }

    handleContextRestored() {
      this.initialize();
    }
  }

  class RhizomeField {
    constructor(canvas, root, sharedState) {
      this.canvas = canvas;
      this.root = root;
      this.sharedState = sharedState;
      this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
      this.webglLayer = this.context ? new WebGLDynamicLayer(root) : null;
      this.width = 1;
      this.height = 1;
      this.offsetLeft = 0;
      this.offsetTop = 0;
      this.dpr = 1;
      this.nodes = [];
      this.edges = [];
      this.quality = 2;
      this.frameHandle = 0;
      this.lastFrame = 0;
      this.lastRafTime = 0;
      this.lastSampleTime = 0;
      this.averageFrame = 16.7;
      this.sampledFrames = 0;
      this.frameCallbacks = 0;
      this.renderedFrames = 0;
      this.skippedFrames = 0;
      this.drawCalls = 0;
      this.collisionActive = false;
      this.running = false;
      this.resizeObserver = null;
      this.nearestSample = {
        active: false,
        distance: null,
        threshold: 0,
        nodeX: null,
        nodeY: null,
      };

      if (!this.context) {
        root.dataset.rrWebgl = "unavailable";
        root.dataset.rrRenderer = "unavailable";
        return;
      }

      this.resize = this.resize.bind(this);
      this.frame = this.frame.bind(this);
      this.handleVisibility = this.handleVisibility.bind(this);
      if (typeof window.ResizeObserver === "function") {
        this.resizeObserver = new window.ResizeObserver(this.resize);
        this.resizeObserver.observe(canvas);
      }
      window.addEventListener("resize", this.resize, { passive: true });
      document.addEventListener("visibilitychange", this.handleVisibility);
      this.resize();
    }

    get available() {
      return Boolean(this.context);
    }

    targetNodeCount() {
      const compact = this.width < 700;
      const counts = compact ? [34, 44, 56] : [52, 72, 92];
      const dprPenalty = this.dpr > 1.75 ? 1 : 0;
      return counts[Math.max(0, this.quality - dprPenalty)];
    }

    sampleInterval() {
      return [50, 1000 / 30, 0][this.quality];
    }

    updateQualityState() {
      const names = ["low", "medium", "high"];
      const layerBudgets = ["minimal", "reduced", "full"];
      const interval = this.sampleInterval();
      this.root.dataset.rrQuality = names[this.quality];
      this.root.dataset.rrLayerBudget = layerBudgets[this.quality];
      this.root.dataset.rrSampleRate = interval > 0 ? String(Math.round(1000 / interval)) : "display";
      this.root.style.setProperty("--rr-quality-layer-opacity", [0.42, 0.7, 1][this.quality].toFixed(2));
      this.root.style.setProperty("--rr-quality-sample-interval", `${interval.toFixed(2)}ms`);
    }

    resize() {
      if (!this.context) return;

      const bounds = this.canvas.getBoundingClientRect();
      this.offsetLeft = bounds.left;
      this.offsetTop = bounds.top;
      this.width = Math.max(1, Math.round(bounds.width || window.innerWidth));
      this.height = Math.max(1, Math.round(bounds.height || window.innerHeight));
      const mobileCap = this.width < 700 ? 1.5 : 2;
      const memoryCap = 4096 / Math.max(this.width, this.height);
      this.dpr = clamp(window.devicePixelRatio || 1, 1, Math.min(mobileCap, memoryCap));
      const pixelWidth = Math.max(1, Math.round(this.width * this.dpr));
      const pixelHeight = Math.max(1, Math.round(this.height * this.dpr));

      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }

      if (this.webglLayer) this.webglLayer.resize(pixelWidth, pixelHeight);
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.generate();
      this.draw(this.sharedState.stableMode ? STABLE_FRAME_TIME : performance.now());
    }

    updateOffset() {
      const bounds = this.canvas.getBoundingClientRect();
      this.offsetLeft = bounds.left;
      this.offsetTop = bounds.top;
    }

    generate() {
      const random = createRandom(FIXED_SEED + this.quality * 97 + (this.width < 700 ? 1 : 0));
      const count = this.targetNodeCount();
      const nodes = [];
      const edgeAnchors = [
        [-0.045, 0.12],
        [1.045, 0.2],
        [-0.04, 0.42],
        [1.04, 0.53],
        [-0.035, 0.78],
        [1.04, 0.86],
        [0.17, -0.035],
        [0.79, 1.035],
      ];

      for (let index = 0; index < count; index += 1) {
        let normalizedX;
        let normalizedY;
        if (index < edgeAnchors.length) {
          [normalizedX, normalizedY] = edgeAnchors[index];
        } else {
          normalizedX = (index * 0.61803398875 + random() * 0.12) % 1;
          normalizedY = (index * 0.41421356237 + random() * 0.14) % 1;
        }

        const kindRoll = random();
        const kind = kindRoll < 0.27 ? "research" : kindRoll < 0.53 ? "translation" : "organic";
        nodes.push({
          normalizedX,
          normalizedY,
          x: normalizedX * this.width,
          y: normalizedY * this.height,
          offsetX: 0,
          offsetY: 0,
          velocityX: 0,
          velocityY: 0,
          radius: 1.15 + random() * 1.25,
          phase: random() * TAU,
          frequency: 0.00012 + random() * 0.00016,
          amplitude: 2.5 + random() * 4.5,
          kind,
        });
      }

      const edgeKeys = new Set();
      const edges = [];
      const addEdge = (from, to, salt) => {
        if (from === to) return;
        const low = Math.min(from, to);
        const high = Math.max(from, to);
        const key = `${low}:${high}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        const first = nodes[from];
        const second = nodes[to];
        let kind = "organic";
        if (first.kind === second.kind && first.kind !== "organic") {
          kind = first.kind;
        } else if ((first.kind === "research" && second.kind === "translation") || (first.kind === "translation" && second.kind === "research")) {
          kind = "collision";
        }
        const edgeRandom = createRandom(FIXED_SEED ^ salt ^ (from * 131 + to * 977));
        edges.push({
          from,
          to,
          kind,
          bend: (edgeRandom() - 0.5) * 0.56,
          phase: edgeRandom(),
          weight: 0.38 + edgeRandom() * 0.65,
        });
      };

      nodes.forEach((node, index) => {
        const neighbors = nodes
          .map((candidate, candidateIndex) => ({
            candidateIndex,
            distance: (candidate.normalizedX - node.normalizedX) ** 2 + (candidate.normalizedY - node.normalizedY) ** 2,
          }))
          .filter(({ candidateIndex }) => candidateIndex !== index)
          .sort((first, second) => first.distance - second.distance);

        addEdge(index, neighbors[0].candidateIndex, index * 11 + 1);
        if (index % 3 !== 1) addEdge(index, neighbors[1].candidateIndex, index * 11 + 2);
        if (index % 7 === 0) addEdge(index, (index + 11 + Math.floor(random() * 9)) % count, index * 11 + 3);
      });

      edges
        .filter((edge) => edge.kind === "collision")
        .slice(0, 2)
        .forEach((edge) => {
          edge.flashEligible = true;
        });

      this.nodes = nodes;
      this.edges = edges;
      this.updateQualityState();
    }

    sampleNearestNode(clientX, clientY) {
      const threshold = clamp(Math.min(this.width, this.height) * 0.07, 38, 64);
      const localX = clientX - this.offsetLeft;
      const localY = clientY - this.offsetTop;
      const inside = localX >= -threshold && localX <= this.width + threshold && localY >= -threshold && localY <= this.height + threshold;
      let nearestNode = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      if (inside) {
        this.nodes.forEach((node) => {
          const distance = Math.hypot(node.x - localX, node.y - localY);
          if (distance < nearestDistance) {
            nearestNode = node;
            nearestDistance = distance;
          }
        });
      }

      const active = Boolean(nearestNode) && nearestDistance <= threshold + Math.max(0, nearestNode.radius) * 1.5;
      this.nearestSample = {
        active,
        distance: nearestNode ? Number(nearestDistance.toFixed(2)) : null,
        threshold: Number(threshold.toFixed(2)),
        nodeX: nearestNode ? Number(clamp(nearestNode.x / this.width, 0, 1).toFixed(4)) : null,
        nodeY: nearestNode ? Number(clamp(nearestNode.y / this.height, 0, 1).toFixed(4)) : null,
      };
      return this.nearestSample;
    }

    clearNearestSample() {
      this.nearestSample = {
        active: false,
        distance: null,
        threshold: Number(clamp(Math.min(this.width, this.height) * 0.07, 38, 64).toFixed(2)),
        nodeX: null,
        nodeY: null,
      };
    }

    edgeGeometry(edge) {
      const startNode = this.nodes[edge.from];
      const endNode = this.nodes[edge.to];
      const start = { x: startNode.x, y: startNode.y };
      const end = { x: endNode.x, y: endNode.y };
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const distance = Math.max(1, Math.hypot(deltaX, deltaY));
      const control = {
        x: (start.x + end.x) * 0.5 - (deltaY / distance) * distance * edge.bend,
        y: (start.y + end.y) * 0.5 + (deltaX / distance) * distance * edge.bend,
      };
      return { start, control, end };
    }

    updateNodes(time, delta) {
      const pointer = this.sharedState.pointer;
      const evolution = this.sharedState.evolution;
      const motion = this.sharedState.motionActive;
      const breathTempo = evolution === "clinical" ? 1 : evolution === "mimic" ? this.sharedState.mimicTempo : 1.12;
      const anticipation = evolution === "intrusive" ? 0.075 : evolution === "mimic" ? 0.025 : 0;
      const predictedX = pointer.x - this.offsetLeft + pointer.velocityX * anticipation;
      const predictedY = pointer.y - this.offsetTop + pointer.velocityY * anticipation;
      const radius = this.width < 700 ? 132 : 178;
      const forceScale = clamp(delta / 16.7, 0.2, 2);

      this.nodes.forEach((node, index) => {
        const baseX = node.normalizedX * this.width;
        const baseY = node.normalizedY * this.height;
        const breath = motion
          ? Math.sin(time * node.frequency * breathTempo + node.phase)
          : Math.sin(STABLE_FRAME_TIME * node.frequency + node.phase);
        const organicX = Math.cos(node.phase * 1.7) * breath * node.amplitude;
        const organicY = Math.sin(node.phase * 1.3) * breath * node.amplitude;
        const tiltX = this.sharedState.tilt.x * (3 + (index % 4));
        const tiltY = this.sharedState.tilt.y * (2 + (index % 3));

        if (pointer.active && motion) {
          const differenceX = baseX + node.offsetX - predictedX;
          const differenceY = baseY + node.offsetY - predictedY;
          const distance = Math.max(1, Math.hypot(differenceX, differenceY));
          if (distance < radius) {
            const influence = (1 - distance / radius) ** 2;
            const direction = evolution === "intrusive" && node.kind === "organic" ? -0.12 : 1;
            node.velocityX += (differenceX / distance) * influence * direction * 0.62 * forceScale;
            node.velocityY += (differenceY / distance) * influence * direction * 0.62 * forceScale;
          }
        }

        node.velocityX += -node.offsetX * 0.012 * forceScale;
        node.velocityY += -node.offsetY * 0.012 * forceScale;
        node.velocityX *= Math.pow(0.9, forceScale);
        node.velocityY *= Math.pow(0.9, forceScale);
        node.offsetX = clamp(node.offsetX + node.velocityX * forceScale, -42, 42);
        node.offsetY = clamp(node.offsetY + node.velocityY * forceScale, -42, 42);
        node.x = baseX + organicX + node.offsetX + tiltX;
        node.y = baseY + organicY + node.offsetY + tiltY;
      });
    }

    strokeCurve(geometry) {
      this.context.beginPath();
      this.context.moveTo(geometry.start.x, geometry.start.y);
      this.context.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.end.x, geometry.end.y);
      this.context.stroke();
    }

    drawOrganicEdge(edge, geometry, time) {
      const context = this.context;
      const breathing = this.sharedState.motionActive ? 0.5 + Math.sin(time * 0.00022 + edge.phase * TAU) * 0.15 : 0.52;
      context.setLineDash([]);
      context.lineWidth = edge.weight;
      context.strokeStyle = `rgba(212, 204, 178, ${0.12 * breathing})`;
      this.strokeCurve(geometry);
    }

    drawResearchEdge(edge, geometry, time, activeAmount) {
      const context = this.context;
      context.setLineDash([3, 8]);
      context.lineDashOffset = this.sharedState.motionActive ? -((time * 0.018 + edge.phase * 17) % 11) : -(edge.phase * 11);
      context.lineWidth = 0.65 + edge.weight * 0.72;
      context.strokeStyle = `rgba(57, 229, 217, ${0.13 + activeAmount * 0.25})`;
      this.strokeCurve(geometry);
      context.setLineDash([]);

      if (activeAmount > 0.05) {
        const progress = this.sharedState.motionActive ? (time * 0.00006 + edge.phase) % 1 : edge.phase;
        const pulse = pointOnQuadratic(geometry.start, geometry.control, geometry.end, progress);
        context.fillStyle = `rgba(98, 255, 184, ${0.28 + activeAmount * 0.46})`;
        context.fillRect(pulse.x - 1.6, pulse.y - 1.6, 3.2, 3.2);
      }
    }

    drawTranslationEdge(edge, geometry, time, activeAmount) {
      const context = this.context;
      const drag = this.sharedState.motionActive ? Math.sin(time * 0.00016 + edge.phase * TAU) : Math.sin(edge.phase * TAU);
      context.setLineDash([]);
      context.lineCap = "square";
      context.lineWidth = 0.65 + edge.weight * 1.15;
      context.strokeStyle = `rgba(190, 65, 41, ${0.12 + activeAmount * 0.24})`;
      this.strokeCurve(geometry);

      context.save();
      context.translate(drag * 1.2, -drag * 0.65);
      context.setLineDash([14, 4, 2, 7]);
      context.lineDashOffset = edge.phase * 23;
      context.lineWidth = 0.38;
      context.strokeStyle = `rgba(203, 139, 80, ${0.08 + activeAmount * 0.14})`;
      this.strokeCurve(geometry);
      context.restore();
      context.setLineDash([]);
    }

    drawCollisionEdge(edge, geometry, time, activeAmount) {
      const context = this.context;
      const collisionChapter = this.sharedState.chapter === "collision";
      const cycle = time % 2300;
      const flash = collisionChapter && edge.flashEligible && cycle < 120 && this.sharedState.motionActive;
      const staticAmount = collisionChapter ? 0.2 + activeAmount * 0.34 : 0.04;
      context.setLineDash([2, 12]);
      context.lineDashOffset = edge.phase * 17;
      context.lineWidth = 0.55 + (flash ? 1.25 : 0);
      context.strokeStyle = flash ? "rgba(223, 180, 92, 0.86)" : `rgba(171, 139, 80, ${staticAmount})`;
      this.strokeCurve(geometry);
      context.setLineDash([]);

      if (flash || (collisionChapter && !this.sharedState.motionActive)) {
        const point = pointOnQuadratic(geometry.start, geometry.control, geometry.end, 0.5 + (edge.phase - 0.5) * 0.24);
        const size = flash ? 4.5 : 2.2;
        context.fillStyle = flash ? "rgba(243, 203, 109, 0.95)" : "rgba(215, 174, 88, 0.55)";
        context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      }

      return flash;
    }

    draw(time) {
      if (!this.context) return;
      const context = this.context;
      const chapter = this.sharedState.chapter;
      const researchAmount = chapter === "research" ? 1 : chapter === "collision" ? 0.75 : 0.24;
      const translationAmount = chapter === "translation" ? 1 : chapter === "collision" ? 0.78 : 0.22;
      const collisionAmount = chapter === "collision" ? 1 : 0;
      let collisionActive = false;

      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, this.width, this.height);
      context.globalCompositeOperation = "source-over";
      context.lineCap = "round";
      context.lineJoin = "round";

      const webglDrawn =
        this.webglLayer &&
        this.webglLayer.render(time, {
          chapter,
          height: this.height,
          offsetLeft: this.offsetLeft,
          offsetTop: this.offsetTop,
          pointer: this.sharedState.pointer,
          quality: this.quality,
          tilt: this.sharedState.tilt,
          width: this.width,
        });
      if (webglDrawn) {
        context.save();
        context.globalCompositeOperation = "screen";
        context.drawImage(this.webglLayer.canvas, 0, 0, this.width, this.height);
        context.restore();
      }

      this.edges.forEach((edge) => {
        const geometry = this.edgeGeometry(edge);
        if (edge.kind === "research") {
          this.drawResearchEdge(edge, geometry, time, researchAmount);
        } else if (edge.kind === "translation") {
          this.drawTranslationEdge(edge, geometry, time, translationAmount);
        } else if (edge.kind === "collision") {
          collisionActive = this.drawCollisionEdge(edge, geometry, time, collisionAmount) || collisionActive;
        } else {
          this.drawOrganicEdge(edge, geometry, time);
        }
      });

      this.nodes.forEach((node) => {
        const isResearch = node.kind === "research";
        const isTranslation = node.kind === "translation";
        const active =
          (isResearch && chapter === "research") ||
          (isTranslation && chapter === "translation") ||
          (chapter === "collision" && (isResearch || isTranslation));
        context.beginPath();
        context.arc(node.x, node.y, node.radius + (active ? 0.55 : 0), 0, TAU);
        if (isResearch) {
          context.fillStyle = `rgba(85, 235, 211, ${active ? 0.62 : 0.2})`;
        } else if (isTranslation) {
          context.fillStyle = `rgba(191, 73, 43, ${active ? 0.64 : 0.2})`;
        } else {
          context.fillStyle = "rgba(222, 214, 190, 0.29)";
        }
        context.fill();
      });

      this.setCollisionState(collisionActive);
      this.drawCalls += 1;
    }

    setCollisionState(active) {
      const shouldActivate = active && this.sharedState.chapter === "collision" && this.sharedState.motionActive;
      if (shouldActivate === this.collisionActive) return;
      this.collisionActive = shouldActivate;
      this.root.classList.toggle("rr-glitch-active", shouldActivate);
      this.root.style.setProperty("--rr-collision-flash", shouldActivate ? "1" : "0");
    }

    adaptQuality(delta) {
      if (!this.sharedState.motionActive || this.sharedState.stableMode) return;
      this.averageFrame = lerp(this.averageFrame, delta, 0.035);
      this.sampledFrames += 1;
      if (this.sampledFrames < 120) return;
      this.sampledFrames = 0;

      if (this.averageFrame > 25 && this.quality > 0) {
        this.quality -= 1;
        this.generate();
      } else if (this.averageFrame < 17.2 && this.quality < 2) {
        this.quality += 1;
        this.generate();
      }
    }

    frame(time) {
      if (!this.running || document.hidden || !this.context) return;
      this.frameCallbacks += 1;
      const rafDelta = this.lastRafTime ? clamp(time - this.lastRafTime, 1, 100) : 16.7;
      this.lastRafTime = time;
      this.adaptQuality(rafDelta);
      const sampleInterval = this.sampleInterval();
      if (sampleInterval > 0 && this.lastSampleTime && time - this.lastSampleTime < sampleInterval - 0.5) {
        this.skippedFrames += 1;
        this.frameHandle = window.requestAnimationFrame(this.frame);
        return;
      }

      const delta = this.lastFrame ? clamp(time - this.lastFrame, 1, 50) : 16.7;
      this.lastFrame = time;
      this.lastSampleTime = time;
      this.updateNodes(time, delta);
      this.sharedState.updateFragments(time, delta);
      if (this.sharedState.pointer.active) {
        const nearest = this.sampleNearestNode(this.sharedState.pointer.x, this.sharedState.pointer.y);
        this.sharedState.updateNearestCursor(nearest);
      }
      this.draw(time);
      this.renderedFrames += 1;
      this.frameHandle = window.requestAnimationFrame(this.frame);
    }

    start() {
      if (!this.context || this.running || this.sharedState.stableMode) return;
      this.running = true;
      this.lastFrame = 0;
      this.lastRafTime = 0;
      this.lastSampleTime = 0;
      this.frameHandle = window.requestAnimationFrame(this.frame);
    }

    stop() {
      this.running = false;
      if (this.frameHandle) {
        window.cancelAnimationFrame(this.frameHandle);
        this.frameHandle = 0;
      }
      this.setCollisionState(false);
    }

    freeze(time = STABLE_FRAME_TIME) {
      this.stop();
      if (this.sharedState.stableMode) {
        const deterministicQuality = this.width < 700 ? 1 : 2;
        if (this.quality !== deterministicQuality) {
          this.quality = deterministicQuality;
          this.generate();
        }
        this.nodes.forEach((node) => {
          node.offsetX = 0;
          node.offsetY = 0;
          node.velocityX = 0;
          node.velocityY = 0;
        });
      }
      this.updateNodes(time, 16.7);
      this.sharedState.updateFragments(time, 16.7, true);
      if (this.sharedState.pointer.active) {
        const nearest = this.sampleNearestNode(this.sharedState.pointer.x, this.sharedState.pointer.y);
        this.sharedState.updateNearestCursor(nearest);
      }
      this.draw(time);
    }

    invalidate() {
      if (!this.context) return;
      if (this.sharedState.motionActive && !this.sharedState.stableMode) {
        this.start();
      } else {
        this.freeze(STABLE_FRAME_TIME);
      }
    }

    handleVisibility() {
      if (document.hidden) {
        this.stop();
      } else {
        this.invalidate();
      }
    }

    snapshotMetrics() {
      const interval = this.sampleInterval();
      let nodeChecksum = 0;
      let fieldEnergy = 0;
      this.nodes.forEach((node, index) => {
        const baseX = node.normalizedX * this.width;
        const baseY = node.normalizedY * this.height;
        nodeChecksum += node.x * (index + 3) * 0.001937 + node.y * (index + 7) * 0.001123;
        fieldEnergy += Math.hypot(node.x - baseX, node.y - baseY);
      });
      fieldEnergy /= Math.max(1, this.nodes.length);
      return {
        frame: {
          callbacks: this.frameCallbacks,
          rendered: this.renderedFrames,
          skipped: this.skippedFrames,
          draws: this.drawCalls,
          webgl: this.webglLayer ? this.webglLayer.renderCount : 0,
          averageMs: Number(this.averageFrame.toFixed(2)),
        },
        sample: {
          quality: this.root.dataset.rrQuality || "unknown",
          intervalMs: Number(interval.toFixed(2)),
          targetFps: interval > 0 ? Math.round(1000 / interval) : 60,
          nodes: this.nodes.length,
          nodeChecksum: Number((nodeChecksum % 100000).toFixed(4)),
          fieldEnergy: Number(fieldEnergy.toFixed(4)),
          webglAlpha: this.webglLayer ? this.webglLayer.sampleAlpha : 0,
          webglFallback: this.webglLayer ? this.webglLayer.fallbackReason : "unavailable",
          contextLost: this.webglLayer ? this.webglLayer.contextLost : false,
        },
        nearest: {
          active: this.nearestSample.active,
          distancePx: this.nearestSample.distance,
          thresholdPx: this.nearestSample.threshold,
          nodeX: this.nearestSample.nodeX,
          nodeY: this.nearestSample.nodeY,
        },
      };
    }
  }

  const initialize = () => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root || root.dataset.rrRuntime === "ready") return;
    root.dataset.rrRuntime = "initializing";
    root.classList.add("rr-js");

    const session = loadSession();
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const canvas = root.querySelector("#rr-field");
    const sections = Array.from(root.querySelectorAll("[data-rr-section]"));
    const fragments = Array.from(root.querySelectorAll("[data-rr-fragment]"));
    const depthLayers = Array.from(root.querySelectorAll("[data-rr-depth]"));
    const motionControls = Array.from(root.querySelectorAll("[data-rr-motion]"));
    const soundControls = Array.from(root.querySelectorAll("[data-rr-sound]"));
    const tiltControls = Array.from(root.querySelectorAll("[data-rr-tilt]"));
    const calligraphy = root.querySelector("[data-rr-calligraphy]");
    const directCharacters = calligraphy ? Array.from(calligraphy.querySelectorAll("[data-rr-calligraphy-char]")) : [];
    const calligraphyCharacters = directCharacters.length
      ? directCharacters.slice(0, 3)
      : calligraphy
        ? Array.from(calligraphy.children).slice(0, 3)
        : [];
    const pageDialog = root.querySelector("#rr-reader");
    let stableMode = detectStableMode(root);
    let motionOverride = session.motionOverride;
    let motionEnabled = motionOverride === null ? !reducedMotionQuery.matches : motionOverride;
    let soundEnabled = session.soundEnabled;
    let lastStoredAt = 0;
    let lastExplorationRecord = 0;
    let activeSection = "";
    let scrollScheduled = false;
    let field = null;
    let audioContext = null;
    let focusReturnTarget = null;
    let tiltListening = false;

    const pointer = {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5,
      previousX: window.innerWidth * 0.5,
      previousY: window.innerHeight * 0.5,
      velocityX: 0,
      velocityY: 0,
      active: false,
      type: "mouse",
      lastMoveAt: 0,
    };

    const tilt = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const fragmentStates = fragments.map((element, index) => {
      const elementRandom = createRandom(FIXED_SEED ^ hashString(`${element.dataset.rrFragment || "fragment"}:${index}`));
      const kind = (element.dataset.rrFragment || "translation").toLowerCase();
      return {
        element,
        kind,
        x: 0,
        y: 0,
        angle: 0,
        depth: 0,
        velocityX: 0,
        velocityY: 0,
        angularVelocity: 0,
        scatterX: (elementRandom() - 0.5) * 2,
        scatterY: (elementRandom() - 0.5) * 2,
        scatterAngle: (elementRandom() - 0.5) * 2,
        phase: elementRandom() * TAU,
        frequency: 0.00015 + elementRandom() * 0.0002,
      };
    });

    const sharedState = {
      pointer,
      tilt,
      chapter: "hero",
      chapterProgress: 0,
      evolution: "clinical",
      mimicTempo: 1,
      motionActive: false,
      stableMode,
      updateFragments: () => {},
      updateNearestCursor: () => {},
    };

    const persistSession = (force = false) => {
      const now = Date.now();
      if (!force && now - lastStoredAt < 700) return;
      lastStoredAt = now;
      session.soundEnabled = soundEnabled;
      session.motionOverride = motionOverride;
      safeSessionStorage.write(session);
    };

    const updateEvolution = () => {
      const count = session.interactionCount;
      const evolution = count >= 16 ? "intrusive" : count >= 5 ? "mimic" : "clinical";
      sharedState.evolution = evolution;
      sharedState.mimicTempo = clamp(1100 / session.gestureInterval, 0.82, 1.2);
      root.dataset.rrEvolution = evolution;
      root.style.setProperty("--rr-mimic-tempo", sharedState.mimicTempo.toFixed(3));
    };

    const recordInteraction = (kind) => {
      const now = Date.now();
      const elapsed = session.lastGestureAt ? now - session.lastGestureAt : 0;
      if (elapsed > 160 && elapsed < 8000) {
        session.gestureInterval = lerp(session.gestureInterval, elapsed, 0.18);
      }
      session.lastGestureAt = now;
      session.interactionCount = clamp(session.interactionCount + (kind === "explore" ? 0.5 : 1), 0, 999);
      updateEvolution();
      persistSession();
    };

    const updateMotionState = () => {
      sharedState.stableMode = stableMode;
      sharedState.motionActive = motionEnabled && !stableMode && !document.hidden;
      root.dataset.rrMotion = sharedState.motionActive ? "full" : "reduced";
      root.dataset.motion = motionEnabled ? "on" : "off";
      root.dataset.rrStable = stableMode ? "true" : "false";
      motionControls.forEach((control) => {
        control.setAttribute("aria-pressed", motionEnabled ? "true" : "false");
        control.setAttribute("aria-label", motionEnabled ? "Turn motion off" : "Turn motion on");
        control.dataset.rrState = motionEnabled ? "on" : "off";
        const output = control.querySelector("output");
        if (output) output.textContent = motionEnabled ? "ON" : "OFF";
      });
      if (field) field.invalidate();
    };

    const updateSoundState = () => {
      root.dataset.rrSound = soundEnabled ? "on" : "off";
      root.dataset.sound = soundEnabled ? "on" : "off";
      soundControls.forEach((control) => {
        control.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
        control.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
        control.dataset.rrState = soundEnabled ? "on" : "off";
        const output = control.querySelector("output");
        if (output) output.textContent = soundEnabled ? "ON" : "MUTED";
      });
      persistSession(true);
    };

    const playFeedback = (frequency = 360) => {
      if (!soundEnabled) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioContext) audioContext = new AudioContextClass();
        if (audioContext.state === "suspended") audioContext.resume();
        const now = audioContext.currentTime;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.018, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
      } catch {
        // Audio feedback is optional and never blocks interaction.
      }
    };

    const chapterDisassembly = (chapter, kind, progress) => {
      const translationKind = kind.includes("translation") || kind.includes("page") || kind.includes("cover");
      const researchKind = kind.includes("research") || kind.includes("interface") || kind.includes("screen");

      if (chapter === "collision") return 1;
      if (chapter === "contact") return 0.06;
      if (researchKind && chapter === "research") return 1 - ease(progress);
      if (translationKind && chapter === "translation") return 1 - ease(progress);
      if (researchKind && chapter === "identity") return 0.7;
      if (translationKind && chapter === "research") return 0.82;
      if (researchKind && chapter === "translation") return 0.54;
      if (chapter === "hero") return researchKind ? 0.82 : 0.94;
      return 0.5;
    };

    const updateFragments = (time, delta, immediate = false) => {
      const chapter = sharedState.chapter;
      const progress = sharedState.chapterProgress;
      const motion = sharedState.motionActive;
      const deltaScale = clamp(delta / 16.7, 0.2, 2.2);
      const maxHorizontal = clamp(window.innerWidth * 0.12, 34, 148);
      const maxVertical = clamp(window.innerHeight * 0.09, 32, 92);

      fragmentStates.forEach((fragment, index) => {
        const translationKind = fragment.kind.includes("translation") || fragment.kind.includes("page") || fragment.kind.includes("cover");
        const disassembly = chapterDisassembly(chapter, fragment.kind, progress);
        const overload = chapter === "collision" ? 1.55 : 1;
        const organicWave = motion
          ? Math.sin(time * fragment.frequency + fragment.phase)
          : Math.sin(STABLE_FRAME_TIME * fragment.frequency + fragment.phase);
        const mechanicalStep = Math.round(organicWave * 2.5) * 2;
        const targetX =
          fragment.scatterX * maxHorizontal * disassembly * overload +
          (translationKind ? organicWave * 3.2 * disassembly : mechanicalStep * disassembly);
        const targetY =
          fragment.scatterY * maxVertical * disassembly * overload +
          (translationKind ? Math.sin(time * fragment.frequency * 0.73 + fragment.phase) * 2.5 * disassembly : 0);
        const targetAngle = fragment.scatterAngle * (translationKind ? 3.2 : 1.35) * disassembly * overload;
        const targetDepth = disassembly * (translationKind ? 0.7 : 0.42);
        const spring = translationKind ? 0.026 : 0.095;
        const damping = translationKind ? 0.9 : 0.76;

        if (immediate || !motion) {
          fragment.x = targetX;
          fragment.y = targetY;
          fragment.angle = targetAngle;
          fragment.depth = targetDepth;
          fragment.velocityX = 0;
          fragment.velocityY = 0;
          fragment.angularVelocity = 0;
        } else {
          fragment.velocityX = (fragment.velocityX + (targetX - fragment.x) * spring * deltaScale) * Math.pow(damping, deltaScale);
          fragment.velocityY = (fragment.velocityY + (targetY - fragment.y) * spring * deltaScale) * Math.pow(damping, deltaScale);
          fragment.angularVelocity =
            (fragment.angularVelocity + (targetAngle - fragment.angle) * spring * 0.7 * deltaScale) * Math.pow(damping, deltaScale);
          fragment.x += fragment.velocityX * deltaScale;
          fragment.y += fragment.velocityY * deltaScale;
          fragment.angle += fragment.angularVelocity * deltaScale;
          fragment.depth = lerp(fragment.depth, targetDepth, spring * 2.5 * deltaScale);
        }

        const releaseOpacity = chapter === "contact" ? (index % 3 === 0 ? 0.16 : 0.3) : 1;
        fragment.element.style.setProperty("--rr-fragment-x", `${fragment.x.toFixed(2)}px`);
        fragment.element.style.setProperty("--rr-fragment-y", `${fragment.y.toFixed(2)}px`);
        fragment.element.style.setProperty("--rr-fragment-angle", `${fragment.angle.toFixed(3)}deg`);
        fragment.element.style.setProperty("--rr-fragment-depth", fragment.depth.toFixed(3));
        fragment.element.style.setProperty("--rr-fragment-opacity", releaseOpacity.toFixed(2));
        fragment.element.classList.toggle("rr-is-assembled", disassembly < 0.12);
      });

      tilt.x = lerp(tilt.x, tilt.targetX, motion ? 0.045 * deltaScale : 1);
      tilt.y = lerp(tilt.y, tilt.targetY, motion ? 0.045 * deltaScale : 1);
      root.style.setProperty("--rr-tilt-x", tilt.x.toFixed(3));
      root.style.setProperty("--rr-tilt-y", tilt.y.toFixed(3));
    };
    sharedState.updateFragments = updateFragments;

    const updateCalligraphy = () => {
      if (!calligraphyCharacters.length) return;
      const factors = {
        hero: 0,
        identity: 0.12,
        research: 0.42,
        translation: 0.68,
        collision: 1,
        contact: 0.08,
      };
      const baseFactor = factors[sharedState.chapter] ?? 0.2;
      const factor = baseFactor * ease(sharedState.chapterProgress);
      const compactScale = window.innerWidth < 700 ? 0.7 : 1;
      const offsets = [
        [-13, -5],
        [10, 2],
        [-5, 13],
      ];

      calligraphyCharacters.forEach((character, index) => {
        const [offsetX, offsetY] = offsets[index] || [0, 0];
        character.style.setProperty("--rr-char-x", `${(offsetX * factor * compactScale).toFixed(2)}px`);
        character.style.setProperty("--rr-char-y", `${(offsetY * factor * compactScale).toFixed(2)}px`);
      });
      calligraphy.classList.toggle("rr-is-reterritorialized", factor < 0.08);
    };

    const updateDepthLayers = () => {
      const pointerX = clamp(pointer.x / Math.max(1, window.innerWidth) - 0.5, -0.5, 0.5);
      const pointerY = clamp(pointer.y / Math.max(1, window.innerHeight) - 0.5, -0.5, 0.5);
      depthLayers.forEach((layer, index) => {
        const depth = clamp(Number(layer.dataset.rrDepth) || (index % 5) + 1, 0, 8);
        const scale = sharedState.motionActive ? depth * 1.3 : 0;
        layer.style.setProperty("--rr-depth-x", `${(pointerX * scale).toFixed(2)}px`);
        layer.style.setProperty("--rr-depth-y", `${(pointerY * scale).toFixed(2)}px`);
      });
    };

    const normalizeChapter = (element) => {
      const raw = (element.dataset.rrSection || element.id || "section").toLowerCase();
      if (raw.includes("hero")) return "hero";
      if (raw.includes("identity") || raw.includes("about") || raw.includes("skill")) return "identity";
      if (raw.includes("research") || raw.includes("rhizome")) return "research";
      if (raw.includes("translation") || raw.includes("archive")) return "translation";
      if (raw.includes("collision") || raw.includes("intersection")) return "collision";
      if (raw.includes("contact") || raw.includes("exit")) return "contact";
      return raw.replace(/[^a-z0-9_-]/g, "") || "section";
    };

    const updateScrollState = () => {
      scrollScheduled = false;
      if (!sections.length) return;
      if (field) field.updateOffset();
      const viewportHeight = Math.max(1, window.innerHeight);
      const center = viewportHeight * 0.48;
      let closest = null;

      sections.forEach((section) => {
        const bounds = section.getBoundingClientRect();
        const distance = Math.abs((bounds.top + bounds.bottom) * 0.5 - center);
        const visible = bounds.bottom > 0 && bounds.top < viewportHeight;
        section.classList.toggle("rr-is-visible", visible);
        if (!closest || distance < closest.distance) closest = { section, bounds, distance };
      });

      if (!closest) return;
      const chapter = normalizeChapter(closest.section);
      const progress = clamp((center - closest.bounds.top) / Math.max(1, closest.bounds.height), 0, 1);
      const pageScrollable = Math.max(1, document.documentElement.scrollHeight - viewportHeight);
      const pageProgress = clamp(window.scrollY / pageScrollable, 0, 1);
      sharedState.chapter = chapter;
      sharedState.chapterProgress = progress;
      root.dataset.rrChapter = chapter;
      root.dataset.phase = chapter === "contact" ? "release" : chapter;
      root.style.setProperty("--rr-chapter-progress", progress.toFixed(4));
      root.style.setProperty("--rr-scroll-progress", pageProgress.toFixed(4));
      root.classList.toggle("is-fragmented", chapter === "collision");

      const interfaceAssembly = root.querySelector(".rr-interface");
      const bookAssemblies = Array.from(root.querySelectorAll(".rr-book"));
      const collisionField = root.querySelector("[data-rr-collision]");
      if (interfaceAssembly) interfaceAssembly.classList.toggle("is-fragmented", chapter === "collision");
      bookAssemblies.forEach((book) => book.classList.toggle("is-fragmented", chapter === "collision"));
      if (collisionField) {
        collisionField.classList.toggle("is-overloaded", chapter === "collision" && progress > 0.18 && progress < 0.82);
      }

      sections.forEach((section) => section.classList.toggle("rr-is-active", section === closest.section));

      if (chapter !== activeSection) {
        activeSection = chapter;
        recordInteraction("chapter");
        const status = root.querySelector("[data-rr-status]");
        const readout = root.querySelector("[data-rr-sample-readout]");
        const message = `FIELD / ${chapter.toUpperCase()} / ${sharedState.evolution.toUpperCase()}`;
        if (status) status.textContent = message;
        if (readout) readout.textContent = message;
      }

      updateCalligraphy();
      updateDepthLayers();
      updateFragments(stableMode ? STABLE_FRAME_TIME : performance.now(), 16.7, stableMode || !sharedState.motionActive);
      if (field && !sharedState.motionActive) field.freeze(STABLE_FRAME_TIME);
    };

    const requestScrollUpdate = () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      window.requestAnimationFrame(updateScrollState);
    };

    const createCursor = () => {
      if (!finePointerQuery.matches) return null;
      const existing = root.querySelector("[data-rr-cursor], .rr-cursor");
      if (existing) {
        existing.hidden = false;
        return existing;
      }
      const cursor = document.createElement("div");
      cursor.className = "rr-cursor";
      cursor.dataset.mode = "probe";
      cursor.setAttribute("aria-hidden", "true");
      cursor.innerHTML = '<span class="rr-cursor__reticle"></span>';
      root.append(cursor);
      return cursor;
    };

    let cursor = createCursor();
    let lastPointerTarget = root;
    const updateCursorMode = (target, nearestSample = null) => {
      if (!cursor) return;
      let mode = "probe";
      if (target instanceof Element) {
        if (target.closest("[data-rr-open-reader], [data-rr-page-open], [data-rr-readable], #rr-reader")) {
          mode = "read";
        } else if (target.closest("a, button, input, summary, [role='button']")) {
          mode = "action";
        } else if ((nearestSample && nearestSample.active) || target.closest("[data-rr-node]")) {
          mode = "sample";
        }
      }
      cursor.dataset.mode = mode;
      cursor.classList.toggle("is-node", mode === "sample");
      cursor.classList.toggle("is-reader", mode === "read");
      root.dataset.rrCursor = mode;
      const label = cursor.querySelector("[data-rr-cursor-label], output");
      if (label) {
        label.textContent = {
          action: "ACTUATE",
          read: "FOCUS",
          sample: "SAMPLE",
          probe: "PROBE",
        }[mode];
      }
    };
    sharedState.updateNearestCursor = (nearestSample) => {
      updateCursorMode(lastPointerTarget, nearestSample);
    };

    const moveCursor = (clientX, clientY) => {
      if (!cursor) return;
      cursor.style.setProperty("--rr-cursor-x", `${clientX.toFixed(1)}px`);
      cursor.style.setProperty("--rr-cursor-y", `${clientY.toFixed(1)}px`);
      cursor.style.left = `${clientX.toFixed(1)}px`;
      cursor.style.top = `${clientY.toFixed(1)}px`;
      cursor.classList.add("is-visible");
    };

    const createTouchRipple = (clientX, clientY) => {
      if (!coarsePointerQuery.matches) return;
      const ripple = document.createElement("span");
      ripple.className = "rr-touch-ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.setProperty("--rr-touch-x", `${clientX}px`);
      ripple.style.setProperty("--rr-touch-y", `${clientY}px`);
      ripple.style.left = `${clientX}px`;
      ripple.style.top = `${clientY}px`;
      root.append(ripple);
      window.requestAnimationFrame(() => ripple.classList.add("is-active"));
      window.setTimeout(() => ripple.remove(), 720);
    };

    const updatePointer = (event) => {
      const now = performance.now();
      const elapsed = Math.max(8, now - (pointer.lastMoveAt || now - 16));
      pointer.previousX = pointer.x;
      pointer.previousY = pointer.y;
      pointer.x = clamp(event.clientX, 0, window.innerWidth);
      pointer.y = clamp(event.clientY, 0, window.innerHeight);
      pointer.velocityX = lerp(pointer.velocityX, ((pointer.x - pointer.previousX) / elapsed) * 16.7, 0.28);
      pointer.velocityY = lerp(pointer.velocityY, ((pointer.y - pointer.previousY) / elapsed) * 16.7, 0.28);
      pointer.active = true;
      pointer.type = event.pointerType || "mouse";
      pointer.lastMoveAt = now;
      lastPointerTarget = event.target;
      moveCursor(pointer.x, pointer.y);
      updateDepthLayers();

      if (now - lastExplorationRecord > 850) {
        lastExplorationRecord = now;
        recordInteraction("explore");
      }

      if (field && !sharedState.motionActive) {
        field.updateNodes(STABLE_FRAME_TIME, 16.7);
        field.draw(STABLE_FRAME_TIME);
      }
      const nearestSample = field ? field.sampleNearestNode(pointer.x, pointer.y) : null;
      updateCursorMode(event.target, nearestSample);
    };

    const handlePointerDown = (event) => {
      updatePointer(event);
      recordInteraction("gesture");
      createTouchRipple(event.clientX, event.clientY);
    };

    const handlePointerLeave = (event) => {
      if (event.pointerType === "mouse") pointer.active = false;
      if (field) field.clearNearestSample();
      if (cursor) {
        cursor.classList.add("rr-cursor--outside");
        cursor.classList.remove("is-visible");
      }
    };

    const handlePointerEnter = () => {
      if (cursor) {
        cursor.classList.remove("rr-cursor--outside");
        cursor.classList.add("is-visible");
      }
    };

    const setupControls = () => {
      motionControls.forEach((control) => {
        control.addEventListener("click", () => {
          motionEnabled = !motionEnabled;
          motionOverride = motionEnabled;
          session.motionOverride = motionOverride;
          recordInteraction("control");
          updateMotionState();
          persistSession(true);
          playFeedback(motionEnabled ? 440 : 280);
        });
      });

      soundControls.forEach((control) => {
        control.addEventListener("click", () => {
          soundEnabled = !soundEnabled;
          session.soundEnabled = soundEnabled;
          recordInteraction("control");
          updateSoundState();
          if (soundEnabled) playFeedback(520);
        });
      });
    };

    const setupDialog = () => {
      if (!pageDialog) return;
      const dialogImage = pageDialog.querySelector("[data-rr-reader-image]");
      const dialogSource = pageDialog.querySelector("[data-rr-reader-source]");
      const dialogTitle = pageDialog.querySelector("[data-rr-reader-title]");
      const dialogCount = pageDialog.querySelector("[data-rr-reader-count]");
      const closeControls = Array.from(pageDialog.querySelectorAll("[data-rr-reader-close], [data-rr-reader-close-button]"));
      const triggers = Array.from(root.querySelectorAll("[data-rr-open-reader], [data-rr-page-open]"));

      const closeDialog = () => {
        if (typeof pageDialog.close === "function" && pageDialog.open) {
          pageDialog.close();
        } else {
          pageDialog.removeAttribute("open");
          pageDialog.setAttribute("aria-hidden", "true");
          document.body.classList.remove("rr-reader-open");
          if (focusReturnTarget && typeof focusReturnTarget.focus === "function") focusReturnTarget.focus({ preventScroll: true });
        }
      };

      const openDialog = (trigger) => {
        const sourceImage = trigger.querySelector("img");
        const source = trigger.dataset.rrPageSrc || trigger.getAttribute("href") || (sourceImage ? sourceImage.currentSrc || sourceImage.src : "");
        const webpSource = trigger.dataset.rrPageWebp || "";
        const title = trigger.dataset.rrPageTitle || trigger.dataset.rrPageAlt || (sourceImage ? sourceImage.alt : "") || "书页阅读态";
        if (!source || !dialogImage) return;

        focusReturnTarget = trigger;
        dialogImage.src = source;
        dialogImage.alt = trigger.dataset.rrPageAlt || title;
        if (dialogSource) {
          if (webpSource) {
            dialogSource.srcset = webpSource;
          } else {
            dialogSource.removeAttribute("srcset");
          }
        }
        if (dialogTitle) dialogTitle.textContent = title;
        if (dialogCount) {
          const pageIndex = Math.max(0, triggers.indexOf(trigger));
          dialogCount.textContent = `${String(pageIndex + 1).padStart(2, "0")} / ${String(triggers.length).padStart(2, "0")}`;
        }
        pageDialog.setAttribute("aria-hidden", "false");
        document.body.classList.add("rr-reader-open");
        if (typeof pageDialog.showModal === "function") {
          if (!pageDialog.open) pageDialog.showModal();
        } else {
          pageDialog.setAttribute("open", "");
          pageDialog.setAttribute("role", "dialog");
          pageDialog.setAttribute("aria-modal", "true");
        }
        const initialFocus = closeControls[0] || pageDialog;
        window.requestAnimationFrame(() => initialFocus.focus({ preventScroll: true }));
        recordInteraction("reader");
        playFeedback(410);
      };

      triggers.forEach((trigger) => {
        if (!trigger.matches("button, a, input, [role='button']")) {
          trigger.setAttribute("role", "button");
          if (!trigger.hasAttribute("tabindex")) trigger.tabIndex = 0;
        }
        trigger.addEventListener("click", (event) => {
          event.preventDefault();
          openDialog(trigger);
        });
        trigger.addEventListener("keydown", (event) => {
          if (trigger.matches("button, a, input")) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openDialog(trigger);
          }
        });
      });

      closeControls.forEach((control) => control.addEventListener("click", closeDialog));
      pageDialog.addEventListener("click", (event) => {
        if (event.target === pageDialog) closeDialog();
      });
      pageDialog.addEventListener("close", () => {
        document.body.classList.remove("rr-reader-open");
        pageDialog.setAttribute("aria-hidden", "true");
        if (focusReturnTarget && typeof focusReturnTarget.focus === "function") {
          focusReturnTarget.focus({ preventScroll: true });
        }
      });
      pageDialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && typeof pageDialog.close !== "function") {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          pageDialog.querySelectorAll(
            "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
          )
        ).filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) {
          event.preventDefault();
          pageDialog.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    };

    const handleOrientation = (event) => {
      const gamma = clamp(Number(event.gamma) || 0, -24, 24) / 24;
      const beta = clamp((Number(event.beta) || 0) - 35, -30, 30) / 30;
      tilt.targetX = gamma;
      tilt.targetY = beta;
      root.style.setProperty("--rr-tilt-input-x", gamma.toFixed(3));
      root.style.setProperty("--rr-tilt-input-y", beta.toFixed(3));
    };

    const setTiltState = (state) => {
      root.dataset.rrTilt = state;
      const labels = {
        available: ["READY", "Enable device tilt"],
        denied: ["DENIED", "Device tilt permission denied"],
        enabled: ["ON", "Disable device tilt"],
        unavailable: ["UNAVAILABLE", "Device tilt unavailable"],
      };
      const [outputText, ariaLabel] = labels[state] || labels.available;
      tiltControls.forEach((control) => {
        control.setAttribute("aria-pressed", state === "enabled" ? "true" : "false");
        control.setAttribute("aria-label", ariaLabel);
        control.disabled = state === "unavailable" || state === "denied";
        const output = control.querySelector("output");
        if (output) output.textContent = outputText;
      });
    };

    const enableTilt = async () => {
      if (tiltListening) return true;
      if (typeof window.DeviceOrientationEvent === "undefined") {
        setTiltState("unavailable");
        return false;
      }

      try {
        if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
          const permission = await window.DeviceOrientationEvent.requestPermission();
          if (permission !== "granted") {
            setTiltState("denied");
            return false;
          }
        }
        window.addEventListener("deviceorientation", handleOrientation, { passive: true });
        tiltListening = true;
        setTiltState("enabled");
        return true;
      } catch {
        setTiltState("denied");
        return false;
      }
    };

    const disableTilt = () => {
      if (!tiltListening) return;
      window.removeEventListener("deviceorientation", handleOrientation);
      tiltListening = false;
      tilt.targetX = 0;
      tilt.targetY = 0;
      setTiltState("available");
    };

    const setupTilt = () => {
      if (!tiltControls.length) {
        root.dataset.rrTilt = typeof window.DeviceOrientationEvent === "undefined" ? "unavailable" : "available";
        return;
      }
      setTiltState(typeof window.DeviceOrientationEvent === "undefined" ? "unavailable" : "available");
      tiltControls.forEach((control) => {
        control.addEventListener("click", async () => {
          recordInteraction("control");
          if (tiltListening) {
            disableTilt();
            playFeedback(300);
            return;
          }
          const enabled = await enableTilt();
          playFeedback(enabled ? 470 : 240);
        });
      });
    };

    const handleReducedMotionChange = (event) => {
      if (motionOverride !== null) return;
      motionEnabled = !event.matches;
      updateMotionState();
    };

    const handlePointerCapabilityChange = () => {
      if (finePointerQuery.matches && !cursor) {
        cursor = createCursor();
        root.classList.add("rr-cursor-enabled");
      } else if (!finePointerQuery.matches && cursor) {
        cursor.hidden = true;
        cursor = null;
        root.dataset.rrCursor = "touch";
        root.classList.remove("rr-cursor-enabled");
      }
    };

    root.dataset.rrWebgl = "pending";
    root.dataset.rrRenderer = "2d-fallback";
    updateEvolution();
    setupControls();
    setupDialog();
    setupTilt();
    updateSoundState();

    if (canvas) {
      field = new RhizomeField(canvas, root, sharedState);
      if (!field.available) field = null;
    } else {
      root.dataset.rrRenderer = "no-canvas";
    }

    root.addEventListener("pointermove", updatePointer, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    root.addEventListener("pointerenter", handlePointerEnter, { passive: true });
    window.addEventListener("scroll", requestScrollUpdate, { passive: true });
    window.addEventListener("resize", requestScrollUpdate, { passive: true });

    if (typeof reducedMotionQuery.addEventListener === "function") {
      reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
      finePointerQuery.addEventListener("change", handlePointerCapabilityChange);
    } else {
      reducedMotionQuery.addListener(handleReducedMotionChange);
      finePointerQuery.addListener(handlePointerCapabilityChange);
    }

    const freeze = (time = STABLE_FRAME_TIME) => {
      stableMode = true;
      sharedState.stableMode = true;
      root.dataset.rrStable = "true";
      updateMotionState();
      updateScrollState();
      if (field) field.freeze(Number.isFinite(time) ? time : STABLE_FRAME_TIME);
    };

    const unfreeze = () => {
      stableMode = false;
      sharedState.stableMode = false;
      updateMotionState();
      requestScrollUpdate();
    };

    let stabilizerObserver = null;
    const observeVisualStabilizer = () => {
      if (stableMode || typeof window.MutationObserver !== "function") return;
      stabilizerObserver = new window.MutationObserver(() => {
        if (!document.getElementById("__alfolio_visual_stabilize")) return;
        stabilizerObserver.disconnect();
        stabilizerObserver = null;
        freeze(STABLE_FRAME_TIME);
      });
      stabilizerObserver.observe(document.head || document.documentElement, { childList: true, subtree: true });
    };

    window.__RR_VISUAL_API__ = Object.freeze({
      freeze,
      unfreeze,
      renderAt(time = STABLE_FRAME_TIME) {
        if (!field) return;
        field.freeze(Number.isFinite(time) ? time : STABLE_FRAME_TIME);
      },
      snapshot() {
        const metrics = field
          ? field.snapshotMetrics()
          : {
              frame: {
                callbacks: 0,
                rendered: 0,
                skipped: 0,
                draws: 0,
                webgl: 0,
                averageMs: 0,
              },
              sample: {
                quality: "unavailable",
                intervalMs: 0,
                targetFps: 0,
                nodes: 0,
                nodeChecksum: 0,
                fieldEnergy: 0,
                webglAlpha: 0,
                webglFallback: "no-canvas",
                contextLost: false,
              },
              nearest: {
                active: false,
                distancePx: null,
                thresholdPx: 0,
                nodeX: null,
                nodeY: null,
              },
            };
        return {
          chapter: sharedState.chapter,
          evolution: sharedState.evolution,
          motion: root.dataset.rrMotion,
          renderer: root.dataset.rrRenderer,
          stable: root.dataset.rrStable,
          frame: metrics.frame,
          sample: metrics.sample,
          nearest: metrics.nearest,
          tilt: {
            enabled: tiltListening,
            x: Number(tilt.x.toFixed(3)),
            y: Number(tilt.y.toFixed(3)),
            targetX: Number(tilt.targetX.toFixed(3)),
            targetY: Number(tilt.targetY.toFixed(3)),
          },
        };
      },
    });

    window.addEventListener("rr:visual-freeze", (event) => freeze(event.detail && event.detail.time));
    observeVisualStabilizer();
    updateMotionState();
    updateScrollState();
    root.classList.add("rr-ready");
    root.classList.toggle("rr-cursor-enabled", finePointerQuery.matches);
    root.dataset.rrRuntime = "ready";
    window.__RENAISSANCE_RHIZOME_READY__ = true;
    window.dispatchEvent(new CustomEvent("rr:ready"));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
