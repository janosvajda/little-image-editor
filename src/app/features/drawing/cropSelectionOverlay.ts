import type { CropRect, Point } from '../../core/document/appTypes';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export class CropSelectionOverlay {
	readonly element = document.createElementNS(SVG_NAMESPACE, 'svg');
	#selection: readonly Point[] | null = null;
	#width = 1;
	#height = 1;

	constructor() {
		this.element.classList.add('crop-selection-overlay');
		this.element.setAttribute('aria-hidden', 'true');
		this.element.setAttribute('preserveAspectRatio', 'none');
	}

	render(selection: CropRect | readonly Point[] | null, width: number, height: number, _zoom = 1): void {
		this.#selection = selection ? selectionPoints(selection) : null;
		this.#width = Math.max(1, width);
		this.#height = Math.max(1, height);
		this.element.setAttribute('viewBox', `0 0 ${this.#width} ${this.#height}`);
		this.element.replaceChildren();
		if (!this.#selection) return;

		const polygon = polygonPath(this.#selection);
		const selectionPath = `${rectPath(0, 0, this.#width, this.#height)} ${polygon}`;
		this.element.append(
			path(selectionPath, 'crop-selection-shade'),
			path(polygon, 'crop-selection-contrast'),
			path(polygon, 'crop-selection-frame'),
		);
	}

	refreshZoom(zoom: number): void {
		this.render(this.#selection, this.#width, this.#height, zoom);
	}
}

function selectionPoints(selection: CropRect | readonly Point[]): readonly Point[] {
	if (Array.isArray(selection)) return selection.map((point) => ({ ...point }));
	const rect = selection as CropRect;
	return [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.width, y: rect.y },
		{ x: rect.x + rect.width, y: rect.y + rect.height },
		{ x: rect.x, y: rect.y + rect.height },
	];
}

function polygonPath(points: readonly Point[]): string {
	const first = points[0];
	if (!first) return '';
	return `M${first.x} ${first.y}${points
		.slice(1)
		.map((point) => `L${point.x} ${point.y}`)
		.join('')}Z`;
}

function path(data: string, className: string): SVGPathElement {
	const result = document.createElementNS(SVG_NAMESPACE, 'path');
	result.setAttribute('d', data);
	result.setAttribute('class', className);
	result.setAttribute('fill-rule', 'evenodd');
	return result;
}

function rectPath(x: number, y: number, width: number, height: number): string {
	return `M${x} ${y}h${width}v${height}h${-width}Z`;
}
