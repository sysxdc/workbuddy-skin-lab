import assert from "node:assert/strict";
import test from "node:test";

import { ANCHOR_IDS, ANCHOR_SELECTORS, buildProbeAnchorsScript } from "../src/anchors.mjs";
import { probeAnchors } from "../src/injector.mjs";

test("锚点白名单显式且探测脚本只读取 DOM", () => {
  assert.deepEqual(ANCHOR_IDS, [
    "sidebar", "topbar", "detail-panel", "home-composer", "home-stage", "quick-actions",
    "scene-tabs", "conversation-list", "chat-composer", "dialog", "home-header-title", "home-header-subtitle",
  ]);
  assert.equal(Object.keys(ANCHOR_SELECTORS).length, 12);
  assert.equal(ANCHOR_SELECTORS["home-header-title"], ".wb-home-header__title");
  assert.equal(ANCHOR_SELECTORS["home-header-subtitle"], ".wb-home-header__subtitle");
  const script = buildProbeAnchorsScript();
  assert.match(script, /querySelector/);
  assert.match(script, /getBoundingClientRect/);
  assert.doesNotMatch(script, /appendChild|addEventListener|fetch\(/);
  assert.doesNotThrow(() => new Function(script));
});

test("probeAnchors 复用 CDP session 并返回每个目标的结果", async () => {
  const anchors = { sidebar: { present: true, rect: { x: 0, y: 0, width: 240, height: 800 } } };
  class Session {
    constructor(url) { this.url = url; }
    async open() {}
    async evaluate(expression) { assert.match(expression, /querySelector/); return anchors; }
    close() { this.closed = true; }
  }
  const result = await probeAnchors({
    port: 9223,
    deps: {
      fetchRendererTargets: async () => [{ id: "renderer-1", webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/1" }],
      Session,
    },
  });
  assert.deepEqual(result, { probed: 1, targets: [{ id: "renderer-1", anchors }] });
});

test("probeAnchors 在没有存活渲染目标时拒绝", async () => {
  await assert.rejects(() => probeAnchors({ port: 9223, deps: { fetchRendererTargets: async () => [] } }), /未发现存活/);
});
