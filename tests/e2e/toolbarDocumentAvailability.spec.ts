import { expect, test } from '@playwright/test';

const TOOLBAR_IDS = [
	'tools',
	'adjust',
	'effects',
	'transform',
	'annotations',
] as const;

test('every managed toolbar disables editing until an image exists', async ({
	page,
}) => {
	await page.goto('/');
	for (const toolbarId of TOOLBAR_IDS) {
		const body = page.locator(`[data-panel="${toolbarId}"] > .panel-body`);
		await expect(body).toBeDisabled();
		await expect(body).toHaveAttribute('aria-disabled', 'true');
	}
	await expect(page.getByRole('button', { name: 'Close Tools' })).toBeEnabled();

	await page.locator('#quickNewButton').click();
	await page.locator('#newImageName').fill('available-toolbar-controls');
	await page.locator('#createImageButton').click();
	for (const toolbarId of TOOLBAR_IDS)
		await expect(
			page.locator(`[data-panel="${toolbarId}"] > .panel-body`),
		).toBeEnabled();
});
