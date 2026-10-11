import { expect, test } from '@playwright/test';

const LayerName = '[data-panel="layers"] .layer-row .layer-name';
const MARKDOWN = `# Architecture

\`\`\`mermaid
flowchart LR
  web[Web app] --> api[API]
  api --> db[(Database)]
\`\`\`
`;

test('the File menu has one Open and both Mermaid items', async ({ page }) => {
	await page.goto('/');
	await page.locator('#fileMenu summary').click();
	const items = page.locator('#fileMenu').getByRole('menuitem');
	await expect(items.filter({ hasText: /^Open/ })).toHaveCount(1);
	await expect(items.filter({ hasText: 'Open…' })).toBeVisible();
	await expect(items.filter({ hasText: 'Import Mermaid diagram…' })).toBeVisible();
	await expect(items.filter({ hasText: 'Insert Mermaid diagram…' })).toBeVisible();
	await expect(page.locator('#openProjectButton')).toHaveCount(0);
});

test('importing a Markdown file draws its Mermaid diagram as editable layers', async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	await page.goto('/');
	await page.locator('#fileMenu summary').click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('menuitem', { name: 'Import Mermaid diagram…' }).click();
	await (await chooser).setFiles({ name: 'architecture.md', mimeType: 'text/markdown', buffer: Buffer.from(MARKDOWN) });
	await expect(page.locator('#dimensions')).not.toHaveText('No image');
	await expect(page.locator('#diagramDialog')).toBeHidden();
	if (!(await page.locator('[data-panel="layers"]').isVisible())) {
		await page.locator('#toolbarPickerButton').click();
		await page.locator('[data-panel-toggle="layers"]').check();
		await page.keyboard.press('Escape');
	}
	for (const layer of ['Connections', 'Nodes'])
		await expect(page.locator(LayerName, { hasText: layer }).first()).toBeVisible();
});

test('a diagram file that cannot be drawn opens in the dialog with what is wrong', async ({ page }) => {
	await page.goto('/');
	await page.locator('#diagramFileInput').setInputFiles({ name: 'broken.mmd', mimeType: 'text/plain', buffer: Buffer.from('flowchart LR\n  a -->') });
	await expect(page.locator('#diagramDialog')).toBeVisible();
	await expect(page.locator('#mermaidSource')).toHaveValue('flowchart LR\n  a -->');
	await expect(page.locator('#diagramError')).not.toBeEmpty();
	await expect(page.locator('#dimensions')).toHaveText('No image');
});
