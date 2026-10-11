import type { CanvasDocument } from '../../core/document/imageDocument';
import { degreesToRadians, rotationAbout, transformPoint } from '../../core/geometry/affineMatrix';
import { genericShape } from '../../core/geometry/genericShape';
import { shapeCenter } from '../../core/geometry/shapeTransformHelpers';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
import { canvasContext } from '../../shared/dom/domHelpers';
import { renderAnnotationObject } from '../annotations/annotationRenderer';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
	type AnnotationState,
	type ArrowAnnotation,
	type ConnectorAnnotation,
	type ContentLayer,
	type ItemClip,
	type ItemEffects,
	connectorEnds,
	LineDash,
} from '../annotations/annotationTypes';
import { lineEndInset, pathEnds, trimmedPath } from '../annotations/arrowHead';
import { LineEnd } from '../annotations/lineEnd';
import { clipContours } from '../annotations/itemClip';
import { hasVisibleEffects } from '../annotations/itemEffects';
import { FillRule, pathData } from '../../core/geometry/vectorPath';
import { layerAppearance } from '../layers/layerAppearance';
import { type LineEndMarkerStyle, lineEndMarker, MarkerPosition } from './svgLineEnds';
import { asCanvasContext, escapeXml, SvgRecordingContext, svgElement } from './svgRecordingContext';

/**
 * SVG export: the image as a standard SVG of what is visible, nothing else.
 * Shapes, paths, connectors, arrows, text, markers and gradients become SVG
 * elements, drawn by the editor's own renderer into a recording context;
 * the photo, brush strokes, fills, cut-outs, placed pictures and blurs are
 * pixels, so they are embedded as PNG images. Each visible layer is a group
 * with its opacity and blend mode. Elements are the ones SVG has for each
 * thing: a rectangle is a `rect`, a line with ends a `path` or `polyline`
 * with markers, so an SVG opened again gives back the same editable items.
 */

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const RGBA_CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const LAYER_ID_PREFIX = 'layer-';
/** The inputs and results SVG filter steps name. */
export const FilterInput = { Source: 'SourceGraphic', Blurred: 'blurred' } as const;
/** Characters an id may not hold; a layer's name is kept readable otherwise. */
const ID_UNSAFE = /[^\p{L}\p{N}_-]+/gu;

/** Items made of lines, fills and text, which SVG draws as they are. */
const VECTOR_ITEMS: ReadonlySet<AnnotationObject['type']> = new Set([
	AnnotationObjectTypeId.Shape,
	AnnotationObjectTypeId.Arrow,
	AnnotationObjectTypeId.Connector,
	AnnotationObjectTypeId.Path,
	AnnotationObjectTypeId.Text,
	AnnotationObjectTypeId.Step,
	AnnotationObjectTypeId.Highlight,
	AnnotationObjectTypeId.Box,
	AnnotationObjectTypeId.Redact,
]);

/** How an SVG is written: the size it asks to be shown at, as a share of the image's, and whether the image's own pixels are in it. */
export interface SvgDocumentOptions {
	readonly scale?: number;
	readonly includeImage?: boolean;
}

/** The whole visible image as an SVG document. */
export function svgDocument(documentModel: CanvasDocument, state: Readonly<AnnotationState>, { scale = 1, includeImage = true }: SvgDocumentOptions = {}): string {
	const { width, height } = documentModel;
	const definitions: string[] = [];
	const body: string[] = [];
	if (includeImage && documentModel.layers.isVisible(CoreLayerId.Image))
		body.push(svgElement('image', { href: documentModel.canvas.toDataURL('image/png'), x: 0, y: 0, width, height }));
	if (documentModel.layers.isVisible(CoreLayerId.Objects)) {
		const ids = new LayerIds();
		let cursor = 0;
		state.layers.forEach((layer, layerIndex) => {
			// `objects` follows `layers`, so each layer's items are the next run of objects.
			const items = state.objects.slice(cursor, cursor + layer.itemIds.length);
			cursor += layer.itemIds.length;
			if (layer.visible === false) return;
			const content = items
				.filter((item) => item.visible !== false)
				.map((item, itemIndex) => itemSvg(documentModel, item, `l${layerIndex}i${itemIndex}-`, definitions));
			// A group's title is its name, as SVG names groups, so the layer opens again with it.
			if (content.length) body.push(svgElement('g', layerAttributes(layer, ids), `${svgElement('title', {}, escapeXml(layer.name))}${content.join('')}`));
		});
	}
	const defs = definitions.length ? svgElement('defs', {}, definitions.join('')) : '';
	return `${svgElement(
		'svg',
		// A vector drawing scales without loss: only the size it asks for changes, never its own coordinates.
		{ xmlns: SVG_NAMESPACE, width: width * scale, height: height * scale, viewBox: `0 0 ${width} ${height}` },
		`${svgElement('title', {}, escapeXml(documentModel.baseName))}${defs}${body.join('')}`,
	)}\n`;
}

