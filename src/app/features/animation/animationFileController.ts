import type { CanvasDocument } from '../../core/document/imageDocument';
import { editorPlatform, type EditorPlatform, type SaveTarget } from '../../platform/editorPlatform';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import { DocumentStateAdapter } from '../files/documentState';
import type { AnimationDocumentPort, AnimationDocumentWrite } from '../files/fileController';
import { ANIMATION_MIME_TYPE, animationBaseName } from './format/animationFileFormat';
import { AnimationFileError, AnimationReadWarning, readAnimationDocument } from './format/animationFileReader';
import { AnimationWriteWarning, serializeAnimationFile, writeAnimationFile } from './format/animationFileWriter';

const OPEN_FAILED_MESSAGE = 'The animation could not be opened.';
/** What opening could not keep, said once the animation is open. */
const READ_WARNING_MESSAGES: Readonly<Record<AnimationReadWarning, string>> = {
	[AnimationReadWarning.InstancesLeftOut]: 'This animation places symbols, which this version of the editor cannot edit yet. They were left out.',
};
/** What saving will not keep, asked about before the file is written. */
export const WRITE_WARNING_MESSAGES: Readonly<Record<AnimationWriteWarning, string>> = {
	[AnimationWriteWarning.StagePixels]:
		'Something was painted on the stage itself, such as by an image effect. Animation files keep layers, not the stage’s pixels, so it will not be saved. Continue?',
};

/**
 * The document as an animation file, in every edition: an animation file
 * opens as the animation it was saved from, and an animation is written as
 * one, as `docs/animation-format.md` describes.
 */
export class AnimationFileController implements AnimationDocumentPort {
	readonly #persistence: DocumentStateAdapter;

	constructor(
		private readonly documentModel: CanvasDocument,
		private readonly editableObjects: Pick<AnnotationDocument, 'restoreSession' | 'state'>,
		private readonly platform: Pick<EditorPlatform, 'dialogs'> = editorPlatform(),
	) {
		this.#persistence = new DocumentStateAdapter(documentModel, editableObjects);
	}

	async open(file: File, target: SaveTarget | null): Promise<void> {
		try {
			const { state, warnings } = await readAnimationDocument(await file.text(), animationBaseName(file.name));
			this.#persistence.restore(state);
			this.documentModel.fileHandle = target;
			for (const warning of warnings) this.platform.dialogs.alert(READ_WARNING_MESSAGES[warning]);
		} catch (error) {
			this.platform.dialogs.alert(error instanceof AnimationFileError ? `${OPEN_FAILED_MESSAGE}\n${error.message}` : OPEN_FAILED_MESSAGE);
		}
	}

	async write(): Promise<AnimationDocumentWrite> {
		const { file, warnings } = await writeAnimationFile(this.documentModel, this.editableObjects.state);
		return { blob: new Blob([serializeAnimationFile(file)], { type: ANIMATION_MIME_TYPE }), warnings: warnings.map((warning) => WRITE_WARNING_MESSAGES[warning]) };
	}
}
