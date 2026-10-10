import { expect, test } from '@playwright/test';
import { ShapeToolId, UtilityToolId } from '../../src/app/core/document/appTypes';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { canvasPixel, installTestProjectWriter, mouseCanvasDrag, openTestPhoto, restoreTestProject, saveTestProject, selectTool } from './support/editorWorkflow';

const Rectangle = { from: { x: 60, y: 50 }, to: { x: 180, y: 130 } } as const;
const Arrow = { from: { x: 40, y: 145 }, to: { x: 100, y: 40 } } as const;
const Sample = { x: 55, y: 119 } as const;
const MoveBy = { x: 10, y: 10 } as const;
const WhitePixel = [255, 255, 255, 255];

test.use({ viewport: { width: 1600, height: 1050 } });

for (const tool of [ShapeToolId.Arrow, ShapeToolId.Line]) {
	test(`${tool} keeps its drawn position and direction inside a rotated layer`, async ({ page }) => {
		await openTestPhoto(page);
		await selectTool(page, ShapeToolId.Rectangle);
		await page.locator('#colorInput').fill(ColorPalette.RoyalBlue);
		await page.locator('#focusButton').click();
		await mouseCanvasDrag(page, Rectangle.from, Rectangle.to);
		await selectTool(page, UtilityToolId.Select);
		await mouseCanvasDrag(page, { x: 120, y: 26 }, { x: 204, y: 90 });
		await page.locator('#exitFocusButton').click();
		await page.getByRole('button', { name: 'Choose shape tools' }).click();
		await page.getByRole('menu', { name: 'Shape tools' }).getByRole('menuitem', { name: tool === ShapeToolId.Arrow ? 'Arrow' : 'Line', exact: true }).click();
		await page.locator('#colorInput').fill(ColorPalette.White);
		await page.locator('#focusButton').click();
		await mouseCanvasDrag(page, Arrow.from, Arrow.to);
		expect(await canvasPixel(page, Sample, '.annotation-canvas')).toEqual(WhitePixel);
		await selectTool(page, UtilityToolId.Select);
		await mouseCanvasDrag(page, { x: 120, y: 90 }, { x: 120 + MoveBy.x, y: 90 + MoveBy.y });
		expect(await canvasPixel(page, { x: Sample.x + MoveBy.x, y: Sample.y + MoveBy.y }, '.annotation-canvas')).toEqual(WhitePixel);
		await page.locator('#exitFocusButton').click();
		const project = await saveTestProject(page);
		expect(project.editableObjects.state.layers).toHaveLength(1);
		expect(project.editableObjects.state.layers?.[0]?.rotation).toBeCloseTo(90);
		expect(project.editableObjects.state.objects).toHaveLength(2);
		expect(project.editableObjects.state.objects[1]?.rotation).toBe(0);
		await page.reload();
		await restoreTestProject(page, project);
		await installTestProjectWriter(page);
		expect((await saveTestProject(page)).editableObjects.state).toEqual(project.editableObjects.state);
		expect(await canvasPixel(page, { x: Sample.x + MoveBy.x, y: Sample.y + MoveBy.y }, '.annotation-canvas')).toEqual(WhitePixel);
	});
}
