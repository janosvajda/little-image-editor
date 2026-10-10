import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { BlendMode, LayerOpacity } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	AnnotationObjectTypeId,
	type ContentLayer,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import { normalizeAnnotationState } from '../annotations/contentLayerStructure';
import {
	duplicateLayerName,
	hasDefaultCompositing,
	layerAppearance,
	LayerNumbering,
} from './layerAppearance';

const HALF_OPACITY = 0.5;
const OUT_OF_RANGE_OPACITY = 1.5;

function shape(id: string, extra: Partial<ShapeAnnotation> = {}): ShapeAnnotation {
	return {
		id,
		type: AnnotationObjectTypeId.Shape,
		shape: ShapeToolId.Rectangle,
		rect: { x: 10, y: 10, width: 20, height: 20 },
		color: '#000000',
		width: 2,
		opacity: 1,
		fill: true,
		...extra,
	};
}

function layer(id: string, extra: Partial<ContentLayer> = {}): ContentLayer {
	return { id, name: id, itemIds: [], ...extra };
}

/** Each item in a layer of its own, bottom first; the layer is named after its item. */
function layered(...itemIds: string[]): AnnotationDocument {
	const document = new AnnotationDocument();
	for (const id of itemIds) {
		document.createLayer();
		document.add(shape(id));
	}
	return document;
}

function layerOf(document: AnnotationDocument, itemId: string): string {
	return document.layerOf(itemId)!.id;
}

/** Layers bottom first, each named by its first item. */
function stack(document: AnnotationDocument): string[] {
	return document.state.layers.map((entry) => entry.itemIds[0] ?? '');
}

describe('layer naming', () => {
	it('numbers each new layer once, in creation order', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.createLayer();
		document.createLayer();
		expect(document.state.layers.map(({ name }) => name)).toEqual([
			'Layer 1',
			'Layer 2',
			'Layer 3',
		]);
	});

	it('keeps names when layers are reordered and never reuses a higher number', () => {
		const document = layered('a', 'b');
		const first = layerOf(document, 'a');
		document.moveLayerTo(first, layerOf(document, 'b'));
		expect(document.layerName(first)).toBe('Layer 1');
		document.removeLayer(layerOf(document, 'b'));
		document.createLayer();
		expect(document.activeLayer?.name).toBe('Layer 3');
	});

	it('gives loose items from older data their own layers with names that avoid stored ones', () => {
		const state = normalizeAnnotationState({
			objects: [shape('legacy'), shape('kept'), shape('second-legacy')],
			layers: [layer('stored', { name: 'Layer 1', itemIds: ['kept'] })],
			nextStep: 1,
		});
		expect(state.layers.map(({ name, itemIds }) => [name, itemIds])).toEqual([
			['Layer 1', ['kept']],
			['Layer 2', ['legacy']],
			['Layer 3', ['second-legacy']],
		]);
	});

	it('ignores custom names when numbering', () => {
		const numbering = new LayerNumbering(['Sky', 'Layer 4', 'Layer x', 'Layer']);
		expect(numbering.next()).toBe('Layer 5');
		expect(numbering.next()).toBe('Layer 6');
		expect(duplicateLayerName('Sky')).toBe('Sky copy');
	});
});

describe('active layer', () => {
	it('creates new layers directly above the active layer', () => {
		const document = layered('bottom', 'top');
		document.activate(layerOf(document, 'bottom'));
		document.createLayer();
		document.add(shape('middle'));
		expect(stack(document)).toEqual(['bottom', 'middle', 'top']);
		document.activate(null);
		document.add(shape('above-image'));
		expect(stack(document)[0]).toBe('above-image');
	});

	it('keeps the active layer when transform handles are cleared', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const active = layerOf(document, 'a');
		document.clearSelection();
		expect(document.selectedId).toBeNull();
		expect(document.activeLayer?.id).toBe(active);
	});

	it('activates hidden and locked layers without selecting them', () => {
		const document = layered('hidden', 'top');
		const hidden = layerOf(document, 'hidden');
		document.setLayerVisible(hidden, false);
		document.clearSelection();
		document.activate(hidden);
		expect(document.activeLayer?.id).toBe(hidden);
		expect(document.selectedId).toBeNull();
		expect(document.selectedLayer).toBeNull();
	});

	it('passes activation to the layer beneath a deleted active layer', () => {
		const document = layered('bottom', 'top');
		const bottom = layerOf(document, 'bottom');
		document.removeLayer(layerOf(document, 'top'));
		expect(document.activeLayer?.id).toBe(bottom);
		document.removeLayer(bottom);
		expect(document.activeLayer).toBeNull();
	});

	it('keeps the active layer through undo while it still exists', () => {
		const document = layered('a', 'b');
		const first = layerOf(document, 'a');
		document.activate(first);
		document.setLayerAppearance(first, { name: 'Renamed' });
		document.undo();
		expect(document.activeLayer?.id).toBe(first);
		document.undo();
		document.undo();
		document.undo();
		document.undo();
		expect(document.activeLayer).toBeNull();
	});

	it('activates the top layer when a document is restored', () => {
		const document = new AnnotationDocument();
		document.restore({
			objects: [shape('a'), shape('b')],
			layers: [layer('lower', { itemIds: ['a'] }), layer('upper', { itemIds: ['b'] })],
			nextStep: 1,
		});
		expect(document.activeLayer?.id).toBe('upper');
	});
});

