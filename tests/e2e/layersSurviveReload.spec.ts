import { expect, test, type Page } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;
type Stroke = Readonly<{ from: CanvasPoint; to: CanvasPoint }>;

const PROJECT_MIME_TYPE = 'application/vnd.little-image-editor.project+json';
const RECOVERY_SETTLE_MS = 500;
const PAINT_LAYER_COUNT = 2;
const FIRST_STROKE: Stroke = { from: { x: 100, y: 100 }, to: { x: 200, y: 150 } };
const SECOND_STROKE: Stroke = { from: { x: 200, y: 300 }, to: { x: 350, y: 320 } };
const STROKE_AFTER_RELOAD: Stroke = { from: { x: 50, y: 400 }, to: { x: 300, y: 420 } };

test('paint layers stay in the layer list after a reload and further painting', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption(PROJECT_MIME_TYPE);
	await page.locator('#newImageName').fill('layers-survive-reload');
	await page.locator('#createImageButton').click();
	await showLayersPanel(page);

	await paint(page, FIRST_STROKE);
	await page.locator('[data-panel="layers"] .layer-new-paint').click();
	await paint(page, SECOND_STROKE);
	const paintLayers = page.locator('[data-panel="layers"] .layer-object-row');
	await expect(paintLayers).toHaveCount(PAINT_LAYER_COUNT);

	await page.waitForTimeout(RECOVERY_SETTLE_MS);
	await page.reload();
	await showLayersPanel(page);
	await expect(paintLayers).toHaveCount(PAINT_LAYER_COUNT);

	await paint(page, STROKE_AFTER_RELOAD);
	await expect(paintLayers).toHaveCount(PAINT_LAYER_COUNT);
});

async function showLayersPanel(page: Page): Promise<void> {
	if (await page.locator('[data-panel="layers"]').isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}

async function paint(page: Page, stroke: Stroke): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
	await page.locator('#overlay').evaluate((overlay, gesture) => {
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
					pointerId: 1,
					clientX: bounds.left + (point.x * bounds.width) / canvas.width,
					clientY: bounds.top + (point.y * bounds.height) / canvas.height,
				}),
			);
	}, stroke);
}
