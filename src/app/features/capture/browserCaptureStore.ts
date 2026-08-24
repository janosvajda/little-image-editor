import type { PendingBrowserCapture } from '../../core/document/browserCapture';

const DATABASE_NAME = 'little-image-editor-browser-captures';
const STORE_NAME = 'captures';
const DATABASE_VERSION = 1;

export class BrowserCaptureStore {
	async put(id: string, capture: PendingBrowserCapture): Promise<void> {
		const database = await this.open();
		await requestComplete(database, 'readwrite', (store) =>
			store.put(capture, id),
		);
		database.close();
	}

	async take(id: string): Promise<PendingBrowserCapture | null> {
		const database = await this.open();
		const capture = await requestComplete<PendingBrowserCapture | undefined>(
			database,
			'readwrite',
			(store) => {
				const request = store.get(id);
				store.delete(id);
				return request;
			},
		);
		database.close();
		return capture ?? null;
	}

	private open(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(STORE_NAME))
					request.result.createObjectStore(STORE_NAME);
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(
					request.error ??
						new Error('Could not open the browser capture store.'),
				);
		});
	}
}

function requestComplete<T = IDBValidKey>(
	database: IDBDatabase,
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, mode);
		const request = operation(transaction.objectStore(STORE_NAME));
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error('Browser capture storage failed.'));
		transaction.onabort = () =>
			reject(
				transaction.error ?? new Error('Browser capture storage was aborted.'),
			);
	});
}
