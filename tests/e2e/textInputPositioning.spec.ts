import { expect, test, type Page } from '@playwright/test';
import { MarkupToolId, type Point, UtilityToolId } from '../../src/app/core/document/appTypes';
import { AnnotationObjectTypeId } from '../../src/app/features/annotations/annotationTypes';
import { installTestProjectWriter, mouseCanvasDrag, openTestPhoto, restoreTestProject, saveTestProject, selectTool } from './support/editorWorkflow';

const InlineText = '.annotation-inline-text';
const Position = { x: 80, y: 100 } as const;
const Label = 'Canvas label';
const Toolbar = { Tools: 'tools', Reporting: 'annotations' } as const;

test.use({ viewport: { width: 1600, height: 1050 } });

for (const toolbar of Object.values(Toolbar)) {
	test(`positions text created through ${toolbar} and preserves the text layer in .limg`, async ({ page }) => {
		await openTestPhoto(page);
		if (toolbar === Toolbar.Reporting) {
			await page.locator('#toolbarPickerButton').click();
			await page.locator('[data-panel-toggle="annotations"]').check();
			await page.keyboard.press('Escape');
			await page.locator(`[data-panel="${toolbar}"] [data-tool="${MarkupToolId.Text}"]`).click();
		} else await selectTool(page, MarkupToolId.Text);
		await page.locator('#focusButton').click();
		await mouseCanvasDrag(page, Position, Position);
		await expectPositionedInput(page, Position);
		await page.locator(InlineText).fill(Label);
		await page.locator(InlineText).press('Enter');
		await page.locator('#exitFocusButton').click();
		const project = await saveTestProject(page);
		const item = project.editableObjects.state.objects[0]!;
		expect(item).toMatchObject({ type: AnnotationObjectTypeId.Text, at: Position, text: Label });
		expect(project.editableObjects.state.layers?.[0]?.itemIds).toContain(item.id);
		await page.reload();
		await restoreTestProject(page, project);
		await installTestProjectWriter(page);
		expect((await saveTestProject(page)).editableObjects.state).toEqual(project.editableObjects.state);
	});
}

test('positions text creation and double-click editing after zooming and scrolling', async ({ page }) => {
	await openTestPhoto(page);
	await page.locator('#zoomSelect').selectOption('800');
	await selectTool(page, MarkupToolId.Text);
	await page.locator('#focusButton').click();
	await page.locator('#canvasWrap').evaluate((element) => { element.scrollLeft = 240; element.scrollTop = 160; });
	const scroll = await page.locator('#canvasWrap').evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }));
	expect(scroll.x).toBeGreaterThan(0);
	expect(scroll.y).toBeGreaterThan(0);
	await mouseCanvasDrag(page, Position, Position);
	await expectPositionedInput(page, Position);
	await page.locator(InlineText).fill(Label);
	await page.locator(InlineText).press('Enter');
	await selectTool(page, UtilityToolId.Select);
	const editPosition = { x: Position.x + 10, y: Position.y - 10 };
	const client = await canvasClientPoint(page, editPosition);
	await page.mouse.dblclick(client.x, client.y);
	await expectPositionedInput(page, editPosition);
	await expect(page.locator(InlineText)).toHaveValue(Label);
	await page.locator(InlineText).fill('Edited label');
	await page.locator(InlineText).press('Enter');
	await page.locator('#exitFocusButton').click();
	expect((await saveTestProject(page)).editableObjects.state.objects[0]).toMatchObject({ text: 'Edited label', at: Position });
});

function canvasClientPoint(page: Page, point: Point): Promise<Point> {
	return page.locator('#overlay').evaluate((element, position) => {
		const canvas = element as HTMLCanvasElement;
		const bounds = canvas.getBoundingClientRect();
		return { x: bounds.left + position.x * bounds.width / canvas.width, y: bounds.top + position.y * bounds.height / canvas.height };
	}, point);
}

async function expectPositionedInput(page: Page, point: Point): Promise<void> {
	const input = page.locator(InlineText);
	await expect(input).toBeFocused();
	const client = await canvasClientPoint(page, point);
	const bounds = (await input.boundingBox())!;
	const fontSize = await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
	expect(bounds.x).toBeCloseTo(client.x, 0);
	expect(bounds.y + fontSize).toBeCloseTo(client.y, 0);
}
