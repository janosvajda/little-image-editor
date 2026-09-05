import type { CropRect, Point } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import type { CanvasViewportController } from '../workspace/canvasViewportController';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MINIMUM_SELECTION_SIZE = 1;

export type RasterSelectionListener = (selection: CropRect | null) => void;

/** Transient pixel selection. It deliberately has no layer or project identity. */
export class RasterSelection {
	readonly #listeners = new Set<RasterSelectionListener>();
	#anchor: Point | null = null;
	#selection: CropRect | null = null;

	constructor(
		readonly documentModel: CanvasDocument,
		viewport?: CanvasViewportController,
	) {
		const overlay = new RasterSelectionOverlay();
		viewport?.addStageLayer(overlay.element);
		this.onChange((selection) =>
			overlay.render(selection, documentModel.width, documentModel.height),
		);
		documentModel.onDocumentChange(() => this.clear());
		documentModel.onBeforeGeometryChange(() => this.clear());
	}

	get value(): CropRect | null {
		return this.#selection ? { ...this.#selection } : null;
	}

	begin(point: Point): void {
		this.#anchor = this.clamp(point);
		this.#selection = {
			x: this.#anchor.x,
			y: this.#anchor.y,
			width: MINIMUM_SELECTION_SIZE,
			height: MINIMUM_SELECTION_SIZE,
		};
		this.emit();
	}

	update(point: Point): void {
		if (!this.#anchor) return;
		this.#selection = normalizedSelection(this.#anchor, this.clamp(point));
		this.emit();
	}

	finish(point: Point): void {
		if (
			this.#anchor &&
			point.x === this.#anchor.x &&
			point.y === this.#anchor.y
		) {
			this.clear();
			return;
		}
		this.update(point);
		this.#anchor = null;
	}

	clear(): void {
		if (!this.#anchor && !this.#selection) return;
		this.#anchor = null;
		this.#selection = null;
		this.emit();
	}

	onChange(listener: RasterSelectionListener): () => void {
		this.#listeners.add(listener);
		listener(this.value);
		return () => this.#listeners.delete(listener);
	}

	private clamp(point: Point): Point {
		return {
			x: Math.max(0, Math.min(this.documentModel.width, point.x)),
			y: Math.max(0, Math.min(this.documentModel.height, point.y)),
		};
	}

	private emit(): void {
		const selection = this.value;
		this.#listeners.forEach((listener) => listener(selection));
	}
}

export function normalizedSelection(from: Point, to: Point): CropRect {
	const x = Math.min(from.x, to.x);
	const y = Math.min(from.y, to.y);
	return {
		x,
		y,
		width: Math.max(MINIMUM_SELECTION_SIZE, Math.abs(to.x - from.x)),
		height: Math.max(MINIMUM_SELECTION_SIZE, Math.abs(to.y - from.y)),
	};
}

class RasterSelectionOverlay {
	readonly element = document.createElementNS(SVG_NAMESPACE, 'svg');

	constructor() {
		this.element.classList.add('raster-selection-overlay');
		this.element.setAttribute('aria-hidden', 'true');
		this.element.setAttribute('preserveAspectRatio', 'none');
	}

	render(selection: CropRect | null, width: number, height: number): void {
		this.element.setAttribute('viewBox', `0 0 ${width} ${height}`);
		this.element.replaceChildren();
		if (!selection) return;
		this.element.append(
			selectionRectangle(selection, 'raster-selection-contrast'),
			selectionRectangle(selection, 'raster-selection-frame'),
		);
	}
}

function selectionRectangle(
	selection: CropRect,
	className: string,
): SVGRectElement {
	const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
	rectangle.setAttribute('x', String(selection.x));
	rectangle.setAttribute('y', String(selection.y));
	rectangle.setAttribute('width', String(selection.width));
	rectangle.setAttribute('height', String(selection.height));
	rectangle.setAttribute('class', className);
	return rectangle;
}
