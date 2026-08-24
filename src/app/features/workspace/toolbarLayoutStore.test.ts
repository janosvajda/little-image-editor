import { describe, expect, it } from "vitest";
import { ToolbarLayoutStore, type KeyValueStorage } from "./toolbarLayoutStore";

describe("ToolbarLayoutStore", () => {
  it("owns toolbar serialization independently from DOM and workspace behavior", () => {
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); }
    };
    const store = new ToolbarLayoutStore(storage, "layout");
    const layout = { tools: { x: 10, y: 20, visible: true, collapsed: false } };

    store.save(layout);
    expect(store.load()).toEqual(layout);
    store.clear();
    expect(store.load()).toEqual({});
    values.set("layout", "not-json");
    expect(store.load()).toEqual({});
  });
});
