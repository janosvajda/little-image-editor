import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { BlendMode } from '../../core/layers/layerTypes';
import { AnnotationStackDirection, AnnotationDocument } from './annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type ShapeAnnotation,
	type StrokeAnnotation,
} from './annotationTypes';
import { normalizeAnnotationState } from './contentLayerStructure';
import {
	EditableObjectPropertyId,
	editableObjectProperties,
	setEditableObjectProperty,
} from './editableObjectProperties';
import { createEmptyStroke } from './paintLayerFactory';

const HALF_OPACITY = 0.5;

function shape(id: string, x = 10, y = 10): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x, y, width: 40, height: 30 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		rotation: 0,
	};
}

function stroke(id: string): StrokeAnnotation {
	const points = [
		{ x: 10, y: 10, pressure: 1 },
		{ x: 60, y: 40, pressure: 1 },
	];
	return {
		...createEmptyStroke(),
		id,
		points,
		pathStyles: [
			{ startIndex: 0, tool: 'brush', color: '#000000', size: 4, opacity: 1, hardness: 1, seed: 1 },
		],
		size: 4,
		sourceRect: { x: 8, y: 8, width: 54, height: 34 },
		rect: { x: 8, y: 8, width: 54, height: 34 },
	};
}

function itemIds(document: AnnotationDocument, layerId: string): string[] {
	return document.layerItems(layerId).map((item) => item.id);
}

describe('content layers hold items', () => {
	it('creates one layer for the first item and puts later items into the active layer', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.add(stroke('b'));
		document.add(shape('c'));
		expect(document.state.layers).toHaveLength(1);
		const layer = document.state.layers[0]!;
		expect(layer.name).toBe('Layer 1');
		expect(itemIds(document, layer.id)).toEqual(['a', 'b', 'c']);
		expect(document.state.objects.map((item) => item.id)).toEqual(['a', 'b', 'c']);
		expect(document.activeLayer).toBe(layer);
		expect(document.selectedId).toBe('c');
	});

	it('creates new layers above the active one and fills them from then on', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const first = document.activeLayer!;
		const second = document.createLayer();
		document.add(shape('b'));
		document.activate(first.id);
		const between = document.createLayer();
		expect(document.state.layers.map((layer) => layer.id)).toEqual([first.id, between, second]);
		expect(document.state.layers.map((layer) => layer.name)).toEqual(['Layer 1', 'Layer 3', 'Layer 2']);
		expect(itemIds(document, second)).toEqual(['b']);
		expect(itemIds(document, between)).toEqual([]);
	});

	it('selecting an item activates its layer, and deselecting keeps the active layer', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const first = document.activeLayer!;
		document.createLayer();
		document.add(shape('b'));
		document.select('a');
		expect(document.activeLayer).toBe(first);
		document.select(null);
		expect(document.selectedId).toBeNull();
		expect(document.activeLayer).toBe(first);
		document.activate(null);
		expect(document.activeLayer).toBeNull();
	});

	it('moves a whole selected layer with all of its items as one undo step', () => {
		const document = new AnnotationDocument();
		document.add(shape('a', 10, 10));
		document.add(shape('b', 100, 50));
		const layer = document.activeLayer!;
		document.selectLayer(layer.id);
		expect(document.selectedLayer).toBe(layer);
		expect(document.layerBounds(layer.id)).toEqual({ x: 10, y: 10, width: 130, height: 70 });
		document.moveLayer(layer.id, { x: 5, y: 7 }, false);
		document.moveLayer(layer.id, { x: 5, y: 3 }, false);
		document.commitCurrent();
		expect(document.object('a')?.rect).toMatchObject({ x: 20, y: 20 });
		expect(document.object('b')?.rect).toMatchObject({ x: 110, y: 60 });
		document.undo();
		expect(document.object('a')?.rect).toMatchObject({ x: 10, y: 10 });
	});

	it('reorders items inside a layer and moves them between layers', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.add(shape('b'));
		const lower = document.activeLayer!;
		const upper = document.createLayer();
		document.add(shape('c'));
		document.reorder('a', AnnotationStackDirection.Forward);
		expect(itemIds(document, lower.id)).toEqual(['b', 'a']);
		document.moveItemTo('b', 'c');
		expect(itemIds(document, upper)).toEqual(['b', 'c']);
		document.moveItemToLayer('c', lower.id);
		expect(itemIds(document, lower.id)).toEqual(['a', 'c']);
		expect(document.state.objects.map((item) => item.id)).toEqual(['a', 'c', 'b']);
		document.reorderLayer(upper, AnnotationStackDirection.Backward);
		expect(document.state.objects.map((item) => item.id)).toEqual(['b', 'a', 'c']);
		document.moveLayerTo(upper, lower.id);
		expect(document.state.layers.map((layer) => layer.id)).toEqual([lower.id, upper]);
	});

	it('hides, locks, duplicates and deletes layers together with their items', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const layer = document.activeLayer!;
		document.setLayerVisible(layer.id, false);
		expect(document.isEditable('a')).toBe(false);
		expect(document.hitTest({ x: 20, y: 20 })).toBeNull();
		document.setLayerVisible(layer.id, true);
		document.setLayerLocked(layer.id, true);
		expect(document.isEditable('a')).toBe(false);
		document.setLayerLocked(layer.id, false);
		expect(document.hitTest({ x: 20, y: 20 })?.id).toBe('a');
		const copy = document.duplicateLayer(layer.id)!;
		expect(document.layer(copy)?.name).toBe('Layer 1 copy');
		const [copiedItem] = document.layerItems(copy);
		expect(copiedItem?.id).not.toBe('a');
		expect(copiedItem?.type).toBe(AnnotationObjectTypeId.Shape);
		document.removeLayer(copy);
		expect(document.state.layers).toHaveLength(1);
		expect(document.activeLayer).toBe(document.state.layers[0]);
		document.remove('a');
		expect(document.state.layers[0]?.itemIds).toEqual([]);
		expect(document.state.objects).toEqual([]);
	});

	it('merges a layer down by moving its items, keeping them editable', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const lower = document.activeLayer!;
		const upper = document.createLayer();
		document.add(shape('b'));
		document.mergeItemsDown(upper);
		expect(document.state.layers.map((layer) => layer.id)).toEqual([lower.id]);
		expect(itemIds(document, lower.id)).toEqual(['a', 'b']);
		expect(document.activeLayer).toBe(document.layer(lower.id));
	});
});

