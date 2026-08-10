import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTheme, listThemeDirectories, readActiveThemeId, readPendingThemeId, slugify, writeActiveThemeId, writePendingThemeId } from "../src/theme-store.mjs";

test("slugify 生成稳定安全 ID 前缀", () => {
  assert.equal(slugify("My Blue Theme"), "my-blue-theme");
  assert.equal(slugify("中文主题"), "custom-theme");
});

test("从背景创建可列出的用户主题", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-store-"));
  const background = join(root, "source.svg");
  const storeRoot = join(root, "themes");
  await writeFile(background, "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  const created = await createTheme({ backgroundPath: background, name: "Practice", storeRoot });
  const manifest = JSON.parse(await readFile(join(created.path, "theme.json"), "utf8"));
  assert.match(created.id, /^practice-[a-f0-9]{8}$/);
  assert.equal("pet" in manifest, false);
  assert.equal((await listThemeDirectories([storeRoot])).length, 1);
});

test("活动主题写入磁盘并可在下次启动恢复", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-preferences-"));
  const settingsPath = join(root, "settings.json");
  assert.equal(await readActiveThemeId(settingsPath), null);
  await writeActiveThemeId(settingsPath, "custom-theme-db46cf4e");
  assert.equal(await readActiveThemeId(settingsPath), "custom-theme-db46cf4e");
  const saved = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.equal(saved.activeThemeId, "custom-theme-db46cf4e");
  await writePendingThemeId(settingsPath, "custom-theme-particles-d2b19f37");
  assert.equal(await readPendingThemeId(settingsPath), "custom-theme-particles-d2b19f37");
  await writeActiveThemeId(settingsPath, "custom-theme-particles-d2b19f37");
  assert.equal(await readPendingThemeId(settingsPath), null);
  await assert.rejects(() => writeActiveThemeId(settingsPath, "../escape"), /主题 ID/);
  await assert.rejects(() => writePendingThemeId(settingsPath, "../escape"), /主题 ID/);
});
