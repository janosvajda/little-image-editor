import { expect, test, type Page } from '@playwright/test';

const Stroke = {
	Start: { x: 180, y: 180 },
	End: { x: 360, y: 220 },
	ContinuedEnd: { x: 500, y: 300 },
} as const;

test('layers expose retained object actions and continuation preserves one stroke', async ({
	page,
}) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageDocumentType').selectOption('project');
	await page.locator('#newImageName').fill('layer-object-editing');
	await page.locator('#createImageButton').click();
	if (await page.locator('[data-panel="layers"]').isVisible()) {
		await page.locator('#toolbarPickerButton').click();
		await page.locator('[data-panel-toggle="layers"]').uncheck();
	}
	await chooseBrush(page);
	await drag(page, Stroke.Start, Stroke.End);

	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	const objectRow = page.locator('[data-panel="layers"] .layer-object-row');
	await expect(objectRow).toHaveCount(1);
	await expect(objectRow.getByRole('button', { name: /Edit Stroke/ })).toBeVisible();
	await expect(objectRow.getByRole('button', { name: /Lock Stroke/ })).toBeVisible();
	await expect(objectRow.getByRole('button', { name: /Delete Stroke/ })).toBeVisible();

	await objectRow.getByRole('button', { name: /Edit Stroke/ }).click();
	await page.getByRole('button', { name: 'Continue selected stroke' }).click();
	await drag(page, Stroke.End, Stroke.ContinuedEnd);
	await page.locator('#quickSaveButton').click();
	const project = await savedProject(page);
	const objects = project.editableObjects.state.objects;
	expect(objects).toHaveLength(1);
	expect(objects[0]?.type).toBe('stroke');
	expect(objects[0]?.points.length).toBeGreaterThan(2);

	await objectRow.getByRole('button', { name: /Lock Stroke/ }).click();
	await expect(objectRow.getByRole('button', { name: /Edit Stroke/ })).toBeDisabled();
	await objectRow.getByRole('button', { name: /Delete Stroke/ }).click();
	await expect(page.locator('[data-panel="layers"] .layer-object-row')).toHaveCount(0);
	await page.locator('#undoButton').click();
	await expect(page.locator('[data-panel="layers"] .layer-object-row')).toHaveCount(1);
});

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function drag(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, gesture) => {
			const canvas = overlay as HTMLCanvasElement;
			const bounds = canvas.getBoundingClientRect();
			canvas.setPointerCapture = () => undefined;
			for (const [type, point, buttons] of [
				['pointerdown', gesture.from, 1],
				['pointermove', gesture.to, 1],
				['pointerup', gesture.to, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						pointerId: 89,
						clientX: bounds.left + (point.x * bounds.width) / canvas.width,
						clientY: bounds.top + (point.y * bounds.height) / canvas.height,
					}),
				);
		},
		{ from, to },
	);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'layer-object-editing.limg',
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(window as Window & { savedProject?: string }).savedProject =
							await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	});
}

async function savedProject(page: Page): Promise<{
	readonly editableObjects: {
		readonly state: {
			readonly objects: ReadonlyArray<{
				readonly type: string;
				readonly points: readonly unknown[];
			}>;
		};
	};
}> {
	const source = await page
		.waitForFunction(
			() => (window as Window & { savedProject?: string }).savedProject,
		)
		.then((handle) => handle.jsonValue());
	return JSON.parse(source);
}
