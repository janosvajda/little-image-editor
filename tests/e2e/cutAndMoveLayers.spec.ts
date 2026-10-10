import { expect, test, type Page } from '@playwright/test';
import { ImageMimeType, ShapeToolId, UtilityToolId, type Point } from '../../src/app/core/document/appTypes';
import { ColorPalette } from '../../src/app/core/document/colorPalette';
import { CoreLayerId } from '../../src/app/core/layers/layerTypes';
import { AnnotationObjectTypeId, type RasterFragmentAnnotation } from '../../src/app/features/annotations/annotationTypes';
import { CropSelectionKind } from '../../src/app/features/drawing/cropSelectionTypes';
import type { LittleImageProject } from '../../src/app/features/projects/projectTypes';
import { decodePixelBytes } from '../../src/app/shared/image/pixelDataCodec';
import { canvasDrag, canvasPixel, canvasPointers, openTestPhoto, PointerPhase, restoreTestProject, saveTestProject, selectTool, showLayers } from './support/editorWorkflow';

const Area = { from: { x: 20, y: 20 }, to: { x: 80, y: 80 }, center: { x: 50, y: 50 }, destination: { x: 170, y: 120 } } as const;
const AlphaChannel = 3;

for (const format of [ImageMimeType.Png, ImageMimeType.Jpeg]) {
	test(`${format}: a photo cut creates an independent layer, transparent hole and linked undo`, async ({ page }) => {
		await openTestPhoto(page, format);
		const original = await canvasPixel(page, Area.center);
		await selectTool(page, UtilityToolId.Crop);
		await canvasDrag(page, Area.from, Area.to);
		expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
		const cut = await saveTestProject(page);
		const piece = pixelPiece(cut);
		expect(cut.editableObjects.state.layers).toHaveLength(1);
		expect(piece.rect).toEqual({ x: 20, y: 20, width: 60, height: 60 });
		expect(fragmentPixel(piece, { x: 30, y: 30 })).toEqual(original);
		expect(await canvasPixel(page, Area.center, '.annotation-canvas')).toEqual(original);
		await page.locator('#undoButton').click();
		expect(await canvasPixel(page, Area.center)).toEqual(original);
		await expect(page.locator('.layer-item-row')).toHaveCount(0);
		await page.locator('#redoButton').click();
		expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
		await expect(page.locator('.layer-item-row')).toHaveCount(1);
		await selectTool(page, UtilityToolId.Select);
		await canvasDrag(page, Area.center, Area.destination);
		expect(await canvasPixel(page, Area.destination, '.annotation-canvas')).toEqual(original);
		const moved = await saveTestProject(page);
		await page.reload();
		await restoreTestProject(page, moved);
		expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
		expect(await canvasPixel(page, Area.destination, '.annotation-canvas')).toEqual(original);
		await page.locator('#undoButton').click();
		expect(await canvasPixel(page, Area.center, '.annotation-canvas')).toEqual(original);
		await page.locator('#undoButton').click();
		expect(await canvasPixel(page, Area.center)).toEqual(original);
		await expect(page.locator('.layer-item-row')).toHaveCount(0);
	});
}

test('a photo cut preserves partial alpha exactly through .limg', async ({ page }) => {
	await openTestPhoto(page, ImageMimeType.Png, 0.5);
	const original = await canvasPixel(page, Area.center);
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, Area.from, Area.to);
	const cut = await saveTestProject(page);
	expect(fragmentPixel(pixelPiece(cut), { x: 30, y: 30 })).toEqual(original);
	expect(original[AlphaChannel]).toBe(128);
	await restoreTestProject(page, cut);
	expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
	expect(await canvasPixel(page, Area.center, '.annotation-canvas')).toEqual(original);
});

test('a photo cut overlapping another layer preserves that layer and stays beneath it', async ({ page }) => {
	await openTestPhoto(page);
	await rectangle(page, { x: 60, y: 40 }, { x: 120, y: 100 });
	const before = await saveTestProject(page);
	const source = before.editableObjects.state.objects[0]!;
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, Area.from, { x: 140, y: 120 });
	const cut = await saveTestProject(page);
	expect(cut.editableObjects.state.layers).toHaveLength(2);
	expect(cut.editableObjects.state.layers?.[1]?.id).toBe(before.editableObjects.state.layers?.[0]?.id);
	expect(cut.editableObjects.state.objects.find((item) => item.id === source.id)).toEqual(source);
	expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
	expect(await canvasPixel(page, { x: 90, y: 70 }, '.annotation-canvas')).toEqual([0, 0, 0, 255]);
});

