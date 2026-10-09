import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const ProjectMimeType = 'application/vnd.little-image-editor.project+json';

test('moving a lower object preserves every object and canonical z-order after reopen', async ({
	page,
}) => {
	await page.goto('/');
	await installProjectWriter(page);
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('composite-order');
	await page.locator('#createImageButton').click();
	await chooseBrush(page);
	await drag(page, { x: 250, y: 260 }, { x: 500, y: 260 });
	await createPaintLayer(page);
	await drag(page, { x: 400, y: 260 }, { x: 650, y: 260 });

	await page.locator('[data-tool="select"]').click();
	await drag(page, { x: 300, y: 260 }, { x: 360, y: 320 });
	await page.locator('#quickSaveButton').click();
	const source = await savedProject(page);
	await drag(page, { x: 760, y: 560 }, { x: 760, y: 560 });
	const beforeReopen = await canvasHash(page);

	await page.locator('#quickCloseImageButton').click();
	await page.locator('#confirmCloseImageButton').click();
	await page.locator('#projectFileInput').setInputFiles({
		name: 'composite-order.limg',
		mimeType: ProjectMimeType,
		buffer: Buffer.from(source),
	});

	expect(await canvasHash(page)).toBe(beforeReopen);
	expect(projectObjectCount(source)).toBe(2);
});

async function createPaintLayer(page: Page): Promise<void> {
	const layers = page.locator('[data-panel="layers"]');
	if (!(await layers.isVisible())) {
		await page.locator('#toolbarPickerButton').click();
		await page.getByLabel('Layers', { exact: true }).check();
		await page.keyboard.press('Escape');
	}
	await layers.locator('.layer-new-paint').click();
}

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
		(overlay, points) => {
			const canvas = overlay as HTMLCanvasElement;
			canvas.setPointerCapture = () => undefined;
			const bounds = canvas.getBoundingClientRect();
			const screen = (point: Readonly<{ x: number; y: number }>) => ({
				x: bounds.left + (point.x * bounds.width) / canvas.width,
				y: bounds.top + (point.y * bounds.height) / canvas.height,
			});
			const start = screen(points.from);
			const end = screen(points.to);
			for (const [type, point, buttons] of [
				['pointerdown', start, 1],
				['pointermove', end, 1],
				['pointerup', end, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						pointerId: 51,
						clientX: point.x,
						clientY: point.y,
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
				name: 'composite-order.limg',
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

function savedProject(page: Page): Promise<string> {
	return page
		.waitForFunction(
			() =>
				(window as Window & { savedProjectSource?: string })
					.savedProjectSource,
		)
		.then((source) => source.jsonValue());
}

function projectObjectCount(source: string): number {
	return (
		JSON.parse(source) as {
			editableObjects: { state: { objects: unknown[] } };
		}
	).editableObjects.state.objects.length;
}

function canvasHash(page: Page): Promise<string> {
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
