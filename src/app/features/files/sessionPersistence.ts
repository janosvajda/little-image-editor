import type { DocumentSessionSnapshot } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';

const DATABASE_NAME = 'littleImageEditor';
const DATABASE_VERSION = 1;
const STORE_NAME = 'recovery';
const SESSION_KEY = 'currentImage';

interface RecoveryRecord extends DocumentSessionSnapshot {
	id: typeof SESSION_KEY;
	updatedAt: number;
}

export class SessionPersistence {
	#database: Promise<IDBDatabase> | null = null;
	#pendingChange: boolean | undefined;
	#writeInProgress = false;
	#flushScheduled = false;

	constructor(readonly documentModel: CanvasDocument) {
		if (!('indexedDB' in globalThis)) return;
		this.#database = this.openDatabase();
		documentModel.onContentChange((hasImage) => this.queueSave(hasImage));
	}

	async restore(): Promise<boolean> {
		if (!this.#database || this.documentModel.hasImage) return false;
		const database = await this.#database;
		const record = await new Promise<RecoveryRecord | undefined>(
			(resolve, reject) => {
				const request = database
					.transaction(STORE_NAME, 'readonly')
					.objectStore(STORE_NAME)
					.get(SESSION_KEY);
				request.onsuccess = () =>
					resolve(request.result as RecoveryRecord | undefined);
				request.onerror = () => reject(request.error);
			},
		);
		if (!record) return false;
		const session =
			Array.isArray(record.history) && record.history.length > 0
				? record
				: {
						...record,
						history: [
							{
								width: record.width,
								height: record.height,
								pixels: record.pixels,
							},
						],
						historyIndex: 0,
					};
		this.documentModel.restoreSession(session);
		return true;
	}

	private queueSave(hasImage: boolean): void {
		this.#pendingChange = hasImage;
		if (this.#writeInProgress || this.#flushScheduled) return;
		this.#flushScheduled = true;
		queueMicrotask(() => {
			this.#flushScheduled = false;
			if (!this.#writeInProgress) void this.flushLatestSnapshot();
		});
	}

	private async flushLatestSnapshot(): Promise<void> {
		this.#writeInProgress = true;
		try {
			const database = await this.#database!;
			while (this.#pendingChange !== undefined) {
				const hasImage = this.#pendingChange;
				this.#pendingChange = undefined;
				// Capture only when a write can begin. Changes arriving during an IDB
				// transaction are represented by one later capture of the latest state.
				const snapshot =
					hasImage && this.documentModel.hasImage
						? this.documentModel.snapshotSession()
						: null;
				await new Promise<void>((resolve, reject) => {
					const transaction = database.transaction(STORE_NAME, 'readwrite');
					const store = transaction.objectStore(STORE_NAME);
					if (snapshot)
						store.put({
							...snapshot,
							id: SESSION_KEY,
							updatedAt: Date.now(),
						} satisfies RecoveryRecord);
					else store.delete(SESSION_KEY);
					transaction.oncomplete = () => resolve();
					transaction.onerror = () => reject(transaction.error);
					transaction.onabort = () => reject(transaction.error);
				});
			}
		} catch (error) {
			console.error('Unable to persist recovery session', error);
		} finally {
			this.#writeInProgress = false;
			if (this.#pendingChange !== undefined) void this.flushLatestSnapshot();
		}
	}

	private openDatabase(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(STORE_NAME))
					request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}
}
