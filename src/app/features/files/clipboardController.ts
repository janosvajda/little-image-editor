import { element } from '../../shared/dom/domHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { ImageMimeType } from '../../core/document/appTypes';
import {
	editorPlatform,
	type PlatformClipboard,
} from '../../platform/editorPlatform';

const STATUS_VISIBILITY_MS = 2_400;

export class ClipboardController {
	readonly #buttons: HTMLButtonElement[];
	readonly #status = element<HTMLElement>('#clipboardStatus');

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly clipboard: PlatformClipboard = editorPlatform().clipboard,
	) {
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

	copy(): Promise<boolean> {
		if (!this.documentModel.hasImage) return Promise.resolve(false);
		return this.write(async () => {
			await this.clipboard.writeImage(
				await this.documentModel.toBlob(ImageMimeType.Png),
			);
		}, 'Image');
	}

	copyText(text: string, description = 'Text'): Promise<boolean> {
		return this.write(() => this.clipboard.writeText(text), description);
	}

	private async write(
		write: () => Promise<void>,
		description: string,
	): Promise<boolean> {
		try {
			await write();
			this.showStatus(`${description} copied to clipboard.`);
			return true;
		} catch {
			this.showStatus(
				`Could not copy the ${description.toLowerCase()}. Check clipboard permission.`,
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
