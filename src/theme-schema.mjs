import { lstat, readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep, win32 } from "node:path";

import { ANCHOR_IDS } from "./anchors.mjs";
import { THEME_SCHEMA_VERSION } from "./constants.mjs";
import { MODULE_SLOTS, resolveModuleSlot } from "./module-slots.mjs";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_COLORS = { accent: "#7C5CFC", secondary: "#41D9C5", surface: "#101525", text: "#F4F7FF" };
const SAFE_AREAS = new Set(["auto", "left", "right", "center", "none"]);
const TASK_MODES = new Set(["auto", "ambient", "banner", "off"]);
const APPEARANCES = new Set(["auto", "light", "dark"]);
const ANCHORS = new Set(ANCHOR_IDS);
const MODULE_KINDS = new Set(["decorate", "icon-swap", "floating"]);
const MODULE_STATES = new Set(["default", "hover", "active"]);

export const MODULE_SOFT_COUNT_LIMIT = 5;
export const MODULE_SOFT_TOTAL_BYTES = 20 * 1024 * 1024;
export const MODULE_HARD_TOTAL_BYTES = 100 * 1024 * 1024;
export const BACKGROUND_SOFT_BYTES = 12 * 1024 * 1024;
export const BACKGROUND_HARD_TOTAL_BYTES = 60 * 1024 * 1024;

function record(value, label) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value;
}

