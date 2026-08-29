import { expect, test } from '@playwright/test';

test('drawing tools expose precise contextual width labels', async ({ page }) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();

	await page.keyboard.press('p');
	await expect(page.locator('#sizeLabel')).toHaveText('Width');

	await page.keyboard.press('e');
	await expect(page.locator('#sizeLabel')).toHaveText('Eraser width');

	await page.keyboard.press('r');
	await expect(page.locator('#sizeLabel')).toHaveText('Stroke width');
});
