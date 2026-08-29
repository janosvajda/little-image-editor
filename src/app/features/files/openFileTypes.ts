import { IMAGE_FORMATS } from '../../core/document/imageFormats';
import {
	PROJECT_EXTENSION,
	PROJECT_MIME_TYPE,
} from '../projects/projectTypes';

const PROJECT_FILE_SUFFIX = `.${PROJECT_EXTENSION}`;

export const EDITOR_OPEN_FILE_ACCEPT = [
	...IMAGE_FORMATS.map((format) => format.mimeType),
	PROJECT_FILE_SUFFIX,
	PROJECT_MIME_TYPE,
].join(',');

export function isProjectFile(file: File): boolean {
	return (
		file.type === PROJECT_MIME_TYPE ||
		file.name.toLowerCase().endsWith(PROJECT_FILE_SUFFIX)
	);
}
