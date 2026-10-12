import { DocumentType, type DocumentSessionSnapshot } from '../../core/document/appTypes';
import { DEFAULT_IMAGE_FORMAT } from '../../core/document/imageFormats';
import { PIXELS_PER_INCH } from '../../core/document/measurementUnits';
import { safeSvg, type SvgSize } from '../../core/document/svgImage';
import { type AffineMatrix, invertMatrix, matrixParts, multiplyMatrices, parseTransform, transformPoint } from '../../core/geometry/affineMatrix';
import { genericShape } from '../../core/geometry/genericShape';
import { shapeCenter } from '../../core/geometry/shapeTransformHelpers';
import { BlendMode, CoreLayerId, DEFAULT_LAYER_STATE, isBlendMode, type LayerState } from '../../core/layers/layerTypes';
import { canvasContext } from '../../shared/dom/domHelpers';
import type { AnnotationObject, AnnotationSessionState, AnnotationState, ContentLayer } from '../annotations/annotationTypes';
import { LayerNumbering } from '../layers/layerAppearance';
import type { EditorDocumentState } from './documentState';
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
import { isAnnotationObjectType, readErasable, SVG_ITEM_CODECS, type SvgItemCodec, SvgItemDrawing } from './svgItemCodecs';
import { flagAttribute, numberAttribute, SvgDataAttribute } from './svgItemFormat';
import { readDocumentMetadata } from './svgDocumentMetadata';
import { elementStyle, INITIAL_SVG_STYLE, isDisplayed, isVisible, SvgKeyword, SvgProperty, type SvgStyle, SvgStyleSheet, styleOpacity } from './svgStyle';

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
	| { readonly kind: typeof ElementOutcome.Image; readonly image: SvgImagePlacement; readonly locked?: boolean };

