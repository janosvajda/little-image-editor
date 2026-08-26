import { expect, test, type Page } from '@playwright/test';

const Project = {
	Name: 'object-properties.limg',
} as const;
const Gesture = {
	Start: { x: 240, y: 220 },
	End: { x: 520, y: 360 },
	Move: { x: 80, y: 50 },
} as const;

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageDocumentType').selectOption('project');
	await page.locator('#newImageName').fill('object-properties');
	await page.locator('#createImageButton').click();
	await selectBrush(page);
	await drag(page, Gesture.Start, Gesture.End);
	await page.locator('[data-tool="select"]').click();
	await clickCanvas(page, midpoint());
});

test('selected object color edits the object while preserving brush defaults and project data', async ({
	page,
}) => {
	const defaultColor = await page.locator('#colorInput').inputValue();
	const objectColor = page.getByLabel('Selected object color');
	await expect(objectColor).toBeVisible();
	await objectColor.fill('#12ab34');
	await expect(page.locator('#colorInput')).toHaveValue(defaultColor);

	await page.locator('#quickSaveButton').click();
	const project = JSON.parse(await savedProject(page)) as {
		editableObjects: { state: { objects: Array<{ color?: string }> } };
	};
	expect(project.editableObjects.state.objects.at(-1)?.color).toBe('#12ab34');
});

test('moving a retained stroke uses the same rendered result before and after commit', async ({
	page,
}) => {
	const from = midpoint();
	const to = { x: from.x + Gesture.Move.x, y: from.y + Gesture.Move.y };
	await pointerDownAndMove(page, from, to);
	await page.evaluate(() => new Promise(requestAnimationFrame));
	const duringMove = await annotationHash(page);
	await pointerUp(page, to);
	await page.evaluate(() => new Promise(requestAnimationFrame));
	expect(await annotationHash(page)).toBe(duringMove);
});

function midpoint(): { x: number; y: number } {
	return {
		x: (Gesture.Start.x + Gesture.End.x) / 2,
		y: (Gesture.Start.y + Gesture.End.y) / 2,
	};
}

async function selectBrush(page: Page): Promise<void> {
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
	await pointerDownAndMove(page, from, to);
	await pointerUp(page, to);
}

async function clickCanvas(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await drag(page, point, point);
}

async function pointerDownAndMove(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await dispatchPointers(page, [
		{ type: 'pointerdown', point: from, buttons: 1 },
		{ type: 'pointermove', point: to, buttons: 1 },
	]);
}

async function pointerUp(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await dispatchPointers(page, [{ type: 'pointerup', point, buttons: 0 }]);
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
		for (const event of pointerEvents) {
			const clientX = bounds.left + (event.point.x * bounds.width) / canvas.width;
			const clientY = bounds.top + (event.point.y * bounds.height) / canvas.height;
			canvas.dispatchEvent(
				new PointerEvent(event.type, {
					bubbles: true,
					button: 0,
					buttons: event.buttons,
					pointerId: 47,
					clientX,
					clientY,
				}),
			);
		}
	}, events);
}

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate((name) => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name,
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
	}, Project.Name);
}

function savedProject(page: Page): Promise<string> {
	return page
		.waitForFunction(
			() =>
				(window as Window & { savedProjectSource?: string })
					.savedProjectSource,
		)
		.then((handle) => handle.jsonValue());
}

function annotationHash(page: Page): Promise<string> {
	return page
		.locator('.annotation-canvas')
		.evaluate(async (canvas: HTMLCanvasElement) => {
			const pixels = canvas
				.getContext('2d')!
				.getImageData(0, 0, canvas.width, canvas.height).data;
			const digest = await crypto.subtle.digest('SHA-256', pixels);
			return [...new Uint8Array(digest)]
				.map((value) => value.toString(16).padStart(2, '0'))
				.join('');
		});
}
