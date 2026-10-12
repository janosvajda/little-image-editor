import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { GradientKind } from '../../core/geometry/gradient';
import { PatternKind } from '../../core/geometry/fillPattern';
import { FillRule } from '../../core/geometry/vectorPath';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { ANNOTATION_TOOLBAR_KEY, ReportControlId } from '../annotations/annotationPanel';
import { CAPTURE_METADATA_KEY } from '../capture/browserCaptureImporter';
import { AnnotationDocument } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	type AnnotationObjectType,
	AnnotationObjectTypeId,
	type AnnotationState,
	type ContentLayer,
	connectorEnds,
	LineDash,
} from '../annotations/annotationTypes';
import { layerAppearance } from '../layers/layerAppearance';
import { LineEnd } from '../annotations/lineEnd';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { AssistantCommandKind } from '../assistant/assistantCommandTypes';
import { drawMermaidDiagram } from '../diagrams/diagramDrawing';
import { svgDocument } from './svgExport';
import { type ItemOf } from './svgItemCodecs';
import { importSvg } from './svgImport';

/**
 * SVG is the editor's document format, so a document saved as SVG and opened
 * again must be the same document: every kind of item with every option it
 * can have, every layer with its settings. Only what a session keeps for
 * itself, such as undo history, is not saved. The table of items is keyed by
 * item type, so a new kind of item does not compile until it is listed here.
 */

const Surface = { width: 320, height: 240 } as const;
const PRECISION = 3;

type EveryItem = { readonly [Type in AnnotationObjectType]: readonly ItemOf<Type>[] };

const GRADIENT = {
	kind: GradientKind.Linear,
	stops: [
		{ offset: 0, color: '#ff0000' },
		{ offset: 1, color: '#0000ff' },
	],
	start: { x: 0, y: 0 },
	end: { x: 1, y: 1 },
} as const;
const ERASURE = { points: [{ xRatio: 0.1, yRatio: 0.2, pressure: 0.5 }, { xRatio: 0.6, yRatio: 0.7, pressure: 0.8 }], sizeRatio: 0.1, opacity: 1, hardness: 1 };
const MASK = { points: [{ xRatio: 0, yRatio: 0 }, { xRatio: 0.5, yRatio: 0 }, { xRatio: 0.5, yRatio: 0.5 }] };
const CLIP = { contours: [{ nodes: [{ point: { x: 0, y: 0 } }, { point: { x: 1, y: 0 } }, { point: { x: 0.5, y: 1 } }], closed: true }], fillRule: FillRule.EvenOdd };
const EFFECTS = { blur: 2, shadow: { color: '#000000', opacity: 0.5, offset: { x: 3, y: 4 }, softness: 2 } };

const shape = (id: string, kind: ItemOf<typeof AnnotationObjectTypeId.Shape>['shape'], x: number, extra: Partial<ItemOf<typeof AnnotationObjectTypeId.Shape>> = {}): ItemOf<typeof AnnotationObjectTypeId.Shape> => ({
	id,
	type: AnnotationObjectTypeId.Shape,
	shape: kind,
	rect: { x, y: 10, width: 30, height: 20 },
	color: '#112233',
	width: 2,
	opacity: 1,
	fill: false,
	...extra,
});

const stroke = (id: string, tool: ItemOf<typeof AnnotationObjectTypeId.Stroke>['tool'], y: number, extra: Partial<ItemOf<typeof AnnotationObjectTypeId.Stroke>> = {}): ItemOf<typeof AnnotationObjectTypeId.Stroke> => ({
	id,
	type: AnnotationObjectTypeId.Stroke,
	layerId: 'objects',
	tool,
	points: [
		{ x: 20, y, pressure: 0.4 },
		{ x: 40, y: y + 5, pressure: 0.7 },
		{ x: 60, y, pressure: 1 },
	],
	rect: { x: 20, y, width: 40, height: 5 },
	color: '#336699',
	size: 6,
	opacity: 0.9,
	hardness: 0.7,
	seed: 42,
	...extra,
});

