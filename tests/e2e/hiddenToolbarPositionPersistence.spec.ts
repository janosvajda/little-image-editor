import { expect, test } from '@playwright/test';

interface Position {
	readonly left: string;
	readonly top: string;
}

test('a hidden toolbar reopens at its previous saved position', async ({
	page,
}) => {
	await page.goto('/');
	const tools = page.locator('[data-panel="tools"]');
	const position = await tools.evaluate<Position>((panel) => ({
		left: (panel as HTMLElement).style.left,
		top: (panel as HTMLElement).style.top,
	}));

	await tools.getByRole('button', { name: 'Close Tools' }).click();
	await expect(tools).toBeHidden();
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="tools"]').check();

	await expect(tools).toBeVisible();
	await expect(tools).toHaveCSS('left', position.left);
	await expect(tools).toHaveCSS('top', position.top);

	await tools.getByRole('button', { name: 'Close Tools' }).click();
	await page.reload();
	await expect(tools).toBeHidden();
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="tools"]').check();
	await expect(tools).toHaveCSS('left', position.left);
	await expect(tools).toHaveCSS('top', position.top);
});
