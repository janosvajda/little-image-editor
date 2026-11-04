import { afterEach, describe, expect, it, vi } from 'vitest';
import { FillRule } from '../../../core/geometry/vectorPath';
import { AnnotationObjectTypeId, type PathAnnotation, type TextAnnotation } from '../../annotations/annotationTypes';
import { AnimationReadWarning, readAnimationDocument } from './animationFileReader';

/** jsdom draws no pictures; this one decodes as a browser's does. */
function decodingPictures(): void {
	class DecodingImage {
		src = '';
		width = 4;
		height = 4;
		decode(): Promise<void> {
			return Promise.resolve();
		}
	}
	vi.stubGlobal('Image', DecodingImage);
	vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture');
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

const identity = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, pivot: { x: 0, y: 0 } };

/** A file another program wrote: no editing data, only what its items draw. */
function foreignFile(items: unknown[]): string {
	return JSON.stringify({
		format: 'little-animation',
		version: 1,
		stage: { width: 40, height: 30, background: [0, 0, 1, 1], fps: 8, frames: 2 },
		library: [{ id: 'star', name: 'Star', frames: 1, timeline: { layers: [], labels: [] } }],
		timeline: {
			layers: [{ id: 'art', name: 'Art', visible: false, locked: true, opacity: 0.5, blendMode: 'screen', length: 2, keyframes: [{ frame: 0, items, tween: null }] }],
			labels: [{ name: 'intro', frame: 0, length: 2 }],
		},
		writer: 'another program',
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('animation files written by other programs', () => {
	it('opens paths as editable paths, quadratic curves made cubic and placed by their transform', async () => {
		const path = {
			id: 'wave',
			transform: { ...identity, x: 10, y: 5, scaleX: 2, scaleY: 2 },
			opacity: 0.5,
			visible: true,
			kind: 'path',
			contours: [
				{
					closed: true,
					commands: [
						['M', 0, 0],
						['Q', 5, 5, 10, 0],
						['C', 10, 5, 5, 10, 0, 10],
						['L', 0, 0],
						['Z'],
					],
				},
			],
			fill: { kind: 'linear', stops: [{ offset: 0, color: [1, 0, 0, 1] }, { offset: 1, color: [0, 0, 1, 1] }], from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
			fillRule: 'evenodd',
			stroke: { paint: { kind: 'solid', color: [0, 1, 0, 1] }, width: 1.5, cap: 'round', join: 'round', dash: [2, 1] },
		};
		const { state, warnings } = await readAnimationDocument(foreignFile([path]), 'wave');
		expect(warnings).toEqual([]);
		const layer = state.editableObjects.state.layers[0]!;
		expect(layer).toMatchObject({ id: 'art', name: 'Art', visible: false, locked: true, opacity: 0.5, blendMode: 'screen' });
		const item = state.editableObjects.state.animation!.layers.art!.keyframes[0]!.items[0] as PathAnnotation;
		expect(item).toMatchObject({ id: 'wave', type: AnnotationObjectTypeId.Path, color: '#00ff00', width: 3, opacity: 0.5, fill: true, fillColor: '#ff0000', fillRule: FillRule.EvenOdd });
		const [contour] = item.contours;
		// The closing line returns to the start, which closing the contour already does.
		expect(contour!.nodes).toHaveLength(3);
		expect(contour!.nodes[0]!.point).toEqual({ x: 10, y: 5 });
		expect(contour!.nodes[0]!.out!.x).toBeCloseTo(10 + (2 * 2 * 5) / 3, 6);
		expect(contour!.nodes[1]!.point).toEqual({ x: 30, y: 5 });
		expect(state.document.width).toBe(40);
	});

	it('opens text, pictures and groups as items of their own, and leaves symbols out, saying so', async () => {
		decodingPictures();
		const items = [
			{ id: 'title', transform: { ...identity, x: 4, y: 20, rotation: Math.PI / 2 }, opacity: 1, visible: true, kind: 'text', text: 'Hi', font: { family: 'serif', size: 10, weight: 400, style: 'normal' }, color: [1, 0, 0, 1], align: 'left', baseline: 'alphabetic' },
			{
				id: 'pair',
				transform: identity,
				opacity: 1,
				visible: false,
				kind: 'group',
				items: [
					{ id: 'dot', transform: identity, opacity: 1, visible: true, kind: 'path', contours: [{ closed: false, commands: [['M', 0, 0], ['L', 4, 0]] }], fill: null, fillRule: 'nonzero', stroke: null },
					{ id: 'photo', transform: { ...identity, x: 2 }, opacity: 1, visible: true, kind: 'image', width: 4, height: 4, png: 'AAAA' },
				],
			},
			{ id: 'twinkle', transform: identity, opacity: 1, visible: true, kind: 'instance', symbol: 'star', play: 'loop', firstFrame: 0, tint: null },
		];
		const { state, warnings } = await readAnimationDocument(foreignFile(items), 'mixed');
		expect(warnings).toEqual([AnimationReadWarning.InstancesLeftOut]);
		const read = state.editableObjects.state.animation!.layers.art!.keyframes[0]!.items;
		expect(read.map(({ id }) => id)).toEqual(['title', 'pair:dot', 'pair:photo']);
		const title = read[0] as TextAnnotation;
		expect(title).toMatchObject({ type: AnnotationObjectTypeId.Text, at: { x: 4, y: 20 }, color: '#ff0000', size: 10, rotation: 90 });
		expect(read[1]!.visible).toBe(false);
		expect(read[2]!.type).toBe(AnnotationObjectTypeId.RasterFragment);
	});
});