const EVERY_ITEM: EveryItem = {
	[AnnotationObjectTypeId.Shape]: [
		...Object.values(ShapeToolId).map((kind, index) => shape(`shape-${kind}`, kind, 10 + index * 35)),
		shape('filled', ShapeToolId.Ellipse, 10, { rect: { x: 10, y: 40, width: 40, height: 30 }, fill: true, fillColor: '#ffcc00', rotation: 30, flipX: true }),
		shape('gradient', ShapeToolId.Rectangle, 60, { rect: { x: 60, y: 40, width: 40, height: 30 }, fill: true, fillGradient: GRADIENT, lineGradient: GRADIENT }),
		shape('pattern', ShapeToolId.Star, 110, { rect: { x: 110, y: 40, width: 40, height: 30 }, fill: true, fillPattern: { kind: PatternKind.Dots, color: '#00aa00', background: '#ffffff', size: 8 }, width: 0 }),
		shape('looks', ShapeToolId.Rectangle, 160, { rect: { x: 160, y: 40, width: 40, height: 30 }, effects: EFFECTS, clip: CLIP, locked: true }),
		shape('hidden', ShapeToolId.Rectangle, 210, { rect: { x: 210, y: 40, width: 40, height: 30 }, visible: false }),
		shape('erased', ShapeToolId.Rectangle, 260, { rect: { x: 260, y: 40, width: 40, height: 30 }, fill: true, erasures: [ERASURE], pixelCutouts: [MASK], pixelClips: [MASK] }),
	],
	[AnnotationObjectTypeId.Path]: [
		{
			id: 'path',
			type: AnnotationObjectTypeId.Path,
			contours: [{ nodes: [{ point: { x: 10, y: 90 }, out: { x: 30, y: 80 } }, { point: { x: 50, y: 100 }, in: { x: 40, y: 110 } }], closed: false }],
			color: '#aa0000',
			width: 3,
			opacity: 1,
			fill: false,
			dash: LineDash.Dashed,
			head: LineEnd.Arrow,
			tail: LineEnd.Circle,
		},
	],
	[AnnotationObjectTypeId.Connector]: [
		{ id: 'connector', type: AnnotationObjectTypeId.Connector, points: [{ x: 60, y: 90 }, { x: 90, y: 90 }, { x: 90, y: 110 }], color: '#000000', width: 2, opacity: 1, arrow: false, dash: LineDash.Solid, head: LineEnd.OpenArrow, tail: LineEnd.Diamond },
	],
	[AnnotationObjectTypeId.Arrow]: [{ id: 'arrow', type: AnnotationObjectTypeId.Arrow, from: { x: 100, y: 90 }, to: { x: 140, y: 110 }, color: '#ff0000', width: 4, rotation: 15 }],
	[AnnotationObjectTypeId.Text]: [
		{ id: 'text', type: AnnotationObjectTypeId.Text, at: { x: 150, y: 90 }, text: 'Hello <SVG> & "you"', color: '#123456', size: 18 },
		{ id: 'fitted', type: AnnotationObjectTypeId.Text, at: { x: 150, y: 115 }, text: 'Fitted', color: '#654321', size: 14, rect: { x: 150, y: 101, width: 60, height: 18.2 }, rotation: 20 },
	],
	[AnnotationObjectTypeId.Step]: [
		{ id: 'step-3', type: AnnotationObjectTypeId.Step, at: { x: 230, y: 100 }, value: 3, color: '#e53935', size: 24 },
		{ id: 'step-12', type: AnnotationObjectTypeId.Step, at: { x: 270, y: 100 }, value: 12, color: '#ffeb3b', size: 30 },
	],
	[AnnotationObjectTypeId.Box]: [{ id: 'box', type: AnnotationObjectTypeId.Box, rect: { x: 10, y: 130, width: 50, height: 30 }, color: '#00ff00', width: 3, opacity: 1, blur: 0, rotation: 10 }],
	[AnnotationObjectTypeId.Highlight]: [{ id: 'highlight', type: AnnotationObjectTypeId.Highlight, rect: { x: 70, y: 130, width: 50, height: 20 }, color: '#ffff00', width: 0, opacity: 0.4, blur: 0 }],
	[AnnotationObjectTypeId.Redact]: [{ id: 'redact', type: AnnotationObjectTypeId.Redact, rect: { x: 130, y: 130, width: 50, height: 20 }, color: '#000000', width: 0, opacity: 1, blur: 0 }],
	[AnnotationObjectTypeId.Blur]: [{ id: 'blur', type: AnnotationObjectTypeId.Blur, rect: { x: 190, y: 130, width: 50, height: 30 }, color: '#000000', width: 0, opacity: 1, blur: 8 }],
	[AnnotationObjectTypeId.Stroke]: [
		...Object.values(PaintToolId)
			.filter((tool) => tool !== PaintToolId.Eraser)
			.map((tool, index) => stroke(`stroke-${tool}`, tool, 170 + index * 10)),
		stroke('styled', PaintToolId.Brush, 225, {
			points: [
				{ x: 100, y: 225, pressure: 0.5 },
				{ x: 120, y: 230, pressure: 0.5 },
				{ x: 140, y: 225, pressure: 0.5 },
				{ x: 160, y: 230, pressure: 0.5 },
			],
			rect: { x: 100, y: 225, width: 60, height: 5 },
			pathStarts: [2],
			pathStyles: [{ startIndex: 2, tool: PaintToolId.Marker, color: '#ff00ff', size: 4, opacity: 1, hardness: 1, seed: 7 }],
			rotation: 5,
		}),
	],
	[AnnotationObjectTypeId.Fill]: [
		{
			id: 'fill',
			type: AnnotationObjectTypeId.Fill,
			layerId: 'objects',
			rect: { x: 250, y: 170, width: 20, height: 3 },
			runs: [
				{ x: 250, y: 170, length: 20 },
				{ x: 252, y: 171, length: 16 },
				{ x: 255, y: 172, length: 10 },
			],
			color: '#0088ff',
			opacity: 0.8,
			tolerance: 32,
		},
	],
	[AnnotationObjectTypeId.RasterFragment]: [],
};

