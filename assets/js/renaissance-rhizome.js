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
      fidelityMode: "auto",
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
        fidelityMode: ["auto", "3", "2", "1"].includes(String(parsed.fidelityMode)) ? String(parsed.fidelityMode) : "auto",
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

  const prepareScrollVisualAssets = (root) => {
    const images = Array.from(root.querySelectorAll(".rr-translation img, .rr-collision img"));
    if (!images.length) return Promise.resolve();

    const decodes = images.map((image) => {
      image.loading = "eager";
      image.fetchPriority = "low";
      if (typeof image.decode !== "function") return Promise.resolve();
      return image.decode().catch(() => undefined);
    });
    return Promise.race([Promise.allSettled(decodes), new Promise((resolve) => window.setTimeout(resolve, 4000))]);
  };

  class FrameScheduler {
    constructor(root) {
      this.root = root;
      this.measureCallbacks = new Map();
      this.callbacks = new Map();
      this.dirty = new Set(["viewportDirty", "resizeDirty"]);
      this.frameHandle = 0;
      this.runningFrame = false;
      this.lastTime = 0;
      this.frameCount = 0;
      this.recentFrameIntervals = [];
      this.recentWorkDurations = [];
      this.callbackDurations = new Map();
      this.refreshSamples = [];
      this.refreshSampleTick = 0;
      this.refreshHz = 60;
      this.refreshMeasured = false;
      this.boundFrame = this.frame.bind(this);
    }

    register(name, callback) {
      this.callbacks.set(name, callback);
      return () => this.callbacks.delete(name);
    }

    registerMeasure(name, callback) {
      this.measureCallbacks.set(name, callback);
      return () => this.measureCallbacks.delete(name);
    }

    wake(flag = "viewportDirty") {
      this.dirty.add(flag);
      if (!this.frameHandle && !this.runningFrame && !document.hidden) {
        this.frameHandle = window.requestAnimationFrame(this.boundFrame);
      }
    }

    stop() {
      if (this.frameHandle) {
        window.cancelAnimationFrame(this.frameHandle);
        this.frameHandle = 0;
      }
      this.lastTime = 0;
    }

    sampleRefresh(delta) {
      // Keep converging when a software compositor briefly delivers 20-30 Hz.
      // Very large stalls are still excluded so a single long task cannot be
      // mistaken for the panel refresh rate.
      if (delta < 3 || delta > 125) return;
      this.refreshSamples.push(delta);
      if (this.refreshSamples.length > 120) this.refreshSamples.shift();
      if (this.refreshSamples.length < 18) return;
      this.refreshSampleTick += 1;
      if (this.refreshSampleTick % 9 !== 0) return;
      const ordered = [...this.refreshSamples].sort((first, second) => first - second);
      const start = Math.floor(ordered.length * 0.15);
      const end = Math.max(start + 1, Math.ceil(ordered.length * 0.85));
      const middle = ordered.slice(start, end);
      const median = middle[Math.floor(middle.length * 0.5)];
      const measured = clamp(1000 / Math.max(1, median), 30, 360);
      this.refreshHz = lerp(this.refreshHz, measured, this.refreshMeasured ? 0.12 : 1);
      this.refreshMeasured = true;
    }

    frame(time) {
      const workStartedAt = performance.now();
      this.frameHandle = 0;
      if (document.hidden) {
        this.stop();
        return;
      }

      this.runningFrame = true;
      this.frameCount += 1;
      const delta = this.lastTime ? clamp(time - this.lastTime, 1, 100) : 16.7;
      if (this.lastTime) {
        this.sampleRefresh(delta);
        this.recentFrameIntervals.push(delta);
        if (this.recentFrameIntervals.length > 180) this.recentFrameIntervals.shift();
      }
      this.lastTime = time;
      const dirty = new Set(this.dirty);
      this.dirty.clear();
      let continueAnimating = false;

      this.measureCallbacks.forEach((callback, name) => {
        const startedAt = performance.now();
        try {
          callback(time, delta, dirty);
        } catch {
          // Measurement failures are isolated to their decorative subsystem.
        }
        this.recordCallbackDuration(`measure:${name}`, performance.now() - startedAt);
      });

      this.callbacks.forEach((callback, name) => {
        const startedAt = performance.now();
        try {
          continueAnimating = callback(time, delta, dirty) === true || continueAnimating;
        } catch {
          // A decorative subsystem must never stop navigation or reading.
        }
        this.recordCallbackDuration(name, performance.now() - startedAt);
      });

      this.runningFrame = false;
      this.recentWorkDurations.push(performance.now() - workStartedAt);
      if (this.recentWorkDurations.length > 180) this.recentWorkDurations.shift();
      if (continueAnimating || this.dirty.size) {
        this.frameHandle = window.requestAnimationFrame(this.boundFrame);
      }
    }

    recordCallbackDuration(name, duration) {
      const samples = this.callbackDurations.get(name) || [];
      samples.push(duration);
      if (samples.length > 180) samples.shift();
      this.callbackDurations.set(name, samples);
    }

    resetPerformanceWindow() {
      this.recentFrameIntervals.length = 0;
      this.recentWorkDurations.length = 0;
      this.callbackDurations.clear();
    }

    snapshot() {
      const orderedIntervals = [...this.recentFrameIntervals].sort((first, second) => first - second);
      const p90Index = Math.min(orderedIntervals.length - 1, Math.floor(orderedIntervals.length * 0.9));
      const orderedWork = [...this.recentWorkDurations].sort((first, second) => first - second);
      const workP90Index = Math.min(orderedWork.length - 1, Math.floor(orderedWork.length * 0.9));
      const callbackWork = {};
      this.callbackDurations.forEach((samples, name) => {
        const ordered = [...samples].sort((first, second) => first - second);
        const callbackP90Index = Math.min(ordered.length - 1, Math.floor(ordered.length * 0.9));
        callbackWork[name] = {
          p90Ms: ordered.length ? Number(ordered[callbackP90Index].toFixed(2)) : null,
          maxMs: ordered.length ? Number(ordered[ordered.length - 1].toFixed(2)) : null,
        };
      });
      return {
        frames: this.frameCount,
        dirty: Array.from(this.dirty),
        refreshHz: Number(this.refreshHz.toFixed(2)),
        refreshMeasured: this.refreshMeasured,
        scheduled: Boolean(this.frameHandle),
        cadence: {
          samples: orderedIntervals.length,
          p90Ms: orderedIntervals.length ? Number(orderedIntervals[p90Index].toFixed(2)) : null,
        },
        work: {
          samples: orderedWork.length,
          p90Ms: orderedWork.length ? Number(orderedWork[workP90Index].toFixed(2)) : null,
          maxMs: orderedWork.length ? Number(orderedWork[orderedWork.length - 1].toFixed(2)) : null,
        },
        callbackWork,
      };
    }
  }

  class FidelityController {
    constructor(root, scheduler, session, persist) {
      this.root = root;
      this.scheduler = scheduler;
      this.session = session;
      this.persist = persist;
      this.mode = ["auto", "3", "2", "1"].includes(session.fidelityMode) ? session.fidelityMode : "auto";
      this.level = this.mode === "auto" ? 3 : Number(this.mode);
      this.costSamples = [];
      this.longTaskPressure = 0;
      this.overBudgetWindows = 0;
      this.underBudgetWindows = 0;
      this.softwareRendererFallback = false;
      this.listeners = new Set();
      this.controls = Array.from(root.querySelectorAll("[data-rr-fidelity]"));
      this.readout = root.querySelector("[data-rr-fidelity-readout]");
      this.longTaskObserver = null;
      if (typeof window.PerformanceObserver === "function") {
        try {
          this.longTaskObserver = new window.PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => {
              if (entry.duration > 50) this.longTaskPressure += 1;
            });
          });
          this.longTaskObserver.observe({ type: "longtask", buffered: true });
        } catch {
          this.longTaskObserver = null;
        }
      }
      this.setupControls();
      this.updateUI();
    }

    setupControls() {
      this.controls.forEach((control) => {
        control.addEventListener("click", () => {
          const mode = String(control.dataset.rrFidelity || "auto");
          if (!["auto", "3", "2", "1"].includes(mode)) return;
          this.setMode(mode);
        });
      });
    }

    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    setSoftwareRendererFallback(active) {
      const nextActive = Boolean(active);
      if (nextActive === this.softwareRendererFallback) return;
      this.softwareRendererFallback = nextActive;
      this.costSamples.length = 0;
      this.longTaskPressure = 0;
      this.overBudgetWindows = 0;
      this.underBudgetWindows = 0;
      this.emitChange();
      this.scheduler.wake("resizeDirty");
    }

    setMode(mode) {
      const nextMode = ["auto", "3", "2", "1"].includes(mode) ? mode : "auto";
      const previousMode = this.mode;
      const previousLevel = this.level;
      this.mode = nextMode;
      if (nextMode !== "auto") this.level = Number(nextMode);
      this.session.fidelityMode = nextMode;
      this.costSamples.length = 0;
      this.longTaskPressure = 0;
      this.overBudgetWindows = 0;
      this.underBudgetWindows = 0;
      this.updateUI();
      this.persist(true);
      if (this.level !== previousLevel || nextMode !== previousMode || nextMode === "auto") this.emitChange();
      this.scheduler.wake("resizeDirty");
    }

    profile() {
      const compact = window.innerWidth < 700;
      const levelIndex = clamp(this.level - 1, 0, 2);
      const nodeCounts = compact ? [34, 44, 56] : [52, 72, 92];
      const dprCaps = compact ? [1, 1.25, 1.5] : [1, 1.5, 2];
      const resolutionScales = [0.5, 0.75, 1];
      const refresh = this.scheduler.refreshMeasured ? this.scheduler.refreshHz : 60;
      const multiplier = [0.5, 0.75, 1][levelIndex];
      const softwareConstrained = this.softwareRendererFallback && this.mode === "auto";
      const softwareNodeCaps = compact ? [24, 30, 36] : [28, 36, 44];
      const softwareTargetCaps = [24, 27, 30];
      return {
        level: this.level,
        nodeCount: softwareConstrained ? Math.min(nodeCounts[levelIndex], softwareNodeCaps[levelIndex]) : nodeCounts[levelIndex],
        dprCap: softwareConstrained ? Math.min(dprCaps[levelIndex], 1) : dprCaps[levelIndex],
        resolutionScale: softwareConstrained ? Math.min(resolutionScales[levelIndex], 0.25) : resolutionScales[levelIndex],
        targetHz: softwareConstrained
          ? Math.min(Math.max(15, refresh * multiplier), softwareTargetCaps[levelIndex])
          : Math.max(15, refresh * multiplier),
        refreshHz: refresh,
        softwareConstrained,
      };
    }

    observePerformance(cost, interval) {
      if (this.mode !== "auto" || !Number.isFinite(cost) || !Number.isFinite(interval)) return;
      this.costSamples.push({ cost, interval });
      if (this.costSamples.length < 18) return;
      const samples = this.costSamples.splice(0);
      const averageCost = samples.reduce((sum, sample) => sum + sample.cost, 0) / samples.length;
      const intervals = samples.map((sample) => sample.interval).sort((first, second) => first - second);
      const p90Interval = intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.9))];
      this.costSamples.length = 0;
      const budget = 1000 / Math.max(30, this.scheduler.refreshHz);
      const targetInterval = 1000 / Math.max(15, this.profile().targetHz);
      const overBudget = averageCost > budget * 0.92 || p90Interval > targetInterval * 1.5 || this.longTaskPressure > 1;
      const underBudget = averageCost < budget * 0.48 && p90Interval < targetInterval * 1.12 && this.longTaskPressure === 0;
      this.longTaskPressure = 0;
      this.overBudgetWindows = overBudget ? this.overBudgetWindows + 1 : 0;
      this.underBudgetWindows = underBudget ? this.underBudgetWindows + 1 : 0;
      if (this.overBudgetWindows >= 2 && this.level > 1) {
        this.level -= 1;
        this.overBudgetWindows = 0;
        this.underBudgetWindows = 0;
        this.emitChange();
      } else if (this.underBudgetWindows >= 6 && this.level < 3) {
        this.level += 1;
        this.overBudgetWindows = 0;
        this.underBudgetWindows = 0;
        this.emitChange();
      } else {
        this.updateUI();
      }
    }

    emitChange() {
      this.updateUI();
      this.listeners.forEach((listener) => listener(this.profile()));
    }

    updateUI() {
      const roman = { 1: "I", 2: "II", 3: "III" }[this.level];
      const profile = this.profile();
      this.root.dataset.rrFidelityMode = this.mode;
      this.root.dataset.rrFidelityLevel = String(this.level);
      this.root.dataset.rrQuality = { 1: "low", 2: "medium", 3: "high" }[this.level];
      this.root.dataset.rrLayerBudget = { 1: "full-i", 2: "full-ii", 3: "full-iii" }[this.level];
      this.root.dataset.rrRenderProfile = profile.softwareConstrained ? "software-auto" : "standard";
      this.root.dataset.rrSampleRate = String(Math.round(profile.targetHz));
      this.root.style.setProperty("--rr-fidelity-resolution", profile.resolutionScale.toFixed(2));
      this.controls.forEach((control) => {
        const active = String(control.dataset.rrFidelity) === this.mode;
        control.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (this.readout) {
        const nextText = this.scheduler.refreshMeasured ? `${roman} / ${Math.round(profile.targetHz)} Hz` : `${roman} / measuring Hz`;
        if (this.readout.textContent !== nextText) this.readout.textContent = nextText;
      }
    }
  }

  class AssemblyController {
    constructor(root, scheduler, sharedState, fidelity) {
      this.root = root;
      this.scheduler = scheduler;
      this.sharedState = sharedState;
      this.fidelity = fidelity;
      this.components = Array.from(root.querySelectorAll("[data-rr-assembly]")).map((element, componentIndex) => {
        const fragments = Array.from(element.querySelectorAll("[data-rr-assembly-fragment]")).map((fragment, fragmentIndex) => {
          const random = createRandom(FIXED_SEED ^ hashString(`assembly:${componentIndex}:${fragmentIndex}`));
          return {
            element: fragment,
            scatterX: (random() - 0.5) * 2,
            scatterY: (random() - 0.5) * 2,
            scatterAngle: (random() - 0.5) * 2,
            values: { x: Number.NaN, y: Number.NaN, angle: Number.NaN, depth: Number.NaN, opacity: Number.NaN },
          };
        });
        return {
          element,
          anchor:
            element.dataset.rrAssemblyKind === "book"
              ? element.querySelector(".rr-book__cover") || element
              : element.querySelector(".rr-interface__master") || element,
          fragments,
          state: "unseen",
          settledEver: false,
          visible: false,
          rect: null,
          progress: 0,
          disturbance: 0,
          disturbedUntil: 0,
          disturbedAt: 0,
          lastRecoveryMs: 0,
          recoverStartedAt: 0,
          disturbTimer: 0,
          settleTimer: 0,
          pointerX: 0.5,
          pointerY: 0.5,
        };
      });
      this.componentByElement = new Map(this.components.map((component) => [component.element, component]));
      this.measuredReadings = [];
      this.geometryPending = false;
      this.lastSoftwarePaintTime = 0;
      this.pendingPointer = null;
      this.measuredPointer = null;
      this.pendingRecoverAllAt = 0;
      this.resizeObserver = null;
      this.intersectionObserver = null;
      this.unregisterMeasure = this.scheduler.registerMeasure("assembly-geometry", (_time, _delta, dirty) => this.measure(dirty));
      this.unregisterFrame = this.scheduler.register("assembly", (time, delta, dirty) => this.tick(time, delta, dirty));
      this.setupObservers();
      this.scheduler.wake("assemblyDirty");
    }

    setupObservers() {
      if (typeof window.IntersectionObserver === "function") {
        this.intersectionObserver = new window.IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              const component = this.componentByElement.get(entry.target);
              if (component) component.visible = entry.isIntersecting || entry.intersectionRatio > 0;
            });
            this.scheduler.wake("assemblyDirty");
          },
          { rootMargin: "20% 0px 20% 0px", threshold: [0, 0.01, 0.25, 0.75, 1] }
        );
        this.components.forEach((component) => this.intersectionObserver.observe(component.element));
      }

      if (typeof window.ResizeObserver === "function") {
        this.resizeObserver = new window.ResizeObserver(() => this.scheduler.wake("resizeDirty"));
        this.components.forEach((component) => this.resizeObserver.observe(component.element));
      }
    }

    componentFromTarget(target) {
      if (!(target instanceof Element)) return null;
      const element = target.closest("[data-rr-assembly]");
      return element ? this.componentByElement.get(element) || null : null;
    }

    measure(dirty) {
      if (dirty.has("viewportDirty") || dirty.has("resizeDirty") || dirty.has("assemblyDirty")) {
        this.measuredReadings = this.components.map((component) => ({
          component,
          rect: component.anchor.getBoundingClientRect(),
        }));
        this.geometryPending = true;
      }
      if (dirty.has("pointerDirty")) {
        const pending = this.pendingPointer;
        this.pendingPointer = null;
        this.measuredPointer = pending
          ? {
              ...pending,
              bounds: pending.component.element.getBoundingClientRect(),
            }
          : null;
      }
    }

    disturb(component, strength, time) {
      window.clearTimeout(component.disturbTimer);
      window.clearTimeout(component.settleTimer);
      component.state = "disturbed";
      component.disturbance = Math.max(component.disturbance, clamp(strength, 0.18, 1));
      component.disturbedAt = performance.now();
      // Keep the disturbance perceptible, but leave enough of the 400 ms
      // interaction budget for the eased return even on a throttled frame.
      component.disturbedUntil = time + 64;
      component.recoverStartedAt = 0;
      component.element.dataset.rrAssembly = "disturbed";
      component.element.classList.add("rr-is-moving");
      component.disturbTimer = window.setTimeout(() => {
        if (component.state === "disturbed") this.beginRecovery(component, performance.now());
      }, 64);
      this.scheduler.wake("assemblyDirty");
    }

    handlePointer(target, pointer, speed, time) {
      const component = this.componentFromTarget(target);
      this.pendingPointer =
        component && component.settledEver && !this.sharedState.readerOpen
          ? {
              component,
              x: pointer.x,
              y: pointer.y,
              speed,
              time,
            }
          : null;
    }

    applyMeasuredPointer() {
      const reading = this.measuredPointer;
      this.measuredPointer = null;
      if (!reading || this.sharedState.readerOpen) return;
      const { component, bounds, x, y, speed, time } = reading;
      component.pointerX = clamp((x - bounds.left) / Math.max(1, bounds.width), 0, 1);
      component.pointerY = clamp((y - bounds.top) / Math.max(1, bounds.height), 0, 1);
      component.element.style.setProperty("--rr-assembly-glow-x", `${(component.pointerX * 100).toFixed(2)}%`);
      component.element.style.setProperty("--rr-assembly-glow-y", `${(component.pointerY * 100).toFixed(2)}%`);
      component.element.style.setProperty("--rr-assembly-glow", clamp(speed / 14, 0.08, 0.42).toFixed(3));

      if (!this.sharedState.motionActive || speed < 12) {
        if (component.state === "disturbed") this.beginRecovery(component, time);
        return;
      }

      this.disturb(component, (speed - 12) / 34, time);
    }

    recoverAll(time = performance.now()) {
      this.pendingPointer = null;
      this.pendingRecoverAllAt = time;
      this.scheduler.wake("assemblyDirty");
    }

    beginRecovery(component, time) {
      window.clearTimeout(component.disturbTimer);
      component.disturbTimer = 0;
      window.clearTimeout(component.settleTimer);
      component.state = "recovering";
      component.recoverStartedAt = time;
      component.element.dataset.rrAssembly = "recovering";
      component.element.classList.add("rr-is-moving");
      component.fragments.forEach((fragment) => {
        this.writeFragment(fragment, { x: 0, y: 0, angle: 0, depth: 0, opacity: 0 });
      });
      component.settleTimer = window.setTimeout(() => {
        if (component.state === "recovering") this.settle(component);
      }, 160);
      this.scheduler.wake("assemblyDirty");
    }

    settle(component) {
      const previousState = component.state;
      window.clearTimeout(component.disturbTimer);
      window.clearTimeout(component.settleTimer);
      component.disturbTimer = 0;
      component.settleTimer = 0;
      if ((previousState === "disturbed" || previousState === "recovering") && component.disturbedAt > 0) {
        component.lastRecoveryMs = performance.now() - component.disturbedAt;
      }
      component.state = "settled";
      component.settledEver = true;
      component.progress = 1;
      component.disturbance = 0;
      component.disturbedUntil = 0;
      component.disturbedAt = 0;
      component.recoverStartedAt = 0;
      component.element.dataset.rrAssembly = "settled";
      component.element.classList.remove("rr-is-moving");
      component.element.classList.add("rr-is-assembled");
    }

    writeFragment(fragment, next) {
      const previous = fragment.values;
      if (
        Math.abs(previous.x - next.x) < 0.01 &&
        Math.abs(previous.y - next.y) < 0.01 &&
        Math.abs(previous.angle - next.angle) < 0.002 &&
        Math.abs(previous.depth - next.depth) < 0.002 &&
        Math.abs(previous.opacity - next.opacity) < 0.01
      ) {
        return;
      }
      fragment.values = next;
      fragment.element.style.setProperty("--rr-fragment-x", `${next.x.toFixed(2)}px`);
      fragment.element.style.setProperty("--rr-fragment-y", `${next.y.toFixed(2)}px`);
      fragment.element.style.setProperty("--rr-fragment-angle", `${next.angle.toFixed(3)}deg`);
      fragment.element.style.setProperty("--rr-fragment-depth", next.depth.toFixed(3));
      fragment.element.style.setProperty("--rr-fragment-opacity", next.opacity.toFixed(2));
    }

    tick(time, _delta, dirty) {
      if (this.sharedState.readerOpen) return false;
      const geometryDirty = this.geometryPending || dirty.has("viewportDirty") || dirty.has("resizeDirty") || dirty.has("assemblyDirty");
      const viewportHeight = Math.max(1, window.innerHeight);
      const reduced = !this.sharedState.motionActive || this.sharedState.stableMode;
      const newlySettled = new Set();
      const profile = this.fidelity.profile();
      const interactive =
        dirty.has("pointerDirty") || this.pendingRecoverAllAt || this.components.some(({ state }) => state === "disturbed" || state === "recovering");
      if (profile.softwareConstrained && geometryDirty && !interactive) {
        const interval = 1000 / Math.max(15, profile.targetHz);
        if (this.lastSoftwarePaintTime && time - this.lastSoftwarePaintTime < interval - 0.35) return true;
        this.lastSoftwarePaintTime = time;
      }

      if (dirty.has("pointerDirty")) this.applyMeasuredPointer();
      if (this.pendingRecoverAllAt) {
        const recoveryTime = this.pendingRecoverAllAt;
        this.pendingRecoverAllAt = 0;
        this.components.forEach((component) => {
          if (component.state === "disturbed") this.beginRecovery(component, recoveryTime);
        });
      }

      if (geometryDirty) {
        const readings = this.measuredReadings;
        this.geometryPending = false;
        this.measuredReadings = [];
        readings.forEach(({ component, rect }) => {
          component.rect = rect;
          component.visible = rect.bottom > -viewportHeight * 0.2 && rect.top < viewportHeight * 1.2;
          if (component.settledEver || component.state === "disturbed" || component.state === "recovering") return;

          const center = rect.top + rect.height * 0.5;
          const startLine = viewportHeight * 1.04;
          // Finish slightly before the contractual 66.7vh boundary. A small
          // lead prevents sub-pixel reflow at wide breakpoints from leaving a
          // cover one frame short of its terminal state on the boundary.
          const settleLine = viewportHeight * 0.7;
          const reachedSettleLine = center <= settleLine + 1;
          const localProgress = reachedSettleLine ? 1 : clamp((startLine - center) / Math.max(1, startLine - settleLine), 0, 1);
          component.progress = reduced && rect.top < viewportHeight * 1.2 ? 1 : localProgress;
          if (component.progress > 0 && component.progress < 1) {
            component.state = "assembling";
            component.element.dataset.rrAssembly = "assembling";
            component.element.classList.add("rr-is-moving");
          } else if (component.progress >= 1) {
            this.settle(component);
            newlySettled.add(component);
          }
        });
        if (
          dirty.has("viewportDirty") &&
          window.innerWidth < 700 &&
          this.sharedState.motionActive &&
          Math.abs(this.sharedState.scrollVelocity) > 18
        ) {
          readings.forEach(({ component, rect }) => {
            if (
              !component.settledEver ||
              newlySettled.has(component) ||
              component.element.dataset.rrAssemblyKind !== "book" ||
              rect.bottom <= 0 ||
              rect.top >= viewportHeight
            ) {
              return;
            }
            component.pointerX = 0.5;
            component.pointerY = clamp((viewportHeight * 0.55 - rect.top) / Math.max(1, rect.height), 0, 1);
            this.disturb(component, (Math.abs(this.sharedState.scrollVelocity) - 18) / 52, time);
          });
        }
      }

      let continuing = false;
      this.components.forEach((component) => {
        if (reduced && component.visible && !component.settledEver) this.settle(component);
        let disassembly = component.settledEver ? 0 : 1 - ease(component.progress);
        let disturbance = 0;

        if (component.state === "disturbed") {
          if (time >= component.disturbedUntil) {
            this.beginRecovery(component, time);
          } else {
            disturbance = component.disturbance;
          }
        }
        if (component.state === "recovering") {
          disturbance = 0;
        }

        if (component.state === "assembling") disassembly = 1 - ease(component.progress);
        if (component.state === "settled") disassembly = 0;
        if (profile.softwareConstrained && disassembly > 0 && disassembly < 1) {
          disassembly = Math.round(disassembly * 32) / 32;
        }
        const activeAmount = Math.max(disassembly, disturbance);
        const compactScale = window.innerWidth < 700 ? 0.72 : 1;
        component.fragments.forEach((fragment, index) => {
          const fragmentX = (index % 2) * 0.52 + 0.24;
          const fragmentY = Math.floor(index / 2) * 0.42 + 0.24;
          const localDistance = Math.hypot(component.pointerX - fragmentX, component.pointerY - fragmentY);
          const localBias = ease(clamp(1 - localDistance / 0.58, 0, 1));
          const disturbanceScale = disturbance > 0 ? localBias : 1;
          const x = fragment.scatterX * 74 * compactScale * activeAmount * disturbanceScale;
          const y = fragment.scatterY * 48 * compactScale * activeAmount * disturbanceScale;
          const angle = fragment.scatterAngle * 2.4 * activeAmount * disturbanceScale;
          const depth = activeAmount * (0.24 + (index % 3) * 0.04) * disturbanceScale;
          const opacity = component.state === "settled" ? 0 : clamp(activeAmount * 1.18 * disturbanceScale, 0, 1);
          this.writeFragment(fragment, { x, y, angle, depth, opacity });
        });

        if (component.state === "settled") {
          component.fragments.forEach((fragment) => {
            this.writeFragment(fragment, { x: 0, y: 0, angle: 0, depth: 0, opacity: 0 });
          });
        }
      });

      return continuing;
    }

    snapshot() {
      return this.components.map((component) => ({
        id: component.element.dataset.rrBook || component.element.dataset.rrAssemblyKind || "assembly",
        state: component.state,
        settledEver: component.settledEver,
        progress: Number(component.progress.toFixed(4)),
        lastRecoveryMs: Number(component.lastRecoveryMs.toFixed(2)),
        fragments: component.fragments.map((fragment) => ({
          x: Number((fragment.values.x || 0).toFixed(3)),
          y: Number((fragment.values.y || 0).toFixed(3)),
          angle: Number((fragment.values.angle || 0).toFixed(3)),
          depth: Number((fragment.values.depth || 0).toFixed(3)),
        })),
      }));
    }
  }

  class CollisionEvidenceController {
    constructor(root, scheduler, sharedState, fidelity) {
      this.root = root;
      this.scheduler = scheduler;
      this.sharedState = sharedState;
      this.fidelity = fidelity;
      this.stage = root.querySelector("[data-rr-collision-evidence]");
      this.viewport = this.stage ? this.stage.querySelector(".rr-collision__evidence-viewport") : null;
      this.track = this.stage ? this.stage.querySelector("[data-rr-evidence-track]") : null;
      this.items = this.track ? Array.from(this.track.querySelectorAll("[data-rr-evidence]")) : [];
      this.visible = false;
      this.progress = 0;
      this.distanceVh = 220;
      this.targetDistanceVh = 220;
      this.distanceLocked = false;
      this.measurement = null;
      this.lastSoftwarePaintTime = 0;
      this.styleCache = new WeakMap();
      this.mobile = window.matchMedia("(max-width: 700px)");
      this.intersectionObserver = null;
      if (!this.stage || !this.viewport || !this.track || !this.items.length) return;

      if (typeof window.IntersectionObserver === "function") {
        this.intersectionObserver = new window.IntersectionObserver(
          (entries) => {
            this.visible = entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0);
            if (this.visible) {
              this.items.forEach((item) => {
                const image = item.querySelector("img[loading='lazy']");
                if (image) image.loading = "eager";
              });
            }
            this.scheduler.wake("collisionDirty");
          },
          { rootMargin: "15% 0px 15% 0px", threshold: [0, 0.01, 0.5] }
        );
        this.intersectionObserver.observe(this.stage);
      } else {
        this.visible = true;
      }
      this.track.addEventListener("scroll", () => this.scheduler.wake("collisionDirty"), { passive: true });
      this.scheduler.registerMeasure("collision-geometry", (_time, _delta, dirty) => this.measure(dirty));
      this.scheduler.register("collision", (time, _delta, dirty) => this.tick(time, dirty));
      this.scheduler.wake("collisionDirty");
    }

    measure(dirty) {
      if (!dirty.has("viewportDirty") && !dirty.has("resizeDirty") && !dirty.has("collisionDirty")) return;
      if (!this.visible) {
        this.measurement = null;
        return;
      }
      const mobile = this.mobile.matches;
      const stageBounds = this.stage.getBoundingClientRect();
      const viewportBounds = this.viewport.getBoundingClientRect();
      this.measurement = {
        mobile,
        stageBounds,
        viewportBounds,
        viewportHeight: Math.max(1, window.innerHeight),
        trackScrollLeft: this.track.scrollLeft,
        trackScrollWidth: this.track.scrollWidth,
        trackClientWidth: this.track.clientWidth,
        viewportClientWidth: this.viewport.clientWidth,
        items: this.items.map((item) => ({
          offsetLeft: item.offsetLeft,
          offsetWidth: item.offsetWidth,
        })),
      };
    }

    lifecycle(local) {
      if (local <= 0) return { state: "queued", reveal: 0 };
      if (local < 0.2) return { state: "scanning", reveal: ease(local / 0.2) };
      if (local < 0.36) return { state: "revealed", reveal: 1 };
      if (local < 0.7) return { state: "holding", reveal: 1 };
      if (local < 1) return { state: "receding", reveal: 1 - ease((local - 0.7) / 0.3) };
      return { state: "passed", reveal: 0 };
    }

    setProgress(progress) {
      this.progress = clamp(progress, 0, 1);
      const progressData = this.progress.toFixed(4);
      if (this.stage.dataset.rrEvidenceProgress !== progressData) this.stage.dataset.rrEvidenceProgress = progressData;
      const span = this.items.length + 1.15;
      this.items.forEach((item, index) => {
        const local = this.progress * span - index;
        this.applyLifecycle(item, local);
      });
    }

    applyLifecycle(item, local) {
      const lifecycle = this.lifecycle(local);
      const softwareConstrained = this.fidelity.profile().softwareConstrained;
      const reveal = softwareConstrained ? Math.round(lifecycle.reveal * 12) / 12 : lifecycle.reveal;
      const scan = clamp(local / 0.2, 0, 1);
      const scanPosition = softwareConstrained ? Math.round(scan * 12) / 12 : scan;
      const next = {
        state: lifecycle.state,
        reveal: reveal.toFixed(4),
        clip: `inset(0 ${(100 - reveal * 100).toFixed(2)}% 0 0)`,
        opacity: clamp(reveal * 1.12, 0, 1).toFixed(3),
        brightness: (0.76 + reveal * 0.24).toFixed(3),
        scanPosition: `${(scanPosition * 100).toFixed(2)}%`,
      };
      const previous = this.styleCache.get(item) || {};
      if (previous.state !== next.state) item.dataset.rrEvidenceState = next.state;
      if (previous.reveal !== next.reveal) item.style.setProperty("--rr-evidence-reveal", next.reveal);
      if (previous.clip !== next.clip) item.style.setProperty("--rr-evidence-clip", next.clip);
      if (previous.opacity !== next.opacity) item.style.setProperty("--rr-evidence-opacity", next.opacity);
      if (previous.brightness !== next.brightness) item.style.setProperty("--rr-evidence-brightness", next.brightness);
      if (previous.scanPosition !== next.scanPosition) item.style.setProperty("--rr-evidence-scan-position", next.scanPosition);
      this.styleCache.set(item, next);
    }

    setMobileProgress(measurement) {
      const maximum = Math.max(1, measurement.trackScrollWidth - measurement.trackClientWidth);
      this.progress = clamp(measurement.trackScrollLeft / maximum, 0, 1);
      this.stage.dataset.rrEvidenceProgress = this.progress.toFixed(4);
      const center = measurement.trackScrollLeft + measurement.trackClientWidth * 0.5;
      this.items.forEach((item, index) => {
        const itemGeometry = measurement.items[index];
        const itemCenter = itemGeometry.offsetLeft + itemGeometry.offsetWidth * 0.5;
        const local = 0.55 + (center - itemCenter) / Math.max(1, itemGeometry.offsetWidth);
        this.applyLifecycle(item, local);
      });
    }

    tick(time, dirty) {
      if (!this.stage || this.sharedState.readerOpen || document.hidden) return false;
      if (!this.measurement && !dirty.has("viewportDirty") && !dirty.has("resizeDirty") && !dirty.has("collisionDirty")) return false;
      if (!this.visible) {
        this.measurement = null;
        return false;
      }
      const measurement = this.measurement;
      if (!measurement) return false;
      const profile = this.fidelity.profile();
      if (profile.softwareConstrained) {
        const interval = 1000 / Math.max(15, profile.targetHz);
        if (this.lastSoftwarePaintTime && time - this.lastSoftwarePaintTime < interval - 0.35) return true;
        this.lastSoftwarePaintTime = time;
      }
      this.measurement = null;
      if (measurement.mobile) {
        this.setMobileProgress(measurement);
        this.track.style.removeProperty("--rr-evidence-translate");
        return false;
      }

      const { stageBounds, viewportBounds, viewportHeight } = measurement;
      const navOffset = Math.max(0, viewportBounds.top);

      if (!this.distanceLocked && stageBounds.top < viewportHeight * 1.25) {
        const speed = clamp((Math.abs(this.sharedState.scrollVelocity || 0) - 3) / 55, 0, 1);
        const candidate = 300 - ease(speed) * 200;
        if (Math.abs(candidate - this.targetDistanceVh) > 8) this.targetDistanceVh = candidate;
        const previousDistance = this.distanceVh;
        if (stageBounds.top <= navOffset) {
          this.distanceVh = this.targetDistanceVh;
          this.distanceLocked = true;
        } else {
          this.distanceVh = lerp(this.distanceVh, this.targetDistanceVh, 0.24);
          if (Math.abs(this.distanceVh - this.targetDistanceVh) < 0.6) this.distanceVh = this.targetDistanceVh;
        }
        if (Math.abs(previousDistance - this.distanceVh) > 0.05) {
          this.stage.style.setProperty("--rr-collision-distance", `${this.distanceVh.toFixed(2)}svh`);
          this.scheduler.wake("resizeDirty");
        }
      }

      const travel = Math.max(1, stageBounds.height - viewportBounds.height);
      const progress = clamp((navOffset - stageBounds.top) / travel, 0, 1);
      const maximum = Math.max(0, measurement.trackScrollWidth - measurement.viewportClientWidth);
      const translate = `${(-progress * maximum).toFixed(profile.softwareConstrained ? 0 : 2)}px`;
      if (this.track.style.getPropertyValue("--rr-evidence-translate") !== translate) {
        this.track.style.setProperty("--rr-evidence-translate", translate);
      }
      this.setProgress(progress);
      this.visible = stageBounds.bottom > 0 && stageBounds.top < viewportHeight;
      return false;
    }

    snapshot() {
      return {
        progress: Number(this.progress.toFixed(4)),
        distanceVh: Number(this.distanceVh.toFixed(2)),
        targetDistanceVh: Number(this.targetDistanceVh.toFixed(2)),
        distanceLocked: this.distanceLocked,
        mobile: this.mobile.matches,
        visible: this.visible,
        states: this.items.map((item) => item.dataset.rrEvidenceState || "queued"),
      };
    }
  }

  class WebGLDynamicLayer {
    constructor(root) {
      this.root = root;
      this.canvas = document.createElement("canvas");
      this.canvas.className = "rr-hero__webgl";
      this.canvas.dataset.rrWebglLayer = "";
      this.canvas.setAttribute("aria-hidden", "true");
      const fieldCanvas = root.querySelector("[data-rr-field]");
      if (fieldCanvas?.parentNode) fieldCanvas.parentNode.insertBefore(this.canvas, fieldCanvas);
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
      this.debugSampling = new URLSearchParams(window.location.search).has("rr-debug");
      this.forceSoftwareRenderer = new URLSearchParams(window.location.search).has("rr-force-webgl");
      this.rendererName = "";

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
        const rendererExtension = context.getExtension("WEBGL_debug_renderer_info");
        this.rendererName = String(
          rendererExtension ? context.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER) || ""
        );
        if (!this.forceSoftwareRenderer && /(swiftshader|llvmpipe|software rasterizer|basic render)/i.test(this.rendererName)) {
          this.fail("software-renderer");
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
        this.canvas.hidden = false;
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
      this.canvas.hidden = true;
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

        if (this.debugSampling && (this.renderCount === 1 || this.renderCount % 120 === 0)) {
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
    constructor(canvas, root, sharedState, scheduler, fidelity) {
      this.canvas = canvas;
      this.root = root;
      this.sharedState = sharedState;
      this.scheduler = scheduler;
      this.fidelity = fidelity;
      this.context = canvas.getContext("2d", { alpha: true, desynchronized: true });
      this.webglLayer = this.context ? new WebGLDynamicLayer(root) : null;
      this.fidelity.setSoftwareRendererFallback(this.webglLayer?.fallbackReason === "software-renderer" && !this.sharedState.stableMode);
      this.width = 1;
      this.height = 1;
      this.offsetLeft = 0;
      this.offsetTop = 0;
      this.dpr = 1;
      this.nodes = [];
      this.edges = [];
      this.quality = 2;
      this.lastFrame = 0;
      this.lastRafTime = 0;
      this.lastSampleTime = 0;
      this.sampleAccumulator = 0;
      this.recentRenderIntervals = [];
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
      this.unregisterFrame = this.scheduler.register("field", this.frame);
      this.unregisterFidelity = this.fidelity.onChange(() => {
        this.recentRenderIntervals.length = 0;
        this.lastFrame = 0;
        this.lastSampleTime = 0;
        this.sampleAccumulator = 0;
        this.resize(false);
        this.scheduler.wake("resizeDirty");
      });
      if (typeof window.ResizeObserver === "function") {
        this.resizeObserver = new window.ResizeObserver(() => this.scheduler.wake("resizeDirty"));
        this.resizeObserver.observe(canvas);
      }
      window.addEventListener("resize", () => this.scheduler.wake("resizeDirty"), { passive: true });
      document.addEventListener("visibilitychange", this.handleVisibility);
      this.resize();
    }

    get available() {
      return Boolean(this.context);
    }

    targetNodeCount() {
      return this.fidelity.profile().nodeCount;
    }

    sampleInterval() {
      return 1000 / Math.max(15, this.fidelity.profile().targetHz);
    }

    updateQualityState() {
      const profile = this.fidelity.profile();
      const interval = this.sampleInterval();
      this.quality = profile.level - 1;
      this.root.dataset.rrSampleRate = String(Math.round(profile.targetHz));
      this.root.style.setProperty("--rr-quality-sample-interval", `${interval.toFixed(2)}ms`);
    }

    resize(drawAfter = true) {
      if (!this.context) return;

      const bounds = this.canvas.getBoundingClientRect();
      this.offsetLeft = bounds.left;
      this.offsetTop = bounds.top;
      this.width = Math.max(1, Math.round(bounds.width || window.innerWidth));
      this.height = Math.max(1, Math.round(bounds.height || window.innerHeight));
      const fidelityCap = this.fidelity.profile().dprCap;
      const resolutionScale = this.fidelity.profile().resolutionScale;
      const memoryCap = 4096 / Math.max(this.width, this.height);
      const nativeRatio = clamp(window.devicePixelRatio || 1, 1, Math.min(fidelityCap, memoryCap));
      this.dpr = clamp(nativeRatio * resolutionScale, 0.5, Math.min(fidelityCap, memoryCap));
      const pixelWidth = Math.max(1, Math.round(this.width * this.dpr));
      const pixelHeight = Math.max(1, Math.round(this.height * this.dpr));

      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }

      if (this.webglLayer) this.webglLayer.resize(pixelWidth, pixelHeight);
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.generate();
      if (drawAfter && this.sharedState.heroVisible !== false) {
        this.draw(this.sharedState.stableMode ? STABLE_FRAME_TIME : performance.now());
      }
    }

    updateOffset() {
      const bounds = this.canvas.getBoundingClientRect();
      this.offsetLeft = bounds.left;
      this.offsetTop = bounds.top;
    }

    generate() {
      this.quality = this.fidelity.profile().level - 1;
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

      if (this.webglLayer) {
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

    frame(time, schedulerDelta, dirty) {
      if (dirty.has("resizeDirty")) this.resize(false);
      if (
        !this.running ||
        document.hidden ||
        !this.context ||
        !this.sharedState.motionActive ||
        !this.sharedState.heroVisible ||
        this.sharedState.readerOpen
      ) {
        return false;
      }
      this.frameCallbacks += 1;
      const rafDelta = this.lastRafTime ? clamp(time - this.lastRafTime, 1, 100) : schedulerDelta;
      this.lastRafTime = time;
      this.averageFrame = lerp(this.averageFrame, rafDelta, 0.035);
      const sampleInterval = this.sampleInterval();
      this.sampleAccumulator = Math.min(sampleInterval * 2, this.sampleAccumulator + rafDelta);
      if (this.sampleAccumulator < sampleInterval - 0.35) {
        this.skippedFrames += 1;
        return true;
      }
      this.sampleAccumulator = Math.max(0, this.sampleAccumulator - sampleInterval);

      const delta = this.lastFrame ? clamp(time - this.lastFrame, 1, 50) : 16.7;
      this.lastFrame = time;
      if (this.lastSampleTime) {
        this.recentRenderIntervals.push(time - this.lastSampleTime);
        if (this.recentRenderIntervals.length > 180) this.recentRenderIntervals.shift();
      }
      this.lastSampleTime = time;
      const renderStartedAt = performance.now();
      this.updateNodes(time, delta);
      if (this.sharedState.pointer.active) {
        const nearest = this.sampleNearestNode(this.sharedState.pointer.x, this.sharedState.pointer.y);
        this.sharedState.updateNearestCursor(nearest);
      }
      this.draw(time);
      this.renderedFrames += 1;
      this.fidelity.observePerformance(performance.now() - renderStartedAt, rafDelta);
      return true;
    }

    start() {
      if (!this.context || this.running || this.sharedState.stableMode) return;
      this.running = true;
      this.lastFrame = 0;
      this.lastRafTime = 0;
      this.lastSampleTime = 0;
      this.sampleAccumulator = 0;
      this.scheduler.wake("viewportDirty");
    }

    stop() {
      this.running = false;
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
      if (this.sharedState.pointer.active) {
        const nearest = this.sampleNearestNode(this.sharedState.pointer.x, this.sharedState.pointer.y);
        this.sharedState.updateNearestCursor(nearest);
      }
      this.draw(time);
    }

    invalidate() {
      if (!this.context) return;
      if (this.sharedState.motionActive && !this.sharedState.stableMode && this.sharedState.heroVisible && !this.sharedState.readerOpen) {
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
        this.scheduler.wake("viewportDirty");
      }
    }

    resetPerformanceWindow() {
      this.recentRenderIntervals.length = 0;
      this.lastSampleTime = 0;
    }

    snapshotMetrics() {
      const interval = this.sampleInterval();
      const renderIntervals = [...this.recentRenderIntervals].sort((first, second) => first - second);
      const renderP90Index = Math.min(renderIntervals.length - 1, Math.floor(renderIntervals.length * 0.9));
      let nodeChecksum = 0;
      let fieldEnergy = 0;
      this.nodes.forEach((node, index) => {
        const baseX = node.normalizedX * this.width;
        const baseY = node.normalizedY * this.height;
        nodeChecksum += (node.x / Math.max(1, this.width)) * (index + 3) * 1.937 + (node.y / Math.max(1, this.height)) * (index + 7) * 1.123;
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
          cadence: {
            samples: renderIntervals.length,
            p90Ms: renderIntervals.length ? Number(renderIntervals[renderP90Index].toFixed(2)) : null,
          },
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
          webglRenderer: this.webglLayer ? this.webglLayer.rendererName : "",
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
    const scrollVisualAssetsReady = prepareScrollVisualAssets(root);
    const scheduler = new FrameScheduler(root);

    const session = loadSession();
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const canvas = root.querySelector("#rr-field");
    const sections = Array.from(root.querySelectorAll("[data-rr-section]"));
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
    let activeSectionElement = null;
    let field = null;
    let fidelity = null;
    let assembly = null;
    let collisionEvidence = null;
    let audioContext = null;
    let focusReturnTarget = null;
    let tiltListening = false;
    let lastScrollY = window.scrollY;
    let lastScrollAt = performance.now();

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

    const sharedState = {
      pointer,
      tilt,
      chapter: "hero",
      chapterProgress: 0,
      evolution: "clinical",
      mimicTempo: 1,
      motionActive: false,
      stableMode,
      heroVisible: true,
      readerOpen: false,
      scrollVelocity: 0,
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

    fidelity = new FidelityController(root, scheduler, session, persistSession);

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
      sharedState.motionActive = motionEnabled && !reducedMotionQuery.matches && !stableMode && !document.hidden;
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
      scheduler.wake("assemblyDirty");
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
        const nextX = `${(pointerX * scale).toFixed(2)}px`;
        const nextY = `${(pointerY * scale).toFixed(2)}px`;
        if (layer.style.getPropertyValue("--rr-depth-x") !== nextX) layer.style.setProperty("--rr-depth-x", nextX);
        if (layer.style.getPropertyValue("--rr-depth-y") !== nextY) layer.style.setProperty("--rr-depth-y", nextY);
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
      if (!sections.length) return;
      if (field) field.updateOffset();
      const viewportHeight = Math.max(1, window.innerHeight);
      const center = viewportHeight * 0.48;
      let closest = null;

      const readings = sections.map((section) => ({ section, bounds: section.getBoundingClientRect() }));
      readings.forEach(({ section, bounds }) => {
        const distance = Math.abs((bounds.top + bounds.bottom) * 0.5 - center);
        const visible = bounds.bottom > 0 && bounds.top < viewportHeight;
        section.classList.toggle("rr-is-visible", visible);
        if (!closest || distance < closest.distance) closest = { section, bounds, distance };
      });

      if (!closest) return;
      const chapter = normalizeChapter(closest.section);
      const progress = clamp((center - closest.bounds.top) / Math.max(1, closest.bounds.height), 0, 1);
      sharedState.chapter = chapter;
      sharedState.chapterProgress = progress;
      if (chapter !== activeSection) {
        root.dataset.rrChapter = chapter;
        root.dataset.phase = chapter === "contact" ? "release" : chapter;
        root.classList.toggle("is-fragmented", chapter === "collision");
      }
      if (closest.section !== activeSectionElement) {
        sections.forEach((section) => section.classList.toggle("rr-is-active", section === closest.section));
        activeSectionElement = closest.section;
      }

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
    };

    const requestScrollUpdate = () => {
      const now = performance.now();
      // A flick that starts after an idle pause is still fast. Capping the
      // event window prevents that idle time from diluting the first large
      // displacement, while small wheel/touch deltas remain below threshold.
      const timeSinceLastScroll = now - lastScrollAt;
      const elapsed = clamp(timeSinceLastScroll, 8, 48);
      const nextScrollY = window.scrollY;
      const instantaneousVelocity = ((nextScrollY - lastScrollY) / elapsed) * 16.7;
      const directionChanged =
        Math.abs(sharedState.scrollVelocity) > 0.5 &&
        Math.abs(instantaneousVelocity) > 0.5 &&
        Math.sign(sharedState.scrollVelocity) !== Math.sign(instantaneousVelocity);
      sharedState.scrollVelocity =
        timeSinceLastScroll > 80 || directionChanged ? instantaneousVelocity : lerp(sharedState.scrollVelocity, instantaneousVelocity, 0.32);
      lastScrollY = nextScrollY;
      lastScrollAt = now;
      scheduler.wake("viewportDirty");
    };
    scheduler.register("viewport", (_time, _delta, dirty) => {
      if (dirty.has("viewportDirty") || dirty.has("resizeDirty")) updateScrollState();
      return false;
    });

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
      window.setTimeout(() => ripple.classList.add("is-active"), 0);
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
      const speed = Math.hypot(pointer.velocityX, pointer.velocityY);
      if (assembly) assembly.handlePointer(event.target, pointer, speed, now);
      scheduler.wake("pointerDirty");

      if (now - lastExplorationRecord > 850) {
        lastExplorationRecord = now;
        recordInteraction("explore");
      }
    };
    scheduler.register("pointer", (_time, _delta, dirty) => {
      if (!dirty.has("pointerDirty")) return false;
      moveCursor(pointer.x, pointer.y);
      updateDepthLayers();
      const nearestSample = field && sharedState.heroVisible ? field.sampleNearestNode(pointer.x, pointer.y) : null;
      updateCursorMode(lastPointerTarget, nearestSample);
      return false;
    });

    const handlePointerDown = (event) => {
      updatePointer(event);
      // A tap is a discrete action, so expose its sampled node immediately.
      // Pointer moves stay frame-coalesced; this one bounded O(node-count)
      // lookup prevents touch feedback from lagging one scheduler frame.
      const nearestSample = field ? field.sampleNearestNode(pointer.x, pointer.y) : null;
      updateCursorMode(event.target, nearestSample);
      recordInteraction("gesture");
      createTouchRipple(event.clientX, event.clientY);
    };

    const handlePointerLeave = (event) => {
      if (event.pointerType === "mouse") pointer.active = false;
      if (field) field.clearNearestSample();
      if (assembly) assembly.recoverAll();
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
      const readerCursor = pageDialog.querySelector("[data-rr-reader-cursor]");
      const closeControls = Array.from(pageDialog.querySelectorAll("[data-rr-reader-close], [data-rr-reader-close-button]"));
      const triggers = Array.from(root.querySelectorAll("[data-rr-open-reader], [data-rr-page-open]"));
      const readerPointer = {
        x: window.innerWidth * 0.5,
        y: window.innerHeight * 0.5,
        targetX: window.innerWidth * 0.5,
        targetY: window.innerHeight * 0.5,
        visible: false,
        type: "mouse",
      };
      if (!readerCursor) pageDialog.classList.add("rr-reader--cursor-fallback");

      scheduler.register("reader-cursor", (_time, delta, dirty) => {
        if (!sharedState.readerOpen || !readerCursor || !readerPointer.visible) return false;
        if (!dirty.has("pointerDirty") && !dirty.has("readerDirty")) {
          const remaining = Math.hypot(readerPointer.targetX - readerPointer.x, readerPointer.targetY - readerPointer.y);
          if (remaining < 0.2) return false;
        }
        const reduced = reducedMotionQuery.matches || !motionEnabled || sharedState.stableMode;
        const amount = reduced ? 1 : 1 - Math.pow(0.72, clamp(delta / 16.7, 0.25, 2.5));
        readerPointer.x = lerp(readerPointer.x, readerPointer.targetX, amount);
        readerPointer.y = lerp(readerPointer.y, readerPointer.targetY, amount);
        readerCursor.style.setProperty("--rr-reader-cursor-x", `${readerPointer.x.toFixed(1)}px`);
        readerCursor.style.setProperty("--rr-reader-cursor-y", `${readerPointer.y.toFixed(1)}px`);
        readerCursor.dataset.rrPointerType = readerPointer.type;
        readerCursor.classList.add("is-visible");
        return !reduced && Math.hypot(readerPointer.targetX - readerPointer.x, readerPointer.targetY - readerPointer.y) >= 0.2;
      });

      const deactivateReader = () => {
        sharedState.readerOpen = false;
        root.dataset.rrReaderOpen = "false";
        readerPointer.visible = false;
        if (readerCursor) readerCursor.classList.remove("is-visible");
        document.body.classList.remove("rr-reader-open");
        if (field) field.invalidate();
        scheduler.wake("viewportDirty");
      };

      const closeDialog = () => {
        if (typeof pageDialog.close === "function" && pageDialog.open) {
          pageDialog.close();
        } else {
          pageDialog.removeAttribute("open");
          pageDialog.setAttribute("aria-hidden", "true");
          deactivateReader();
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
        const owningBook = trigger.closest("[data-rr-book]");
        const readerTheme = owningBook && owningBook.dataset.rrBook === "platform-socialism" ? "platform" : "xenofeminism";
        pageDialog.dataset.rrReaderTheme = readerTheme;
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
        sharedState.readerOpen = true;
        root.dataset.rrReaderOpen = "true";
        if (field) field.stop();
        if (typeof pageDialog.showModal === "function") {
          if (!pageDialog.open) pageDialog.showModal();
        } else {
          pageDialog.setAttribute("open", "");
          pageDialog.setAttribute("role", "dialog");
          pageDialog.setAttribute("aria-modal", "true");
        }
        if (readerCursor && finePointerQuery.matches && pointer.active && pointer.type !== "touch") {
          readerPointer.x = pointer.x;
          readerPointer.y = pointer.y;
          readerPointer.targetX = pointer.x;
          readerPointer.targetY = pointer.y;
          readerPointer.type = pointer.type;
          readerPointer.visible = true;
          readerCursor.style.setProperty("--rr-reader-cursor-x", `${readerPointer.x.toFixed(1)}px`);
          readerCursor.style.setProperty("--rr-reader-cursor-y", `${readerPointer.y.toFixed(1)}px`);
          readerCursor.dataset.rrPointerType = readerPointer.type;
          readerCursor.classList.add("is-visible");
        }
        const initialFocus = closeControls[0] || pageDialog;
        window.setTimeout(() => initialFocus.focus({ preventScroll: true }), 0);
        scheduler.wake("readerDirty");
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
      pageDialog.addEventListener(
        "pointermove",
        (event) => {
          event.stopPropagation();
          readerPointer.targetX = event.clientX;
          readerPointer.targetY = event.clientY;
          readerPointer.type = event.pointerType || "mouse";
          readerPointer.visible = true;
          scheduler.wake("pointerDirty");
        },
        { passive: true }
      );
      pageDialog.addEventListener(
        "pointerenter",
        (event) => {
          readerPointer.targetX = event.clientX;
          readerPointer.targetY = event.clientY;
          readerPointer.type = event.pointerType || "mouse";
          readerPointer.visible = true;
          scheduler.wake("readerDirty");
        },
        { passive: true }
      );
      pageDialog.addEventListener(
        "pointerleave",
        () => {
          readerPointer.visible = false;
          if (readerCursor) readerCursor.classList.remove("is-visible");
        },
        { passive: true }
      );
      pageDialog.addEventListener("close", () => {
        deactivateReader();
        pageDialog.setAttribute("aria-hidden", "true");
        if (focusReturnTarget && typeof focusReturnTarget.focus === "function") {
          focusReturnTarget.focus({ preventScroll: true });
        }
      });
      pageDialog.addEventListener("keydown", (event) => {
        if (event.key === "Tab" && readerCursor) readerCursor.classList.remove("is-visible");
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
      scheduler.wake("pointerDirty");
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
    scheduler.register("tilt", (_time, delta, dirty) => {
      if (!dirty.has("pointerDirty") && Math.hypot(tilt.targetX - tilt.x, tilt.targetY - tilt.y) < 0.001) return false;
      const amount = sharedState.motionActive ? 1 - Math.pow(0.955, clamp(delta / 16.7, 0.2, 2.5)) : 1;
      tilt.x = lerp(tilt.x, tilt.targetX, amount);
      tilt.y = lerp(tilt.y, tilt.targetY, amount);
      return sharedState.motionActive && Math.hypot(tilt.targetX - tilt.x, tilt.targetY - tilt.y) >= 0.001;
    });

    root.dataset.rrWebgl = "pending";
    root.dataset.rrRenderer = "2d-fallback";
    updateEvolution();
    setupControls();
    setupTilt();
    updateSoundState();

    if (canvas) {
      field = new RhizomeField(canvas, root, sharedState, scheduler, fidelity);
      if (!field.available) field = null;
    } else {
      root.dataset.rrRenderer = "no-canvas";
    }
    assembly = new AssemblyController(root, scheduler, sharedState, fidelity);
    collisionEvidence = new CollisionEvidenceController(root, scheduler, sharedState, fidelity);
    setupDialog();

    const hero = root.querySelector("#hero, .rr-hero");
    if (hero && typeof window.IntersectionObserver === "function") {
      const heroObserver = new window.IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          sharedState.heroVisible = Boolean(entry && (entry.isIntersecting || entry.intersectionRatio > 0));
          root.dataset.rrFieldVisible = sharedState.heroVisible ? "true" : "false";
          if (field) {
            if (sharedState.heroVisible) field.invalidate();
            else field.stop();
          }
          scheduler.wake("viewportDirty");
        },
        { threshold: [0, 0.001] }
      );
      heroObserver.observe(hero);
    } else {
      root.dataset.rrFieldVisible = "true";
    }

    root.addEventListener("pointermove", updatePointer, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    root.addEventListener("pointerenter", handlePointerEnter, { passive: true });
    window.addEventListener("scroll", requestScrollUpdate, { passive: true });
    window.addEventListener("resize", requestScrollUpdate, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        scheduler.stop();
      } else {
        scheduler.refreshSamples.length = 0;
        scheduler.refreshMeasured = false;
        scheduler.wake("resizeDirty");
      }
    });

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
      scheduler.wake("assemblyDirty");
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
      resetPerformanceWindow() {
        scheduler.resetPerformanceWindow();
        if (field) field.resetPerformanceWindow();
        scheduler.wake("viewportDirty");
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
          scrollVelocity: Number(sharedState.scrollVelocity.toFixed(3)),
          frame: metrics.frame,
          sample: metrics.sample,
          nearest: metrics.nearest,
          scheduler: scheduler.snapshot(),
          fidelity: {
            mode: fidelity.mode,
            level: fidelity.level,
            ...fidelity.profile(),
          },
          assembly: assembly ? assembly.snapshot() : [],
          collision: collisionEvidence ? collisionEvidence.snapshot() : null,
          reader: {
            open: sharedState.readerOpen,
            theme: pageDialog ? pageDialog.dataset.rrReaderTheme || "" : "",
            cursorInDialog: Boolean(pageDialog && pageDialog.querySelector("[data-rr-reader-cursor]")),
            cursorVisible: Boolean(pageDialog && pageDialog.querySelector("[data-rr-reader-cursor].is-visible")),
          },
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
    scheduler.wake("viewportDirty");
    scrollVisualAssetsReady.finally(() => {
      root.classList.add("rr-ready");
      root.classList.toggle("rr-cursor-enabled", finePointerQuery.matches);
      root.dataset.rrRuntime = "ready";
      window.__RENAISSANCE_RHIZOME_READY__ = true;
      window.dispatchEvent(new CustomEvent("rr:ready"));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
