import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const THEME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function readActiveThemeId(settingsPath) {
  try {
    const value = JSON.parse(await readFile(settingsPath, "utf8"));
    return typeof value.activeThemeId === "string" && THEME_ID.test(value.activeThemeId) ? value.activeThemeId : null;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function readPendingThemeId(settingsPath) {
  try {
    const value = JSON.parse(await readFile(settingsPath, "utf8"));
    return typeof value.pendingThemeId === "string" && THEME_ID.test(value.pendingThemeId) ? value.pendingThemeId : null;
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writePendingThemeId(settingsPath, pendingThemeId) {
  if (typeof pendingThemeId !== "string" || !THEME_ID.test(pendingThemeId)) throw new Error("待启用主题 ID 无效");
  let current = {};
  try { current = JSON.parse(await readFile(settingsPath, "utf8")); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ ...current, pendingThemeId, pendingThemeUpdatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  return pendingThemeId;
}

export async function writeActiveThemeId(settingsPath, activeThemeId) {
  if (typeof activeThemeId !== "string" || !THEME_ID.test(activeThemeId)) throw new Error("活动主题 ID 无效");
  let current = {};
  try { current = JSON.parse(await readFile(settingsPath, "utf8")); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  await mkdir(dirname(settingsPath), { recursive: true });
  const { pendingThemeId: _pendingThemeId, pendingThemeUpdatedAt: _pendingThemeUpdatedAt, ...next } = current;
  await writeFile(settingsPath, `${JSON.stringify({ ...next, activeThemeId, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  return activeThemeId;
}

export function slugify(value) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "custom-theme";
}

async function checkImage(path, label) {
  const extension = extname(path).toLowerCase();
  if (!EXTENSIONS.has(extension)) throw new Error(`${label} 只支持 PNG、JPEG、WebP、GIF 或 SVG`);
  const info = await stat(path);
  if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024) throw new Error(`${label} 必须是 1 B 到 20 MB 的文件`);
  return extension;
}

export async function createTheme({ backgroundPath, name, storeRoot }) {
  const backgroundExtension = await checkImage(backgroundPath, "背景图片");
  const digest = createHash("sha256").update(`${name}\0${basename(backgroundPath)}\0${Date.now()}`).digest("hex").slice(0, 8);
  const id = `${slugify(name)}-${digest}`;
  const destination = join(storeRoot, id);
  const temporary = join(storeRoot, `.tmp-${id}-${process.pid}`);
  const background = `background${backgroundExtension}`;
  const manifest = {
    schemaVersion: 1,
    id,
    name,
    background,
    colors: { accent: "#7C5CFC", secondary: "#41D9C5", surface: "#101525", text: "#F4F7FF" },
    ui: { opacity: 0.82, blur: 18, radius: 16, appearance: "auto" },
    art: { focusX: 0.72, focusY: 0.45, safeArea: "left", taskMode: "ambient" },
    modules: [],
  };
  await mkdir(storeRoot, { recursive: true });
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  try {
    await copyFile(backgroundPath, join(temporary, background));
    await writeFile(join(temporary, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return { id, path: destination };
}

export async function listThemeDirectories(roots) {
  const result = [];
  for (const root of roots) {
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifestPath = join(root, entry.name, "theme.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        const info = await stat(manifestPath);
        result.push({ id: manifest.id, name: manifest.name, path: join(root, entry.name), modifiedAtMs: info.mtimeMs });
      } catch { /* 不完整主题不会阻塞其它主题。 */ }
    }
  }
  return result.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}
