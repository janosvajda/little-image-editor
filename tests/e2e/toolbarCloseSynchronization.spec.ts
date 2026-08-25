import { expect, test } from '@playwright/test';

test('a toolbar close control synchronizes its checklist and persisted visibility', async ({
	page,
}) => {
	await page.goto('/');
	const tools = page.locator('[data-panel="tools"]');
	await expect(tools).toBeVisible();
	await tools.getByRole('button', { name: 'Close Tools' }).click();
	await expect(tools).toBeHidden();

	await page.locator('#toolbarPickerButton').click();
	await expect(page.locator('[data-panel-toggle="tools"]')).not.toBeChecked();
	await page.reload();
	await expect(tools).toBeHidden();

	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="tools"]').check();
	await expect(tools).toBeVisible();
	await expect(
		tools.getByRole('button', { name: 'Close Tools' }),
	).toBeVisible();
});
