import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
});

test('the rulers\' corner switches their unit in the browser editions too, as the unit menu does', async ({ page }) => {
	const corner = page.locator('.ruler-corner');
	const unit = page.locator('#rulerUnitSelect');
	await expect(corner).toHaveText('px');
	// Pressed on its left edge, which no panel covers.
	await corner.click({ position: { x: 6, y: 16 } });
	await expect(unit).toHaveValue('mm');
	await expect(corner).toHaveText('mm');
	await corner.click({ position: { x: 6, y: 16 } });
	await expect(unit).toHaveValue('cm');
	await unit.selectOption('in');
	await expect(corner).toHaveText('in');
});

test('a selected shape gets its own section: its name, its line and fill, then its style, and its kind of fill once filled', async ({ page }) => {
	await page.keyboard.press('r');
	const box = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.move(box.x + 400, box.y + 150);
	await page.mouse.down();
	await page.mouse.move(box.x + 600, box.y + 350, { steps: 5 });
	await page.mouse.up();
	await page.keyboard.press('v');
	await page.mouse.click(box.x + 500, box.y + 150);
	const options = page.locator('.selected-object-options');
	await expect(options).toBeVisible();
	// Titled with what it is, then its own line and fill, then how it is drawn.
	const rows = options.locator(':scope > :not(.hidden)');
	await expect(rows.nth(0)).toHaveText('Rectangle');
	await expect(rows.nth(1)).toHaveAttribute('data-object-property', 'color');
	await expect(rows.nth(2)).toHaveClass(/fill-group/);
	await expect(rows.nth(3)).toHaveClass(/shape-style/);
	// An outlined shape has no fill: its fill swatch says so.
	await expect(options.locator('[data-object-property="fillColor"]')).toHaveClass(/no-fill/);
	await expect(options.getByLabel('Selected object fill style')).toBeHidden();
	await page.getByRole('group', { name: 'Selected object style' }).getByRole('button', { name: 'Outline and fill' }).click();
	// With a fill, its kind can be chosen.
	await expect(options.locator('[data-object-property="fillColor"]')).not.toHaveClass(/no-fill/);
	await expect(options.getByLabel('Selected object fill style')).toBeVisible();
});
