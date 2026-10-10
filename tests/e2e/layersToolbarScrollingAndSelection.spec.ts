import { expect, test, type Page } from '@playwright/test';

const ObjectCount = 30;

test('only the layer list scrolls, and it visibly selects clicked layers', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageFormat').selectOption('application/vnd.little-image-editor.project+json');
	await page.locator('#newImageName').fill('scrolling-layers');
	await page.locator('#createImageButton').click();
	await selectBrush(page);
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
	const panel = page.locator('[data-panel="layers"]');
	for (let index = 0; index < ObjectCount; index += 1) {
		const x = 30 + (index % 10) * 70;
		const y = 40 + Math.floor(index / 10) * 100;
		await panel.locator('.layer-new-paint').click();
		await drawStroke(page, x, y);
	}
	// The list scrolls on its own, keeping the layer properties and actions in view.
	const body = panel.locator('.layer-list');
	await expect(panel).toBeVisible();
	await expect(panel.locator('.layer-object-row')).toHaveCount(ObjectCount);

	const scrolling = await body.evaluate((element) => ({
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
		overflowY: getComputedStyle(element).overflowY,
	}));
	expect(scrolling.scrollHeight).toBeGreaterThan(scrolling.clientHeight);
	expect(scrolling.overflowY).toBe('auto');
	await expect(panel.locator('.layer-new-paint')).toBeInViewport();
	const panelBounds = await panel.boundingBox();
	expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(
		await page.evaluate(() => window.innerHeight),
	);

	const row = panel.locator('.layer-object-row').nth(1);
	await row.click();
	await expect(row).toHaveAttribute(
		'aria-selected',
		'true',
	);
	await expect(panel.locator('.layer-object-row').first()).toHaveAttribute(
		'aria-selected',
		'false',
	);
	const promotedLayerId = await row.getAttribute('data-content-layer-id');
	await row.getByRole('button', { name: /Move .* forward/ }).click();
	await expect(panel.locator('.layer-object-row').first()).toHaveAttribute(
		'data-content-layer-id',
		promotedLayerId!,
	);
	await body.hover();
	await page.mouse.wheel(0, scrolling.scrollHeight);
	await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	await expect(panel.locator('.layer-object-row').last()).toBeInViewport();
});

async function selectBrush(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Choose brush tools' }).click();
	await page
		.getByRole('menu', { name: 'Brush tools' })
		.getByRole('menuitem', { name: 'Brush', exact: true })
		.click();
}

async function drawStroke(page: Page, x: number, y: number): Promise<void> {
	await page.locator('#overlay').evaluate(
		(overlay, point) => {
			const canvas = overlay as HTMLCanvasElement;
			canvas.setPointerCapture = () => undefined;
			const bounds = canvas.getBoundingClientRect();
			const scaleX = bounds.width / canvas.width;
			const scaleY = bounds.height / canvas.height;
			for (const [type, offset, buttons] of [
				['pointerdown', 0, 1],
				['pointermove', 20, 1],
				['pointerup', 20, 0],
			] as const)
				canvas.dispatchEvent(
					new PointerEvent(type, {
						bubbles: true,
						button: 0,
						buttons,
						pointerId: 61,
						clientX: bounds.left + (point.x + offset) * scaleX,
						clientY: bounds.top + point.y * scaleY,
					}),
				);
		},
		{ x, y },
	);
}
