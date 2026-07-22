import { homedir } from "node:os";
import { join } from "node:path";

export const PRODUCT_NAME = "WorkBuddy Skin Lab";
export const DEFAULT_THEME_ID = "aurora-lab";
export const DEFAULT_CDP_PORT = 9223;
export const RENDERER_URL_HINT = "renderer/index.html";
export const THEME_SCHEMA_VERSION = 1;

export function projectRoot(importMetaUrl) {
  return new URL("..", importMetaUrl);
}

export function resolveStatePaths({ home = homedir() } = {}) {
  const root = process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "WorkBuddySkinLab")
    : join(home, "Library", "Application Support", "WorkBuddySkinLab");
  return {
    root,
    themesRoot: join(root, "themes"),
    settingsPath: join(root, "settings.json"),
  };
}
