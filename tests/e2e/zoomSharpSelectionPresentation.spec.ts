import { expect, test, type Page } from '@playwright/test';

test('selection controls stay sharp and screen-sized while canvas pixels magnify', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await selectRectangle(page);
	await dragCanvas(page, { x: 220, y: 180 }, { x: 480, y: 360 });
	await page.keyboard.press('v');

	const handle = page.locator('.selection-handle').first();
	await expect(handle).toBeVisible();
	const actualSize = await handle.boundingBox();
	await page.locator('#zoomSelect').selectOption('300');
	const magnifiedSize = await handle.boundingBox();

	expect(magnifiedSize?.width).toBeCloseTo(actualSize?.width ?? 0, 0);
	expect(magnifiedSize?.height).toBeCloseTo(actualSize?.height ?? 0, 0);
	await expect(page.locator('.canvas-stage')).toHaveClass(/magnified/);
	expect(
		await page
			.locator('#canvas')
			.evaluate((canvas) => getComputedStyle(canvas).imageRendering),
	).toBe('pixelated');
});

async function selectRectangle(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose shape tools' }).click();
	await page
		.getByRole('menu', { name: 'Shape tools' })
		.getByRole('menuitem', { name: 'Rectangle', exact: true })
		.click();
}

async function dragCanvas(
	page: Page,
	from: Readonly<{ x: number; y: number }>,
	to: Readonly<{ x: number; y: number }>,
): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, points) => {
			const canvas = overlay as HTMLCanvasElement;
			const bounds = canvas.getBoundingClientRect();
			const screen = (point: Readonly<{ x: number; y: number }>) => ({
				x: bounds.left + (point.x * bounds.width) / canvas.width,
				y: bounds.top + (point.y * bounds.height) / canvas.height,
			});
			const start = screen(points.from);
			const end = screen(points.to);
			canvas.setPointerCapture = () => undefined;
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
						pointerId: 89,
						clientX: point.x,
						clientY: point.y,
					}),
				);
		},
		{ from, to },
	);
}
