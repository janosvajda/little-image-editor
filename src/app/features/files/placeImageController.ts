import type { CanvasDocument } from '../../core/document/imageDocument';
import { editorPlatform, type PlatformDialogs } from '../../platform/editorPlatform';
import { element } from '../../shared/dom/domHelpers';
import type { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { PICTURE_FILE_ACCEPT } from './openFileTypes';

const PLACE_FAILED_MESSAGE = 'The picture could not be placed. Choose a PNG, JPEG, WebP or SVG image.';
/** Where Place image is offered: the File menu, and the toolbar, which every edition shows. */
const PLACE_IMAGE_BUTTONS = ['#placeImageButton', '#quickPlaceImageButton'] as const;

/**
 * Place image…: puts a picture on the open image as an item on the active
 * layer, selected so it can be moved and resized at once. With no image
 * open, the picture is simply opened.
 */
export class PlaceImageController {
	readonly #input = element<HTMLInputElement>('#placeImageInput');

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly runner: Pick<AssistantCommandRunner, 'placeFile'>,
		private readonly onPlaced: (itemId: string) => void,
		private readonly dialogs: Pick<PlatformDialogs, 'alert'> = editorPlatform().dialogs,
	) {
		this.#input.accept = PICTURE_FILE_ACCEPT;
		for (const button of PLACE_IMAGE_BUTTONS) element(button).addEventListener('click', () => this.#input.click());
		this.#input.addEventListener('change', () => {
			const file = this.#input.files?.[0];
			this.#input.value = '';
			if (file) void this.place(file);
		});
	}

	async place(file: File): Promise<void> {
		try {
			if (!this.documentModel.hasImage) {
				await this.documentModel.load(file);
				return;
			}
			const result = await this.runner.placeFile(file);
			if ('itemId' in result) this.onPlaced(result.itemId);
		} catch {
			this.dialogs.alert(PLACE_FAILED_MESSAGE);
		}
	}
}
