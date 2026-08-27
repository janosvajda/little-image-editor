import { expect, test, type Page } from '@playwright/test';

const ProjectName = 'retained-interactions';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill(ProjectName);
	await page.locator('#createImageButton').click();
});

test('fill is bounded by retained shape pixels without flattening layers', async ({
	page,
}) => {
	await chooseGroupedTool(page, 'Shape tools', 'Ellipse');
	await drag(page, { x: 200, y: 160 }, { x: 500, y: 400 });
	await page.locator('[data-tool="fill"]').click();
	await clickCanvas(page, { x: 350, y: 280 });
	await page.locator('#quickSaveButton').click();
	const project = await savedProject(page);
	const objects = project.editableObjects.state.objects;
	const shape = objects.find((object) => object.type === 'shape');
	const fill = objects.find((object) => object.type === 'fill');

	expect(shape).toBeDefined();
	expect(fill).toBeDefined();
	expect(fill!.runs?.length).toBeGreaterThan(0);
	expect(fill!.rect!.width).toBeLessThan(shape!.rect!.width);
	expect(fill!.rect!.height).toBeLessThan(shape!.rect!.height);
	expect(project.document.layerState.layers.map((layer) => layer.id)).toEqual([
		'image',
		'objects',
	]);
});

test('brush mode exposes stable 400% resize handles and edits the retained stroke', async ({
	page,
}) => {
	await chooseGroupedTool(page, 'Brush tools', 'Brush');
	await drag(page, { x: 200, y: 200 }, { x: 400, y: 300 });
	await page.locator('#zoomSelect').selectOption('400');
	const southEast = { x: 406, y: 306 };
	await movePointer(page, southEast);
	await expect(page.locator('#overlay')).toHaveCSS('cursor', 'nwse-resize');
	await drag(page, southEast, { x: 426, y: 326 });
	await page.locator('#quickSaveButton').click();
	const project = await savedProject(page);
	const stroke = project.editableObjects.state.objects.find(
		(object) => object.type === 'stroke',
	);

	expect(stroke?.rect).toMatchObject({ width: 232, height: 132 });
	await expect(page.locator('#paintToolControl')).toHaveClass(/active/);
});

interface SavedObject {
	readonly type: string;
	readonly rect?: { x: number; y: number; width: number; height: number };
	readonly runs?: ReadonlyArray<{ x: number; y: number; length: number }>;
}

interface SavedProject {
	readonly document: {
		readonly layerState: {
			readonly layers: ReadonlyArray<{ readonly id: string }>;
		};
	};
	readonly editableObjects: {
		readonly state: { readonly objects: readonly SavedObject[] };
	};
}

async function chooseGroupedTool(
	page: Page,
	group: string,
	tool: string,
): Promise<void> {
	await page.getByRole('button', { name: `Choose ${group.toLowerCase()}` }).click();
	await page
		.getByRole('menu', { name: group })
		.getByRole('menuitem', { name: tool, exact: true })
		.click();
}

async function clickCanvas(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await drag(page, point, point);
}

async function movePointer(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await dispatchPointers(page, [{ type: 'pointermove', point, buttons: 0 }]);
}

async function drag(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await dispatchPointers(page, [
		{ type: 'pointerdown', point: from, buttons: 1 },
		{ type: 'pointermove', point: to, buttons: 1 },
		{ type: 'pointerup', point: to, buttons: 0 },
	]);
}

async function dispatchPointers(
	page: Page,
	events: ReadonlyArray<{
		readonly type: string;
		readonly point: Readonly<{ x: number; y: number }>;
		readonly buttons: number;
	}>,
): Promise<void> {
	await page.locator('#overlay').evaluate((overlay, pointerEvents) => {
		const canvas = overlay as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		canvas.setPointerCapture = () => undefined;
		for (const event of pointerEvents)
			canvas.dispatchEvent(
				new PointerEvent(event.type, {
					bubbles: true,
					button: 0,
					buttons: event.buttons,
					pointerId: 73,
					clientX:
						bounds.left +
						(event.point.x * bounds.width) / canvas.width,
					clientY:
						bounds.top +
						(event.point.y * bounds.height) / canvas.height,
				}),
			);
	}, events);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate((name) => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: `${name}.limg`,
				createWritable: async () => ({
					write: async (blob: Blob) => {
						(
							window as Window & { savedProjectSource?: string }
						).savedProjectSource = await blob.text();
					},
					close: async () => undefined,
				}),
			}),
		});
	}, ProjectName);
}

async function savedProject(page: Page): Promise<SavedProject> {
	const source = await page
		.waitForFunction(
			() =>
				(window as Window & { savedProjectSource?: string })
					.savedProjectSource,
		)
		.then((handle) => handle.jsonValue());
	return JSON.parse(source) as SavedProject;
}
