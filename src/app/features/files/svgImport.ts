import { DocumentType, type DocumentSessionSnapshot } from '../../core/document/appTypes';
import { DEFAULT_IMAGE_FORMAT } from '../../core/document/imageFormats';
import { PIXELS_PER_INCH } from '../../core/document/measurementUnits';
import { safeSvg, type SvgSize } from '../../core/document/svgImage';
import { type AffineMatrix, multiplyMatrices, parseTransform } from '../../core/geometry/affineMatrix';
import { BlendMode, isBlendMode } from '../../core/layers/layerTypes';
import { canvasContext } from '../../shared/dom/domHelpers';
import type { AnnotationObject, AnnotationSessionState, AnnotationState, ContentLayer } from '../annotations/annotationTypes';
import { LayerNumbering } from '../layers/layerAppearance';
import type { EditorProjectState } from '../projects/projectEditorAdapter';
import {
	ElementOutcome,
	isItemElement,
	placedPictureFrame,
	readElement,
	type SvgImagePlacement,
	type SvgReadingContext,
} from './svgElements';
import { dataUrlBlob, elementPicture, embeddedPictureItem, NON_RENDERING_ELEMENTS } from './svgPictures';
import { pictureFragment } from './placedImage';
import { clipFor } from '../annotations/itemClip';
import { type ItemLook, readLook } from './svgEffects';
import { elementStyle, INITIAL_SVG_STYLE, isDisplayed, isVisible, SvgProperty, type SvgStyle, SvgStyleSheet, styleOpacity } from './svgStyle';

/**
 * Opens an SVG as an editable document: each top-level group is a layer,
 * named by its title, its Inkscape label or its id, with its opacity, blend
 * mode and visibility; what is drawn outside groups shares layers of its own.
 * Elements become the editor's items, and parts no item can be are kept as
 * pictures, drawn exactly as the SVG draws them. A picture filling the whole
 * image first, as Little Image Editor writes the image's own pixels, is the
 * document's image again.
 */

/** An entry of a layer, read in order and finished once pictures are decoded. */
type PendingEntry =
	| { readonly kind: typeof ElementOutcome.Items; readonly item: AnnotationObject }
	| { readonly kind: typeof ElementOutcome.Picture; readonly element: Element }
	| { readonly kind: typeof ElementOutcome.Image; readonly image: SvgImagePlacement };

interface PendingLayer {
	readonly name: string | null;
	readonly visible: boolean;
	readonly opacity: number;
	readonly blendMode: BlendMode;
	/** The group the layer is, whose own opacity and blending the layer applies. */
	readonly group?: Element;
	readonly entries: PendingEntry[];
}

const GROUP_ELEMENTS: ReadonlySet<string> = new Set(['g', 'a']);
const LAYER_GROUP = 'g';
const TITLE_ELEMENT = 'title';
const INKSCAPE_LABEL = 'inkscape:label';
/** The prefix Little Image Editor gives layer group ids. */
const LAYER_ID_PREFIX = 'layer-';
const VIEW_BOX_PARTS = 4;
const RGBA_CHANNELS = 4;
/** A picture this close to the image's edges fills it. */
const EDGE_TOLERANCE = 0.5;
const PreserveAspectRatio = { None: 'none', Slice: 'slice' } as const;
const ALIGN_SHARE: Readonly<Record<string, number>> = { Min: 0, Mid: 0.5, Max: 1 };
const ALIGN = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/;

/** Reads SVG source as the state of an editable document named `baseName`. */
export async function importSvg(source: string, baseName: string): Promise<EditorProjectState> {
	const { root, size } = safeSvg(source);
	const sheet = new SvgStyleSheet(root);
	const viewport = viewBoxSize(root, size);
	const context: SvgReadingContext = { root, sheet, viewport };
	const reader = new SvgLayerReader(context, viewBoxMatrix(root, size, viewport));
	const { base, layers } = reader.read();
	const pixels = await basePixels(base, size);
	const state = await finishedState(layers, root, size);
	return { document: documentSession(baseName, size, pixels), editableObjects: session(state) };
}

