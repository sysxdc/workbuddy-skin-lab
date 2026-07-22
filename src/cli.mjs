#!/usr/bin/env node
import { access } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEFAULT_CDP_PORT, DEFAULT_THEME_ID, PRODUCT_NAME, RENDERER_URL_HINT, resolveStatePaths } from "./constants.mjs";
import { applySkin, inspectModules, probeAnchors, removeSkin, skinStatus } from "./injector.mjs";
import { loadTheme } from "./theme-schema.mjs";
import { createTheme, listThemeDirectories, readActiveThemeId, writeActiveThemeId } from "./theme-store.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseOptions(argv) {
  const result = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`无法识别的参数：${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} 缺少值`);
    result[token.slice(2)] = value;
    index += 1;
  }
  return result;
}

function portValue(value) {
  const port = value === undefined ? DEFAULT_CDP_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port 必须是 1024 到 65535 的整数");
  return port;
}

async function exists(path) {
  return Boolean(path) && access(path).then(() => true, () => false);
}

async function loadedThemes(roots) {
  const directories = await listThemeDirectories(roots);
  const valid = [];
  const invalid = [];
  const warnings = [];
  for (const entry of directories) {
    try {
      const loaded = await loadTheme(entry.path);
      loaded.modifiedAtMs = entry.modifiedAtMs || 0;
      valid.push(loaded);
      for (const warning of loaded.warnings) warnings.push({ id: loaded.manifest.id, warning });
    }
    catch (error) { invalid.push({ id: entry.id, path: entry.path, error: error.message }); }
  }
  return { valid, invalid, warnings };
}

function insideOrEqual(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel));
}

export function chooseActiveThemeId(valid, { requested, remembered, userThemesRoot } = {}) {
  const available = new Set(valid.map(({ manifest }) => manifest.id));
  if (requested) return requested;
  if (remembered && available.has(remembered)) return remembered;
  const latestUserTheme = valid.filter(({ root }) => userThemesRoot && insideOrEqual(userThemesRoot, root))
    .sort((left, right) => (right.modifiedAtMs || 0) - (left.modifiedAtMs || 0))[0];
  return latestUserTheme?.manifest.id || DEFAULT_THEME_ID;
}

function dependencies(overrides = {}) {
  const state = resolveStatePaths();
  return {
    roots: [join(repositoryRoot, "themes"), state.themesRoot],
    userThemesRoot: state.themesRoot,
    settingsPath: state.settingsPath,
    applySkin,
    removeSkin,
    skinStatus,
    probeAnchors,
    inspectModules,
    createTheme,
    readActiveThemeId: () => readActiveThemeId(state.settingsPath),
    writeActiveThemeId: (id) => writeActiveThemeId(state.settingsPath, id),
    ...overrides,
  };
}

export async function runCli(argv, overrides = {}) {
  const command = argv[0] || "help";
  const options = parseOptions(argv);
  const deps = dependencies(overrides);

  if (command === "help") {
    return {
      product: PRODUCT_NAME,
      commands: [
        "list", "validate", "create --background PATH --name NAME",
        "apply [--theme ID] [--port 9223]", "status [--port 9223]", "pause [--port 9223]", "probe-anchors [--port 9223]", "inspect-modules --output-dir PATH [--port 9223]", "doctor",
      ],
    };
  }
  if (command === "list" || command === "validate") {
    const result = await loadedThemes(deps.roots);
    return command === "list"
      ? { themes: result.valid.map(({ manifest, root }) => ({ id: manifest.id, name: manifest.name, path: root })), invalid: result.invalid, warnings: result.warnings }
      : { valid: result.valid.length, invalid: result.invalid, warnings: result.warnings };
  }
  if (command === "create") {
    if (!options.background) throw new Error("create 需要 --background PATH");
    if (!options.name) throw new Error("create 需要 --name NAME");
    return deps.createTheme({ backgroundPath: options.background, name: options.name, storeRoot: resolveStatePaths().themesRoot });
  }
  if (command === "apply") {
    const result = await loadedThemes(deps.roots);
    if (result.invalid.length) process.stderr.write(`提示：已忽略 ${result.invalid.length} 个无效主题。\n`);
    for (const item of result.warnings) process.stderr.write(`提示：主题 ${item.id}：${item.warning}。\n`);
    const available = new Set(result.valid.map(({ manifest }) => manifest.id));
    const remembered = options.theme ? null : await deps.readActiveThemeId();
    const activeId = chooseActiveThemeId(result.valid, { requested: options.theme, remembered, userThemesRoot: deps.userThemesRoot });
    if (!available.has(activeId)) throw new Error(`找不到有效主题：${activeId}`);
    const applied = await deps.applySkin({ loadedThemes: result.valid, activeId, port: portValue(options.port) });
    await deps.writeActiveThemeId(activeId);
    return { ...applied, persistedThemeId: activeId };
  }
  if (command === "pause" || command === "restore") return deps.removeSkin({ port: portValue(options.port) });
  if (command === "status") return deps.skinStatus({ port: portValue(options.port) });
  if (command === "probe-anchors") return deps.probeAnchors({ port: portValue(options.port) });
  if (command === "inspect-modules") {
    if (!options["output-dir"]) throw new Error("inspect-modules 需要 --output-dir PATH");
    return deps.inspectModules({ port: portValue(options.port), outputDir: resolve(options["output-dir"]) });
  }
  if (command === "doctor") {
    const candidates = [
      process.env.WORKBUDDY_EXE,
      "D:\\WorkBuddy\\WorkBuddy.exe",
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "workbuddy", "WorkBuddy.exe"),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "workbuddy", "WorkBuddy.exe"),
      process.env.ProgramFiles && join(process.env.ProgramFiles, "WorkBuddy", "WorkBuddy.exe"),
      process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "WorkBuddy", "WorkBuddy.exe"),
    ].filter(Boolean);
    let app = null;
    for (const candidate of candidates) if (await exists(candidate)) { app = candidate; break; }
    return { platform: process.platform, node: process.version, nodeSupported: Number(process.versions.node.split(".")[0]) >= 22, app, appFound: Boolean(app), candidates, cdpPort: DEFAULT_CDP_PORT, rendererHint: RENDERER_URL_HINT, stateRoot: resolveStatePaths().root };
  }
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runCli(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    (error) => { process.stderr.write(`${PRODUCT_NAME}：${error.message}\n`); process.exitCode = 1; },
  );
}
