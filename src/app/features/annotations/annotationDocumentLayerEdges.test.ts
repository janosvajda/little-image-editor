import { describe, expect, it } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { EditorLimit } from '../../core/document/editorLimits';
import { ShapeHandleId } from '../../core/geometry/shapeTransformHelpers';
import { CoreLayerId } from '../../core/layers/layerTypes';
import {
	AnnotationStackDirection,
	AnnotationDocument,
} from './annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type RasterFragmentAnnotation,
	type ShapeAnnotation,
	type StrokeAnnotation,
} from './annotationTypes';

const Selection = [
	{ x: 0, y: 0 },
	{ x: 30, y: 0 },
	{ x: 30, y: 30 },
] as const;
const Delta = { x: 5, y: 7 } as const;

function shape(id: string): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 10, height: 10 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
	};
}

function stroke(id: string): StrokeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Stroke,
		layerId: CoreLayerId.Objects,
		tool: PaintToolId.Brush,
		points: [
			{ x: 1, y: 1, pressure: 1 },
			{ x: 20, y: 20, pressure: 1 },
		],
		rect: { x: 0, y: 0, width: 22, height: 22 },
		color: '#000000',
		size: 2,
		opacity: 1,
		hardness: 1,
		seed: 1,
	};
}

function fragment(): RasterFragmentAnnotation {
	return {
		id: 'fragment',
		type: AnnotationObjectTypeId.RasterFragment,
		rect: { x: 0, y: 0, width: 1, height: 1 },
		pixelWidth: 1,
		pixelHeight: 1,
		pixels: '/wAA/w==',
		rotation: 0,
	};
}

function document(...objects: AnnotationObject[]): AnnotationDocument {
	const layers = new AnnotationDocument();
	for (const object of objects) layers.add(object);
	return layers;
}

function historyLength(layers: AnnotationDocument): number {
	return layers.snapshotSession().history.length;
}

describe('annotation document layer edge cases', () => {
	it('ignores operations on layers that do not exist', () => {
		const layers = document(shape('a'));
		const before = historyLength(layers);
		layers.activate('missing');
		layers.beginInteraction('missing');
		layers.remove('missing');
		layers.reorder('missing', AnnotationStackDirection.Forward);
		layers.moveItemTo('missing', 'a');
		layers.moveItemTo('a', 'a');
		layers.moveItemToLayer('a', 'missing');
		layers.moveLayerTo('missing', layers.layerOf('a')!.id);
		expect(layers.cutAndMove('missing', Selection, Delta)).toBeNull();
		expect(layers.cutToRasterFragment('missing', Selection, fragment())).toBeNull();
		expect(historyLength(layers)).toBe(before);
	});

	it('does not move the bottom layer down or the top layer up', () => {
		const layers = document(shape('bottom'), shape('top'));
		const before = historyLength(layers);
		layers.reorder('bottom', AnnotationStackDirection.Backward);
		layers.reorder('top', AnnotationStackDirection.Forward);
		expect(historyLength(layers)).toBe(before);
	});

	it('clears the selection of a layer that is hidden', () => {
		const layers = document(shape('a'));
		layers.setVisible('a', false);
		expect(layers.selectedId).toBeNull();
		expect(layers.containsObjectPoint('a', { x: 15, y: 15 })).toBe(false);
		layers.setVisible('a', true);
		expect(layers.containsObjectPoint('a', { x: 15, y: 15 })).toBe(true);
	});

	it('cancels an interaction only while one is active', () => {
		const layers = document(shape('a'));
		const revision = layers.renderState.revision;
		layers.cancelCurrentInteraction();
		expect(layers.renderState.revision).toBe(revision);
		layers.beginInteraction('a');
		layers.cancelCurrentInteraction();
		expect(layers.renderState.interactionActive).toBe(false);
	});

	it('discards uncommitted layers and their selection', () => {
		const layers = document(shape('kept'));
		layers.add(shape('draft'), false);
		layers.discardUncommitted(new Set());
		expect(layers.object('draft')).not.toBeNull();
		layers.discardUncommitted(new Set(['draft']));
		expect(layers.object('draft')).toBeNull();
		expect(layers.selectedId).toBeNull();
	});

	it('translates every layer, optionally as a history step', () => {
		const empty = new AnnotationDocument();
		empty.translateAll(Delta);
		expect(historyLength(empty)).toBe(1);
		const layers = document(shape('a'));
		const before = historyLength(layers);
		layers.translateAll(Delta);
		expect(layers.object('a')?.rect).toMatchObject({ x: 15, y: 17 });
		expect(historyLength(layers)).toBe(before + 1);
	});

	it('cuts pixels of an item into a piece directly above it in the same layer', () => {
		const layers = document(stroke('paint'), shape('top'));
		const layerId = layers.layerOf('paint')!.id;
		expect(layers.cutAndMove('paint', Selection.slice(0, 2), Delta)).toBeNull();
		const moved = layers.cutAndMove('paint', Selection, Delta)!;
		expect(layers.state.objects.map(({ id }) => id)).toEqual(['paint', moved, 'top']);
		expect(layers.layerOf(moved)?.id).toBe(layerId);
		const cut = layers.cutToRasterFragment('paint', Selection, fragment())!;
		expect(layers.object('paint')?.pixelCutouts?.at(-1)?.strokePointLimit).toBe(2);
		expect(layers.layerOf(cut)?.id).toBe(layerId);
		expect(layers.cutToRasterFragment('paint', Selection.slice(0, 2), fragment())).toBeNull();
	});

	it('resizes and transforms only a selected layer', () => {
		const layers = document(shape('a'));
		layers.clearSelection();
		layers.resizeSelected({ x: 40, y: 40 });
		layers.transformSelected(ShapeHandleId.SouthEast, { x: 40, y: 40 });
		expect(layers.object('a')?.rect).toMatchObject({ width: 10, height: 10 });
	});

	it('keeps at most the configured number of history steps', () => {
		const layers = document(shape('a'));
		for (let step = 0; step <= EditorLimit.EditableObjectHistory; step += 1)
			layers.move('a', { x: 1, y: 0 });
		expect(historyLength(layers)).toBe(EditorLimit.EditableObjectHistory);
	});

	it('hit-tests a zero-length arrow by its point', () => {
		const layers = document({
			id: 'arrow',
			type: AnnotationObjectTypeId.Arrow,
			from: { x: 5, y: 5 },
			to: { x: 5, y: 5 },
			color: '#000000',
			width: 2,
		});
		expect(layers.hitTest({ x: 6, y: 6 })?.id).toBe('arrow');
	});
});
