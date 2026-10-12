import type { CanvasDocument } from '../../core/document/imageDocument';
import { SVG_MIME_TYPE } from '../../core/document/svgFormat';
import { editorPlatform, type EditorPlatform, type SaveTarget } from '../../platform/editorPlatform';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { DocumentStateAdapter } from './documentState';
import type { SvgDocumentPort } from './fileController';
import { type SvgDocumentOptions, svgDocument } from './svgExport';
import { importSvg } from './svgImport';

const OPEN_FAILED_MESSAGE = 'The SVG could not be opened.';

/**
 * The document as SVG, its own format in every edition: an SVG opens as the
 * editable document it was written from, and the document is written as a
 * standard SVG. Save writes back into the SVG it was opened from.
 */
export class SvgDocumentController implements SvgDocumentPort {
	readonly #persistence: DocumentStateAdapter;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly editableObjects: Pick<AnnotationDocument, 'snapshotSession' | 'restoreSession' | 'state'>,
		private readonly platform: Pick<EditorPlatform, 'dialogs'> = editorPlatform(),
	) {
		this.#persistence = new DocumentStateAdapter(documentModel, editableObjects);
	}

	async open(file: File, target: SaveTarget | null): Promise<void> {
		try {
			this.#persistence.restore(await importSvg(await file.text(), file.name.replace(/\.[^.]+$/, '') || file.name));
			this.documentModel.fileHandle = target;
		} catch {
			this.platform.dialogs.alert(OPEN_FAILED_MESSAGE);
		}
	}

	write(options?: SvgDocumentOptions): Blob {
		return new Blob([svgDocument(this.documentModel, this.editableObjects.state, options)], { type: SVG_MIME_TYPE });
	}
}