/** Numbers to the precision SVG is written at, and ids left out: an opened document gives its items and layers new ones. */
function comparable(value: unknown): unknown {
	if (typeof value === 'number') return Number(value.toFixed(PRECISION));
	if (Array.isArray(value)) return value.map(comparable);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key, entry]) => key !== 'id' && key !== 'itemIds' && entry !== undefined)
				.map(([key, entry]) => [key, comparable(entry)]),
		);
	return value;
}

/** What an item means: no turn written or none at all are the same, and a connector's ends however they are named. */
function itemMeaning(item: AnnotationObject | undefined): unknown {
	if (!item) return item;
	const { arrow: _arrow, head: _head, tail: _tail, ...connector } = item.type === AnnotationObjectTypeId.Connector ? item : { arrow: undefined, head: undefined, tail: undefined };
	const ends = item.type === AnnotationObjectTypeId.Connector ? { ...connector, ...connectorEnds(item) } : item;
	return comparable({ ...ends, rotation: item.rotation ?? 0 });
}

/** What a layer means: its settings as the editor resolves them, and how many items it holds. */
function layerMeaning(layer: ContentLayer): unknown {
	return comparable({ name: layer.name, visible: layer.visible !== false, locked: layer.locked === true, rotation: layer.rotation ?? 0, ...layerAppearance(layer), items: layer.itemIds.length });
}

/** Each item and each layer compared on its own, so a failure names every one that differs. */
function expectSameState(opened: Readonly<AnnotationState>, saved: Readonly<AnnotationState>): void {
	saved.objects.forEach((item, index) => expect.soft(itemMeaning(opened.objects[index]), item.id).toEqual(itemMeaning(item)));
	expect.soft(opened.objects).toHaveLength(saved.objects.length);
	expect(opened.layers.map(layerMeaning)).toEqual(saved.layers.map(layerMeaning));
	expect(opened.nextStep).toBe(saved.nextStep);
}

let model: CanvasDocument;
let objects: AnnotationDocument;

beforeEach(() => {
	// jsdom has no PNG encoder; the image's own pixels are a placeholder picture here.
	vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	model.create({ name: 'everything', ...Surface, transparent: false, background: '#ffffff' });
	objects = new AnnotationDocument();
});