describe('completing saved states', () => {
	it('gives each loose item its own layer, carrying its old layer fields', () => {
		const legacy = {
			...shape('a'),
			name: 'Sky',
			layerOpacity: HALF_OPACITY,
			blendMode: BlendMode.Multiply,
		} as AnnotationObject;
		const state = normalizeAnnotationState({ objects: [legacy, shape('b')], nextStep: 1 });
		expect(state.layers).toEqual([
			expect.objectContaining({ name: 'Sky', itemIds: ['a'], opacity: HALF_OPACITY, blendMode: BlendMode.Multiply }),
			expect.objectContaining({ name: 'Layer 1', itemIds: ['b'] }),
		]);
		expect(state.objects[0]).not.toHaveProperty('name');
		expect(state.objects[0]).not.toHaveProperty('layerOpacity');
	});

	it('drops unknown and repeated item ids and orders items by layer', () => {
		const state = normalizeAnnotationState({
			objects: [shape('a'), shape('b')],
			layers: [
				{ id: 'top', name: 'Top', itemIds: ['a', 'missing'] },
				{ id: 'next', name: 'Next', itemIds: ['a', 'b'] },
			],
			nextStep: 1,
		});
		expect(state.layers.map((layer) => layer.itemIds)).toEqual([['a'], ['b']]);
		expect(state.objects.map((item) => item.id)).toEqual(['a', 'b']);
	});
});

describe('one brush stroke is one editable item', () => {
	it('exposes and changes the colour and width of the whole stroke', () => {
		const item = stroke('s');
		expect(editableObjectProperties(item)).toEqual({ color: '#000000', size: 4, opacity: 1, hardness: 1 });
		setEditableObjectProperty(item, EditableObjectPropertyId.Color, '#ff0000');
		setEditableObjectProperty(item, EditableObjectPropertyId.Size, 10);
		expect(item.color).toBe('#ff0000');
		expect(item.pathStyles?.[0]).toMatchObject({ color: '#ff0000', size: 10 });
		expect(item.sourceRect).toEqual({ x: 5, y: 5, width: 60, height: 40 });
		expect(item.rect).toEqual({ x: 5, y: 5, width: 60, height: 40 });
	});
});
