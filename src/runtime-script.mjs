import { ANCHOR_SELECTORS } from "./anchors.mjs";

const STYLE_ID = "wb-skin-lab-style";
const DOCK_ID = "wb-skin-lab-dock";
const EFFECTS_ID = "wb-skin-lab-effects";
const STATE_KEY = "__WORKBUDDY_SKIN_LAB__";

function runtimeMain(payload) {
  const { css, themes, activeId, ids, anchorSelectors } = payload;
  const storageKey = "workbuddy-skin-lab:v1";
  const root = document.documentElement;
  const previous = window[ids.state];
  previous?.cleanup?.();
  const safeStorage = {
    read() {
      try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
    },
    write(value) {
      try { localStorage.setItem(storageKey, JSON.stringify(value)); return true; } catch { return false; }
    },
  };
  const saved = safeStorage.read();
  const managedAppearanceClasses = ["light", "vscode-light", "cb-light", "dark", "vscode-dark", "cb-dark"];
  const rememberAppearance = (node) => ({
    classes: Object.fromEntries(managedAppearanceClasses.map((name) => [name, node.classList.contains(name)])),
    kind: node.getAttribute("data-vscode-theme-kind"),
    name: node.getAttribute("data-vscode-theme-name"),
    colorScheme: node.style.colorScheme,
  });
  const state = {
    requestedId: activeId, activeId,
    listeners: [], cleanups: [], sidebarResizeObserver: null, sidebarTimer: null,
    pageObserver: null, pageNode: null, pageHostObserver: null, pageHost: null, pageFrame: null, pageTimer: null, paletteSource: null,
    guardedOverlays: new Set(), overlayHostStyles: new Map(),
    originalAppearance: { html: rememberAppearance(root), body: rememberAppearance(document.body) },
  };

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    state.listeners.push(() => target.removeEventListener(type, handler, options));
  };
  const themeById = (id) => themes.find((theme) => theme.id === id) || themes[0];
  const overrides = () => safeStorage.read().overrides?.[state.activeId] || {};
  const savePatch = (patch) => {
    const current = safeStorage.read();
    current.activeId = state.activeId;
    current.overrides = current.overrides || {};
    current.overrides[state.activeId] = { ...(current.overrides[state.activeId] || {}), ...patch };
    if (!safeStorage.write(current)) throw new Error("本地存储空间不足；请换一张更小的图片，或先重置本主题");
  };

  const rectOf = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  };
  const overlaps = (left, right) => Boolean(left && right && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top);
  const visibleOverlay = (node) => {
    const rect = rectOf(node);
    const style = node ? getComputedStyle(node) : null;
    return Boolean(rect && rect.width > 0 && rect.height > 0 && style && style.display !== "none" && style.visibility !== "hidden");
  };

  const rememberOverlayHost = (node) => Object.fromEntries(["overflow", "overflow-x", "overflow-y"].map((property) => [property, {
    value: node.style.getPropertyValue(property), priority: node.style.getPropertyPriority(property),
  }]));
  const restoreOverlayHost = (node, snapshot) => {
    for (const [property, previous] of Object.entries(snapshot)) {
      if (previous.value) node.style.setProperty(property, previous.value, previous.priority);
      else node.style.removeProperty(property);
    }
  };

  const syncNativeOverlays = () => {
    const semantic = [...document.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"]')]
      .filter((node) => !node.closest(`#${ids.dock}`) && visibleOverlay(node));
    const current = new Set();
    const unclippedHosts = new Set();
    const protectedHosts = [anchorSelectors["home-composer"], anchorSelectors["chat-composer"]]
      .map((selector) => selector ? document.querySelector(selector) : null).filter(Boolean);
    for (const node of semantic) {
      current.add(node);
      const base = rectOf(node);
      const unlockOverflow = protectedHosts.some((host) => {
        if (host.contains(node) || node.contains(host) || overlaps(base, rectOf(host))) return true;
        const hostRect = rectOf(host);
        if (!base || !hostRect) return false;
        const horizontalGap = Math.max(0, hostRect.left - base.right, base.left - hostRect.right);
        const verticalGap = Math.max(0, hostRect.top - base.bottom, base.top - hostRect.bottom);
        return horizontalGap <= 24 && verticalGap <= 24;
      });
      let parent = node.parentElement;
      let surfaceLocked = false;
      for (let depth = 0; parent && parent !== document.body && depth < 10; depth += 1) {
        const parentRect = rectOf(parent);
        const style = getComputedStyle(parent);
        if (unlockOverflow && (state.overlayHostStyles.has(parent) || style.overflow !== "visible" || style.overflowX !== "visible" || style.overflowY !== "visible")) unclippedHosts.add(parent);
        const positioned = style.position === "fixed" || style.position === "absolute";
        const contains = parentRect && base && parentRect.left <= base.left + 1 && parentRect.right >= base.right - 1
          && parentRect.top <= base.top + 1 && parentRect.bottom >= base.bottom - 1;
        const nearSurface = contains && parentRect.width <= Math.min(window.innerWidth - 8, Math.max(720, base.width + 192))
          && parentRect.height <= Math.min(window.innerHeight - 8, Math.max(720, base.height + 192));
        if (!surfaceLocked && nearSurface && (positioned || parent.children.length <= 6)) current.add(parent);
        if (positioned && nearSurface) surfaceLocked = true;
        if (protectedHosts.includes(parent)) break;
        parent = parent.parentElement;
      }
    }
    for (const [node, snapshot] of state.overlayHostStyles) {
      if (unclippedHosts.has(node)) continue;
      restoreOverlayHost(node, snapshot);
      state.overlayHostStyles.delete(node);
    }
    for (const node of unclippedHosts) {
      if (!state.overlayHostStyles.has(node)) state.overlayHostStyles.set(node, rememberOverlayHost(node));
      node.style.setProperty("overflow", "visible", "important");
    }
    for (const node of state.guardedOverlays) {
      if (current.has(node)) continue;
      node.removeAttribute("data-wb-native-overlay-guard");
      state.guardedOverlays.delete(node);
    }
    for (const node of current) {
      if (!state.guardedOverlays.has(node)) {
        state.guardedOverlays.add(node);
        state.cleanups.push(() => node.removeAttribute("data-wb-native-overlay-guard"));
      }
      node.setAttribute("data-wb-native-overlay-guard", "true");
    }
    return [...current].map(rectOf);
  };

  const syncSidebarWidth = () => {
    const sidebar = document.querySelector('[data-view-id="sidebar"]');
    if (!sidebar) return null;
    const width = Math.round(sidebar.getBoundingClientRect().width);
    if (width >= 180 && width <= 480) root.style.setProperty("--wb-sidebar-width", `${width}px`);
    return sidebar;
  };

  const watchSidebarWidth = () => {
    const sidebar = syncSidebarWidth();
    if (sidebar && typeof ResizeObserver === "function") {
      state.sidebarResizeObserver = new ResizeObserver(syncSidebarWidth);
      state.sidebarResizeObserver.observe(sidebar);
    }
    listen(window, "resize", syncSidebarWidth);
    state.sidebarTimer = setTimeout(syncSidebarWidth, 500);
  };

  const syncPageMode = () => {
    const pageNode = document.querySelector(".main-content");
    root.dataset.wbPageMode = document.querySelector(".wb-home-page") || pageNode?.classList.contains("main-content--welcome") ? "home" : "task";
    const appRoot = document.querySelector("#root");
    const effectsParent = appRoot || document.body;
    if (effectsHost.parentElement !== effectsParent) effectsParent.prepend(effectsHost);
    if (pageNode && pageNode !== state.pageNode && state.pageObserver) {
      state.pageObserver.disconnect();
      state.pageObserver.observe(pageNode, { attributes: true, attributeFilter: ["class"] });
      state.pageNode = pageNode;
    }
    const pageHost = document.body;
    if (pageHost && pageHost !== state.pageHost && state.pageHostObserver) {
      state.pageHostObserver.disconnect();
      state.pageHostObserver.observe(pageHost, { childList: true, subtree: true });
      state.pageHost = pageHost;
    }
    syncNativeOverlays();
  };

  const schedulePageModeSync = () => {
    if (state.pageFrame != null) return;
    state.pageFrame = requestAnimationFrame(() => {
      state.pageFrame = null;
      syncPageMode();
    });
  };

  const watchPageMode = () => {
    if (typeof MutationObserver === "function") {
      state.pageObserver = new MutationObserver(schedulePageModeSync);
      state.pageHostObserver = new MutationObserver(schedulePageModeSync);
    }
    syncPageMode();
    state.pageTimer = setInterval(syncPageMode, 500);
    listen(window, "popstate", schedulePageModeSync);
    listen(window, "hashchange", schedulePageModeSync);
    listen(window, "scroll", syncNativeOverlays, true);
    listen(document, "pointerover", syncNativeOverlays, true);
    listen(document, "pointerout", syncNativeOverlays, true);
    listen(document, "pointerdown", syncNativeOverlays, true);
    listen(document, "pointerup", syncNativeOverlays, true);
    listen(document, "click", schedulePageModeSync, true);
  };

  const isLightColor = (value) => {
    const match = /^#([0-9a-f]{6})$/i.exec(value || "");
    if (!match) return false;
    const packed = Number.parseInt(match[1], 16);
    const red = (packed >> 16) & 255;
    const green = (packed >> 8) & 255;
    const blue = packed & 255;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue >= 128;
  };

  const resolveVisualTheme = (theme, custom) => {
    const source = { ...theme.colors, ...(custom.colors || {}) };
    const requested = custom.appearance || (custom.background ? "auto" : (theme.ui.appearance || "auto"));
    const effective = requested === "auto"
      ? (custom.detectedAppearance || (isLightColor(source.surface) ? "light" : "dark"))
      : requested;
    const surfaceMatches = isLightColor(source.surface) === (effective === "light");
    return {
      requested,
      effective,
      colors: surfaceMatches ? source : {
        ...source,
        surface: effective === "light" ? "#F3F5FA" : "#111827",
        text: effective === "light" ? "#20283B" : "#F4F7FF",
      },
    };
  };

  const applyNativeAppearance = (appearance) => {
    const dark = appearance === "dark";
    const kind = dark ? "vscode-dark" : "vscode-light";
    const name = dark ? "IDE Dark" : "IDE Light";
    for (const node of [root, document.body]) {
      node.setAttribute("data-vscode-theme-kind", kind);
      node.setAttribute("data-vscode-theme-name", name);
      node.style.colorScheme = appearance;
      for (const className of managedAppearanceClasses) {
        const darkClass = className === "dark" || className === "vscode-dark" || className === "cb-dark";
        node.classList.toggle(className, dark ? darkClass : !darkClass);
      }
    }
    root.dataset.wbAppearance = appearance;
  };

  const restoreNativeAppearance = (node, snapshot) => {
    for (const [className, enabled] of Object.entries(snapshot.classes)) node.classList.toggle(className, enabled);
    for (const [attribute, value] of [["data-vscode-theme-kind", snapshot.kind], ["data-vscode-theme-name", snapshot.name]]) {
      if (value == null) node.removeAttribute(attribute); else node.setAttribute(attribute, value);
    }
    node.style.colorScheme = snapshot.colorScheme;
  };

  let style = document.getElementById(ids.style);
  if (!style) {
    style = document.createElement("style");
    style.id = ids.style;
    (document.head || root).appendChild(style);
  }
  state.cleanups.push(() => style.remove());
  style.textContent = css;

  const effectsHost = document.createElement("div");
  effectsHost.id = ids.effects;
  effectsHost.setAttribute("aria-hidden", "true");
  effectsHost.innerHTML = `<div class="wb-weather-layer"></div>`;
  (document.querySelector("#root") || document.body).prepend(effectsHost);
  state.cleanups.push(() => effectsHost.remove());
  const weatherLayer = effectsHost.querySelector(".wb-weather-layer");

  const unitValue = (seed) => {
    let value = Math.imul((seed + 0x9e3779b9) >>> 0, 0x85ebca6b);
    value ^= value >>> 13;
    value = Math.imul(value, 0xc2b2ae35);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  };
  const syncAmbientEffects = () => {
    const custom = overrides();
    const weather = ["none", "rain", "thunder", "snow", "hearts", "stars", "custom"].includes(custom.weather) ? custom.weather : "none";
    const intensity = ["low", "medium", "high"].includes(custom.weatherIntensity) ? custom.weatherIntensity : "medium";
    const speed = ["slow", "normal", "fast"].includes(custom.effectSpeed) ? custom.effectSpeed : "normal";
    const defaultColors = { rain: "#B7DBFF", thunder: "#D9E6FF", snow: "#FFFFFF", hearts: "#FF6B9A", stars: "#FFD76A", custom: "#FFFFFF" };
    const color = typeof custom.effectColor === "string" && /^#[0-9a-f]{6}$/i.test(custom.effectColor)
      ? custom.effectColor.toUpperCase() : (defaultColors[weather] || "#FFFFFF");
    const symbolText = typeof custom.particleSymbol === "string" ? custom.particleSymbol.trim() : "";
    const customSymbol = [...symbolText].slice(0, 2).join("") || "✦";
    effectsHost.dataset.weather = weather;
    effectsHost.dataset.weatherIntensity = intensity;
    effectsHost.dataset.effectSpeed = speed;
    effectsHost.style.setProperty("--wb-particle-color", color);
    weatherLayer.replaceChildren();
    const counts = weather === "rain" || weather === "thunder"
      ? { low: 32, medium: 56, high: 84 }
      : { low: 18, medium: 32, high: 50 };
    const count = weather === "none" ? 0 : counts[intensity];
    const speedScale = { slow: 1.35, normal: 1, fast: 0.72 }[speed];
    const symbols = {
      snow: ["❄", "❅", "❆"],
      hearts: ["♥", "❤", "♡"],
      stars: ["✦", "★", "✧", "⋆"],
      custom: [customSymbol],
    };
    const modeSeed = { rain: 0, thunder: 1000, snow: 2000, hearts: 3000, stars: 4000, custom: 5000 }[weather] || 0;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("i");
      const randomValue = (salt) => unitValue(modeSeed + index * 131 + salt);
      particle.textContent = symbols[weather]?.[index % symbols[weather].length] || "";
      particle.style.setProperty("--wb-particle-x", `${Math.round(randomValue(11) * 10000) / 100}%`);
      const durationBase = weather === "rain" || weather === "thunder"
        ? 0.65 + randomValue(71) * 0.8
        : weather === "snow" ? 9 + randomValue(71) * 9 : 7 + randomValue(71) * 8;
      const duration = durationBase * speedScale;
      particle.style.setProperty("--wb-particle-duration", `${Math.round(duration * 100) / 100}s`);
      particle.style.setProperty("--wb-particle-delay", `${Math.round(randomValue(37) * duration * -100) / 100}s`);
      particle.style.setProperty("--wb-particle-scale", `${Math.round((0.55 + randomValue(101) * 0.9) * 100) / 100}`);
      particle.style.setProperty("--wb-particle-opacity", `${Math.round((0.42 + randomValue(151) * 0.5) * 100) / 100}`);
      const driftRange = weather === "snow" ? 100 : weather === "stars" ? 150 : 130;
      const drift = (salt) => `${Math.round((randomValue(salt) - 0.5) * driftRange * 2)}px`;
      particle.style.setProperty("--wb-drift-a", drift(181));
      particle.style.setProperty("--wb-drift-b", drift(211));
      particle.style.setProperty("--wb-drift-c", drift(241));
      particle.style.setProperty("--wb-drift-end", drift(271));
      const spin = Math.round((randomValue(301) - 0.5) * 720);
      particle.style.setProperty("--wb-spin-a", `${Math.round(spin * 0.28)}deg`);
      particle.style.setProperty("--wb-spin-b", `${Math.round(spin * 0.62)}deg`);
      particle.style.setProperty("--wb-spin-end", `${spin}deg`);
      weatherLayer.appendChild(particle);
    }
    const weatherSelect = document.querySelector(`#${ids.dock} [data-setting="weather"]`);
    if (weatherSelect) weatherSelect.value = weather;
    const intensitySelect = document.querySelector(`#${ids.dock} [data-setting="weather-intensity"]`);
    if (intensitySelect) {
      intensitySelect.value = intensity;
      intensitySelect.disabled = weather === "none";
    }
    const speedSelect = document.querySelector(`#${ids.dock} [data-setting="effect-speed"]`);
    if (speedSelect) {
      speedSelect.value = speed;
      speedSelect.disabled = weather === "none";
    }
    const colorInput = document.querySelector(`#${ids.dock} [data-setting="effect-color"]`);
    if (colorInput) {
      colorInput.value = color;
      colorInput.disabled = weather === "none";
    }
    const symbolInput = document.querySelector(`#${ids.dock} [data-setting="particle-symbol"]`);
    if (symbolInput) {
      symbolInput.value = customSymbol;
      symbolInput.disabled = weather !== "custom";
    }
  };

  const applyTheme = (id) => {
    const theme = themeById(id);
    state.activeId = theme.id;
    const custom = overrides();
    const art = theme.art || { focusX: 0.5, focusY: 0.5, safeArea: "auto", taskMode: "auto" };
    const background = custom.background || (theme.backgrounds || []).find((item) => item.id === custom.backgroundId)?.dataUrl || theme.backgroundDataUrl;
    const visual = resolveVisualTheme(theme, custom);
    root.dataset.workbuddySkinLab = theme.id;
    root.dataset.wbSafeArea = custom.safeArea || art.safeArea || "auto";
    root.dataset.wbTaskMode = custom.taskMode || art.taskMode || "auto";
    root.dataset.wbReadability = custom.readability === false ? "off" : "on";
    root.dataset.wbReadabilityAnchor = document.querySelector(anchorSelectors["main-content"]) ? "ready" : "missing";
    applyNativeAppearance(visual.effective);
    const styles = {
      "--wb-accent": visual.colors.accent,
      "--wb-secondary": visual.colors.secondary,
      "--wb-surface": visual.colors.surface,
      "--wb-text": visual.colors.text,
      "--wb-panel-opacity": `${Math.round(theme.ui.opacity * 100)}%`,
      "--wb-blur": `${theme.ui.blur}px`,
      "--wb-radius": `${theme.ui.radius}px`,
      "--wb-background": `url(${JSON.stringify(background)})`,
      "--wb-focus-x": `${Math.round((art.focusX ?? 0.5) * 10000) / 100}%`,
      "--wb-focus-y": `${Math.round((art.focusY ?? 0.5) * 10000) / 100}%`,
    };
    for (const [name, value] of Object.entries(styles)) root.style.setProperty(name, String(value));
    const safeAreaSelect = document.querySelector(`#${ids.dock} [data-setting="safe-area"]`);
    if (safeAreaSelect) safeAreaSelect.value = root.dataset.wbSafeArea;
    const taskModeSelect = document.querySelector(`#${ids.dock} [data-setting="task-mode"]`);
    if (taskModeSelect) taskModeSelect.value = root.dataset.wbTaskMode;
    const appearanceSelect = document.querySelector(`#${ids.dock} [data-setting="appearance"]`);
    if (appearanceSelect) appearanceSelect.value = visual.requested;
    const readabilitySelect = document.querySelector(`#${ids.dock} [data-setting="readability"]`);
    if (readabilitySelect) readabilitySelect.value = root.dataset.wbReadability;
    const themeSelect = document.querySelector(`#${ids.dock} [data-setting="theme"]`);
    if (themeSelect) themeSelect.value = theme.id;
    syncNativeOverlays();
    for (const button of document.querySelectorAll(`#${ids.dock} [data-background-id]`)) button.dataset.active = String(button.dataset.backgroundId === (custom.background ? "custom" : (custom.backgroundId || theme.backgrounds?.[0]?.id)));
    const savedNow = safeStorage.read();
    savedNow.activeId = theme.id;
    safeStorage.write(savedNow);
    if (background && (!custom.colors || !custom.detectedAppearance)) {
      refreshStoredPalette(theme.id, background);
    }
    syncAmbientEffects();
  };

  const mixRgb = (from, to, amount) => from.map((value, index) => value + (to[index] - value) * amount);
  const toHex = (rgb) => `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const extractPalette = (image) => {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = Math.max(1, Math.round(48 * image.height / image.width));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let luminanceSum = 0;
    let count = 0;
    let accent = [124, 92, 252];
    let accentScore = -1;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 32) continue;
      const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
      const high = Math.max(...rgb);
      const low = Math.min(...rgb);
      const saturation = high === 0 ? 0 : (high - low) / high;
      const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      luminanceSum += luminance;
      count += 1;
      const score = saturation * saturation * (1 - Math.abs(luminance - 140) / 180);
      if (saturation >= 0.16 && luminance >= 28 && luminance <= 238 && score > accentScore) {
        accent = rgb;
        accentScore = score;
      }
    }
    const light = (count ? luminanceSum / count : 128) >= 128;
    return {
      detectedAppearance: light ? "light" : "dark",
      colors: {
        accent: toHex(accent),
        secondary: toHex(mixRgb(accent, [92, 214, 196], 0.45)),
        surface: toHex(mixRgb(accent, light ? [250, 251, 254] : [12, 16, 26], light ? 0.92 : 0.88)),
        text: toHex(mixRgb(accent, light ? [24, 32, 51] : [244, 247, 255], 0.88)),
      },
    };
  };

  const refreshStoredPalette = (themeId, dataUrl) => {
    if (state.paletteSource === dataUrl) return;
    state.paletteSource = dataUrl;
    const image = new Image();
    listen(image, "load", () => {
      const currentTheme = themeById(themeId);
      const current = overrides();
      const selected = current.background || (currentTheme.backgrounds || []).find((item) => item.id === current.backgroundId)?.dataUrl || currentTheme.backgroundDataUrl;
      if (state.activeId !== themeId || selected !== dataUrl) return;
      try {
        savePatch(extractPalette(image));
        state.paletteSource = null;
        applyTheme(themeId);
      } catch { /* 旧背景无法取样时维持主题原色。 */ }
    }, { once: true });
    listen(image, "error", () => { /* 旧背景无法解码时维持主题原色。 */ }, { once: true });
    image.src = dataUrl;
  };

  const imageFromFile = (file, maxDimension, analyzePalette = false) => new Promise((resolve, reject) => {
    if (!file?.type?.startsWith("image/")) { reject(new Error("请选择图片文件")); return; }
    if (file.size > 20 * 1024 * 1024) { reject(new Error("图片不能超过 20 MB")); return; }
    if ((file.type === "image/svg+xml" || file.type === "image/gif") && file.size > 3 * 1024 * 1024) {
      reject(new Error("GIF/SVG 会原样保存，文件不能超过 3 MB")); return;
    }
    const reader = new FileReader();
    listen(reader, "error", () => reject(new Error("图片读取失败")), { once: true });
    listen(reader, "load", () => {
      if (!analyzePalette && (file.type === "image/svg+xml" || file.type === "image/gif")) {
        resolve({ dataUrl: reader.result }); return;
      }
      const image = new Image();
      listen(image, "error", () => reject(new Error("图片解码失败")), { once: true });
      listen(image, "load", () => {
        let palette = {};
        if (analyzePalette) {
          try { palette = extractPalette(image); } catch { /* 无法取样时继续使用主题原色。 */ }
        }
        if (file.type === "image/svg+xml" || file.type === "image/gif") {
          resolve({ dataUrl: reader.result, ...palette }); return;
        }
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/webp", 0.86), ...palette });
      }, { once: true });
      image.src = reader.result;
    }, { once: true });
    reader.readAsDataURL(file);
  });

  const chooseBackground = (maxDimension) => {
    const input = document.createElement("input");
    state.cleanups.push(() => input.remove());
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";
    listen(input, "change", async () => {
      try {
        const result = await imageFromFile(input.files?.[0], maxDimension, true);
        savePatch({ background: result.dataUrl, backgroundId: null, detectedAppearance: result.detectedAppearance, colors: result.colors });
        applyTheme(state.activeId);
        refreshBackgroundOptions();
      } catch (error) { alert(`WorkBuddy Skin Lab：${error.message}`); }
    }, { once: true });
    input.click();
  };

  const dock = document.createElement("div");
  dock.id = ids.dock;
  dock.innerHTML = `
    <button id="wb-skin-lab-toggle" type="button" title="打开换肤面板">🎨</button>
    <section id="wb-skin-lab-panel" aria-label="WorkBuddy 换肤面板">
      <strong>WorkBuddy Skin Lab</strong>
      <details open><summary>主题与背景</summary><div class="wb-panel-group">
        <label>切换主题<select data-setting="theme"></select></label>
        <button data-action="save-theme" type="button">保存当前主题（下次启动）</button>
        <span data-theme-save-status>切换只用于预览；保存后下次启动恢复。</span>
        <div data-background-options></div><span data-background-status>当前背景：方案1</span>
        <button data-action="background">指定自己的图片</button>
      </div></details>
      <details><summary>显示效果</summary><div class="wb-panel-group">
        <label>浅色/深色<select data-setting="appearance"><option value="auto">自动匹配图片</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <label>背景安全区<select data-setting="safe-area"><option value="auto">自动（左侧）</option><option value="left">左侧</option><option value="right">右侧</option><option value="center">中央</option><option value="none">不保护</option></select></label>
        <label>任务页背景<select data-setting="task-mode"><option value="auto">自动（柔和）</option><option value="ambient">柔和保留</option><option value="banner">仅顶部展示</option><option value="off">任务页关闭</option></select></label>
        <label>回答阅读层<select data-setting="readability"><option value="on">显示（更清晰）</option><option value="off">关闭（背景通透）</option></select></label>
      </div></details>
      <details><summary>环境粒子特效</summary><div class="wb-panel-group">
        <label>粒子特效<select data-setting="weather"><option value="none">关闭</option><option value="rain">下雨</option><option value="thunder">雷雨</option><option value="snow">下雪</option><option value="hearts">冒爱心</option><option value="stars">下星星</option><option value="custom">自定义符号</option></select></label>
        <label>粒子强度<select data-setting="weather-intensity"><option value="low">轻</option><option value="medium">中</option><option value="high">强</option></select></label>
        <label>粒子速度<select data-setting="effect-speed"><option value="slow">慢</option><option value="normal">正常</option><option value="fast">快</option></select></label>
        <label>粒子颜色<input data-setting="effect-color" type="color" value="#FFFFFF"></label>
        <label>自定义符号<input data-setting="particle-symbol" maxlength="4" placeholder="例如：🌸"></label>
        <small>粒子只显示在背景层，不接收点击，也不会替换 WorkBuddy 的原生内容。系统启用“减少动态效果”时会自动停止动画。</small>
      </div></details>
      <details><summary>恢复与重置</summary><div class="wb-panel-group"><button data-action="reset">重置本主题</button><button data-action="native">恢复原生界面</button></div></details>
    </section>`;
  document.body.appendChild(dock);
  state.cleanups.push(() => dock.remove());
  const panel = dock.querySelector("#wb-skin-lab-panel");
  const toggle = dock.querySelector("#wb-skin-lab-toggle");
  const themeSelect = dock.querySelector('[data-setting="theme"]');
  for (const theme of themes) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    themeSelect.appendChild(option);
  }
  themeSelect.value = state.activeId;
  const refreshBackgroundOptions = () => {
    const theme = themeById(state.activeId);
    const custom = overrides();
    const container = dock.querySelector("[data-background-options]");
    container.replaceChildren();
    for (const background of theme.backgrounds || []) {
      const button = document.createElement("button");
      const image = document.createElement("img");
      const label = document.createElement("span");
      button.type = "button";
      button.dataset.backgroundId = background.id;
      button.title = background.label;
      image.src = background.dataUrl;
      image.alt = "";
      label.textContent = background.label;
      button.append(image, label);
      container.appendChild(button);
      listen(button, "click", () => {
        savePatch({ background: null, backgroundId: background.id, colors: null, detectedAppearance: null });
        applyTheme(state.activeId);
        refreshStoredPalette(state.activeId, background.dataUrl);
        refreshBackgroundOptions();
      });
    }
    const activeId = custom.background ? "custom" : (custom.backgroundId || theme.backgrounds?.[0]?.id);
    for (const button of container.querySelectorAll("button")) button.dataset.active = String(button.dataset.backgroundId === activeId);
    const active = (theme.backgrounds || []).find((item) => item.id === activeId);
    dock.querySelector("[data-background-status]").textContent = `当前背景：${custom.background ? "自定义图片" : (active?.label || "默认背景")}`;
  };
  const themeSaveStatus = dock.querySelector("[data-theme-save-status]");
  const updateThemeSaveStatus = () => {
    const preferredId = safeStorage.read().preferredActiveId;
    themeSaveStatus.textContent = preferredId === state.activeId
      ? `已保存“${themeById(state.activeId).name}”，下次启动将自动恢复。`
      : "当前为预览状态；点击“保存当前主题”后才设为下次启动主题。";
  };
  updateThemeSaveStatus();
  refreshBackgroundOptions();
  const clampDockPosition = (position) => ({
    x: Math.max(8, Math.min(window.innerWidth - 46, Number(position?.x) || window.innerWidth - 54)),
    y: Math.max(8, Math.min(window.innerHeight - 46, Number(position?.y) || 54)),
  });
  const placeDock = (position, persist = false) => {
    const next = clampDockPosition(position);
    const opensUp = next.y > window.innerHeight / 2;
    dock.style.left = `${Math.round(next.x)}px`;
    dock.style.top = `${Math.round(next.y)}px`;
    dock.style.removeProperty("right");
    dock.dataset.panelSide = next.x > window.innerWidth / 2 ? "left" : "right";
    dock.dataset.panelVertical = opensUp ? "up" : "down";
    const availableHeight = opensUp ? next.y - 62 : window.innerHeight - next.y - 62;
    dock.style.setProperty("--wb-panel-max-height", `${Math.max(180, Math.floor(availableHeight))}px`);
    if (persist) {
      const current = safeStorage.read();
      current.dockPosition = next;
      safeStorage.write(current);
    }
    return next;
  };
  let dockPosition = placeDock(saved.dockPosition);
  let drag = null;
  let suppressToggle = false;
  listen(toggle, "pointerdown", (event) => {
    if (event.button != null && event.button !== 0) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: dockPosition, moved: false };
    toggle.setPointerCapture?.(event.pointerId);
  });
  listen(toggle, "pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    panel.classList.remove("open");
    dockPosition = placeDock({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    event.preventDefault();
  });
  const finishDockDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    suppressToggle = drag.moved;
    if (drag.moved) dockPosition = placeDock(dockPosition, true);
    toggle.releasePointerCapture?.(event.pointerId);
    drag = null;
  };
  listen(toggle, "pointerup", finishDockDrag);
  listen(toggle, "pointercancel", finishDockDrag);
  listen(toggle, "click", (event) => {
    if (suppressToggle) { suppressToggle = false; event.preventDefault(); return; }
    panel.classList.toggle("open");
  });
  listen(window, "resize", () => { dockPosition = placeDock(dockPosition, true); });
  listen(themeSelect, "change", () => {
    const next = themes.find((theme) => theme.id === themeSelect.value);
    if (!next) return;
    const current = safeStorage.read();
    current.activeId = next.id;
    current.activeIdUpdatedAt = Date.now();
    if (!safeStorage.write(current)) throw new Error("无法保存主题切换状态");
    applyTheme(next.id);
    refreshBackgroundOptions();
    updateThemeSaveStatus();
  });
  listen(dock.querySelector('[data-action="save-theme"]'), "click", () => {
    const current = safeStorage.read();
    current.preferredActiveId = state.activeId;
    current.preferredActiveIdUpdatedAt = Date.now();
    if (!safeStorage.write(current)) {
      alert("WorkBuddy Skin Lab：无法保存当前主题，请先清理浏览器本地存储空间");
      return;
    }
    updateThemeSaveStatus();
  });
  listen(dock.querySelector('[data-setting="appearance"]'), "change", (event) => {
    savePatch({ appearance: event.target.value });
    applyTheme(state.activeId);
  });
  listen(dock.querySelector('[data-setting="safe-area"]'), "change", (event) => {
    savePatch({ safeArea: event.target.value });
    applyTheme(state.activeId);
  });
  listen(dock.querySelector('[data-setting="task-mode"]'), "change", (event) => {
    savePatch({ taskMode: event.target.value });
    applyTheme(state.activeId);
  });
  listen(dock.querySelector('[data-setting="readability"]'), "change", (event) => {
    savePatch({ readability: event.target.value !== "off" });
    applyTheme(state.activeId);
  });
  listen(dock.querySelector('[data-setting="weather"]'), "change", (event) => {
    savePatch({ weather: event.target.value });
    syncAmbientEffects();
  });
  listen(dock.querySelector('[data-setting="weather-intensity"]'), "change", (event) => {
    savePatch({ weatherIntensity: event.target.value });
    syncAmbientEffects();
  });
  listen(dock.querySelector('[data-setting="effect-speed"]'), "change", (event) => {
    savePatch({ effectSpeed: event.target.value });
    syncAmbientEffects();
  });
  listen(dock.querySelector('[data-setting="effect-color"]'), "change", (event) => {
    savePatch({ effectColor: event.target.value.toUpperCase() });
    syncAmbientEffects();
  });
  listen(dock.querySelector('[data-setting="particle-symbol"]'), "change", (event) => {
    savePatch({ particleSymbol: [...event.target.value.trim()].slice(0, 2).join("") });
    syncAmbientEffects();
  });
  listen(dock.querySelector('[data-action="background"]'), "click", () => chooseBackground(1920));
  listen(dock.querySelector('[data-action="reset"]'), "click", () => {
    const current = safeStorage.read();
    if (current.overrides) delete current.overrides[state.activeId];
    safeStorage.write(current);
    applyTheme(state.activeId);
    refreshBackgroundOptions();
  });

  state.cleanup = () => {
    clearTimeout(state.sidebarTimer);
    clearInterval(state.pageTimer);
    if (state.pageFrame != null) cancelAnimationFrame(state.pageFrame);
    state.sidebarResizeObserver?.disconnect();
    state.pageObserver?.disconnect();
    state.pageHostObserver?.disconnect();
    for (const remove of state.listeners) remove();
    for (const cleanup of state.cleanups) cleanup();
    delete root.dataset.workbuddySkinLab;
    delete root.dataset.wbPageMode;
    delete root.dataset.wbSafeArea;
    delete root.dataset.wbTaskMode;
    delete root.dataset.wbReadability;
    delete root.dataset.wbReadabilityAnchor;
    delete root.dataset.wbAppearance;
    for (const node of state.guardedOverlays) node.removeAttribute("data-wb-native-overlay-guard");
    state.guardedOverlays.clear();
    for (const [node, snapshot] of state.overlayHostStyles) restoreOverlayHost(node, snapshot);
    state.overlayHostStyles.clear();
    for (const property of ["--wb-accent", "--wb-secondary", "--wb-surface", "--wb-text", "--wb-panel-opacity", "--wb-blur", "--wb-radius", "--wb-background", "--wb-focus-x", "--wb-focus-y", "--wb-sidebar-width"]) root.style.removeProperty(property);
    restoreNativeAppearance(root, state.originalAppearance.html);
    restoreNativeAppearance(document.body, state.originalAppearance.body);
    if (window[ids.state] === state) delete window[ids.state];
    return true;
  };
  listen(dock.querySelector('[data-action="native"]'), "click", state.cleanup);
  window[ids.state] = state;
  watchSidebarWidth();
  watchPageMode();
  applyTheme(state.activeId);
  return { installed: true, activeId: state.activeId, themes: themes.length };
}

export function buildRuntimeScript({ css, themes, activeId }) {
  if (!Array.isArray(themes) || themes.length === 0) throw new Error("至少需要一个可注入主题");
  if (!themes.some((theme) => theme.id === activeId)) throw new Error(`活动主题不存在：${activeId}`);
  // WorkBuddy 的首页组件结构会随版本更新而改变。运行时只接收稳定的背景能力，
  // 即使旧主题仍带有文案或模块字段，也不能重新启用脆弱的 DOM 注入。
  const backgroundThemes = themes.map((theme) => ({
    ...theme,
    homeHeader: null,
    copySets: [],
    modules: [],
  }));
  const payload = { css, themes: backgroundThemes, activeId, ids: { style: STYLE_ID, dock: DOCK_ID, effects: EFFECTS_ID, state: STATE_KEY }, anchorSelectors: ANCHOR_SELECTORS };
  return `(${runtimeMain.toString()})(${JSON.stringify(payload)})`;
}

export function buildCleanupScript() {
  return `(() => window[${JSON.stringify(STATE_KEY)}]?.cleanup?.() ?? false)()`;
}

export function buildStatusScript() {
  return `(() => { const state = window[${JSON.stringify(STATE_KEY)}]; const effects = document.getElementById(${JSON.stringify(EFFECTS_ID)}); return { installed: Boolean(state), requestedThemeId: state?.requestedId || null, themeId: document.documentElement.dataset.workbuddySkinLab || null, pageMode: document.documentElement.dataset.wbPageMode || null, readability: document.documentElement.dataset.wbReadability || null, backgroundOnly: true, ambientEffects: effects ? { weather: effects.dataset.weather || "none" } : null, panel: Boolean(document.getElementById(${JSON.stringify(DOCK_ID)})), nativeOverlays: document.querySelectorAll("[data-wb-native-overlay-guard]").length }; })()`;
}

export function buildModuleInspectionScript() {
  return `(() => {
    const selectors = ${JSON.stringify(ANCHOR_SELECTORS)};
    const rectOf = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    const overlaps = (left, right) => Boolean(left && right && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top);
    const anchors = Object.fromEntries(Object.entries(selectors).map(([id, selector]) => [id, rectOf(document.querySelector(selector))]));
    const modules = [...document.querySelectorAll("[data-wb-module]")].map((node) => {
      const rect = rectOf(node);
      const style = getComputedStyle(node);
      return {
        id: node.dataset.wbModule,
        kind: node.dataset.wbModuleKind,
        slot: node.dataset.wbModuleSlot,
        order: Number(node.dataset.wbModuleOrder),
        visible: node.dataset.wbVisible === "true",
        rect,
        style: { opacity: style.opacity, visibility: style.visibility, pointerEvents: style.pointerEvents, backgroundColor: style.backgroundColor },
        textOverflow: [...node.querySelectorAll(".wb-module-eyebrow,.wb-module-title,.wb-module-subtitle,.wb-module-badge")]
          .some((text) => {
            const textStyle = getComputedStyle(text);
            return textStyle.display !== "none" && textStyle.visibility !== "hidden"
              && (text.scrollWidth > text.clientWidth + 1 || text.scrollHeight > text.clientHeight + 1);
          }),
        interactiveOverlaps: ["home-composer", "quick-actions", "chat-composer", "dialog"].filter((id) => overlaps(rect, anchors[id])),
      };
    });
    const rootStyle = getComputedStyle(document.documentElement);
    const homeHeader = {
      title: document.querySelector(selectors["home-header-title"])?.textContent ?? null,
      subtitle: document.querySelector(selectors["home-header-subtitle"])?.textContent ?? null,
    };
    const textEditors = [...document.querySelectorAll("#${DOCK_ID} [data-module-editor] input")].map((input) => ({
      moduleId: input.closest("[data-module-id]")?.dataset.moduleId ?? null,
      field: input.dataset.textKey ?? null,
      maxLength: input.maxLength,
      value: input.value,
    }));
    const nativeOverlays = [...document.querySelectorAll("[data-wb-native-overlay-guard]")].map((node) => {
      const rect = rectOf(node);
      const style = getComputedStyle(node);
      let clippedAncestors = 0;
      const composer = document.querySelector(selectors["home-composer"]);
      if (node.getAttribute("role")) {
        for (let parent = node.parentElement, depth = 0; parent && parent !== document.body && depth < 10; parent = parent.parentElement, depth += 1) {
          const parentStyle = getComputedStyle(parent);
          if (parentStyle.overflow !== "visible" || parentStyle.overflowX !== "visible" || parentStyle.overflowY !== "visible") clippedAncestors += 1;
          if (parent === composer) break;
        }
      }
      return { role: node.getAttribute("role"), rect, clippedAncestors, style: { zIndex: style.zIndex, backgroundColor: style.backgroundColor, pointerEvents: style.pointerEvents, opacity: style.opacity } };
    });
    return { themeId: document.documentElement.dataset.workbuddySkinLab || null, pageMode: document.documentElement.dataset.wbPageMode || null, anchors, homeHeader, modules, nativeOverlays, textEditors, rootStyle: { color: rootStyle.color, backgroundColor: rootStyle.backgroundColor } };
  })()`;
}
