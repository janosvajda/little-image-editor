import { expect, type Locator, test } from '@playwright/test';

interface Rectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

const DRAG_STEP_COUNT = 8;

async function rectangleOf(locator: Locator): Promise<Rectangle> {
	const rectangle = await locator.boundingBox();
	if (!rectangle)
		throw new Error('Expected toolbar to have a visible rectangle.');
	return rectangle;
}

function overlaps(left: Rectangle, right: Rectangle): boolean {
	return (
		left.x < right.x + right.width &&
		left.x + left.width > right.x &&
		left.y < right.y + right.height &&
		left.y + left.height > right.y
	);
}

test('managed toolbars resolve overlap on drop and persist the safe layout', async ({
	page,
}) => {
	await page.goto('/');
	const tools = page.locator('[data-panel="tools"]');
	const adjust = page.locator('[data-panel="adjust"]');
	await page.locator('#toolbarPickerButton').click();
	await page.locator('[data-panel-toggle="adjust"]').check();
	await expect(adjust).toBeVisible();

	const toolsRectangle = await rectangleOf(tools);
	const adjustHeader = adjust.locator('.panel-header');
	const adjustHeaderRectangle = await rectangleOf(adjustHeader);
	await page.mouse.move(
		adjustHeaderRectangle.x + adjustHeaderRectangle.width / 2,
		adjustHeaderRectangle.y + adjustHeaderRectangle.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(
		toolsRectangle.x + toolsRectangle.width / 2,
		toolsRectangle.y + toolsRectangle.height / 2,
		{ steps: DRAG_STEP_COUNT },
	);
	await page.mouse.up();

	expect(overlaps(await rectangleOf(tools), await rectangleOf(adjust))).toBe(
		false,
	);
	const resolvedPosition = await adjust.evaluate((panel) => ({
		left: (panel as HTMLElement).style.left,
		top: (panel as HTMLElement).style.top,
	}));

	await page.reload();
	await expect(adjust).toBeVisible();
	expect(overlaps(await rectangleOf(tools), await rectangleOf(adjust))).toBe(
		false,
	);
	await expect(adjust).toHaveCSS('left', resolvedPosition.left);
	await expect(adjust).toHaveCSS('top', resolvedPosition.top);
});
