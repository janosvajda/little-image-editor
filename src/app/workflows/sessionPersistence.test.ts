import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasDocument } from "../models/imageDocument";
import type { DocumentSessionSnapshot } from "../models/appTypes";
import { SessionPersistence } from "./sessionPersistence";

function model(): CanvasDocument {
  return new CanvasDocument(document.querySelector<HTMLCanvasElement>("#canvas")!, document.querySelector<HTMLCanvasElement>("#overlay")!);
}

async function recoveryRecord(): Promise<unknown> {
  const request = indexedDB.open("littleImageEditor");
  const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  if (!database.objectStoreNames.contains("recovery")) return undefined;
  const result = database.transaction("recovery", "readonly").objectStore("recovery").get("currentImage");
  return new Promise((resolve, reject) => { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error); });
}

describe("SessionPersistence", () => {
  beforeEach(() => { Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() }); });

  it("persists committed pixels and restores them into a new document", async () => {
    const source = model();
    new SessionPersistence(source);
    source.create({ name: "recovered", width: 12, height: 8, transparent: false, background: "#fff" });
    source.commit();
    source.commit();
    source.undo();
    await expect.poll(recoveryRecord).toMatchObject({ baseName: "recovered", width: 12, height: 8, historyIndex: 1 });

    document.body.innerHTML = document.body.innerHTML;
    const restored = model();
    const persistence = new SessionPersistence(restored);
    await expect(persistence.restore()).resolves.toBe(true);
    const history = vi.fn();
    restored.onHistoryChange(history);
    expect(restored.hasImage).toBe(true);
    expect(restored.baseName).toBe("recovered");
    expect([restored.width, restored.height]).toEqual([12, 8]);
    expect(history).toHaveBeenLastCalledWith(true, true);
    restored.redo();
    expect(history).toHaveBeenLastCalledWith(true, false);
  });

  it("removes the recovery session when the image is closed", async () => {
    const source = model();
    new SessionPersistence(source);
    source.create({ name: "temporary", width: 4, height: 4, transparent: true, background: "#fff" });
    await expect.poll(recoveryRecord).toBeTruthy();
    source.close();
    await expect.poll(recoveryRecord).toBeUndefined();
  });

  it("coalesces rapid updates and persists the newest complete snapshot", async () => {
    const source = model();
    const snapshots = vi.spyOn(source, "snapshotSession");
    new SessionPersistence(source);
    source.create({ name: "adjusted", width: 2, height: 2, transparent: false, background: "#fff" });
    for (let brightness = -1; brightness >= -69; brightness--) {
      const pixels = source.context.getImageData(0, 0, 2, 2);
      pixels.data.fill(100 + brightness);
      source.context.putImageData(pixels, 0, 0);
      source.setToolbarState("adjustments", { controls: { brightnessInput: String(brightness) } });
    }

    await expect.poll(recoveryRecord).toMatchObject({ toolbarStates: { adjustments: { controls: { brightnessInput: "-69" } } } });
    const record = await recoveryRecord() as DocumentSessionSnapshot;
    expect(record.pixels[0]).toBe(31);
    expect(snapshots).toHaveBeenCalledTimes(1);
  });

  it("does not restore when no record exists or a document is already active", async () => {
    const empty = model();
    await expect(new SessionPersistence(empty).restore()).resolves.toBe(false);
    empty.create({ name: "active", width: 2, height: 2, transparent: true, background: "#fff" });
    await expect(new SessionPersistence(empty).restore()).resolves.toBe(false);
  });

  it("is disabled cleanly when IndexedDB is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "indexedDB");
    await expect(new SessionPersistence(model()).restore()).resolves.toBe(false);
  });
});
