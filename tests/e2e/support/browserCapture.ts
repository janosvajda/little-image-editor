import type { Page } from '@playwright/test';

const CAPTURE_DATABASE = 'little-image-editor-browser-captures';
const CAPTURE_STORE = 'captures';
const CAPTURE_DATABASE_VERSION = 1;
const CAPTURE_CANVAS_SIZE = 80;

export async function seedBrowserCapture(
	page: Page,
	id: string,
): Promise<void> {
	await page.evaluate(
		async ({ captureId, databaseName, storeName, version, canvasSize }) => {
			const canvas = document.createElement('canvas');
			canvas.width = canvasSize;
			canvas.height = canvasSize;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas context is unavailable.');
			context.fillStyle = '#336699';
			context.fillRect(0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob>((resolve, reject) =>
				canvas.toBlob(
					(result) =>
						result
							? resolve(result)
							: reject(new Error('Capture encoding failed.')),
					'image/png',
				),
			);
			const database = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open(databaseName, version);
				request.onupgradeneeded = () => {
					if (!request.result.objectStoreNames.contains(storeName))
						request.result.createObjectStore(storeName);
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(storeName, 'readwrite');
				transaction
					.objectStore(storeName)
					.put({ blob, name: 'context-menu-capture.png' }, captureId);
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
			});
			database.close();
		},
		{
			captureId: id,
			databaseName: CAPTURE_DATABASE,
			storeName: CAPTURE_STORE,
			version: CAPTURE_DATABASE_VERSION,
			canvasSize: CAPTURE_CANVAS_SIZE,
		},
	);
}
