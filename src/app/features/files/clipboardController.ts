import { element } from '../../shared/dom/domHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { ImageMimeType } from '../../core/document/appTypes';

const STATUS_VISIBILITY_MS = 2_400;

export class ClipboardController {
	readonly #buttons: HTMLButtonElement[];
	readonly #status = element<HTMLElement>('#clipboardStatus');

	constructor(private readonly documentModel: CanvasDocument) {
		this.#buttons = [
			element<HTMLButtonElement>('#copyImageButton'),
			element<HTMLButtonElement>('#quickCopyButton'),
		];
		this.#buttons.forEach((button) =>
			button.addEventListener('click', () => void this.copy()),
		);
		this.documentModel.onDocumentChange(({ hasImage }) =>
			this.#buttons.forEach((button) => {
				button.disabled = !hasImage;
			}),
		);
	}

	async copy(): Promise<boolean> {
		if (!this.documentModel.hasImage) return false;
		try {
			const blob = await this.documentModel.toBlob(ImageMimeType.Png);
			await navigator.clipboard.write([
				new ClipboardItem({ [ImageMimeType.Png]: blob }),
			]);
			this.showStatus('Image copied to clipboard.');
			return true;
		} catch {
			this.showStatus(
				'Could not copy the image. Check clipboard permission.',
				true,
			);
			return false;
		}
	}

	private showStatus(message: string, error = false): void {
		this.#status.textContent = message;
		this.#status.classList.toggle('error', error);
		this.#status.classList.add('visible');
		window.setTimeout(
			() => this.#status.classList.remove('visible'),
			STATUS_VISIBILITY_MS,
		);
	}
}
