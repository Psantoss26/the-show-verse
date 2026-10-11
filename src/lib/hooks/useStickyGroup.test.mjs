import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function harness() {
  const listeners = new Map();
  const frames = new Map();
  const updates = [];
  const cleanups = [];
  let activeNode;
  let id = 0;
  const context = vm.createContext({
    useRef: (value) => ({ current: value === null ? activeNode : value }),
    useState: () => [false, (value) => updates.push(value)],
    useLayoutEffect: (effect) => cleanups.push(effect()),
    getComputedStyle: (node) => ({ top: String(node.threshold) }),
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(node) { node.resize = this.callback; }
      disconnect() {}
    },
    window: {
      addEventListener: (type, callback) => listeners.set(type, callback),
      removeEventListener: (type) => listeners.delete(type),
    },
  });
  const source = readFileSync(new URL("./useStickyGroup.js", import.meta.url), "utf8")
    .replace(/import .* from "react";/, "")
    .replace("export default function", "function");
  vm.runInContext(source, context);
  return {
    updates, listeners, frames,
    mount(top = 200) {
      const node = {
        top, threshold: 136, style: {},
        firstElementChild: { offsetHeight: 88 },
        getBoundingClientRect() { return { top: this.top }; },
        addEventListener() {}, removeEventListener() {},
      };
      activeNode = node;
      context.useStickyGroup(false, false);
      return node;
    },
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    cleanup() { cleanups.splice(0).forEach((cleanup) => cleanup()); },
  };
}

test("scroll events share a single frame and update only on docking changes", () => {
  const h = harness();
  const node = h.mount();
  h.mount(500);
  node.top = 136;
  for (let i = 0; i < 20; i++) h.listeners.get("scroll")();
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.deepEqual(h.updates, [true]);
  node.top = 140;
  h.listeners.get("scroll")(); h.flush();
  assert.deepEqual(h.updates, [true]);
  node.top = 150;
  h.listeners.get("scroll")(); h.flush();
  assert.deepEqual(h.updates, [true, false]);
  h.cleanup();
  assert.equal(h.listeners.size, 0);
});

test("compacting preserves the expanded footprint and undocking allows resize", () => {
  const h = harness();
  const node = h.mount();
  assert.equal(node.style.minHeight, "88px");
  node.top = 136;
  h.listeners.get("scroll")(); h.flush();
  node.firstElementChild.offsetHeight = 44;
  node.firstElementChild.resize(); h.flush();
  assert.equal(node.style.minHeight, "88px");
  node.top = 200;
  h.listeners.get("scroll")(); h.flush();
  node.firstElementChild.offsetHeight = 96;
  node.firstElementChild.resize(); h.flush();
  assert.equal(node.style.minHeight, "96px");
  h.cleanup();
});

test("restored scroll is detected immediately and pending frames are cancelled", () => {
  const h = harness();
  h.mount(136);
  assert.deepEqual(h.updates, [true]);
  h.listeners.get("resize")();
  h.cleanup();
  assert.equal(h.frames.size, 0);
});
