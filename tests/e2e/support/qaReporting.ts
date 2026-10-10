import type { Page } from '@playwright/test';
import { ToolbarId } from '../../../src/app/features/workspace/toolbarTypes';

/** Collapses or expands the QA Reporting toolbar; collapsed, it leaves the canvas free to click. */
export async function toggleQaReporting(page: Page): Promise<void> {
	await page.locator(`[data-panel="${ToolbarId.Annotations}"] > .panel-header > .collapse`).click();
}
