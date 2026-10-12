import type { CanvasDocument } from '../../core/document/imageDocument';
import { degreesToRadians, rotationAbout, transformPoint } from '../../core/geometry/affineMatrix';
import { genericShape } from '../../core/geometry/genericShape';
import { shapeCenter } from '../../core/geometry/shapeTransformHelpers';
import { BlendMode, CoreLayerId } from '../../core/layers/layerTypes';
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
import { documentMetadata } from './svgDocumentMetadata';
import { erasableAttributes, itemCodec } from './svgItemCodecs';
import { flagValue, SvgDataAttribute } from './svgItemFormat';
import { type LineEndMarkerStyle, lineEndMarker, MarkerPosition } from './svgLineEnds';
import { asCanvasContext, escapeXml, SvgRecordingContext, svgElement, svgNumber } from './svgRecordingContext';
import { SvgKeyword } from './svgStyle';

/**
 * The document as a standard SVG, which is also the editor's own document
 * format. Every item is vector drawing, drawn by the editor's own renderer
 * into a recording context: shapes, paths, lines, text, markers, brush
 * strokes, fills, and erasing as SVG masks; a blur is the photo blurred by an
 * SVG filter. Only real pixels, the photo and pixels cut or pasted in, are
 * embedded as PNG images. Each item is a group naming what it is, and each
 * layer a group with its settings, so the SVG opens again as the same
 * editable document, while any SVG viewer shows it as it looks.
 */

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const RGBA_CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const LAYER_ID_PREFIX = 'layer-';
/** The inputs and results SVG filter steps name. */
export const FilterInput = { Source: 'SourceGraphic', Blurred: 'blurred' } as const;
/** Characters an id may not hold; a layer's name is kept readable otherwise. */
const ID_UNSAFE = /[^\p{L}\p{N}_-]+/gu;

/** The id of the image's own picture, which a blur over it refers to rather than holding the picture twice. */
export const IMAGE_ELEMENT_ID = 'image';

/** What every item of a document is written with: the document, the definitions they add, and the images the file already holds. */
interface SvgWriting {
	readonly documentModel: CanvasDocument;
	readonly definitions: string[];
	readonly images: ReadonlyMap<CanvasImageSource, string>;
}

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
	// The image's photo is kept even while hidden, as its layer is: hidden, it is still the document's.
	if (includeImage) body.push(imageElement(documentModel));
	const writing: SvgWriting = { documentModel, definitions, images: includeImage ? new Map([[documentModel.canvas, IMAGE_ELEMENT_ID]]) : new Map() };
	const ids = new LayerIds();
	let cursor = 0;
	state.layers.forEach((layer, layerIndex) => {
		// `objects` follows `layers`, so each layer's items are the next run of objects.
		const items = state.objects.slice(cursor, cursor + layer.itemIds.length);
		cursor += layer.itemIds.length;
		const content = items.map((item, itemIndex) => itemSvg(writing, item, `l${layerIndex}i${itemIndex}-`));
		// A group's title is its name, as SVG names groups, so the layer opens again with it.
		body.push(svgElement('g', layerAttributes(layer, ids), `${svgElement('title', {}, escapeXml(layer.name))}${content.join('')}`));
	});
	const defs = definitions.length ? svgElement('defs', {}, definitions.join('')) : '';
	return `${svgElement(
		'svg',
		// A vector drawing scales without loss: only the size it asks for changes, never its own coordinates.
		{
			xmlns: SVG_NAMESPACE,
			width: width * scale,
			height: height * scale,
			viewBox: `0 0 ${width} ${height}`,
			[SvgDataAttribute.NextStep]: state.nextStep,
			[SvgDataAttribute.Resolution]: documentModel.resolution,
		},
		`${svgElement('title', {}, escapeXml(documentModel.baseName))}${documentMetadata((key) => documentModel.toolbarState(key))}${defs}${body.join('')}`,
	)}\n`;
}

/** The image's own photo, hidden and locked as its layer is. */
function imageElement(documentModel: CanvasDocument): string {
	const layer = documentModel.layers.state.layers.find(({ id }) => id === CoreLayerId.Image);
	return svgElement('image', {
		id: IMAGE_ELEMENT_ID,
		href: documentModel.canvas.toDataURL('image/png'),
		x: 0,
		y: 0,
		width: documentModel.width,
		height: documentModel.height,
		visibility: layer?.visible === false ? SvgKeyword.Hidden : undefined,
		[SvgDataAttribute.Locked]: flagValue(layer?.locked),
	});
}

/**
 * One item: its group, named by its kind and turned as it is, around its
 * drawing, inside its clip and its effects as SVG writes those, which apply
 * to the item as it is turned.
 */
function itemSvg(writing: SvgWriting, item: AnnotationObject, idPrefix: string): string {
	const { documentModel, definitions } = writing;
	const content = itemGroup(writing, { ...item, effects: undefined, clip: undefined }, idPrefix);
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

/**
 * An item's group: the item drawn unturned, as recorded SVG when it is vector
 * drawing and as an embedded picture when it is pixels, turned by the group,
 * which says what kind of item it is and what its drawing cannot show.
 */
function itemGroup(writing: SvgWriting, item: AnnotationObject, idPrefix: string): string {
	const unturned = { ...item, rotation: undefined, visible: undefined, locked: undefined };
	const drawing = vectorItemSvg(writing, unturned, idPrefix);
	const centre = shapeCenter(genericShape(item).geometry);
	return svgElement(
		'g',
		{
			[SvgDataAttribute.Item]: item.type,
			...itemCodec(item).attributes(item),
			...erasableAttributes(item),
			[SvgDataAttribute.Locked]: flagValue(item.locked),
			// Hidden, but still there to read, as SVG's visibility keeps it.
			visibility: item.visible === false ? SvgKeyword.Hidden : undefined,
			transform: item.rotation ? `rotate(${svgNumber(item.rotation)} ${svgNumber(centre.x)} ${svgNumber(centre.y)})` : undefined,
		},
		drawing,
	);
}

/** A vector item as SVG elements, its line ends as markers. */
function vectorItemSvg({ documentModel, definitions, images }: SvgWriting, item: AnnotationObject, idPrefix: string): string {
	const recorder = new SvgRecordingContext(documentModel, idPrefix, images);
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
		display: layer.visible === false ? SvgKeyword.None : undefined,
		[SvgDataAttribute.Locked]: flagValue(layer.locked),
		[SvgDataAttribute.Rotation]: layer.rotation || undefined,
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
