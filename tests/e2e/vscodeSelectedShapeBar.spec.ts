import { expect, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

test.use({ viewport: { width: 1100, height: 700 } });

const Bar = '.topbar .selected-object-options';

test('in VS Code a selected box shows its line and fill in the bar, and keeps its selection after picking a colour', async ({ page }) => {
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 700, height: 500 }, ColorPalette.White);
	await page.getByRole('button', { name: 'Insert Mermaid diagram' }).click();
	await page.locator('#mermaidSource').fill('flowchart LR\n  web[Web app] --> api[API]');
	await page.locator('#insertDiagramButton').click();
	await page.keyboard.press('v');
	const layersButton = page.locator('.dock-rail button').first();
	await layersButton.click();
	await page.locator('[data-panel="layers"] .layer-item-row', { hasText: 'Rectangle' }).first().locator('.layer-name').click();
	await layersButton.click();

	const bar = page.locator(Bar);
	await expect(bar).toBeVisible();
	await expect(bar).not.toContainText('Selected object');
	await expect(bar.locator('[data-object-property="color"]')).toHaveText('Line');
	const fill = page.getByLabel('Selected object fill colour');
	await expect(fill).toBeVisible();
	await fill.fill('#ffcc00');
	await expect(fill).toHaveValue('#ffcc00');

	// The press that closes the colour picker does not clear the selection.
	await page.getByLabel('Selected object color', { exact: true }).click();
	const canvas = (await page.locator('#overlay').boundingBox())!;
	await page.mouse.click(canvas.x + 20, canvas.y + 20);
	await expect(bar).toBeVisible();
	// The next press on empty canvas is the canvas's again.
	await page.mouse.click(canvas.x + 20, canvas.y + 20);
	await expect(bar).toBeHidden();
});
