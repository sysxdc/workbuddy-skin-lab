const fixed = (anchor, kind, mount, box, minAnchor, text = {}, requiredText = [], hostPath = []) => Object.freeze({
  anchor, kind, mount, maxInstances: 1, box: () => box, hostPath: () => hostPath,
  minAnchor: Object.freeze(minAnchor), text: Object.freeze(text), requiredText: Object.freeze(requiredText),
});

export const MODULE_SLOTS = Object.freeze({
  "sidebar-note": fixed("sidebar", "decorate", "prepend", { x: 0, y: 0, w: 1, h: 1 }, { width: 220, height: 360 }, { title: 32, subtitle: 72 }, ["title"]),
  "home-hero": fixed("scene-tabs", "decorate", "before", { x: 0, y: 0, w: 1, h: 1 }, { width: 240, height: 32 }, { eyebrow: 32, title: 48, subtitle: 80, badge: 16 }, ["title"]),
  "home-card": Object.freeze({
    anchor: "quick-actions", kind: "decorate", mount: "child-overlay", maxInstances: 3,
    box: () => ({ x: 0, y: 0, w: 1, h: 1 }),
    hostPath: (order) => [0, order],
    minAnchor: Object.freeze({ width: 360, height: 28 }),
    text: Object.freeze({ title: 24, subtitle: 56 }), requiredText: Object.freeze(["title"]),
  }),
  "scene-icon": Object.freeze({
    anchor: "scene-tabs", kind: "icon-swap", mount: "child-overlay", maxInstances: 4,
    box: () => ({ x: 0, y: 0, w: 1, h: 1 }),
    hostPath: (order) => [order],
    minAnchor: Object.freeze({ width: 240, height: 32 }),
    text: Object.freeze({ title: 16 }), requiredText: Object.freeze(["title"]),
  }),
  "composer-float": fixed("home-composer", "floating", "overlay", { x: 0.86, y: 0.01, w: 0.1, h: 0.22 }, { width: 520, height: 120 }, { label: 24 }),
});

export const MODULE_SLOT_IDS = Object.freeze(Object.keys(MODULE_SLOTS));

export function resolveModuleSlot(slot, order) {
  const definition = MODULE_SLOTS[slot];
  if (!definition) return null;
  return { ...definition, box: definition.box(order), hostPath: definition.hostPath?.(order) ?? [] };
}