test('a cut from a selected object creates a pixel item in the same layer and preserves its neighbours', async ({ page }) => {
	await openTestPhoto(page);
	await rectangle(page, { x: 20, y: 20 }, { x: 110, y: 110 });
	await rectangle(page, { x: 130, y: 20 }, { x: 210, y: 100 });
	const before = await saveTestProject(page);
	const source = before.editableObjects.state.objects[0]!;
	const neighbour = before.editableObjects.state.objects[1]!;
	await showLayers(page);
	await page.locator(`.layer-item-row[data-object-id="${source.id}"]`).click();
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, { x: 30, y: 30 }, { x: 70, y: 70 });
	const cut = await saveTestProject(page);
	const piece = pixelPiece(cut);
	expect(cut.editableObjects.state.layers).toHaveLength(1);
	expect(cut.editableObjects.state.layers?.[0]?.itemIds).toContain(piece.id);
	expect(cut.editableObjects.state.objects.find((item) => item.id === source.id)?.pixelCutouts).toHaveLength(1);
	expect(cut.editableObjects.state.objects.find((item) => item.id === neighbour.id)).toEqual(neighbour);
	await canvasDrag(page, Area.center, { x: 50, y: 140 });
	expect((await canvasPixel(page, Area.center, '.annotation-canvas'))[AlphaChannel]).toBe(0);
	expect(await canvasPixel(page, { x: 50, y: 140 }, '.annotation-canvas')).toEqual([0, 0, 0, 255]);
	expect(await canvasPixel(page, Area.center)).toEqual([255, 0, 0, 255]);
	await selectTool(page, UtilityToolId.Select);
	await canvasDrag(page, { x: 230, y: 170 }, { x: 230, y: 170 });
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, { x: 40, y: 40 }, { x: 60, y: 60 });
	const throughHole = await saveTestProject(page);
	expect(throughHole.editableObjects.state.layers).toHaveLength(2);
	expect(throughHole.editableObjects.state.objects).toHaveLength(4);
	expect(throughHole.editableObjects.state.objects.find((item) => item.id === source.id)?.pixelCutouts).toHaveLength(1);
	expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
});

test('a lasso cut preserves pixels outside its polygon and permits a new cut through its transparent corner', async ({ page }) => {
	await openTestPhoto(page);
	await selectTool(page, UtilityToolId.Crop);
	await page.locator(`[data-crop-selection-kind="${CropSelectionKind.Lasso}"]`).click();
	await canvasPointers(page, [
		{ type: PointerPhase.Press, point: Area.from },
		{ type: PointerPhase.Move, point: { x: 120, y: 20 } },
		{ type: PointerPhase.Move, point: { x: 20, y: 120 } },
		{ type: PointerPhase.Release, point: Area.from },
	]);
	expect((await canvasPixel(page, { x: 40, y: 40 }))[AlphaChannel]).toBe(0);
	expect((await canvasPixel(page, { x: 100, y: 100 }))[AlphaChannel]).toBe(255);
	const first = await saveTestProject(page);
	expect(fragmentPixel(pixelPiece(first), { x: 80, y: 80 })[AlphaChannel]).toBe(0);
	await selectTool(page, UtilityToolId.Select);
	await canvasDrag(page, { x: 230, y: 170 }, { x: 230, y: 170 });
	await selectTool(page, UtilityToolId.Crop);
	await page.locator(`[data-crop-selection-kind="${CropSelectionKind.Rectangle}"]`).click();
	await canvasDrag(page, { x: 100, y: 100 }, { x: 115, y: 115 });
	const second = await saveTestProject(page);
	expect(second.editableObjects.state.layers).toHaveLength(2);
	expect(second.editableObjects.state.objects).toHaveLength(2);
	expect((await canvasPixel(page, { x: 105, y: 105 }))[AlphaChannel]).toBe(0);
});

