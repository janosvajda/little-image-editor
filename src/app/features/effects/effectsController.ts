import { element } from '../../shared/dom/domHelpers';
import {
	applyColorEffect,
	applySharpen,
	EffectId,
	type ColorEffect,
} from './imageFilterHelpers';
import type {
	CropRect,
	HistorySnapshot,
} from '../../core/document/appTypes';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import { ToolbarId, toolbarSelector } from '../workspace/toolbarTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import {
	mergeSelectedPixels,
	transformSelectedPixels,
} from './selectionAwareImageData';

type Effect = ColorEffect | typeof EffectId.Sharpen;
interface EffectState {
	previewBase?: HistorySnapshot;
	lastAppliedBase?: HistorySnapshot;
}
const PERCENT_SCALE = 100;

const EFFECTS: Readonly<
	Record<Effect, { label: string; maximum: number; hint: string }>
> = {
	[EffectId.Monochrome]: {
		label: 'Intensity',
		maximum: 100,
		hint: 'Convert colours to shades of gray.',
	},
	[EffectId.Sepia]: {
		label: 'Intensity',
		maximum: 100,
		hint: 'Blend warm brown tones into the image.',
	},
	[EffectId.Invert]: {
		label: 'Amount',
		maximum: 100,
		hint: 'Reverse colours by the selected amount.',
	},
	[EffectId.Sharpen]: {
		label: 'Strength',
		maximum: 200,
		hint: 'Increase local edge contrast. High values can create halos.',
	},
};

export class EffectsController {
	readonly #root = element<HTMLElement>(toolbarSelector(ToolbarId.Effects));
	readonly #effect = element<HTMLSelectElement>('#effectSelect');
	readonly #amount = element<HTMLInputElement>('#effectAmountInput');
	readonly #amountName = element<HTMLElement>('#effectAmountName');
	readonly #amountValue = element<HTMLElement>('#effectAmountValue');
	readonly #hint = element<HTMLElement>('#effectHint');
	readonly #applyButton = element<HTMLButtonElement>('#applyEffectButton');
	readonly #previewButton = element<HTMLButtonElement>('#cancelEffectButton');
	readonly #clearButton = document.createElement('button');
	readonly #toolbar: PersistentDocumentToolbar<EffectState>;
	#previewBase: ImageData | null = null;
	#lastAppliedBase: ImageData | null = null;
	#changingHistory = false;

