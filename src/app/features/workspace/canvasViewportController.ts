import { element } from '../../shared/dom/domHelpers';
import { rulerTicks } from './rulerHelpers';
import {
	MEASUREMENT_UNITS,
	MEASUREMENT_UNIT_LABELS,
	MeasurementUnitId,
	type MeasurementUnit,
} from '../../core/document/measurementUnits';
import { CanvasDocument } from '../../core/document/imageDocument';
import { PersistentDocumentToolbar } from './genericToolbar';
import { Numeric } from '../../shared/math/numericConstants';

const ViewportConfiguration = {
	Zoom10: 10,
	Zoom25: 25,
	Zoom50: 50,
	Zoom75: 75,
	Zoom100: 100,
	Zoom125: 125,
	Zoom150: 150,
	Zoom200: 200,
	Zoom300: 300,
	Zoom400: 400,
	Zoom800: 800,
	ActualPixelsPercent: 100,
	RulerSize: 32,
	FitPadding: 80,
	RulerTickSpacing: 72,
} as const;

const ZOOM_LEVELS = [
	ViewportConfiguration.Zoom10,
	ViewportConfiguration.Zoom25,
	ViewportConfiguration.Zoom50,
	ViewportConfiguration.Zoom75,
	ViewportConfiguration.Zoom100,
	ViewportConfiguration.Zoom125,
	ViewportConfiguration.Zoom150,
	ViewportConfiguration.Zoom200,
	ViewportConfiguration.Zoom300,
	ViewportConfiguration.Zoom400,
	ViewportConfiguration.Zoom800,
] as const;
const RULER_SIZE = ViewportConfiguration.RulerSize;
export const ZoomDirection = { Out: -1, In: 1 } as const;
export type ZoomDirection = (typeof ZoomDirection)[keyof typeof ZoomDirection];
type StageLayer = HTMLElement | SVGElement;

export class CanvasViewportController {
	readonly #wrap = element<HTMLElement>('#canvasWrap');
	readonly #viewport = document.createElement('div');
	readonly #rulerLayer = document.createElement('div');
	readonly #stage = document.createElement('div');
	readonly #horizontalRuler = document.createElement('div');
	readonly #verticalRuler = document.createElement('div');
	readonly #corner = document.createElement('div');
	readonly #controls = document.createElement('div');
	readonly #zoomSelect = document.createElement('select');
	readonly #unitSelect = document.createElement('select');
	readonly #rulerButton = document.createElement('button');
	readonly #rulerVisible = document.createElement('input');
	readonly #toolbar: PersistentDocumentToolbar;
	readonly #viewListeners = new Set<() => void>();

