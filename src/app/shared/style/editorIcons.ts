import {
	ARTWORK_ID_TOKEN,
	ARTWORK_MATERIALS,
	ORIGINAL_ICON_SHAPES,
	originalIconArtwork,
} from './editorArtwork';
import { EditorIconId } from './editorIconIds';

export { EditorIconId } from './editorIconIds';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ICON_VIEW_BOX = '0 0 24 24';
const ICON_STROKE_WIDTH = '0.75';
const ICON_ATTRIBUTE = 'data-editor-icon';
const ICON_CLASS = 'editor-icon';
const SEMANTIC_ICON_CLASSES: Readonly<Partial<Record<EditorIconId, string>>> = {
	[EditorIconId.Eraser]: 'eraser-icon',
	[EditorIconId.Picker]: 'eyedropper-icon',
};
const SVG_ATTRIBUTES = {
	viewBox: ICON_VIEW_BOX,
	'aria-hidden': 'true',
	focusable: 'false',
	fill: 'none',
	stroke: '#1b2634',
	'stroke-width': ICON_STROKE_WIDTH,
	'stroke-linecap': 'round',
	'stroke-linejoin': 'round',
} as const;

/** Markup for existing toolbar and panel views that render their own button contents. */
export function editorIconMarkup(id: EditorIconId): string {
	const attributes = Object.entries(SVG_ATTRIBUTES)
		.map(([name, value]) => `${name}="${value}"`)
		.join(' ');
	return `<svg class="${iconClasses(id).join(' ')}" ${ICON_ATTRIBUTE}="${id}" ${attributes}>${iconArtwork(id)}</svg>`;
}

/** A shared SVG element for views built with DOM methods rather than markup. */
export function createEditorIcon(id: EditorIconId): SVGSVGElement {
	const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
	presentIcon(svg, id);
	return svg;
}

/** Resolves static HTML icon placeholders through the same catalog as dynamic controls. */
export function presentEditorIcons(root: ParentNode = document): void {
	for (const svg of root.querySelectorAll<SVGSVGElement>(
		`svg[${ICON_ATTRIBUTE}]`,
	)) {
		const id = svg.getAttribute(ICON_ATTRIBUTE);
		if (!isEditorIconId(id)) throw new Error(`Unknown editor icon: ${id}`);
		presentIcon(svg, id);
	}
}

function isEditorIconId(value: string | null): value is EditorIconId {
	return value !== null && Object.hasOwn(ORIGINAL_ICON_SHAPES, value);
}

function presentIcon(svg: SVGSVGElement, id: EditorIconId): void {
	svg.classList.add(...iconClasses(id));
	svg.setAttribute(ICON_ATTRIBUTE, id);
	for (const [name, value] of Object.entries(SVG_ATTRIBUTES))
		svg.setAttribute(name, value);
	svg.innerHTML = iconArtwork(id);
}

function iconClasses(id: EditorIconId): string[] {
	const semanticClass = SEMANTIC_ICON_CLASSES[id];
	return semanticClass ? [ICON_CLASS, semanticClass] : [ICON_CLASS];
}

/** Scope paint servers to each SVG, including repeated icons in menus and panels. */
let artworkInstance = 0;

function iconArtwork(id: EditorIconId): string {
	const namespace = `editor-art-${++artworkInstance}`;
	return `${ARTWORK_MATERIALS}${originalIconArtwork(id)}`.replaceAll(
		ARTWORK_ID_TOKEN,
		namespace,
	);
}
