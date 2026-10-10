import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';
const Fixture = {
	ObjectCount: 300,
	Columns: 20,
	Spacing: 25,
	ObjectSize: 14,
	TargetX: 650,
	TargetY: 450,
	MoveX: 45,
	MoveY: 30,
} as const;

test('cached interactive rendering is pixel-identical to a fresh project render', async ({
	page,
}) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('render-cache-equivalence');
	await page.locator('#createImageButton').click();
	await page.locator('#quickSaveButton').click();
	const blankProject = await savedProject(page);

	await closeAndOpen(page, populateObjects(blankProject));
	await showAnnotationToolbar(page);
	await page.locator('[data-panel="annotations"] [data-tool="select"]').click();
	await dragCanvas(
		page,
		{ x: Fixture.TargetX, y: Fixture.TargetY },
		{
			x: Fixture.TargetX + Fixture.MoveX,
			y: Fixture.TargetY + Fixture.MoveY,
		},
	);
	await clickCanvas(page, { x: 780, y: 580 });
	const cachedRenderHash = await annotationHash(page);

	await page.locator('#quickSaveButton').click();
	const movedProject = await savedProject(page, blankProject);
	await closeAndOpen(page, movedProject);

	expect(await annotationHash(page)).toBe(cachedRenderHash);
});

async function installProjectWriter(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(window, 'showSaveFilePicker', {
			configurable: true,
			value: async () => ({
				name: 'render-cache-equivalence.limg',
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
	});
}

function savedProject(page: Page, previous = ''): Promise<string> {
	return page
		.waitForFunction(
			(oldValue) => {
				const value = (window as Window & { savedProjectSource?: string })
					.savedProjectSource;
				return value && value !== oldValue ? value : undefined;
			},
			previous,
		)
		.then((handle) => handle.jsonValue());
}

function populateObjects(source: string): string {
	const project = JSON.parse(source) as {
		editableObjects: {
			state: { objects: unknown[]; nextStep: number };
			history: Array<{ objects: unknown[]; nextStep: number }>;
			historyIndex: number;
		};
	};
	const objects = Array.from({ length: Fixture.ObjectCount }, (_, index) => ({
		id: `cached-box-${index}`,
		type: 'box',
		rect: {
			x: 25 + (index % Fixture.Columns) * Fixture.Spacing,
			y: 25 + Math.floor(index / Fixture.Columns) * Fixture.Spacing,
			width: Fixture.ObjectSize,
			height: Fixture.ObjectSize,
		},
		color: '#1455cc',
		width: 2,
		opacity: 1,
		blur: 0,
	}));
	objects.push({
		id: 'interactive-target',
		type: 'box',
		rect: {
			x: Fixture.TargetX - Fixture.ObjectSize,
			y: Fixture.TargetY - Fixture.ObjectSize,
			width: Fixture.ObjectSize * 2,
			height: Fixture.ObjectSize * 2,
		},
		color: '#dd2244',
		width: 4,
		opacity: 1,
		blur: 0,
	});
	const state = { objects, nextStep: 1 };
	project.editableObjects = {
		state,
		history: [structuredClone(state)],
		historyIndex: 0,
	};
	return JSON.stringify(project);
}

async function showAnnotationToolbar(page: Page): Promise<void> {
	await page.locator('#toolbarPickerButton').click();
	const toggle = page.locator('[data-panel-toggle="annotations"]');
	if (!(await toggle.isChecked())) await toggle.check();
	await page.keyboard.press('Escape');
}

async function dragCanvas(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	const start = await screenPoint(page, from);
	const end = await screenPoint(page, to);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 4 });
	await page.mouse.up();
}

async function clickCanvas(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<void> {
	const screen = await screenPoint(page, point);
	await page.mouse.click(screen.x, screen.y);
}

async function screenPoint(
	page: Page,
	point: Readonly<{ x: number; y: number }>,
): Promise<{ x: number; y: number }> {
	const overlay = page.locator('#overlay');
	const bounds = await overlay.boundingBox();
	const size = await overlay.evaluate((canvas: HTMLCanvasElement) => ({
		width: canvas.width,
		height: canvas.height,
	}));
	return {
		x: bounds!.x + (point.x * bounds!.width) / size.width,
		y: bounds!.y + (point.y * bounds!.height) / size.height,
	};
}

async function closeAndOpen(page: Page, source: string): Promise<void> {
	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'render-cache-equivalence.limg',
		mimeType: PROJECT_MIME_TYPE,
		buffer: Buffer.from(source),
	});
	await expect(page.locator('#canvasWrap')).toBeVisible();
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