afterEach(() => vi.restoreAllMocks());

describe('a document saved as SVG and opened again', () => {
	it('has every kind of item, with every option, on every kind of layer', async () => {
		const markup: ReadonlySet<AnnotationObjectType> = new Set([AnnotationObjectTypeId.Box, AnnotationObjectTypeId.Highlight, AnnotationObjectTypeId.Redact, AnnotationObjectTypeId.Blur]);
		const all = Object.values(EVERY_ITEM).flat() as AnnotationObject[];
		const items = all.filter((item) => !markup.has(item.type));
		const marks = all.filter((item) => markup.has(item.type));
		const state: AnnotationState = {
			objects: structuredClone([...items, ...marks]),
			layers: [
				{ id: 'items', name: 'Items', itemIds: items.map(({ id }) => id) },
				{ id: 'markup', name: 'Markup', itemIds: marks.map(({ id }) => id), visible: false, locked: true, opacity: 0.5, blendMode: BlendMode.Multiply, rotation: 10 },
			],
			nextStep: 13,
		};
		const saved = svgDocument(model, state);
		// Everything is vector drawing; the image's own photo is the only picture in the file.
		expect(saved.match(/<image\b/g)).toHaveLength(1);
		const { editableObjects } = await importSvg(saved, 'everything');
		expectSameState(editableObjects.state as AnnotationState, state);
	});

	it('keeps a Mermaid diagram as the same editable shapes, lines and labels', async () => {
		const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
		const { commands } = drawMermaidDiagram('flowchart TD\n  A[Start] --> B{Choice}\n  B -->|yes| C(Done)\n  B -->|no| D((Again))');
		runner.run({ kind: AssistantCommandKind.Batch, commands: [...commands] });
		const { editableObjects } = await importSvg(svgDocument(model, objects.state), 'diagram');
		expectSameState(editableObjects.state as AnnotationState, objects.state);
	});

	it('keeps the document\'s QA report, the page it was captured from, its resolution, and its photo hidden and locked', async () => {
		const report = { controls: { [ReportControlId.Title]: 'Login <fails>', [ReportControlId.TicketUrl]: 'https://tracker.example/QA-1', [ReportControlId.Steps]: '1. Open\n2. Click', [ReportControlId.Expected]: 'It works', [ReportControlId.Actual]: 'It fails', [ReportControlId.Markdown]: '# Edited by hand' }, extra: { reportEdited: true } };
		const source = { url: 'https://site.example/login', capturedAt: '2026-10-11T10:00:00.000Z', userAgent: 'Browser/1.0', viewport: { width: 1280, height: 720 } };
		model.setToolbarState(ANNOTATION_TOOLBAR_KEY, report);
		model.setToolbarState(CAPTURE_METADATA_KEY, source);
		model.resolution = 144;
		model.layers.setVisible(CoreLayerId.Image, false);
		model.layers.setLocked(CoreLayerId.Image, true);
		const { document } = await importSvg(svgDocument(model, objects.state), 'report');
		expect(document.toolbarStates).toEqual({ [ANNOTATION_TOOLBAR_KEY]: report, [CAPTURE_METADATA_KEY]: source });
		expect(document.resolution).toBe(144);
		expect(document.layerState!.layers.find(({ id }) => id === CoreLayerId.Image)).toMatchObject({ visible: false, locked: true });
	});

	it('keeps the next number a numbered marker gets', async () => {
		objects.add(structuredClone(EVERY_ITEM[AnnotationObjectTypeId.Step][0]!));
		const { editableObjects } = await importSvg(svgDocument(model, { ...objects.state, nextStep: 7 }), 'markers');
		expect(editableObjects.state.nextStep).toBe(7);
	});
});

describe('a document without a QA report', () => {
	it('writes no metadata, as the report text the form writes for itself is not the document\'s own', () => {
		model.setToolbarState(ANNOTATION_TOOLBAR_KEY, { controls: { [ReportControlId.Markdown]: '# Issue report' }, extra: { reportEdited: false } });
		expect(svgDocument(model, objects.state)).not.toContain('<metadata');
	});
});
