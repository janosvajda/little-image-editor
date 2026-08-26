import { expect, test, type Page } from '@playwright/test';

const Stroke = {
	Start: { x: 180, y: 180 },
	End: { x: 360, y: 220 },
	LayerEditedEnd: { x: 470, y: 280 },
	DoubleClickEditedEnd: { x: 560, y: 330 },
} as const;

test('paint objects can be edited from Layers and by double-clicking', async ({
	page,
}) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await installProjectWriter(page);
	await createProject(page);
	await chooseBrush(page);
	await drag(page, Stroke.Start, Stroke.End);

	await showLayers(page);
	const objectRow = page.locator('[data-panel="layers"] .layer-object-row');
	await objectRow.getByRole('button', { name: /Edit Stroke/ }).click();
	await drag(page, Stroke.End, Stroke.LayerEditedEnd);
	await expectStroke(page, 1, Stroke.LayerEditedEnd);

	await doubleClickCanvasPoint(page, Stroke.LayerEditedEnd);
	await drag(page, Stroke.LayerEditedEnd, Stroke.DoubleClickEditedEnd);
	await expectStroke(page, 1, Stroke.DoubleClickEditedEnd);
});

async function createProject(page: Page): Promise<void> {
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageDocumentType').selectOption('project');
	await page.locator('#newImageName').fill('direct-paint-editing');
	await page.locator('#createImageButton').click();
}

async function chooseBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function showLayers(page: Page): Promise<void> {
	await page.locator('#toolbarPickerButton').click();
	const toggle = page.locator('[data-panel-toggle="layers"]');
	if (!(await toggle.isChecked())) await toggle.check();
}

async function expectStroke(
	page: Page,
	expectedObjectCount: number,
	expectedEnd: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#quickSaveButton').click();
	const project = await savedProject(page);
	const objects = project.editableObjects.state.objects;
	expect(objects).toHaveLength(expectedObjectCount);
	const stroke = objects[0];
	expect(stroke?.type).toBe('stroke');
	expect(stroke?.points.at(-1)).toMatchObject(expectedEnd);
}

async function doubleClickCanvasPoint(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate((overlay, canvasPoint) => {
		const canvas = overlay as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		canvas.dispatchEvent(
			new MouseEvent('dblclick', {
				bubbles: true,
				button: 0,
				clientX: bounds.left + (canvasPoint.x * bounds.width) / canvas.width,
				clientY: bounds.top + (canvasPoint.y * bounds.height) / canvas.height,
			}),
		);
	}, point);
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
						pointerId: 113,
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
				name: 'direct-paint-editing.limg',
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
				readonly points: ReadonlyArray<{ x: number; y: number }>;
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
