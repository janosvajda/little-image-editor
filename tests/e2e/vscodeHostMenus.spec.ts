import { expect, type Page, test } from '@playwright/test';
import { openVsCodeWebview } from './support/vscodeWebview';

const SCREENSHOT_DIRECTORY = 'test-results/host-menus';

async function topbarLayout(page: Page) {
	const topbar = (await page.locator('.topbar').boundingBox())!;
	const workspace = (await page.locator('.workspace').boundingBox())!;
	return { topbarHeight: topbar.height, workspaceTop: workspace.y };
}

test('in VS Code the editor leaves the application menus to VS Code and keeps its quick actions', async ({ page }) => {
	await page.goto('/');
	const web = await topbarLayout(page);
	await expect(page.locator('.menubar')).toBeVisible();
	await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/web.png` });

	await openVsCodeWebview(page);
	await expect(page.locator('html')).toHaveAttribute('data-host-provides', 'application-menus');
	await expect(page.locator('.menubar')).toBeHidden();
	await expect(page.locator('.app-mark')).toBeHidden();
	await expect(page.getByRole('toolbar', { name: 'Quick actions' })).toBeVisible();
	// In the docked layout every toolbar is a tab, so the Toolbars picker is not needed.
	await expect(page.locator('#toolbarPickerButton')).toBeHidden();
	const vscode = await topbarLayout(page);
	expect(vscode.topbarHeight).toBeLessThan(web.topbarHeight);
	expect(vscode.workspaceTop).toBe(vscode.topbarHeight);
	await page.screenshot({ path: `${SCREENSHOT_DIRECTORY}/vscode.png` });

	// Ctrl+F belongs to VS Code's find; the editor's hidden File menu stays closed.
	await page.keyboard.press('Control+f');
	await expect(page.locator('#fileMenu')).not.toHaveAttribute('open');
});
