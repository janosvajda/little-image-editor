import { expect, test } from '@playwright/test';

test('crop selection modes use direct icon buttons with a visible active state', async ({
	page,
}) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await page.locator('[data-tool="crop"]').click();

	const rectangle = page.getByRole('button', {
		name: 'Rectangle crop selection',
	});
	const lasso = page.getByRole('button', { name: 'Lasso crop selection' });
	await expect(rectangle.locator('svg')).toBeVisible();
	await expect(lasso.locator('svg')).toBeVisible();
	await expect(rectangle).toHaveAttribute('aria-pressed', 'true');
	await expect(lasso).toHaveAttribute('aria-pressed', 'false');
	await expect(page.locator('.crop-tool-options select')).toHaveCount(0);

	await lasso.click();
	await expect(rectangle).toHaveAttribute('aria-pressed', 'false');
	await expect(lasso).toHaveAttribute('aria-pressed', 'true');
	await expect(lasso).toHaveClass(/active/);
});
