import type { SvgSize } from '../../core/document/svgImage';
import { svgPicture } from '../../core/document/svgImage';
import { canvasContext } from '../../shared/dom/domHelpers';
import type { RasterFragmentAnnotation } from '../annotations/annotationTypes';
import { createRasterFragmentItem } from '../annotations/paintLayerFactory';
import { placedPictureFrame, type SvgImagePlacement } from './svgElements';
import { coveredBounds } from './svgExport';
import { pictureFragment } from './placedImage';

/**
 * Pictures in an SVG: embedded images become picture items, and parts the
 * editor has no item for, such as filtered, masked or clipped ones, are drawn
 * by the browser exactly as the SVG draws them and kept as picture items.
 */

/** Elements that hold definitions or describe the file, which draw nothing themselves. */
export const NON_RENDERING_ELEMENTS: ReadonlySet<string> = new Set([
	'defs',
	'style',
	'title',
	'desc',
	'metadata',
	'linearGradient',
	'radialGradient',
	'pattern',
	'clipPath',
	'mask',
	'marker',
	'filter',
	'symbol',
]);

const DATA_URL = /^data:([^,;]*)((?:;[^,;]*)*?)(;base64)?,(.*)$/is;
const DEFAULT_DATA_TYPE = 'text/plain';
/** Styles that keep a layer group's own opacity and blending off its parts, which the layer applies itself. */
const LAYER_EFFECTS_RESET = 'opacity: 1; mix-blend-mode: normal';

/** The contents of a `data:` URL; none for any other address, which an SVG opened here never loads. */
export function dataUrlBlob(href: string): Blob | null {
	const match = DATA_URL.exec(href.trim());
	if (!match) return null;
	const [, type, , base64, data = ''] = match;
	const mimeType = type || DEFAULT_DATA_TYPE;
	try {
		if (!base64) return new Blob([decodeURIComponent(data)], { type: mimeType });
		const binary = atob(data.replace(/\s+/g, ''));
		return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: mimeType });
	} catch {
		return null;
	}
}

/** An embedded picture as a picture item, fitted, placed and turned as the SVG places it; none when it cannot be read. */
export async function embeddedPictureItem(placement: SvgImagePlacement): Promise<RasterFragmentAnnotation | null> {
	const blob = dataUrlBlob(placement.href);
	if (!blob) return null;
	try {
		const fragment = await pictureFragment(blob);
		const { rect, rotation } = placedPictureFrame(placement, fragment.bounds);
		return { ...createRasterFragmentItem(fragment, rect), rotation, ...(placement.visible ? {} : { visible: false }) };
	} catch {
		return null;
	}
}

/**
 * One element as the browser draws it, alone, kept as a picture item cropped
 * to what it covers. `layer` is the group that became its layer, whose own
 * opacity and blending the layer applies, so they are left out of the picture.
 */
export async function elementPicture(root: Element, element: Element, size: SvgSize, layer?: Element): Promise<RasterFragmentAnnotation | null> {
	const clone = root.cloneNode(true) as Element;
	// Both found before anything is removed, while the copy still matches the original.
	const target = counterpart(root, clone, element);
	const group = layer ? counterpart(root, clone, layer) : null;
	keepOnlyTarget(clone, target);
	group?.setAttribute('style', `${group.getAttribute('style') ?? ''}; ${LAYER_EFFECTS_RESET}`);
	try {
		const image = await svgPicture(new XMLSerializer().serializeToString(clone), size);
		const canvas = document.createElement('canvas');
		canvas.width = size.width;
		canvas.height = size.height;
		const context = canvasContext(canvas);
		context.drawImage(image, 0, 0, size.width, size.height);
		const pixels = context.getImageData(0, 0, size.width, size.height);
		const bounds = coveredBounds(pixels);
		if (!bounds) return null;
		const crop = context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height).data;
		const fragment = { bounds: { left: bounds.x, top: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height, width: bounds.width, height: bounds.height }, pixels: crop };
		return createRasterFragmentItem(fragment, bounds);
	} catch {
		return null;
	}
}

/** The element in a copy of the document that stands where `element` stands in the original. */
function counterpart(root: Element, clone: Element, element: Element): Element {
	const path: number[] = [];
	for (let current = element; current !== root && current.parentElement; current = current.parentElement)
		path.unshift([...current.parentElement.children].indexOf(current));
	return path.reduce<Element>((parent, index) => parent.children[index]!, clone);
}

/** Leaves in the copy only the target, the groups it is in, and the definitions anything may use. */
function keepOnlyTarget(clone: Element, target: Element): void {
	const ancestors = new Set<Element>();
	for (let current: Element | null = target; current; current = current.parentElement) ancestors.add(current);
	const prune = (parent: Element) => {
		for (const child of [...parent.children]) {
			if (child === target || NON_RENDERING_ELEMENTS.has(child.localName)) continue;
			if (ancestors.has(child)) prune(child);
			else child.remove();
		}
	};
	prune(clone);
}