describe('layer appearance', () => {
	it('resolves defaults for layers without stored appearance', () => {
		expect(layerAppearance(layer('a', { name: 'Layer 1' }))).toEqual({
			name: 'Layer 1',
			opacity: LayerOpacity.Opaque,
			blendMode: BlendMode.Normal,
		});
		expect(hasDefaultCompositing(layer('a'))).toBe(true);
		expect(hasDefaultCompositing(layer('a', { opacity: HALF_OPACITY }))).toBe(false);
		expect(hasDefaultCompositing(layer('a', { blendMode: BlendMode.Screen }))).toBe(false);
	});

	it('changes name, opacity and blend mode as one undoable step', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const id = layerOf(document, 'a');
		document.setLayerAppearance(id, {
			name: '  Sky  ',
			opacity: HALF_OPACITY,
			blendMode: BlendMode.Multiply,
		});
		expect(document.layer(id)).toMatchObject({
			name: 'Sky',
			opacity: HALF_OPACITY,
			blendMode: BlendMode.Multiply,
		});
		document.undo();
		expect(layerAppearance(document.layer(id)!)).toEqual({
			name: 'Layer 1',
			opacity: LayerOpacity.Opaque,
			blendMode: BlendMode.Normal,
		});
	});

	it('rejects empty names and out-of-range opacity, and skips no-op changes', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const id = layerOf(document, 'a');
		const historyLength = () => document.snapshotSession().history.length;
		const before = historyLength();
		document.setLayerAppearance(id, { name: '   ' });
		document.setLayerAppearance(id, { opacity: OUT_OF_RANGE_OPACITY });
		document.setLayerAppearance(id, { name: 'Layer 1', blendMode: BlendMode.Normal });
		document.setLayerAppearance('missing', { name: 'Ghost' });
		expect(historyLength()).toBe(before);
	});

	it('previews opacity without a history step until committed', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const before = document.snapshotSession().history.length;
		document.setLayerAppearance(layerOf(document, 'a'), { opacity: HALF_OPACITY }, false);
		expect(document.snapshotSession().history.length).toBe(before);
		document.commitCurrent();
		expect(document.snapshotSession().history.length).toBe(before + 1);
	});
});

describe('layer operations', () => {
	it('duplicates a layer and its items directly above itself as the active layer', () => {
		const document = layered('a', 'b');
		const source = layerOf(document, 'a');
		document.setLayerAppearance(source, { blendMode: BlendMode.Screen });
		const copyId = document.duplicateLayer(source)!;
		expect(document.state.layers.map(({ id }) => id)).toEqual([
			source,
			copyId,
			layerOf(document, 'b'),
		]);
		expect(document.layer(copyId)).toMatchObject({
			name: 'Layer 1 copy',
			blendMode: BlendMode.Screen,
		});
		expect(document.layerItems(copyId)).toEqual([
			expect.objectContaining({ type: AnnotationObjectTypeId.Shape, rect: shape('a').rect }),
		]);
		expect(document.layerItems(copyId)[0]?.id).not.toBe('a');
		expect(document.activeLayer?.id).toBe(copyId);
		expect(document.duplicateLayer('missing')).toBeNull();
	});

	it('replaces a layer and the one beneath it with one item in the lower layer', () => {
		const document = layered('bottom', 'middle', 'top');
		const middle = layerOf(document, 'middle');
		document.mergeLayersInto(middle, layerOf(document, 'top'), shape('merged'));
		expect(stack(document)).toEqual(['bottom', 'merged']);
		expect(document.layerItems(middle).map(({ id }) => id)).toEqual(['merged']);
		expect(document.activeLayer?.id).toBe(middle);
		document.mergeLayersInto(middle, 'missing', shape('ignored'));
		expect(stack(document)).toEqual(['bottom', 'merged']);
		document.undo();
		expect(stack(document)).toEqual(['bottom', 'middle', 'top']);
	});
});