	constructor(readonly documentModel: CanvasDocument) {
		this.createViewport();
		this.createControls();
		this.#toolbar = new PersistentDocumentToolbar(
			this.#controls,
			documentModel,
			'viewport',
		);
		this.#toolbar.onRestore(() => this.applyView());
		this.bindEvents();
		documentModel.onDocumentChange(() => this.applyView());
		this.applyView();
	}

	get zoom(): number {
		return Number(this.#zoomSelect.value) / Numeric.PercentScale;
	}
	get unit(): MeasurementUnit {
		return MEASUREMENT_UNITS.includes(this.#unitSelect.value as MeasurementUnit)
			? (this.#unitSelect.value as MeasurementUnit)
			: MeasurementUnitId.Pixel;
	}
	get rulersVisible(): boolean {
		return this.#rulerVisible.checked;
	}

	addCanvasLayer(canvas: HTMLCanvasElement): void {
		this.addStageLayer(canvas);
	}

	addStageLayer(layer: StageLayer): void {
		layer.classList.add('canvas-stage-layer');
		this.#stage.insertBefore(layer, this.documentModel.overlay);
		this.applyLayerSize(layer);
	}

	onViewChange(listener: () => void): () => void {
		this.#viewListeners.add(listener);
		return () => this.#viewListeners.delete(listener);
	}

	zoomIn(): void {
		this.stepZoom(ZoomDirection.In);
	}
	zoomOut(): void {
		this.stepZoom(ZoomDirection.Out);
	}
	actualPixels(): void {
		this.setZoomLevel(ViewportConfiguration.ActualPixelsPercent);
	}

	fitToWindow(): void {
		if (!this.documentModel.hasImage) return;
		const rulerSize = this.rulersVisible ? RULER_SIZE : 0;
		const availableWidth = Math.max(
			1,
			this.#wrap.clientWidth - rulerSize - ViewportConfiguration.FitPadding,
		);
		const availableHeight = Math.max(
			1,
			this.#wrap.clientHeight - rulerSize - ViewportConfiguration.FitPadding,
		);
		const maximumPercent =
			Math.min(
				availableWidth / this.documentModel.width,
				availableHeight / this.documentModel.height,
			) * Numeric.PercentScale;
		const level =
			[...ZOOM_LEVELS]
				.reverse()
				.find((candidate) => candidate <= maximumPercent) ?? ZOOM_LEVELS[0];
		this.setZoomLevel(level);
	}

	zoomAt(clientX: number, clientY: number, direction: ZoomDirection): void {
		const before = this.documentModel.overlay.getBoundingClientRect();
		if (before.width <= 0 || before.height <= 0) {
			this.stepZoom(direction);
			return;
		}
		const imagePoint = {
			x: (clientX - before.left) / before.width,
			y: (clientY - before.top) / before.height,
		};
		this.stepZoom(direction);
		const after = this.documentModel.overlay.getBoundingClientRect();
		this.#wrap.scrollLeft += after.left + imagePoint.x * after.width - clientX;
		this.#wrap.scrollTop += after.top + imagePoint.y * after.height - clientY;
	}

	private createViewport(): void {
		this.#viewport.className = 'canvas-viewport';
		this.#rulerLayer.className = 'canvas-ruler-layer';
		this.#stage.className = 'canvas-stage';
		this.#horizontalRuler.className = 'canvas-ruler horizontal-ruler';
		this.#verticalRuler.className = 'canvas-ruler vertical-ruler';
		this.#corner.className = 'ruler-corner';
		this.#stage.append(this.documentModel.canvas, this.documentModel.overlay);
		this.#viewport.append(this.#stage);
		this.#rulerLayer.append(
			this.#corner,
			this.#horizontalRuler,
			this.#verticalRuler,
		);
		this.#wrap.append(this.#viewport);
		this.#wrap.parentElement!.append(this.#rulerLayer);
	}

	private createControls(): void {
		this.#controls.className = 'viewport-controls';
		this.#controls.dataset.toolbarKey = 'viewport';
		this.#controls.setAttribute('role', 'group');
		this.#controls.setAttribute('aria-label', 'Zoom and rulers');
		this.#zoomSelect.id = 'zoomSelect';
		this.#zoomSelect.title = 'Canvas zoom';
		this.#zoomSelect.append(
			...ZOOM_LEVELS.map(
				(level) =>
					new Option(
						`${level}%`,
						String(level),
						level === ViewportConfiguration.ActualPixelsPercent,
						level === ViewportConfiguration.ActualPixelsPercent,
					),
			),
		);
		this.#unitSelect.id = 'rulerUnitSelect';
		this.#unitSelect.title = 'Ruler measurement unit (96 PPI)';
		this.#unitSelect.append(
			...MEASUREMENT_UNITS.map(
				(unit) => new Option(MEASUREMENT_UNIT_LABELS[unit], unit),
			),
		);
		this.#rulerButton.id = 'rulerToggleButton';
		this.#rulerButton.className = 'icon-button active';
		this.#rulerButton.title = 'Show or hide rulers';
		this.#rulerButton.setAttribute('aria-label', 'Show rulers');
		this.#rulerButton.setAttribute('aria-pressed', 'true');
		this.#rulerButton.textContent = '⌑';
		this.#rulerVisible.id = 'rulerVisibleInput';
		this.#rulerVisible.type = 'checkbox';
		this.#rulerVisible.checked = true;
		this.#rulerVisible.hidden = true;
		this.#controls.append(
			this.controlButton('−', 'Zoom out', () =>
				this.stepZoom(ZoomDirection.Out),
			),
			this.#zoomSelect,
			this.controlButton('+', 'Zoom in', () => this.stepZoom(ZoomDirection.In)),
			this.#rulerButton,
			this.#unitSelect,
			this.#rulerVisible,
		);
		element('.toolbar').insertBefore(this.#controls, element('#focusButton'));
	}

	private controlButton(
		label: string,
		title: string,
		action: () => void,
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'icon-button';
		button.textContent = label;
		button.title = title;
		button.addEventListener('click', action);
		return button;
	}

	private bindEvents(): void {
		this.#zoomSelect.addEventListener('change', () => this.applyView());
		this.#unitSelect.addEventListener('change', () => this.renderRulers());
		this.#rulerButton.addEventListener('click', () => {
			const visible = !this.rulersVisible;
			this.#rulerVisible.checked = visible;
			this.#rulerButton.setAttribute('aria-pressed', String(visible));
			this.#rulerButton.classList.toggle('active', visible);
			this.applyView();
			this.#toolbar.persist();
		});
		this.#wrap.addEventListener('scroll', () => this.pinRulersToViewport(), {
			passive: true,
		});
		window.addEventListener('resize', () => this.applyView());
		document.addEventListener('keydown', (event) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			if (event.key === '+' || event.key === '=') {
				event.preventDefault();
				this.zoomIn();
			} else if (event.key === '-') {
				event.preventDefault();
				this.zoomOut();
			} else if (event.key === '0') {
				event.preventDefault();
				this.fitToWindow();
			} else if (event.key === '1') {
				event.preventDefault();
				this.actualPixels();
			}
		});
	}

	private stepZoom(direction: ZoomDirection): void {
		const current = Number(this.#zoomSelect.value);
		const index = ZOOM_LEVELS.findIndex((level) => level === current);
		const next =
			ZOOM_LEVELS[
				Math.max(
					0,
					Math.min(
						ZOOM_LEVELS.length - 1,
						(index < 0
							? ZOOM_LEVELS.indexOf(ViewportConfiguration.ActualPixelsPercent)
							: index) + direction,
					),
				)
			]!;
		this.setZoomLevel(next);
	}

	private setZoomLevel(level: number): void {
		this.#zoomSelect.value = String(level);
		this.applyView();
		this.#toolbar.persist();
	}

	private applyView(): void {
		const zoom = this.zoom;
		const rulerSize = this.rulersVisible ? RULER_SIZE : 0;
		const width = Math.max(1, this.documentModel.width * zoom);
		const height = Math.max(1, this.documentModel.height * zoom);
		this.#viewport.style.width = `${width + rulerSize}px`;
		this.#viewport.style.height = `${height + rulerSize}px`;
		this.#stage.style.left = `${rulerSize}px`;
		this.#stage.style.top = `${rulerSize}px`;
		this.#stage.style.width = `${width}px`;
		this.#stage.style.height = `${height}px`;
		this.#stage.classList.toggle('magnified', zoom > 1);
		this.#stage
			.querySelectorAll<StageLayer>(':scope > *')
			.forEach((layer) => this.applyLayerSize(layer, width, height));
		this.#viewport.classList.toggle('rulers-hidden', !this.rulersVisible);
		this.#rulerLayer.classList.toggle(
			'hidden',
			!this.rulersVisible || !this.documentModel.hasImage,
		);
		this.#rulerButton.setAttribute('aria-pressed', String(this.rulersVisible));
		this.#rulerButton.classList.toggle('active', this.rulersVisible);
		element('#zoomLabel').textContent =
			`${Math.round(zoom * Numeric.PercentScale)}%`;
		this.#viewListeners.forEach((listener) => listener());
		this.pinRulersToViewport();
		this.renderRulers();
	}

	private applyLayerSize(
		layer: StageLayer,
		width = this.documentModel.width * this.zoom,
		height = this.documentModel.height * this.zoom,
	): void {
		layer.style.width = `${width}px`;
		layer.style.height = `${height}px`;
	}

	private pinRulersToViewport(): void {
		const x = Math.max(0, this.#wrap.scrollLeft);
		const y = Math.max(0, this.#wrap.scrollTop);
		this.#horizontalRuler.style.setProperty('--ruler-scroll', `${x}px`);
		this.#verticalRuler.style.setProperty('--ruler-scroll', `${y}px`);
	}

	private renderRulers(): void {
		if (!this.rulersVisible) return;
		const resolution = this.documentModel.resolution;
		this.#unitSelect.title =
			this.unit === MeasurementUnitId.Pixel
				? 'Ruler measurement unit'
				: `Document measurement at ${resolution} PPI (not physical screen size)`;
		this.#horizontalRuler.replaceChildren(
			...rulerTicks(
				this.documentModel.width,
				this.zoom,
				this.unit,
				ViewportConfiguration.RulerTickSpacing,
				resolution,
			).map((tick) => this.tick(tick.pixelPosition, tick.label, false)),
		);
		this.#verticalRuler.replaceChildren(
			...rulerTicks(
				this.documentModel.height,
				this.zoom,
				this.unit,
				ViewportConfiguration.RulerTickSpacing,
				resolution,
			).map((tick) => this.tick(tick.pixelPosition, tick.label, true)),
		);
		this.#corner.textContent = this.unit;
		this.#corner.title =
			this.unit === MeasurementUnitId.Pixel
				? 'Pixels'
				: `${MEASUREMENT_UNIT_LABELS[this.unit]} at ${resolution} PPI`;
	}

	private tick(
		position: number,
		label: string,
		vertical: boolean,
	): HTMLElement {
		const tick = document.createElement('span');
		tick.className = 'ruler-tick';
		tick.textContent = label;
		tick.style[vertical ? 'top' : 'left'] =
			`calc(${position}px - var(--ruler-scroll, 0px))`;
		return tick;
	}
}