interface PendingLayer {
	readonly name: string | null;
	readonly visible: boolean;
	readonly opacity: number;
	readonly blendMode: BlendMode;
	readonly locked: boolean;
	readonly rotation: number;
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
export async function importSvg(source: string, baseName: string): Promise<EditorDocumentState> {
	const { root, size } = safeSvg(source);
	const sheet = new SvgStyleSheet(root);
	const viewport = viewBoxSize(root, size);
	const context: SvgReadingContext = { root, sheet, viewport };
	const reader = new SvgLayerReader(context, viewBoxMatrix(root, size, viewport));
	const { base, baseElement, layers } = reader.read();
	const pixels = await basePixels(base, size);
	const state = await finishedState(layers, root, size);
	const document = {
		...documentSession(baseName, size, pixels),
		resolution: numberAttribute(root, SvgDataAttribute.Resolution) ?? PIXELS_PER_INCH,
		layerState: imageLayerState(baseElement),
		toolbarStates: { ...readDocumentMetadata(root) },
	};
	return { document, editableObjects: session(state) };
}

/** The document's layers, its image hidden and locked as the photo it was written with is. */
function imageLayerState(photo: Element | null): LayerState {
	const hidden = photo?.getAttribute('visibility') === SvgKeyword.Hidden;
	const locked = photo ? flagAttribute(photo, SvgDataAttribute.Locked) : false;
	return { ...DEFAULT_LAYER_STATE, layers: DEFAULT_LAYER_STATE.layers.map((layer) => (layer.id === CoreLayerId.Image ? { ...layer, visible: !hidden, locked } : layer)) };
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

	read(): { base: SvgImagePlacement | null; baseElement: Element | null; layers: PendingLayer[] } {
		const children = [...this.context.root.children].filter((child) => !NON_RENDERING_ELEMENTS.has(child.localName));
		const [first] = children;
		const base = first ? this.basePicture(first) : null;
		for (const child of base ? children.slice(1) : children) {
			if (child.localName === LAYER_GROUP) this.readLayer(child);
			else this.readLoose(child);
		}
		return { base, baseElement: base ? first! : null, layers: this.#layers };
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
			locked: flagAttribute(group, SvgDataAttribute.Locked),
			rotation: numberAttribute(group, SvgDataAttribute.Rotation) ?? 0,
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
			this.#loose = { name: null, visible: true, opacity: 1, blendMode: BlendMode.Normal, locked: false, rotation: 0, entries: [] };
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
		const editorItem = this.editorItem(element, style, parentMatrix, parentOpacity);
		if (editorItem) {
			entries.push(editorItem);
			return;
		}
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

	/**
	 * One of the editor's own items: its group's drawing read unturned, made
	 * into the item its group names, then turned and placed as the group is.
	 * None when the group is not one, or its drawing is no longer that item,
	 * edited elsewhere, so it is read as the drawing it now is.
	 */
	private editorItem(group: Element, style: SvgStyle, parentMatrix: AffineMatrix, opacity: number): PendingEntry | null {
		const type = group.getAttribute(SvgDataAttribute.Item);
		const groupMatrix = parseTransform(group.getAttribute('transform'));
		if (!isAnnotationObjectType(type) || !groupMatrix) return null;
		const codec = SVG_ITEM_CODECS[type] as SvgItemCodec<AnnotationObject>;
		const locked = flagAttribute(group, SvgDataAttribute.Locked);
		if (codec.drawing === SvgItemDrawing.Picture) return this.editorPicture(group, style, multiplyMatrices(parentMatrix, groupMatrix), opacity, locked);
		// A drawing rendered from what the group says is not read: the group says all of it.
		const drawn: PendingEntry[] = [];
		if (codec.drawing === SvgItemDrawing.Read) for (const child of unmasked(group).children) this.collect(child, style, parentMatrix, opacity, drawn);
		const items = drawn.flatMap((entry) => (entry.kind === ElementOutcome.Items ? [entry.item] : []));
		const erasable = readErasable(group);
		if (items.length !== drawn.length || !erasable) return null;
		const unturned = codec.read(group, items);
		const item = unturned && placedItem(unturned, groupMatrix, parentMatrix);
		if (!item) return null;
		return { kind: ElementOutcome.Items, item: { ...item, ...erasable, ...(isVisible(style) ? {} : { visible: false }), ...(locked ? { locked: true } : {}) } };
	}

	/** An item whose drawing is its pixels: the picture, placed as its group places it, which keeps the item's settings once decoded. */
	private editorPicture(group: Element, style: SvgStyle, matrix: AffineMatrix, opacity: number, locked: boolean): PendingEntry | null {
		const drawn: PendingEntry[] = [];
		for (const child of group.children) this.collect(child, style, matrix, opacity, drawn);
		const [picture] = drawn;
		return drawn.length === 1 && picture?.kind === ElementOutcome.Image ? { ...picture, locked } : null;
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

/** The masks erasing and cutting put around an item's drawing; what they hold is the drawing itself. */
const MASK_ATTRIBUTE = 'mask';

/** An item group's drawing, inside the masks erasing and cutting wrapped it in. */
function unmasked(group: Element): Element {
	const [only] = group.children;
	return group.children.length === 1 && only?.localName === LAYER_GROUP && only.hasAttribute(MASK_ATTRIBUTE) ? unmasked(only) : group;
}

/** Turns smaller than this, and scales this close to none, are rounding. */
const PLACEMENT_TOLERANCE = 1e-6;

/**
 * An unturned item placed as its group places it: turned by the group's turn,
 * and moved where the group carries its centre. None when the group also
 * stretches or skews it, which only its drawing can show.
 */
function placedItem(item: AnnotationObject, groupMatrix: AffineMatrix, parentMatrix: AffineMatrix): AnnotationObject | null {
	const parts = matrixParts(groupMatrix);
	const toLocal = invertMatrix(parentMatrix);
	if (!toLocal || parts.skewed || [parts.scaleX, parts.scaleY].some((scale) => Math.abs(scale - 1) > PLACEMENT_TOLERANCE)) return null;
	const placed = structuredClone(item);
	const centre = shapeCenter(genericShape(placed).geometry);
	const moved = transformPoint(parentMatrix, transformPoint(groupMatrix, transformPoint(toLocal, centre)));
	const delta = { x: moved.x - centre.x, y: moved.y - centre.y };
	// Only a group moved elsewhere moves its item: moving gives some items a frame of their own they had none of.
	if (Math.hypot(delta.x, delta.y) > PLACEMENT_TOLERANCE) genericShape(placed).move(delta);
	return Math.abs(parts.rotation) < PLACEMENT_TOLERANCE ? placed : { ...placed, rotation: parts.rotation };
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
		layers.push(contentLayer(layer, layer.name ?? numbering.next(), layerItems));
	}
	return { objects, layers, nextStep: numberAttribute(root, SvgDataAttribute.NextStep) ?? 1 };
}

/** A read layer as a content layer holding its items, with only the settings that differ from a new layer's. */
function contentLayer(layer: PendingLayer, name: string, items: readonly AnnotationObject[]): ContentLayer {
	return {
		id: crypto.randomUUID(),
		name,
		itemIds: items.map(({ id }) => id),
		...(layer.visible ? {} : { visible: false }),
		...(layer.opacity === 1 ? {} : { opacity: layer.opacity }),
		...(layer.blendMode === BlendMode.Normal ? {} : { blendMode: layer.blendMode }),
		...(layer.locked ? { locked: true } : {}),
		...(layer.rotation ? { rotation: layer.rotation } : {}),
	};
}

function finishedEntry(entry: PendingEntry, root: Element, size: SvgSize, layer?: Element): Promise<AnnotationObject | null> {
	if (entry.kind === ElementOutcome.Items) return Promise.resolve(entry.item);
	if (entry.kind === ElementOutcome.Image) return embeddedPictureItem(entry.image).then((item) => (item && entry.locked ? { ...item, locked: true } : item));
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
