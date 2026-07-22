import assert from "node:assert/strict";
import test from "node:test";

import { MODULE_SLOT_IDS, MODULE_SLOTS, resolveModuleSlot } from "../src/module-slots.mjs";

test("固定槽位覆盖截图中的五类组件", () => {
  assert.deepEqual(MODULE_SLOT_IDS, ["sidebar-note", "home-hero", "home-card", "scene-icon", "composer-float"]);
  assert.equal(MODULE_SLOTS["home-card"].maxInstances, 3);
  assert.equal(MODULE_SLOTS["scene-icon"].maxInstances, 4);
});

test("重复卡片覆盖不同原生子项且使用相同安全 box", () => {
  const boxes = [0, 1, 2].map((order) => resolveModuleSlot("home-card", order).box);
  for (const box of boxes) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1 && box.y + box.h <= 1);
  assert.deepEqual(boxes[0], boxes[1]);
  assert.deepEqual(boxes[1], boxes[2]);
});

test("槽位锁定 anchor、kind 与允许文字字段", () => {
  assert.deepEqual(resolveModuleSlot("sidebar-note", 0).text, { title: 32, subtitle: 72 });
  assert.equal(resolveModuleSlot("home-hero", 0).anchor, "scene-tabs");
  assert.equal(resolveModuleSlot("composer-float", 0).kind, "floating");
  assert.deepEqual(resolveModuleSlot("home-card", 0).minAnchor, { width: 360, height: 28 });
  assert.deepEqual(resolveModuleSlot("home-card", 1).hostPath, [0, 1]);
  assert.deepEqual(resolveModuleSlot("scene-icon", 2).hostPath, [2]);
  assert.deepEqual(resolveModuleSlot("scene-icon", 2).box, { x: 0, y: 0, w: 1, h: 1 });
  assert.deepEqual(resolveModuleSlot("scene-icon", 2).text, { title: 16 });
});