	constructor(
		readonly documentModel: CanvasDocument,
		readonly rasterSelection?: RasterSelection,
	) {
		this.initializeUi();
		this.#toolbar = new PersistentDocumentToolbar(
			this.#root,
			documentModel,
			'effects',
		);
		this.#toolbar.onRestore((state) => {
			this.#previewBase = state?.previewBase
				? imageData(state.previewBase)
				: null;
			this.#lastAppliedBase = state?.lastAppliedBase
				? imageData(state.lastAppliedBase)
				: null;
			this.updateControls();
			this.updateActions();
		});
		this.#effect.addEventListener('change', () => {
			this.updateControls();
			this.refreshPreview();
		});
		this.#amount.addEventListener('input', () => {
			this.updateAmountLabel();
			this.refreshPreview();
		});
		this.#previewButton.addEventListener('click', () => this.togglePreview());
		this.#applyButton.addEventListener('click', () => this.apply());
		this.#clearButton.addEventListener('click', () => this.clearLastEffect());
		documentModel.onDocumentChange(({ hasImage }) => {
			this.#previewButton.disabled = this.#applyButton.disabled = !hasImage;
			this.updateActions();
		});
		documentModel.onHistoryChange(() => {
			if (
				this.#changingHistory ||
				(!this.#previewBase && !this.#lastAppliedBase)
			)
				return;
			this.#previewBase = null;
			this.#lastAppliedBase = null;
			this.persistEffectState();
			this.updateActions();
		});
		this.updateControls();
		this.updateActions();
	}

	private initializeUi(): void {
		this.#effect.size = 1;
		this.#effect.classList.remove('effect-list');
		this.#effect.setAttribute('aria-label', 'Effect');
		this.#effect.closest('label')!.classList.remove('effect-list-control');
		this.#previewButton.id = 'previewEffectButton';
		this.#previewButton.className = 'effect-action';
		this.#previewButton.title = 'Preview effect';
		this.#applyButton.className = 'effect-action';
		this.#applyButton.title = 'Apply effect';
		this.#applyButton.setAttribute('aria-label', 'Apply effect');
		this.#applyButton.innerHTML =
			'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"></path></svg><span>Apply</span>';
		this.#clearButton.type = 'button';
		this.#clearButton.id = 'clearEffectButton';
		this.#clearButton.className = 'effect-action';
		this.#clearButton.title = 'Clear last effect';
		this.#clearButton.setAttribute('aria-label', 'Clear last effect');
		this.#clearButton.innerHTML =
			'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 5H1V2M1.5 5A6 6 0 1 1 2 12"></path></svg><span>Clear</span>';
		this.#root.querySelector('.button-grid')!.append(this.#clearButton);
	}

	private updateControls(): void {
		const configuration = EFFECTS[this.#effect.value as Effect];
		this.#amountName.textContent = configuration.label;
		this.#amount.max = String(configuration.maximum);
		if (Number(this.#amount.value) > configuration.maximum)
			this.#amount.value = String(configuration.maximum);
		this.#hint.textContent = configuration.hint;
		this.updateAmountLabel();
	}

	private updateAmountLabel(): void {
		this.#amountValue.textContent = `${this.#amount.value}%`;
	}

	private togglePreview(): void {
		if (this.#previewBase) {
			this.documentModel.context.putImageData(this.#previewBase, 0, 0);
			this.#previewBase = null;
		} else if (this.documentModel.hasImage) {
			this.#previewBase = this.captureCurrent();
			this.renderEffect(this.#previewBase);
		}
		this.persistEffectState();
		this.updateActions();
	}

	private refreshPreview(): void {
		if (this.#previewBase) this.renderEffect(this.#previewBase);
	}

	private apply(): void {
		if (!this.documentModel.hasImage) return;
		const base = this.#previewBase ?? this.captureCurrent();
		if (!this.#previewBase) this.renderEffect(base);
		this.#previewBase = null;
		this.#lastAppliedBase = base;
		this.#changingHistory = true;
		try {
			this.documentModel.commit();
		} finally {
			this.#changingHistory = false;
		}
		this.persistEffectState();
		this.updateActions();
	}

	private clearLastEffect(): void {
		if (!this.#lastAppliedBase || this.#previewBase) return;
		this.documentModel.context.putImageData(this.#lastAppliedBase, 0, 0);
		this.#lastAppliedBase = null;
		this.#changingHistory = true;
		try {
			this.documentModel.commit();
		} finally {
			this.#changingHistory = false;
		}
		this.persistEffectState();
		this.updateActions();
	}

	private renderEffect(base: ImageData): void {
		const amount = Number(this.#amount.value) / PERCENT_SCALE;
		const effect = this.#effect.value as Effect;
		const selection = this.rasterSelection?.value ?? null;
		const result =
			effect === EffectId.Sharpen
				? this.renderSharpen(base, selection, amount)
				: transformSelectedPixels(base, selection, (region) =>
						applyColorEffect(region, effect, amount),
					);
		this.documentModel.context.putImageData(result, 0, 0);
	}

	private renderSharpen(
		base: ImageData,
		selection: CropRect | null,
		amount: number,
	): ImageData {
		const sharpened = new ImageData(
			new Uint8ClampedArray(base.data),
			base.width,
			base.height,
		);
		applySharpen(sharpened, amount);
		return mergeSelectedPixels(base, sharpened, selection);
	}

	private captureCurrent(): ImageData {
		return this.documentModel.context.getImageData(
			0,
			0,
			this.documentModel.width,
			this.documentModel.height,
		);
	}

	private persistEffectState(): void {
		this.#toolbar.setExtra({
			previewBase: this.#previewBase ? snapshot(this.#previewBase) : undefined,
			lastAppliedBase: this.#lastAppliedBase
				? snapshot(this.#lastAppliedBase)
				: undefined,
		});
	}

	private updateActions(): void {
		const previewing = Boolean(this.#previewBase);
		this.#previewButton.setAttribute(
			'aria-label',
			previewing ? 'Cancel preview' : 'Preview',
		);
		this.#previewButton.title = previewing
			? 'Cancel preview'
			: 'Preview effect';
		this.#previewButton.innerHTML = previewing
			? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"></path></svg><span>Cancel</span>'
			: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.3-4 6.5-4 6.5 4 6.5 4-2.3 4-6.5 4-6.5-4-6.5-4Z"></path><circle cx="8" cy="8" r="1.8"></circle></svg><span>Preview</span>';
		this.#clearButton.disabled =
			!this.#lastAppliedBase ||
			Boolean(this.#previewBase) ||
			!this.documentModel.hasImage;
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
