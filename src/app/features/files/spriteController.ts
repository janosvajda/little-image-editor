import { element } from '../../shared/dom/domHelpers';
import { CanvasDocument } from '../../core/document/imageDocument';
import { IMAGE_FORMATS } from '../../core/document/imageFormats';

export class SpriteController {
	readonly dialog = element<HTMLDialogElement>('#functionsDialog');
	readonly #input = element<HTMLInputElement>('#spriteInput');
	readonly #buildButton = element<HTMLButtonElement>('#buildSpriteButton');
	#frames: ImageBitmap[] = [];

	constructor(readonly documentModel: CanvasDocument) {
		this.#input.accept = IMAGE_FORMATS.map((format) => format.mimeType).join(
			',',
		);
		this.#buildButton.disabled = true;
		element('#functionsButton').addEventListener('click', () =>
			this.dialog.showModal(),
		);
		element('#addSpriteButton').addEventListener('click', () =>
			this.#input.click(),
		);
		this.#input.addEventListener('change', () => {
			if (this.#input.files)
				void this.queue(this.#input.files).finally(() => {
					this.#input.value = '';
				});
		});
		this.#buildButton.addEventListener('click', () => this.build());
	}

	private async queue(files: FileList): Promise<void> {
		const supportedTypes = new Set<string>(
			IMAGE_FORMATS.map((format) => format.mimeType),
		);
		const frames = await Promise.all(
			[...files]
				.filter((file) => supportedTypes.has(file.type))
				.map((file) => createImageBitmap(file)),
		);
		this.#frames.push(...frames);
		element('#spriteCount').textContent = String(this.#frames.length);
		this.#buildButton.disabled = this.#frames.length === 0;
	}

	private build(): void {
		if (!this.#frames.length) return;
		const columns = Math.max(
			1,
			Number(element<HTMLInputElement>('#spriteColumns').value),
		);
		const padding = Math.max(
			0,
			Number(element<HTMLInputElement>('#spritePadding').value),
		);
		const cellWidth = Math.max(...this.#frames.map((frame) => frame.width));
		const cellHeight = Math.max(...this.#frames.map((frame) => frame.height));
		const rows = Math.ceil(this.#frames.length / columns);
		this.documentModel.setSize(
			columns * cellWidth + (columns - 1) * padding,
			rows * cellHeight + (rows - 1) * padding,
		);
		this.documentModel.context.clearRect(
			0,
			0,
			this.documentModel.width,
			this.documentModel.height,
		);
		this.#frames.forEach((frame, index) =>
			this.documentModel.context.drawImage(
				frame,
				(index % columns) * (cellWidth + padding),
				Math.floor(index / columns) * (cellHeight + padding),
			),
		);
		this.documentModel.activate('sprite-sheet');
		this.#frames.forEach((frame) => frame.close());
		this.#frames = [];
		element('#spriteCount').textContent = '0';
		this.#buildButton.disabled = true;
		this.dialog.close();
	}
}