/**
 * One item: recorded as SVG when it is vector drawing, embedded as a picture
 * when it is pixels, inside its clip and its effects as SVG writes those.
 */
function itemSvg(documentModel: CanvasDocument, item: AnnotationObject, idPrefix: string, definitions: string[]): string {
	const plain = { ...item, effects: undefined, clip: undefined };
	const content = drawsAsVectors(plain) ? vectorItemSvg(documentModel, plain, idPrefix, definitions) : pixelItem(documentModel, plain);
	if (!content) return '';
	const clipped = item.clip ? clippedSvg(item, item.clip, content, idPrefix, definitions) : content;
	return hasVisibleEffects(item.effects) ? effectsSvg(documentModel, item.effects, clipped, idPrefix, definitions) : clipped;
}

/** Content shown only inside an item's clip, as an SVG clipPath on the image. */
function clippedSvg(item: AnnotationObject, clip: ItemClip, content: string, idPrefix: string, definitions: string[]): string {
	const id = `${idPrefix}clip`;
	const outline = svgElement('path', { d: pathData(clipContours(item, clip)), 'clip-rule': clip.fillRule === FillRule.EvenOdd ? FillRule.EvenOdd : undefined });
	definitions.push(svgElement('clipPath', { id, clipPathUnits: 'userSpaceOnUse' }, outline));
	return svgElement('g', { 'clip-path': `url(#${id})` }, content);
}

/** Content through an item's effects, as an SVG filter: a Gaussian blur, then a drop shadow of what it blurred. */
function effectsSvg(documentModel: CanvasDocument, { blur = 0, shadow }: ItemEffects, content: string, idPrefix: string, definitions: string[]): string {
	const id = `${idPrefix}effects`;
	const blurred = blur > 0 ? svgElement('feGaussianBlur', { in: FilterInput.Source, stdDeviation: blur, result: FilterInput.Blurred }) : '';
	const shadowed = shadow
		? svgElement('feDropShadow', {
				in: blurred ? FilterInput.Blurred : FilterInput.Source,
				dx: shadow.offset.x,
				dy: shadow.offset.y,
				stdDeviation: shadow.softness,
				'flood-color': shadow.color,
				'flood-opacity': shadow.opacity,
			})
		: '';
	// The filter covers the whole image, so a shadow falling anywhere on it shows.
	const region = { filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: documentModel.width, height: documentModel.height };
	definitions.push(svgElement('filter', { id, ...region }, `${blurred}${shadowed}`));
	return svgElement('g', { filter: `url(#${id})` }, content);
}

/** A vector item as SVG elements, its line ends as markers. */
function vectorItemSvg(documentModel: CanvasDocument, item: AnnotationObject, idPrefix: string, definitions: string[]): string {
	const recorder = new SvgRecordingContext(documentModel, idPrefix);
	const { drawn, ends } = withMarkerEnds(item);
	const markers = Object.fromEntries(
		ends.map(([position, style]) => {
			const id = `${idPrefix}${position}`;
			definitions.push(lineEndMarker(id, style));
			return [position, `url(#${id})`];
		}),
	);
	recorder.markLineEnds(markers);
	recorder.polylines = drawn.type === AnnotationObjectTypeId.Connector;
	renderAnnotationObject(asCanvasContext(recorder), documentModel.canvas, drawn);
	definitions.push(...recorder.definitions);
	return recorder.shapes.join('');
}

/** An item to draw without its line ends, and those ends as markers for its line. */
interface MarkedItem {
	readonly drawn: AnnotationObject;
	readonly ends: readonly (readonly [MarkerPosition, LineEndMarkerStyle])[];
}

/**
 * Lines with ends are written with SVG markers: the line is drawn without
 * them, a connector's pulled back from its hollow ends as on the canvas, and
 * each end becomes a marker. An arrow is a connector with an arrowhead.
 */