test('a raster cut-out remains a source for later cuts without leaving stale hit-test pixels in its hole', async ({ page }) => {
	await openTestPhoto(page);
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, Area.from, Area.to);
	const first = await saveTestProject(page);
	const originalPiece = pixelPiece(first);
	await selectTool(page, UtilityToolId.Select);
	await canvasDrag(page, Area.center, { x: 150, y: 110 });
	// Deselect so Crop starts a new cut instead of moving the selected cut-out.
	await canvasDrag(page, { x: 230, y: 170 }, { x: 230, y: 170 });
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, { x: 140, y: 100 }, { x: 160, y: 120 });
	const second = await saveTestProject(page);
	expect(second.editableObjects.state.layers).toHaveLength(1);
	expect(second.editableObjects.state.objects).toHaveLength(2);
	expect(second.editableObjects.state.objects.find((item) => item.id === originalPiece.id)?.pixelCutouts).toHaveLength(1);
	await canvasDrag(page, { x: 150, y: 110 }, { x: 200, y: 110 });
	await selectTool(page, UtilityToolId.Select);
	await canvasDrag(page, { x: 230, y: 170 }, { x: 230, y: 170 });
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, { x: 145, y: 105 }, { x: 155, y: 115 });
	const third = await saveTestProject(page);
	expect(third.editableObjects.state.layers).toHaveLength(2);
	expect(third.editableObjects.state.objects).toHaveLength(3);
});

test('Escape cancels both selection drafts and cut-out move previews without removing completed cuts', async ({ page }) => {
	await openTestPhoto(page);
	await selectTool(page, UtilityToolId.Crop);
	await canvasPointers(page, [{ type: PointerPhase.Press, point: Area.from }, { type: PointerPhase.Move, point: Area.to }]);
	await page.keyboard.press('Escape');
	await canvasPointers(page, [{ type: PointerPhase.Release, point: Area.to }]);
	expect((await saveTestProject(page)).editableObjects.state.objects).toHaveLength(0);
	expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(255);
	await canvasDrag(page, Area.from, Area.to);
	const cut = await saveTestProject(page);
	await canvasPointers(page, [{ type: PointerPhase.Press, point: Area.center }, { type: PointerPhase.Move, point: Area.destination }]);
	await page.keyboard.press('Escape');
	await canvasPointers(page, [{ type: PointerPhase.Release, point: Area.destination }]);
	expect((await saveTestProject(page)).editableObjects).toEqual(cut.editableObjects);
	expect((await canvasPixel(page, Area.center))[AlphaChannel]).toBe(0);
	await expect(page.locator('.layer-item-row')).toHaveCount(1);
});

test('locking the image blocks a cut without creating a fragment or changing its pixels', async ({ page }) => {
	await openTestPhoto(page);
	await showLayers(page);
	await page.locator(`[data-layer-id="${CoreLayerId.Image}"] .layer-lock`).click();
	const original = await canvasPixel(page, Area.center);
	await selectTool(page, UtilityToolId.Crop);
	await canvasDrag(page, Area.from, Area.to);
	expect(await canvasPixel(page, Area.center)).toEqual(original);
	expect((await saveTestProject(page)).editableObjects.state.objects).toHaveLength(0);
});

function pixelPiece(project: LittleImageProject): RasterFragmentAnnotation {
	const piece = project.editableObjects.state.objects.find((item) => item.type === AnnotationObjectTypeId.RasterFragment);
	if (!piece) throw new Error('Project contains no pixel cut-out.');
	return piece;
}

function fragmentPixel(fragment: RasterFragmentAnnotation, point: Point): number[] {
	const channels = 4;
	const index = (point.y * fragment.pixelWidth + point.x) * channels;
	return Array.from(decodePixelBytes(fragment.pixels).slice(index, index + channels));
}

async function rectangle(page: Page, from: Point, to: Point): Promise<void> {
	await selectTool(page, ShapeToolId.Rectangle);
	await page.locator('#colorInput').fill(ColorPalette.Black);
	await page.locator('#fillInput').check();
	await canvasDrag(page, from, to);
}
