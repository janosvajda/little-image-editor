import type { DocumentSessionSnapshot } from "../models/appTypes";
import { CanvasDocument } from "../models/imageDocument";

const DATABASE_NAME = "littleImageEditor";
const DATABASE_VERSION = 1;
const STORE_NAME = "recovery";
const SESSION_KEY = "currentImage";

interface RecoveryRecord extends DocumentSessionSnapshot {
  id: typeof SESSION_KEY;
  updatedAt: number;
}

export class SessionPersistence {
  #database: Promise<IDBDatabase> | null = null;
  #pendingSnapshot: DocumentSessionSnapshot | null | undefined;
  #writeInProgress = false;

  constructor(readonly documentModel: CanvasDocument) {
    if (!("indexedDB" in globalThis)) return;
    this.#database = this.openDatabase();
    documentModel.onContentChange(snapshot => this.queueSave(snapshot));
  }

  async restore(): Promise<boolean> {
    if (!this.#database || this.documentModel.hasImage) return false;
    const database = await this.#database;
    const record = await new Promise<RecoveryRecord | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(SESSION_KEY);
      request.onsuccess = () => resolve(request.result as RecoveryRecord | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!record) return false;
    const session = Array.isArray(record.history) && record.history.length > 0
      ? record
      : { ...record, history: [{ width: record.width, height: record.height, pixels: record.pixels }], historyIndex: 0 };
    this.documentModel.restoreSession(session);
    return true;
  }

  private queueSave(snapshot: DocumentSessionSnapshot | null): void {
    this.#pendingSnapshot = snapshot;
    if (!this.#writeInProgress) void this.flushLatestSnapshot();
  }

  private async flushLatestSnapshot(): Promise<void> {
    this.#writeInProgress = true;
    try {
      const database = await this.#database!;
      while (this.#pendingSnapshot !== undefined) {
        const snapshot = this.#pendingSnapshot;
        this.#pendingSnapshot = undefined;
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          if (snapshot) store.put({ ...snapshot, id: SESSION_KEY, updatedAt: Date.now() } satisfies RecoveryRecord);
          else store.delete(SESSION_KEY);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      }
    } catch (error) {
      console.error("Unable to persist recovery session", error);
    } finally {
      this.#writeInProgress = false;
      if (this.#pendingSnapshot !== undefined) void this.flushLatestSnapshot();
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