function withMarkerEnds(item: AnnotationObject): MarkedItem {
	if (item.type === AnnotationObjectTypeId.Arrow) return withMarkerEnds(arrowConnector(item));
	if (item.type === AnnotationObjectTypeId.Connector) {
		const { head, tail } = connectorEnds(item);
		const insets = { head: lineEndInset(item.width, head), tail: lineEndInset(item.width, tail) };
		return {
			drawn: { ...item, points: trimmedPath(item.points, insets.tail, insets.head), arrow: false, head: LineEnd.None, tail: LineEnd.None },
			ends: markerEnds(item, { head, tail }, insets),
		};
	}
	if (item.type === AnnotationObjectTypeId.Path && pathEnds(item.contours)) {
		const ends = { head: item.head ?? LineEnd.None, tail: item.tail ?? LineEnd.None };
		return { drawn: { ...item, head: LineEnd.None, tail: LineEnd.None }, ends: markerEnds(item, ends, { head: 0, tail: 0 }) };
	}
	return { drawn: item, ends: [] };
}

function markerEnds(
	item: Pick<ConnectorAnnotation, 'width' | 'color' | 'opacity'>,
	ends: Readonly<Record<'head' | 'tail', LineEnd>>,
	insets: Readonly<Record<'head' | 'tail', number>>,
): MarkedItem['ends'] {
	const style = (end: LineEnd, inset: number): LineEndMarkerStyle => ({ end, width: item.width, color: item.color, opacity: item.opacity, inset });
	return [
		...(ends.tail === LineEnd.None ? [] : [[MarkerPosition.Start, style(ends.tail, insets.tail)] as const]),
		...(ends.head === LineEnd.None ? [] : [[MarkerPosition.End, style(ends.head, insets.head)] as const]),
	];
}

/** An arrow as the connector it draws the same as: a straight line with an arrowhead, turned as the arrow is. */
function arrowConnector(arrow: ArrowAnnotation): ConnectorAnnotation {
	const turn = rotationAbout(degreesToRadians(arrow.rotation ?? 0), shapeCenter(genericShape(arrow).geometry));
	return {
		id: arrow.id,
		type: AnnotationObjectTypeId.Connector,
		points: [transformPoint(turn, arrow.from), transformPoint(turn, arrow.to)],
		color: arrow.color,
		width: arrow.width,
		opacity: 1,
		arrow: true,
		dash: LineDash.Solid,
	};
}

/** Vector items stay vectors unless parts were erased or cut away, which only pixels show. */
export function drawsAsVectors(item: AnnotationObject): boolean {
	return VECTOR_ITEMS.has(item.type) && !item.erasures?.length && !item.pixelCutouts?.length && !item.pixelClips?.length;
}

/** An item drawn as pixels and embedded as a PNG, cropped to what it covers. */
function pixelItem(documentModel: CanvasDocument, item: AnnotationObject): string {
	const canvas = document.createElement('canvas');
	canvas.width = documentModel.width;
	canvas.height = documentModel.height;
	const context = canvasContext(canvas);
	renderAnnotationObject(context, documentModel.canvas, item);
	const bounds = coveredBounds(context.getImageData(0, 0, canvas.width, canvas.height));
	if (!bounds) return '';
	const crop = document.createElement('canvas');
	crop.width = bounds.width;
	crop.height = bounds.height;
	canvasContext(crop).drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
	return svgElement('image', { href: crop.toDataURL('image/png'), ...bounds });
}

/** The smallest box around every pixel that is not fully transparent; none when nothing shows. */
export function coveredBounds({ data, width, height }: Pick<ImageData, 'data' | 'width' | 'height'>): { x: number; y: number; width: number; height: number } | null {
	let left = width;
	let top = height;
	let right = -1;
	let bottom = -1;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			if (!data[(y * width + x) * RGBA_CHANNELS + ALPHA_CHANNEL]) continue;
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
		}
	return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** A layer's group: an id from its name, its opacity, and its blend mode when it has one. */
function layerAttributes(layer: ContentLayer, ids: LayerIds): Record<string, string | number | undefined> {
	const { opacity, blendMode } = layerAppearance(layer);
	return {
		id: ids.next(layer.name),
		opacity: opacity === 1 ? undefined : opacity,
		style: blendMode === BlendMode.Normal ? undefined : `mix-blend-mode: ${blendMode}`,
	};
}

/** Ids for layer groups from their names, numbered when two layers share a name. */
class LayerIds {
	readonly #used = new Set<string>();

	next(name: string): string {
		const base = `${LAYER_ID_PREFIX}${name.trim().replace(ID_UNSAFE, '-').replace(/^-+|-+$/g, '') || this.#used.size + 1}`;
		let id = base;
		for (let number = 2; this.#used.has(id); number++) id = `${base}-${number}`;
		this.#used.add(id);
		return id;
	}
}
