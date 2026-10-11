import { expect, test } from '@playwright/test';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { openImageInVsCode, openVsCodeWebview } from './support/vscodeWebview';

const MARKDOWN = '# Flow\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n';

test.use({ viewport: { width: 980, height: 640 } });

test('in VS Code, without a File menu, the toolbar button inserts a pasted or imported Mermaid diagram', async ({ page }) => {
	await openVsCodeWebview(page);
	await openImageInVsCode(page, 'board.png', { width: 900, height: 700 }, ColorPalette.White);
	await expect(page.locator('#fileMenu')).toBeHidden();
	const button = page.getByRole('button', { name: 'Insert Mermaid diagram' });
	await expect(button).toBeVisible();

	await button.click();
	await expect(page.locator('#diagramDialog')).toBeVisible();
	await page.locator('#mermaidSource').fill('stateDiagram-v2\n  [*] --> Idle\n  Idle --> [*]');
	await page.locator('#insertDiagramButton').click();
	await expect(page.locator('#diagramDialog')).toBeHidden();

	await button.click();
	const chooser = page.waitForEvent('filechooser');
	await page.locator('#importDiagramFileButton').click();
	await (await chooser).setFiles({ name: 'flow.md', mimeType: 'text/markdown', buffer: Buffer.from(MARKDOWN) });
	await expect(page.locator('#diagramDialog')).toBeHidden();
	await expect(page.locator('#mermaidSource')).toHaveValue('sequenceDiagram\n  A->>B: hi');
	// The open image keeps its size: diagrams go onto it.
	await expect(page.locator('#dimensions')).toHaveText('900 × 700 px');
});
