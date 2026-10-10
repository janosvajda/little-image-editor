import { ImageMimeType } from '../core/document/appTypes';
import type {
	EditorPlatform,
	OpenPickerOptions,
	OpenTarget,
	SavePickerOptions,
	SaveTarget,
} from './editorPlatform';

/** Long enough for the browser to start the download before the URL is released. */
const OBJECT_URL_RELEASE_DELAY_MS = 1_000;

/** The File System Access pickers, which only some browsers provide. */
interface PickerWindow extends Window {
	showSaveFilePicker?: (options: SavePickerOptions) => Promise<SaveTarget>;
	showOpenFilePicker?: (options: OpenPickerOptions) => Promise<OpenTarget[]>;
}

function pickers(): PickerWindow {
	return window as PickerWindow;
}

/** The web page and the Chrome extension: browser pickers, downloads, dialogs, clipboard and localStorage. */
export function createBrowserPlatform(): EditorPlatform {
	return {
		files: {
			// Looked up on each call: support, or a test double, can appear after start-up.
			canPickSaveTarget: () => typeof pickers().showSaveFilePicker === 'function',
			pickSaveTarget: (options) => pickers().showSaveFilePicker!(options),
			canPickOpenTarget: () => typeof pickers().showOpenFilePicker === 'function',
			pickOpenTargets: (options) => pickers().showOpenFilePicker!(options),
			download(contents, fileName) {
				const link = document.createElement('a');
				link.href = URL.createObjectURL(contents);
				link.download = fileName;
				link.click();
				setTimeout(
					() => URL.revokeObjectURL(link.href),
					OBJECT_URL_RELEASE_DELAY_MS,
				);
			},
		},
		clipboard: {
			writeImage: (png) =>
				navigator.clipboard.write([new ClipboardItem({ [ImageMimeType.Png]: png })]),
			writeText: (text) => navigator.clipboard.writeText(text),
		},
		storage: localStorage,
		dialogs: {
			confirm: async (message) => window.confirm(message),
			alert: (message) => window.alert(message),
			prompt: async (message, defaultValue) =>
				window.prompt(message, defaultValue),
		},
	};
}
