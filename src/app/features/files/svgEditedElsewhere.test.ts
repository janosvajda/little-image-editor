import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { type AnnotationObject, AnnotationObjectTypeId, type AnnotationState } from '../annotations/annotationTypes';
import { svgDocument } from './svgExport';
import { importSvg } from './svgImport';
import { SvgDataAttribute } from './svgItemFormat';

/**
 * An SVG saved by the editor may be changed by another program before it is
 * opened again. What the drawing still is stays the editor's item; what it no
 * longer is, or what was damaged, is read as the drawing it now is.
 */

const STEP = { id: 'step', type: AnnotationObjectTypeId.Step, at: { x: 50, y: 40 }, value: 4, color: '#e53935', size: 20 } as const;

let model: CanvasDocument;

beforeEach(() => {
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'edited', width: 200, height: 120, transparent: false, background: '#ffffff' });
});

function saved(...objects: AnnotationObject[]): string {
	const state: AnnotationState = { objects, layers: [{ id: 'layer', name: 'Layer', itemIds: objects.map(({ id }) => id) }], nextStep: 1 };
	return svgDocument(model, state);
}

/** The SVG with an item group changed, as another program might change it. */
function edited(markup: string, change: (group: Element) => void): string {
	const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
	change(root.querySelector(`[${SvgDataAttribute.Item}]`)!);
	return new XMLSerializer().serializeToString(root);
}

async function opened(markup: string): Promise<AnnotationObject[]> {
	return (await importSvg(markup, 'edited')).editableObjects.state.objects;
}

describe('an SVG edited elsewhere', () => {
	it('keeps an item moved as one piece, moved where it was put', async () => {
		const [step] = await opened(edited(saved(STEP), (group) => group.setAttribute('transform', 'translate(30 10)')));
		expect(step).toMatchObject({ type: AnnotationObjectTypeId.Step, value: 4, at: { x: 80, y: 50 } });
	});

	it('reads an item stretched out of shape as the drawing it now is', async () => {
		const items = await opened(edited(saved(STEP), (group) => group.setAttribute('transform', 'scale(2 1)')));
		expect(items.map(({ type }) => type)).not.toContain(AnnotationObjectTypeId.Step);
		expect(items.length).toBeGreaterThan(0);
	});

	it('reads an item whose settings were damaged as the drawing it now is', async () => {
		const stroke: AnnotationObject = {
			id: 'stroke',
			type: AnnotationObjectTypeId.Stroke,
			layerId: 'objects',
			tool: PaintToolId.Marker,
			points: [
				{ x: 10, y: 10, pressure: 1 },
				{ x: 60, y: 30, pressure: 1 },
			],
			rect: { x: 10, y: 10, width: 50, height: 20 },
			color: '#336699',
			size: 6,
			opacity: 1,
			hardness: 1,
			seed: 1,
		};
		const items = await opened(edited(saved(stroke), (group) => group.setAttribute(SvgDataAttribute.Points, 'not points')));
		expect(items.map(({ type }) => type)).not.toContain(AnnotationObjectTypeId.Stroke);
	});

	it('keeps erasing and cutting with when they were made and the frame they were made in, and drops damaged ones', async () => {
		const box: AnnotationObject = {
			id: 'box',
			type: AnnotationObjectTypeId.Shape,
			shape: ShapeToolId.Rectangle,
			rect: { x: 20, y: 20, width: 60, height: 40 },
			color: '#000000',
			width: 2,
			opacity: 1,
			fill: true,
			erasures: [{ points: [{ xRatio: 0.2, yRatio: 0.2, pressure: 1 }], sizeRatio: 0.1, opacity: 1, hardness: 1, strokePointLimit: 3 }],
			pixelCutouts: [{ points: [{ xRatio: 0, yRatio: 0 }, { xRatio: 0.5, yRatio: 0.5 }], strokePointLimit: 2, strokeSourceRect: { x: 1, y: 2, width: 3, height: 4 } }],
		};
		const [kept] = await opened(saved(box));
		expect(kept).toMatchObject({ erasures: box.erasures, pixelCutouts: box.pixelCutouts });
		const damaged = await opened(edited(saved(box), (group) => group.setAttribute(SvgDataAttribute.Erasures, 'x 1 1 nope 0.1,0.2,1')));
		expect(damaged.every((item) => !item.erasures)).toBe(true);
	});
});
