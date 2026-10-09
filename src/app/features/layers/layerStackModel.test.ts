import { describe, expect, it } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { BlendMode, LayerOpacity } from '../../core/layers/layerTypes';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type ShapeAnnotation,
} from '../annotations/annotationTypes';
import {
	duplicateLayerName,
	hasDefaultCompositing,
	layerAppearance,
	LayerNumbering,
	resolveLayerNames,
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

function ids(document: AnnotationDocument): string[] {
	return document.state.objects.map(({ id }) => id);
}

describe('layer naming', () => {
	it('numbers each layer kind once, in creation order', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.add(shape('b'));
		document.createPaintLayer();
		expect(document.state.objects.map(({ name }) => name)).toEqual([
			'Shape 1',
			'Shape 2',
			'Paint layer 1',
		]);
	});

	it('keeps names when layers are reordered and never reuses a higher number', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.add(shape('b'));
		document.moveToObject('a', 'b');
		expect(document.layerName('a')).toBe('Shape 1');
		document.remove('a');
		document.add(shape('c'));
		expect(document.layerName('c')).toBe('Shape 3');
	});

	it('gives unnamed layers from older data stable names that avoid stored ones', () => {
		const objects: AnnotationObject[] = [
			shape('legacy'),
			shape('named', { name: 'Shape 1' }),
			shape('second-legacy'),
		];
		expect([...resolveLayerNames(objects).values()]).toEqual([
			'Shape 2',
			'Shape 1',
			'Shape 3',
		]);
	});

	it('ignores custom names and other kinds when numbering', () => {
		const numbering = new LayerNumbering(['Sky', 'Shape 4', 'Paint layer 9', 'Shape x']);
		expect(numbering.next(AnnotationObjectTypeId.Shape)).toBe('Shape 5');
		expect(numbering.next(AnnotationObjectTypeId.Shape)).toBe('Shape 6');
		expect(duplicateLayerName('Sky')).toBe('Sky copy');
	});
});

describe('active layer', () => {
	it('creates new layers directly above the active layer', () => {
		const document = new AnnotationDocument();
		document.add(shape('bottom'));
		document.add(shape('top'));
		document.activate('bottom');
		document.add(shape('middle'));
		expect(ids(document)).toEqual(['bottom', 'middle', 'top']);
		document.activate(null);
		document.add(shape('above-image'));
		expect(ids(document)[0]).toBe('above-image');
	});

	it('keeps the active layer when transform handles are cleared', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.clearSelection();
		expect(document.selectedId).toBeNull();
		expect(document.activeLayer?.id).toBe('a');
		document.select(null);
		expect(document.activeLayer).toBeNull();
	});

	it('activates hidden and locked layers without selecting them', () => {
		const document = new AnnotationDocument();
		document.add(shape('hidden', { visible: false }));
		document.add(shape('top'));
		document.activate('hidden');
		expect(document.activeLayer?.id).toBe('hidden');
		expect(document.selectedId).toBeNull();
	});

	it('passes activation to the layer beneath a deleted active layer', () => {
		const document = new AnnotationDocument();
		document.add(shape('bottom'));
		document.add(shape('top'));
		document.remove('top');
		expect(document.activeLayer?.id).toBe('bottom');
		document.remove('bottom');
		expect(document.activeLayer).toBeNull();
	});

	it('keeps the active layer through undo while it still exists', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.add(shape('b'));
		document.activate('a');
		document.setLayerAppearance('a', { name: 'Renamed' });
		document.undo();
		expect(document.activeLayer?.id).toBe('a');
		document.undo();
		document.undo();
		expect(document.activeLayer).toBeNull();
	});

	it('activates the top layer when a document is restored', () => {
		const document = new AnnotationDocument();
		document.restore({ objects: [shape('a'), shape('b')], nextStep: 1 });
		expect(document.activeLayer?.id).toBe('b');
	});
});

describe('layer appearance', () => {
	it('resolves defaults for layers without stored appearance', () => {
		expect(layerAppearance(shape('a'))).toEqual({
			name: 'Shape',
			opacity: LayerOpacity.Opaque,
			blendMode: BlendMode.Normal,
		});
		expect(hasDefaultCompositing(shape('a'))).toBe(true);
		expect(hasDefaultCompositing(shape('a', { layerOpacity: HALF_OPACITY }))).toBe(false);
		expect(hasDefaultCompositing(shape('a', { blendMode: BlendMode.Screen }))).toBe(false);
	});

	it('changes name, opacity and blend mode as one undoable step', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		document.setLayerAppearance('a', {
			name: '  Sky  ',
			opacity: HALF_OPACITY,
			blendMode: BlendMode.Multiply,
		});
		expect(document.object('a')).toMatchObject({
			name: 'Sky',
			layerOpacity: HALF_OPACITY,
			blendMode: BlendMode.Multiply,
		});
		document.undo();
		expect(layerAppearance(document.object('a')!)).toMatchObject({
			name: 'Shape 1',
			opacity: LayerOpacity.Opaque,
			blendMode: BlendMode.Normal,
		});
	});

	it('rejects empty names and out-of-range opacity, and skips no-op changes', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const historyLength = () => (document.snapshotSession().history.length);
		const before = historyLength();
		document.setLayerAppearance('a', { name: '   ' });
		document.setLayerAppearance('a', { opacity: OUT_OF_RANGE_OPACITY });
		document.setLayerAppearance('a', { name: 'Shape 1', blendMode: BlendMode.Normal });
		document.setLayerAppearance('missing', { name: 'Ghost' });
		expect(historyLength()).toBe(before);
	});

	it('previews opacity without a history step until committed', () => {
		const document = new AnnotationDocument();
		document.add(shape('a'));
		const before = document.snapshotSession().history.length;
		document.setLayerAppearance('a', { opacity: HALF_OPACITY }, false);
		expect(document.snapshotSession().history.length).toBe(before);
		document.commitCurrent();
		expect(document.snapshotSession().history.length).toBe(before + 1);
	});
});

describe('layer operations', () => {
	it('duplicates a layer directly above itself as the active layer', () => {
		const document = new AnnotationDocument();
		document.add(shape('a', { blendMode: BlendMode.Screen }));
		document.add(shape('b'));
		const copyId = document.duplicate('a');
		expect(ids(document)).toEqual(['a', copyId, 'b']);
		expect(document.object(copyId)).toMatchObject({
			name: 'Shape 1 copy',
			blendMode: BlendMode.Screen,
		});
		expect(document.activeLayer?.id).toBe(copyId);
		expect(document.duplicate('missing')).toBeNull();
	});

	it('replaces adjacent layers with one layer in the lowest position', () => {
		const document = new AnnotationDocument();
		document.add(shape('bottom'));
		document.add(shape('middle'));
		document.add(shape('top'));
		document.replaceLayers(['middle', 'top'], shape('merged'));
		expect(ids(document)).toEqual(['bottom', 'merged']);
		expect(document.activeLayer?.id).toBe('merged');
		document.replaceLayers(['missing'], shape('ignored'));
		expect(ids(document)).toEqual(['bottom', 'merged']);
		document.undo();
		expect(ids(document)).toEqual(['bottom', 'middle', 'top']);
	});
});