/** Walks the SVG into layers of pending entries, in drawing order. */
class SvgLayerReader {
	readonly #layers: PendingLayer[] = [];
	readonly #rootStyle: SvgStyle;
	/** The layer that collects what is drawn outside groups, until a group comes between. */
	#loose: PendingLayer | null = null;

	constructor(
		private readonly context: SvgReadingContext,
		private readonly rootMatrix: AffineMatrix,
	) {
		this.#rootStyle = elementStyle(context.root, INITIAL_SVG_STYLE, context.sheet);
	}

	read(): { base: SvgImagePlacement | null; layers: PendingLayer[] } {
		const children = [...this.context.root.children].filter((child) => !NON_RENDERING_ELEMENTS.has(child.localName));
		const [first] = children;
		const base = first ? this.basePicture(first) : null;
		for (const child of base ? children.slice(1) : children) {
			if (child.localName === LAYER_GROUP) this.readLayer(child);
			else this.readLoose(child);
		}
		return { base, layers: this.#layers };
	}

	/** The image's own picture: an embedded picture filling the whole image, drawn first. */
	private basePicture(element: Element): SvgImagePlacement | null {
		const style = elementStyle(element, this.#rootStyle, this.context.sheet);
		const transform = parseTransform(element.getAttribute('transform'));
		if (!transform) return null;
		const placement = { style, matrix: multiplyMatrices(this.rootMatrix, transform), opacity: styleOpacity(style[SvgProperty.Opacity]), visible: isVisible(style) };
		const result = readElement(element, placement, this.context);
		if (result.kind !== ElementOutcome.Image) return null;
		const { rect, rotation } = placedPictureFrame(result.image, result.image.box);
		const { width, height } = this.context.viewport;
		const fills = [rect.x, rect.y].every((edge) => Math.abs(edge) < EDGE_TOLERANCE) && !rotation;
		const size = transformedSize(this.rootMatrix, width, height);
		return fills && Math.abs(rect.width - size.width) < EDGE_TOLERANCE && Math.abs(rect.height - size.height) < EDGE_TOLERANCE ? result.image : null;
	}

	/** A top-level group as a layer, hidden when the group is. */
	private readLayer(group: Element): void {
		this.#loose = null;
		const style = elementStyle(group, this.#rootStyle, this.context.sheet);
		const transform = parseTransform(group.getAttribute('transform'));
		const blendMode = style[SvgProperty.MixBlendMode].trim();
		const layer: PendingLayer = {
			name: layerName(group),
			visible: isDisplayed(style) && isVisible(style),
			opacity: styleOpacity(style[SvgProperty.Opacity]),
			blendMode: isBlendMode(blendMode) ? blendMode : BlendMode.Normal,
			group,
			entries: [],
		};
		this.#layers.push(layer);
		const matrix = transform ? multiplyMatrices(this.rootMatrix, transform) : null;
		const look = matrix ? readLook(style, matrix, this.context) : null;
		if (!matrix || !look) {
			layer.entries.push({ kind: ElementOutcome.Picture, element: group });
			return;
		}
		// The layer shows or hides its parts, so they are read as shown.
		const childStyle = { ...style, [SvgProperty.Visibility]: this.#rootStyle[SvgProperty.Visibility] };
		const content: PendingEntry[] = [];
		for (const child of group.children) this.collect(child, childStyle, matrix, 1, content);
		layer.entries.push(...(withLook(content, look) ?? [{ kind: ElementOutcome.Picture, element: group }]));
	}

	/** Something drawn outside groups, on the layer for such things. */
	private readLoose(element: Element): void {
		if (!this.#loose) {
			this.#loose = { name: null, visible: true, opacity: 1, blendMode: BlendMode.Normal, entries: [] };
			this.#layers.push(this.#loose);
		}
		this.collect(element, this.#rootStyle, this.rootMatrix, 1, this.#loose.entries);
	}

	/**
	 * An element and what it holds, as entries; its filter and clip go to the
	 * items it becomes. Parts no item can be are pictures.
	 */
	private collect(element: Element, parentStyle: SvgStyle, parentMatrix: AffineMatrix, parentOpacity: number, entries: PendingEntry[]): void {
		if (NON_RENDERING_ELEMENTS.has(element.localName)) return;
		const style = elementStyle(element, parentStyle, this.context.sheet);
		if (!isDisplayed(style)) return;
		const transform = parseTransform(element.getAttribute('transform'));
		const known = GROUP_ELEMENTS.has(element.localName) || isItemElement(element);
		const matrix = transform && known ? multiplyMatrices(parentMatrix, transform) : null;
		const look = matrix ? readLook(style, matrix, this.context) : null;
		if (!matrix || !look) {
			entries.push({ kind: ElementOutcome.Picture, element });
			return;
		}
		const content: PendingEntry[] = [];
		this.collectContent(element, style, matrix, parentOpacity * styleOpacity(style[SvgProperty.Opacity]), content);
		entries.push(...(withLook(content, look) ?? [{ kind: ElementOutcome.Picture, element }]));
	}

	/** What an element holds: a group's parts, or the element as items. */
	private collectContent(element: Element, style: SvgStyle, matrix: AffineMatrix, opacity: number, entries: PendingEntry[]): void {
		if (GROUP_ELEMENTS.has(element.localName)) {
			for (const child of element.children) this.collect(child, style, matrix, opacity, entries);
			return;
		}
		const result = readElement(element, { style, matrix, opacity, visible: isVisible(style) }, this.context);
		if (result.kind === ElementOutcome.Items) entries.push(...result.items.map((item) => ({ kind: ElementOutcome.Items, item }) as const));
		else if (result.kind === ElementOutcome.Picture) entries.push({ kind: ElementOutcome.Picture, element });
		else if (result.kind === ElementOutcome.Image) entries.push({ kind: ElementOutcome.Image, image: result.image });
	}
}

/**
 * Entries with an element's look on their items; none when a part cannot
 * take it, being a picture or having a look of its own already, so the
 * element is kept whole as a picture instead.
 */
function withLook(entries: PendingEntry[], { effects, clip }: ItemLook): PendingEntry[] | null {
	if (!effects && !clip) return entries;
	const takes = (entry: PendingEntry) => entry.kind === ElementOutcome.Items && !(effects && entry.item.effects) && !(clip && entry.item.clip);
	if (!entries.length || !entries.every(takes)) return null;
	return entries.map((entry) => {
		if (entry.kind !== ElementOutcome.Items) return entry;
		const item = { ...entry.item, ...(effects ? { effects } : {}) };
		return { kind: ElementOutcome.Items, item: clip ? { ...item, clip: clipFor(item, clip.contours, clip.fillRule) } : item };
	});
}

/** A layer group's name: its title, its Inkscape label, or its id without the prefix Little Image Editor gives it. */
function layerName(group: Element): string | null {
	const title = [...group.children].find((child) => child.localName === TITLE_ELEMENT)?.textContent?.trim();
	const label = group.getAttribute(INKSCAPE_LABEL)?.trim();
	const id = group.getAttribute('id')?.trim();
	return title || label || (id?.startsWith(LAYER_ID_PREFIX) ? id.slice(LAYER_ID_PREFIX.length) : id) || null;
}

/** The size of the SVG's own coordinates, which its percentages are of. */
function viewBoxSize(root: Element, size: SvgSize): SvgSize {
	const [, , width, height] = viewBox(root) ?? [0, 0, size.width, size.height];
	return { width, height };
}

function viewBox(root: Element): readonly [number, number, number, number] | null {
	const parts = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
	return parts.length === VIEW_BOX_PARTS && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0 ? (parts as unknown as [number, number, number, number]) : null;
}

/** The transform from the SVG's own coordinates onto the image, fitted as its preserveAspectRatio asks. */
function viewBoxMatrix(root: Element, size: SvgSize, viewport: SvgSize): AffineMatrix {
	const [minX, minY] = viewBox(root) ?? [0, 0];
	const [align = 'xMidYMid', scaling] = (root.getAttribute('preserveAspectRatio') ?? '').trim().split(/\s+/);
	const scaleX = size.width / viewport.width;
	const scaleY = size.height / viewport.height;
	if (align === PreserveAspectRatio.None) return [scaleX, 0, 0, scaleY, -minX * scaleX, -minY * scaleY];
	const scale = scaling === PreserveAspectRatio.Slice ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
	const [, alignX = 'Mid', alignY = 'Mid'] = ALIGN.exec(align) ?? [];
	const offsetX = (size.width - viewport.width * scale) * ALIGN_SHARE[alignX]!;
	const offsetY = (size.height - viewport.height * scale) * ALIGN_SHARE[alignY]!;
	return [scale, 0, 0, scale, offsetX - minX * scale, offsetY - minY * scale];
}

function transformedSize([a, b, c, d]: AffineMatrix, width: number, height: number): SvgSize {
	return { width: Math.hypot(a, b) * width, height: Math.hypot(c, d) * height };
}

/** The image's own pixels: its embedded picture drawn where it lies, otherwise transparent. */
async function basePixels(base: SvgImagePlacement | null, size: SvgSize): Promise<Uint8ClampedArray> {
	const empty = new Uint8ClampedArray(size.width * size.height * RGBA_CHANNELS);
	const blob = base ? dataUrlBlob(base.href) : null;
	if (!base || !blob) return empty;
	try {
		const fragment = await pictureFragment(blob);
		const { rect } = placedPictureFrame(base, fragment.bounds);
		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvasContext(canvas);
		const source = document.createElement('canvas');
		source.width = fragment.bounds.width;
		source.height = fragment.bounds.height;
		canvasContext(source).putImageData(new ImageData(new Uint8ClampedArray(fragment.pixels), fragment.bounds.width, fragment.bounds.height), 0, 0);
		context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
		return context.getImageData(0, 0, size.width, size.height).data;
	} catch {
		return empty;
	}
}

/** The layers with their entries finished: pictures drawn and decoded, in order, and empty layers left out. */
async function finishedState(pending: readonly PendingLayer[], root: Element, size: SvgSize): Promise<AnnotationState> {
	const numbering = new LayerNumbering(pending.flatMap(({ name }) => (name ? [name] : [])));
	const objects: AnnotationObject[] = [];
	const layers: ContentLayer[] = [];
	for (const layer of pending) {
		const layerItems: AnnotationObject[] = [];
		for (const entry of layer.entries) {
			const item = await finishedEntry(entry, root, size, layer.group);
			if (item) layerItems.push(item);
		}
		if (!layerItems.length) continue;
		objects.push(...layerItems);
		layers.push({
			id: crypto.randomUUID(),
			name: layer.name ?? numbering.next(),
			itemIds: layerItems.map(({ id }) => id),
			...(layer.visible ? {} : { visible: false }),
			...(layer.opacity === 1 ? {} : { opacity: layer.opacity }),
			...(layer.blendMode === BlendMode.Normal ? {} : { blendMode: layer.blendMode }),
		});
	}
	return { objects, layers, nextStep: 1 };
}

function finishedEntry(entry: PendingEntry, root: Element, size: SvgSize, layer?: Element): Promise<AnnotationObject | null> {
	if (entry.kind === ElementOutcome.Items) return Promise.resolve(entry.item);
	if (entry.kind === ElementOutcome.Image) return embeddedPictureItem(entry.image);
	return elementPicture(root, entry.element, size, layer);
}

function documentSession(baseName: string, size: SvgSize, pixels: Uint8ClampedArray): DocumentSessionSnapshot {
	return {
		...size,
		pixels,
		baseName,
		savedType: DEFAULT_IMAGE_FORMAT.mimeType,
		resolution: PIXELS_PER_INCH,
		history: [],
		historyIndex: 0,
		documentType: DocumentType.Svg,
	};
}

function session(state: AnnotationState): AnnotationSessionState {
	return { state, history: [structuredClone(state)], historyIndex: 0 };
}
