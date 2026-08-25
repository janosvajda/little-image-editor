import { expect, type Page, test } from '@playwright/test';

const CAPTURE_DATABASE = 'little-image-editor-browser-captures';
const CAPTURE_STORE = 'captures';
const CAPTURE_DATABASE_VERSION = 1;
const CAPTURE_CANVAS_SIZE = 80;
const FIRST_RUN_LEFT_OFFSET = 14;
const POSITION_TOLERANCE = 2;
const USER_POSITION = { x: 520, y: 0 } as const;
const TOOLBAR_LAYOUT_STORAGE_KEY = 'little-editor.panel-layout.v2';

async function seedBrowserCapture(page: Page, id: string): Promise<void> {
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

test('ordinary context-menu image imports enable normal toolbars without a special layout', async ({
	page,
}) => {
	await page.goto('/');
	await seedBrowserCapture(page, 'ordinary-context-image');
	await page.goto('/?capture=ordinary-context-image');

	await expect(page.locator('#canvasWrap')).toBeVisible();
	await expect(page.locator('[data-panel="tools"]')).toBeVisible();
	await expect(page.locator('[data-panel="effects"]')).toBeVisible();
	await expect(page.locator('[data-panel="annotations"]')).toBeHidden();
	await expect(
		page.locator('[data-panel="tools"] > .panel-body'),
	).toBeEnabled();
});

test('bug-report auto-open uses first-run left dock then preserves a collision-safe user preference', async ({
	page,
}) => {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await seedBrowserCapture(page, 'first-bug-report');
	await page.goto('/?capture=first-bug-report&mode=annotate');
	const annotations = page.locator('[data-panel="annotations"]');
	await expect(annotations).toBeVisible();
	await expect(annotations.locator(':scope > .panel-body')).toBeEnabled();
	const firstPosition = await annotations.boundingBox();
	expect(firstPosition).not.toBeNull();
	expect(
		Math.abs(firstPosition!.x - FIRST_RUN_LEFT_OFFSET),
	).toBeLessThanOrEqual(POSITION_TOLERANCE);

	const annotationHeader = annotations.locator('.panel-header');
	const headerBounds = await annotationHeader.boundingBox();
	expect(headerBounds).not.toBeNull();
	await page.mouse.move(
		headerBounds!.x + headerBounds!.width / 2,
		headerBounds!.y + headerBounds!.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		headerBounds!.x +
			headerBounds!.width / 2 +
			USER_POSITION.x -
			firstPosition!.x,
		headerBounds!.y +
			headerBounds!.height / 2 +
			USER_POSITION.y -
			firstPosition!.y,
	);
	await page.mouse.up();
	await annotations.locator('.collapse').click();
	await annotations.locator('.collapse').click();
	await annotations
		.getByRole('button', { name: 'Close Capture & annotate' })
		.click();
	await seedBrowserCapture(page, 'second-bug-report');
	await page.goto('/?capture=second-bug-report&mode=annotate');

	await expect(annotations).toBeVisible();
	const preferredPosition = await page.evaluate((storageKey) => {
		const layout = JSON.parse(
			localStorage.getItem(storageKey) ?? '{}',
		) as Record<string, { x?: number; y?: number }>;
		return layout.annotations;
	}, TOOLBAR_LAYOUT_STORAGE_KEY);
	expect(preferredPosition).toMatchObject(USER_POSITION);

	const annotationBounds = await annotations.boundingBox();
	expect(annotationBounds).not.toBeNull();
	const visibleSiblings = page.locator(
		'.panel[data-panel]:visible:not([data-panel="annotations"])',
	);
	for (let index = 0; index < (await visibleSiblings.count()); index += 1) {
		const siblingBounds = await visibleSiblings.nth(index).boundingBox();
		if (!siblingBounds) continue;
		expect(rectanglesOverlap(annotationBounds!, siblingBounds)).toBe(false);
	}
});

function rectanglesOverlap(
	left: Readonly<{ x: number; y: number; width: number; height: number }>,
	right: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean {
	return (
		left.x < right.x + right.width &&
		left.x + left.width > right.x &&
		left.y < right.y + right.height &&
		left.y + left.height > right.y
	);
}
