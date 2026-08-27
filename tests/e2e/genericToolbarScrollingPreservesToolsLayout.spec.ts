import { expect, test } from '@playwright/test';

test('generic toolbar scrolling preserves the complete drawing tools layout', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#newImageName').fill('toolbar-layout');
	await page.locator('#createImageButton').click();
	const tools = page.locator('[data-panel="tools"]');
	const body = tools.locator('.panel-body');

	await expect(tools).toBeVisible();
	await expect(body.locator(':scope > .utility-tools')).toBeVisible();
	await expect(body.locator(':scope > .tool-options')).toBeVisible();
	await expect(body.locator(':scope > .zoom-tool-options')).toBeVisible();
	await expect(page.locator('#colorInput')).toBeVisible();
	await expect(page.locator('#sizeInput')).toBeVisible();
	await expect(page.locator('#opacityInput')).toBeVisible();
	await expect(page.locator('#hardnessInput')).toBeVisible();

	const panelBounds = await tools.boundingBox();
	const viewBounds = await body.locator(':scope > .zoom-tool-options').boundingBox();
	expect(viewBounds!.y).toBeGreaterThan(panelBounds!.y);
	expect(viewBounds!.y + viewBounds!.height).toBeLessThanOrEqual(
		panelBounds!.y + panelBounds!.height,
	);
});
