import { element, elements } from '../../shared/dom/domHelpers';
import { applyToneAdjustments } from './imageFilterHelpers';
import type { HistorySnapshot } from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import { ToolbarId, toolbarSelector } from '../workspace/toolbarTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import { transformSelectedPixels } from './selectionAwareImageData';

interface AdjustmentState {
	base: HistorySnapshot;
}
const MIRROR_SCALE = -1;
const QUARTER_TURN_DEGREES = 90;

export class ImageOperations {
	readonly #filters = elements<HTMLInputElement>('[data-filter]');
	readonly #toolbar: PersistentDocumentToolbar<AdjustmentState>;
	#adjustmentBase: ImageData | null = null;
	#committingAdjustment = false;

	constructor(
		readonly documentModel: CanvasDocument,
		readonly rasterSelection?: RasterSelection,
	) {
		this.#toolbar = new PersistentDocumentToolbar(
			element(toolbarSelector(ToolbarId.Adjust)),
			documentModel,
			'adjustments',
		);
		this.#toolbar.onRestore((state) => {
			this.#adjustmentBase = state ? imageData(state.base) : null;
			this.updateLabels();
		});
		this.bindEvents();
	}

	resetControls(): void {
		this.#toolbar.reset();
		this.updateLabels();
	}

	private bindEvents(): void {
		this.#filters.forEach((input) => {
			input.addEventListener('input', () => {
				this.updateLabel(input);
				this.previewAdjustments();
			});
			input.addEventListener('change', () => this.commitAdjustments());
		});
		element('#resetFiltersButton').addEventListener('click', () =>
			this.resetAdjustments(),
		);
		element('#rotateLeftButton').addEventListener('click', () =>
			this.documentModel.transform(-QUARTER_TURN_DEGREES),
		);
		element('#rotateRightButton').addEventListener('click', () =>
			this.documentModel.transform(QUARTER_TURN_DEGREES),
		);
		element('#flipHButton').addEventListener('click', () =>
			this.documentModel.transform(0, MIRROR_SCALE, 1),
		);
		element('#flipVButton').addEventListener('click', () =>
			this.documentModel.transform(0, 1, MIRROR_SCALE),
		);
		element('#resizeButton').addEventListener('click', () =>
			this.documentModel.resize(
				Number(element<HTMLInputElement>('#widthInput').value),
				Number(element<HTMLInputElement>('#heightInput').value),
			),
		);
		this.documentModel.onHistoryChange(() => {
			if (!this.#committingAdjustment && this.#adjustmentBase)
				this.bakeAdjustments();
		});
	}

	private updateLabels(): void {
		this.#filters.forEach((input) => this.updateLabel(input));
	}

	private updateLabel(input: HTMLInputElement): void {
		const label = document.querySelector<HTMLElement>(
			`#${input.dataset.filter}Value`,
		);
		if (label) label.textContent = input.value;
	}

	private previewAdjustments(): void {
		if (!this.documentModel.hasImage) return;
		const { context, width, height } = this.documentModel;
		this.#adjustmentBase ??= context.getImageData(0, 0, width, height);
		const value = (name: string) =>
			Number(
				this.#filters.find((input) => input.dataset.filter === name)?.value ??
					0,
			);
		const result = transformSelectedPixels(
			this.#adjustmentBase,
			this.rasterSelection?.value ?? null,
			(region) =>
				applyToneAdjustments(region, {
					brightness: value('brightness'),
					contrast: value('contrast'),
					saturation: value('saturation'),
				}),
		);
		context.putImageData(result, 0, 0);
		this.#toolbar.setExtra({ base: snapshot(this.#adjustmentBase) });
	}

	private commitAdjustments(): void {
		if (!this.#adjustmentBase) return;
		this.#committingAdjustment = true;
		try {
			this.documentModel.commit();
		} finally {
			this.#committingAdjustment = false;
		}
	}

	private resetAdjustments(): void {
		if (!this.documentModel.hasImage) return;
		if (this.#adjustmentBase)
			this.documentModel.context.putImageData(this.#adjustmentBase, 0, 0);
		this.#adjustmentBase = null;
		this.#toolbar.reset();
		this.#committingAdjustment = true;
		try {
			this.documentModel.commit();
		} finally {
			this.#committingAdjustment = false;
		}
	}

	private bakeAdjustments(): void {
		this.#adjustmentBase = null;
		this.#toolbar.reset();
	}
}

function snapshot(image: ImageData): HistorySnapshot {
	return {
		width: image.width,
		height: image.height,
		pixels: new Uint8ClampedArray(image.data),
	};
}

function imageData(value: HistorySnapshot): ImageData {
	return new ImageData(
		new Uint8ClampedArray(value.pixels),
		value.width,
		value.height,
	);
}