function boundedNumber(value, fallback, min, max, label) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${label} 必须在 ${min} 到 ${max} 之间`);
  return result;
}

export function assetPath(value, { required = false, label }) {
  if (!value && !required) return null;
  if (typeof value !== "string" || !value.trim() || isAbsolute(value) || win32.isAbsolute(value)) {
    throw new Error(`${label} 必须是主题目录内的相对路径`);
  }
  if (value.split(/[\\/]+/).includes("..") || !IMAGE_EXTENSIONS.has(extname(value).toLowerCase())) {
    throw new Error(`${label} 只支持 PNG、JPEG、WebP、GIF 或 SVG`);
  }
  return value;
}

function moduleBox(value, label) {
  const box = record(value, `${label}.box`);
  const normalized = {
    x: boundedNumber(box.x, undefined, 0, 1, `${label}.box.x`),
    y: boundedNumber(box.y, undefined, 0, 1, `${label}.box.y`),
    w: boundedNumber(box.w, undefined, 0, 1, `${label}.box.w`),
    h: boundedNumber(box.h, undefined, 0, 1, `${label}.box.h`),
  };
  if (normalized.w === 0 || normalized.h === 0) throw new Error(`${label}.box.w 和 ${label}.box.h 必须大于 0`);
  if (normalized.x + normalized.w > 1 || normalized.y + normalized.h > 1) throw new Error(`${label}.box 越出了锚点安全区`);
  return normalized;
}

function fixedModuleText(value, definition, label) {
  const input = record(value, `${label}.text`);
  const result = {};
  for (const key of Object.keys(input)) {
    if (!(key in definition.text)) throw new Error(`${label}.text.${key} 不属于该固定槽位`);
  }
  for (const [key, maxLength] of Object.entries(definition.text)) {
    const text = input[key];
    if (text == null || text === "") continue;
    if (typeof text !== "string" || !text.trim() || text.trim().length > maxLength) {
      throw new Error(`${label}.text.${key} 必须是 1 到 ${maxLength} 个字符的纯文本`);
    }
    result[key] = text.trim();
  }
  for (const key of definition.requiredText) {
    if (!result[key]) throw new Error(`${label}.text.${key} 是该固定槽位的必填文字`);
  }
  return result;
}

function normalizeModules(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("modules 必须是数组");
  const ids = new Set();
  const placements = new Set();
  return value.map((input, index) => {
    const label = `modules[${index}]`;
    const data = record(input, label);
    if (typeof data.id !== "string" || !ID.test(data.id)) throw new Error(`${label}.id 只能包含小写字母、数字和连字符`);
    if (ids.has(data.id)) throw new Error(`modules 中的 id 必须唯一：${data.id}`);
    ids.add(data.id);
    if (typeof data.slot !== "string" || !(data.slot in MODULE_SLOTS)) throw new Error(`${label}.slot 不在固定组件槽位中`);
    const slotBase = MODULE_SLOTS[data.slot];
    const order = data.order ?? 0;
    if (!Number.isInteger(order) || order < 0 || order >= slotBase.maxInstances) throw new Error(`${label}.order 超出 ${data.slot} 固定槽位范围`);
    const placement = `${data.slot}:${order}`;
    if (placements.has(placement)) throw new Error(`modules 固定槽位重复：${placement}`);
    placements.add(placement);
    const definition = resolveModuleSlot(data.slot, order);
    if (!ANCHORS.has(data.anchor) || data.anchor !== definition.anchor) throw new Error(`${label}.anchor 必须是固定值 ${definition.anchor}`);
    if (!MODULE_KINDS.has(data.kind) || data.kind !== definition.kind) throw new Error(`${label}.kind 必须是固定值 ${definition.kind}`);
    const state = data.state ?? "default";
    if (!MODULE_STATES.has(state)) throw new Error(`${label}.state 必须是 default、hover 或 active`);
    const asset = assetPath(data.asset, { required: true, label: `${label}.asset` });
    if (asset.replaceAll("\\", "/") !== `assets/${data.id}${extname(asset).toLowerCase()}`) {
      throw new Error(`${label}.asset 必须单独存放为 assets/${data.id}.<ext>`);
    }
    let action = null;
    if (data.action != null) {
      if (data.kind !== "floating") throw new Error(`${label}.action 仅允许用于 floating 模块`);
      const candidate = record(data.action, `${label}.action`);
      if (!ANCHORS.has(candidate.forwardTo)) throw new Error(`${label}.action.forwardTo 不在锚点白名单中`);
      if (candidate.forwardTo === data.anchor) throw new Error(`${label}.action.forwardTo 必须是另一个锚点`);
      action = { forwardTo: candidate.forwardTo };
    }
    const box = moduleBox(data.box, label);
    if (Object.keys(box).some((key) => Math.abs(box[key] - definition.box[key]) > 1e-9)) {
      throw new Error(`${label}.box 必须使用 ${data.slot} 槽位的固定布局`);
    }
    return {
      id: data.id, slot: data.slot, order, anchor: data.anchor, kind: data.kind, asset, box,
      mount: definition.mount, hostPath: definition.hostPath, minAnchor: definition.minAnchor, textLimits: definition.text,
      requiredText: definition.requiredText, text: fixedModuleText(data.text, definition, label), state, action,
    };
  });
}

function normalizeHomeHeader(value) {
  if (value == null) return null;
  const input = record(value, "homeHeader");
  for (const key of Object.keys(input)) {
    if (!['title', 'subtitle'].includes(key)) throw new Error(`homeHeader.${key} 不是允许字段`);
  }
  const limits = { title: 24, subtitle: 36 };
  const result = {};
  for (const [key, limit] of Object.entries(limits)) {
    const text = input[key];
    if (typeof text !== "string" || !text.trim() || text.trim().length > limit) {
      throw new Error(`homeHeader.${key} 必须是 1 到 ${limit} 个字符的纯文本`);
    }
    result[key] = text.trim();
  }
  return result;
}

function normalizeBackgrounds(value, background) {
  if (value == null) return [{ id: "background-1", label: "默认背景", asset: background }];
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw new Error("backgrounds 必须包含 1 到 3 张背景");
  const ids = new Set();
  const assets = new Set();
  const result = value.map((input, index) => {
    const label = `backgrounds[${index}]`;
    const data = record(input, label);
    if (typeof data.id !== "string" || !ID.test(data.id)) throw new Error(`${label}.id 只能包含小写字母、数字和连字符`);
    if (ids.has(data.id)) throw new Error(`backgrounds 中的 id 必须唯一：${data.id}`);
    ids.add(data.id);
    if (typeof data.label !== "string" || !data.label.trim() || data.label.trim().length > 24) throw new Error(`${label}.label 必须是 1 到 24 个字符`);
    const asset = assetPath(data.asset, { required: true, label: `${label}.asset` });
    if (assets.has(asset)) throw new Error(`backgrounds 中的 asset 必须唯一：${asset}`);
    assets.add(asset);
    return { id: data.id, label: data.label.trim(), asset };
  });
  if (result[0].asset !== background) throw new Error("background 必须与 backgrounds[0].asset 一致");
  return result;
}

function normalizeCopySets(value, homeHeader, modules) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) throw new Error("copySets 必须包含 1 到 3 套文案");
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const ids = new Set();
  return value.map((input, index) => {
    const label = `copySets[${index}]`;
    const data = record(input, label);
    if (typeof data.id !== "string" || !ID.test(data.id) || ids.has(data.id)) throw new Error(`${label}.id 必须是唯一的安全 ID`);
    ids.add(data.id);
    if (typeof data.label !== "string" || !data.label.trim() || data.label.trim().length > 12) throw new Error(`${label}.label 必须是 1 到 12 个字符`);
    const copyModules = record(data.modules, `${label}.modules`);
    const normalizedModules = {};
    for (const [moduleId, text] of Object.entries(copyModules)) {
      const module = moduleById.get(moduleId);
      if (!module) throw new Error(`${label}.modules.${moduleId} 不属于当前固定模块`);
      normalizedModules[moduleId] = fixedModuleText(text, { text: module.textLimits, requiredText: module.requiredText }, `${label}.modules.${moduleId}`);
    }
    return { id: data.id, label: data.label.trim(), homeHeader: normalizeHomeHeader(data.homeHeader ?? homeHeader), modules: normalizedModules };
  });
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function validateThemeManifest(input) {
  const data = record(input, "theme.json");
  if (data.schemaVersion !== THEME_SCHEMA_VERSION) throw new Error(`不支持 schemaVersion ${data.schemaVersion}`);
  if (typeof data.id !== "string" || !ID.test(data.id)) throw new Error("id 只能包含小写字母、数字和连字符");
  if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 60) throw new Error("name 必须是 1 到 60 个字符");

  const colors = record(data.colors, "colors");
  const normalizedColors = {};
  for (const [key, fallback] of Object.entries(DEFAULT_COLORS)) {
    const value = colors[key] ?? fallback;
    if (typeof value !== "string" || !HEX.test(value)) throw new Error(`colors.${key} 必须是六位十六进制颜色`);
    normalizedColors[key] = value.toUpperCase();
  }

  const ui = record(data.ui, "ui");
  const art = record(data.art, "art");
  if (!APPEARANCES.has(ui.appearance ?? "auto")) throw new Error("ui.appearance 必须是 auto、light 或 dark");
  if (!SAFE_AREAS.has(art.safeArea ?? "auto")) throw new Error("art.safeArea 必须是 auto、left、right、center 或 none");
  if (!TASK_MODES.has(art.taskMode ?? "auto")) throw new Error("art.taskMode 必须是 auto、ambient、banner 或 off");
  const background = assetPath(data.background, { required: true, label: "background" });
  const modules = normalizeModules(data.modules);
  const homeHeader = normalizeHomeHeader(data.homeHeader);
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    id: data.id,
    name: data.name.trim(),
    background,
    backgrounds: normalizeBackgrounds(data.backgrounds, background),
    colors: normalizedColors,
    ui: {
      opacity: boundedNumber(ui.opacity, 0.82, 0.35, 1, "ui.opacity"),
      blur: boundedNumber(ui.blur, 18, 0, 40, "ui.blur"),
      radius: boundedNumber(ui.radius, 16, 0, 32, "ui.radius"),
      appearance: ui.appearance ?? "auto",
    },
    art: {
      focusX: boundedNumber(art.focusX, 0.5, 0, 1, "art.focusX"),
      focusY: boundedNumber(art.focusY, 0.5, 0, 1, "art.focusY"),
      safeArea: art.safeArea ?? "auto",
      taskMode: art.taskMode ?? "auto",
    },
    homeHeader,
    modules,
    copySets: normalizeCopySets(data.copySets, homeHeader, modules),
  };
}

export async function verifiedAsset(root, relativePath, label) {
  if (!relativePath) return null;
  const candidate = resolve(root, relativePath);
  if (!inside(root, candidate)) throw new Error(`${label} 越过了主题目录`);
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  if (!inside(realRoot, realCandidate)) throw new Error(`${label} 通过链接越过了主题目录`);
  const info = await lstat(realCandidate);
  if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024) throw new Error(`${label} 必须是 1 B 到 20 MB 的文件`);
  return realCandidate;
}

export async function loadTheme(themeDir) {
  const root = resolve(themeDir);
  const manifest = validateThemeManifest(JSON.parse(await readFile(resolve(root, "theme.json"), "utf8")));
  const backgroundAssets = [];
  let backgroundBytes = 0;
  for (const background of manifest.backgrounds) {
    const path = await verifiedAsset(root, background.asset, `background ${background.id}`);
    const size = (await lstat(path)).size;
    backgroundBytes += size;
    backgroundAssets.push({ ...background, path, size });
  }
  if (backgroundBytes > BACKGROUND_HARD_TOTAL_BYTES) throw new Error(`backgrounds 素材总大小不能超过 ${BACKGROUND_HARD_TOTAL_BYTES / 1024 / 1024} MB`);
  const backgroundPath = backgroundAssets[0].path;
  const moduleAssets = [];
  let moduleBytes = 0;
  for (const module of manifest.modules) {
    const path = await verifiedAsset(root, module.asset, `module ${module.id}`);
    const size = (await lstat(path)).size;
    moduleBytes += size;
    moduleAssets.push({ id: module.id, path, size });
  }
  if (moduleBytes > MODULE_HARD_TOTAL_BYTES) throw new Error(`modules 素材总大小不能超过 ${MODULE_HARD_TOTAL_BYTES / 1024 / 1024} MB`);
  const warnings = [];
  for (const background of backgroundAssets) if (background.size > BACKGROUND_SOFT_BYTES) warnings.push(`${background.label} 为 ${(background.size / 1024 / 1024).toFixed(1)} MB，建议不超过 12 MB`);
  if (manifest.modules.length > MODULE_SOFT_COUNT_LIMIT) warnings.push(`modules 有 ${manifest.modules.length} 个，建议每批不超过 ${MODULE_SOFT_COUNT_LIMIT} 个`);
  if (moduleBytes > MODULE_SOFT_TOTAL_BYTES) warnings.push(`modules 素材共 ${(moduleBytes / 1024 / 1024).toFixed(1)} MB，建议分批控制在 ${MODULE_SOFT_TOTAL_BYTES / 1024 / 1024} MB 内`);
  return { root, manifest, backgroundPath, backgroundAssets, moduleAssets, warnings };
}
