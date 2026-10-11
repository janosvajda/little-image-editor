import { expect, type Page, test } from '@playwright/test';

const ItemRow = '[data-panel="layers"] .layer-item-row';
const LayerName = '[data-panel="layers"] .layer-row .layer-name';
const DIAGRAM = `flowchart LR
  web[Web app] --> api[API]
  api --> db[(Database)]
  api -.->|cache| cache((Cache))`;

test('the elbow arrow in the shape tools draws one bent connector', async ({ page }) => {
	await createDocument(page);
	await page.getByRole('button', { name: 'Choose shape tools' }).click();
	await page.getByRole('menu', { name: 'Shape tools' }).getByRole('menuitem', { name: 'Elbow arrow', exact: true }).click();
	await drag(page, { x: 300, y: 200 }, { x: 600, y: 360 });
	await expect(page.locator(ItemRow)).toHaveCount(1);
	await expect(page.locator(ItemRow)).toContainText('Connector');
});

test('a Mermaid flowchart pasted into Image functions becomes editable layers', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#fileMenu summary').click();
	await page.getByRole('menuitem', { name: 'Insert Mermaid diagram…' }).click();
	await page.locator('#mermaidSource').fill('flowchart LR\n  a -->');
	await page.locator('#insertDiagramButton').click();
	await expect(page.locator('#diagramError')).not.toBeEmpty();
	await expect(page.locator('#diagramDialog')).toBeVisible();

	await page.locator('#mermaidSource').fill(DIAGRAM);
	await expect(page.locator('#diagramError')).toBeEmpty();
	await page.locator('#insertDiagramButton').click();
	await expect(page.locator('#diagramDialog')).toBeHidden();
	await expect(page.locator('#dimensions')).not.toHaveText('No image');
	await showLayers(page);
	for (const layer of ['Connections', 'Nodes'])
		await expect(page.locator(LayerName, { hasText: layer }).first()).toBeVisible();
	await expect(page.locator(ItemRow, { hasText: 'Connector' }).first()).toBeAttached();
});

async function createDocument(page: Page): Promise<void> {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await page.locator('#createImageButton').click();
	await showLayers(page);
}

async function showLayers(page: Page): Promise<void> {
	if (await page.locator('[data-panel="layers"]').isVisible()) return;
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="layers"]').check();
	await page.keyboard.press('Escape');
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
	const box = await page.locator('#overlay').boundingBox();
	if (!box) throw new Error('Canvas overlay is not visible.');
	await page.mouse.move(box.x + from.x, box.y + from.y);
	await page.mouse.down();
	await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
	await page.mouse.up();
}
