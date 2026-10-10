import {
	highDensityCaptureDisplaySize,
	scaledCaptureRect,
} from './browserCaptureHelpers';
import type { CanvasDocument } from '../../core/document/imageDocument';
import { ImageMimeType } from '../../core/document/appTypes';
import { BrowserCaptureStore } from './browserCaptureStore';

/** Where a capture's source details are kept in the document state. */
export const CAPTURE_METADATA_KEY = 'captureMetadata';

interface CaptureStore {
	take(id: string): ReturnType<BrowserCaptureStore['take']>;
}

export class BrowserCaptureImporter {
	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly store: CaptureStore = new BrowserCaptureStore(),
	) {}

	async importFromLocation(
		location: Pick<Location, 'search'> = window.location,
	): Promise<boolean> {
		const id = new URLSearchParams(location.search).get('capture');
		if (!id) return false;
		const capture = await this.store.take(id);
		if (!capture) return false;
		const file = new File([capture.blob], capture.name, {
			type: capture.blob.type || ImageMimeType.Png,
		});
		await this.documentModel.load(file);
		if (capture.source) {
			const displaySize = highDensityCaptureDisplaySize(
				capture.source.viewport,
				this.documentModel.width,
				this.documentModel.height,
			);
			if (displaySize)
				this.documentModel.resize(
					displaySize.width,
					displaySize.height,
					'reset',
				);
		}
		if (capture.source)
			this.documentModel.setToolbarState(CAPTURE_METADATA_KEY, capture.source);
		if (capture.crop && capture.viewport) {
			const crop = scaledCaptureRect(
				capture.crop,
				capture.viewport,
				this.documentModel.width,
				this.documentModel.height,
			);
			if (crop) this.documentModel.crop(crop);
		}
		history.replaceState(
			null,
			'',
			location.search
				.replace(/(?:^\?|&)capture=[^&]*/u, '')
				.replace(/^&/u, '?') || window.location.pathname,
		);
		return true;
	}
}
