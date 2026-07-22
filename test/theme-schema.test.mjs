import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadTheme, validateThemeManifest } from "../src/theme-schema.mjs";

test("规范化一个完整主题", () => {
  const theme = validateThemeManifest({
    schemaVersion: 1,
    id: "test-night",
    name: "测试夜色",
    background: "background.svg",
    colors: { accent: "#112233", secondary: "#445566", surface: "#101010", text: "#fefefe" },
    ui: { opacity: 0.7, blur: 12, radius: 8, appearance: "light" },
    art: { focusX: 0.75, focusY: 0.4, safeArea: "right", taskMode: "banner" },
    homeHeader: { title: "测试工作台", subtitle: "在夜色里完成今天" },
  });
  assert.equal(theme.colors.text, "#FEFEFE");
  assert.equal("motion" in theme.ui, false);
  assert.equal(theme.ui.appearance, "light");
  assert.equal("pet" in theme, false);
  assert.deepEqual(theme.modules, []);
  assert.deepEqual(theme.homeHeader, { title: "测试工作台", subtitle: "在夜色里完成今天" });
  assert.deepEqual(theme.art, { focusX: 0.75, focusY: 0.4, safeArea: "right", taskMode: "banner" });
});

test("规范化固定组件槽位、自定义文字和 B 档点击转发", () => {
  const theme = validateThemeManifest({
    schemaVersion: 1, id: "module-theme", name: "Modules", background: "background.webp",
    modules: [
      { id: "side-note", slot: "sidebar-note", order: 0, anchor: "sidebar", kind: "decorate", asset: "assets/side-note.svg", box: { x: 0, y: 0, w: 1, h: 1 }, text: { title: "今日陪伴", subtitle: "慢一点也很好" } },
      { id: "help-float", slot: "composer-float", order: 0, anchor: "home-composer", kind: "floating", asset: "assets/help-float.png", box: { x: 0.86, y: 0.01, w: 0.1, h: 0.22 }, text: { label: "打开原生弹窗" }, state: "hover", action: { forwardTo: "dialog" } },
    ],
  });
  assert.equal(theme.modules[0].state, "default");
  assert.equal(theme.modules[0].action, null);
  assert.deepEqual(theme.modules[0].text, { title: "今日陪伴", subtitle: "慢一点也很好" });
  assert.deepEqual(theme.modules[1].action, { forwardTo: "dialog" });
});

test("拒绝自由布局、错误固定锚点、重复槽位和越权 action", () => {
  const base = { schemaVersion: 1, id: "module-errors", name: "Errors", background: "background.webp" };
  const valid = { id: "badge", slot: "sidebar-note", order: 0, anchor: "sidebar", kind: "decorate", asset: "assets/badge.svg", box: { x: 0, y: 0, w: 1, h: 1 }, text: { title: "陪伴" } };
  assert.throws(() => validateThemeManifest({ ...base, modules: [{ ...valid, anchor: "topbar" }] }), /anchor 必须是固定值/);
  assert.throws(() => validateThemeManifest({ ...base, modules: [{ ...valid, box: { x: 0.03, y: 0, w: 0.97, h: 1 } }] }), /固定布局/);
  assert.throws(() => validateThemeManifest({ ...base, modules: [valid, valid] }), /id 必须唯一/);
  assert.throws(() => validateThemeManifest({ ...base, modules: [{ ...valid, action: { forwardTo: "dialog" } }] }), /仅允许用于 floating/);
  assert.throws(() => validateThemeManifest({ ...base, modules: [{ ...valid, asset: "other/badge.svg" }] }), /必须单独存放/);
  assert.throws(() => validateThemeManifest({ ...base, modules: [{ ...valid, id: "other", asset: "assets/other.svg" }, valid] }), /固定槽位重复/);
  assert.throws(() => validateThemeManifest({ ...base, modules: [{ ...valid, text: { title: "陪伴", html: "<b>bad</b>" } }] }), /不属于该固定槽位/);
});

test("旧主题获得兼容的画面布局默认值", () => {
  const theme = validateThemeManifest({ schemaVersion: 1, id: "legacy", name: "Legacy", background: "background.webp" });
  assert.deepEqual(theme.art, { focusX: 0.5, focusY: 0.5, safeArea: "auto", taskMode: "auto" });
  assert.equal(theme.ui.appearance, "auto");
});

test("拒绝无效的画面焦点、安全区和任务模式", () => {
  const base = { schemaVersion: 1, id: "art-test", name: "Art", background: "background.webp" };
  assert.throws(() => validateThemeManifest({ ...base, art: { focusX: 1.1 } }), /art\.focusX/);
  assert.throws(() => validateThemeManifest({ ...base, art: { safeArea: "top" } }), /art\.safeArea/);
  assert.throws(() => validateThemeManifest({ ...base, art: { taskMode: "cover" } }), /art\.taskMode/);
  assert.throws(() => validateThemeManifest({ ...base, ui: { appearance: "sepia" } }), /ui\.appearance/);
  assert.throws(() => validateThemeManifest({ ...base, homeHeader: { title: "只有标题" } }), /homeHeader\.subtitle/);
  assert.throws(() => validateThemeManifest({ ...base, homeHeader: { title: "x".repeat(25), subtitle: "说明" } }), /homeHeader\.title/);
});

test("拒绝越界素材路径和不安全颜色", () => {
  const base = {
    schemaVersion: 1, id: "unsafe", name: "Unsafe", background: "../secret.png",
    colors: { accent: "#112233", secondary: "#445566", surface: "#101010", text: "#FEFEFE" },
  };
  assert.throws(() => validateThemeManifest(base), /相对路径|只支持/);
  assert.throws(() => validateThemeManifest({ ...base, background: "ok.png", colors: { ...base.colors, accent: "red;display:none" } }), /十六进制/);
});

test("加载主题时验证真实素材", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-theme-"));
  const themeRoot = join(root, "valid");
  await mkdir(themeRoot);
  await writeFile(join(themeRoot, "background.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  await writeFile(join(themeRoot, "theme.json"), JSON.stringify({ schemaVersion: 1, id: "valid", name: "Valid", background: "background.svg" }));
  const loaded = await loadTheme(themeRoot);
  assert.equal(loaded.manifest.id, "valid");
  assert.match(loaded.backgroundPath, /background\.svg$/);
});

test("加载主题时逐个验证 module 素材", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-modules-"));
  const themeRoot = join(root, "valid-modules");
  await mkdir(join(themeRoot, "assets"), { recursive: true });
  await writeFile(join(themeRoot, "background.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  await writeFile(join(themeRoot, "assets", "badge.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  await writeFile(join(themeRoot, "theme.json"), JSON.stringify({
    schemaVersion: 1, id: "valid-modules", name: "Valid Modules", background: "background.svg",
    modules: [{ id: "badge", slot: "sidebar-note", order: 0, anchor: "sidebar", kind: "decorate", asset: "assets/badge.svg", box: { x: 0, y: 0, w: 1, h: 1 }, text: { title: "陪伴" } }],
  }));
  const loaded = await loadTheme(themeRoot);
  assert.equal(loaded.moduleAssets.length, 1);
  assert.equal(loaded.moduleAssets[0].id, "badge");
  assert.match(loaded.moduleAssets[0].path, /badge\.svg$/);
});
