import { expect, type Page, test } from '@playwright/test';
import { HostMessageType } from '../../src/shells/vscode/vscodeMessages';
import { openVsCodeWebview, sendToWebview } from './support/vscodeWebview';

const title = (page: Page) => page.locator('#newImageDialog header strong');

test('the New image dialog names the editor in VS Code, where it sits among other tools, and not in its own app', async ({ page }) => {
	await page.goto('/');
	await page.locator('#quickNewButton').click();
	await expect(title(page)).toHaveText('New image', { useInnerText: true });

	await openVsCodeWebview(page);
	await sendToWebview(page, { type: HostMessageType.Create, fileName: 'Untitled-1.png' });
	await expect(title(page)).toHaveText('New image – Little Image Editor', { useInnerText: true });
});
