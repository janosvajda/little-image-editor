import { ImageMimeType } from '../../../app/core/document/appTypes';
import { imageFormatOfFileName } from '../../../app/core/document/imageFormats';
import {
	type EditorPlatform,
	type ImagePicture,
	HostFeature,
	WorkspaceLayout,
	type KeyValueStorage,
	type OpenTarget,
	type PickerFileType,
	type SaveTarget,
	type TargetWriter,
} from '../../../app/platform/editorPlatform';
import type {
	AssistantCommand,
	AssistantResult,
	NewImageSpec,
} from '../../../app/features/assistant/assistantCommandTypes';
import { PROJECT_MIME_TYPE } from '../../../app/features/projects/projectTypes';
import {
	DOCUMENT_TARGET_ID,
	type HostMessage,
	HostMessageType,
	isPickedSaveTarget,
	receivedFileBytes,
	type ReplyValue,
	PREFERENCES_META_NAME,
	type WebviewMessage,
	WebviewMessageType,
} from '../vscodeMessages';

/** The API VS Code gives a webview page. */
export interface VsCodeWebviewApi {
	postMessage(message: WebviewMessage): void;
}

/** Requests to the extension that wait for its reply. */
class HostChannel {
	#nextRequestId = 0;
	readonly #pending = new Map<number, (value: ReplyValue) => void>();

	constructor(readonly api: VsCodeWebviewApi) {}

	request(build: (requestId: number) => WebviewMessage): Promise<ReplyValue> {
		const requestId = this.#nextRequestId++;
		return new Promise((resolve) => {
			this.#pending.set(requestId, resolve);
			this.api.postMessage(build(requestId));
		});
	}

	resolve(requestId: number, value: ReplyValue): void {
		this.#pending.get(requestId)?.(value);
		this.#pending.delete(requestId);
	}
}

/** Collects what the editor writes and sends it to the extension on close. */
function hostTarget(channel: HostChannel, targetId: string, name: string): SaveTarget {
	return {
		name,
		createWritable(): Promise<TargetWriter> {
			const parts: Blob[] = [];
			return Promise.resolve({
				write: async (contents) => void parts.push(contents),
				close: async () => {
					const contents = new Uint8Array(await new Blob(parts).arrayBuffer());
					await channel.request((requestId) => ({
						type: WebviewMessageType.Write,
						requestId,
						targetId,
						contents,
					}));
				},
			});
		},
	};
}

function mimeTypeOf(fileName: string): string {
	return imageFormatOfFileName(fileName)?.mimeType ?? PROJECT_MIME_TYPE;
}

/** Preferences live in the extension; the page starts with a copy and reports changes. */
function hostStorage(channel: HostChannel): KeyValueStorage {
	const content = document
		.querySelector<HTMLMetaElement>(`meta[name="${PREFERENCES_META_NAME}"]`)
		?.content;
	const values = new Map<string, string>(
		Object.entries(content ? (JSON.parse(content) as Record<string, string>) : {}),
	);
	const store = (key: string, value: string | null) =>
		channel.api.postMessage({ type: WebviewMessageType.StorePreference, key, value });
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value);
			store(key, value);
		},
		removeItem: (key) => {
			values.delete(key);
			store(key, null);
		},
	};
}

function pickerFilters(types: readonly PickerFileType[]) {
	return types.map((type) => ({
		description: type.description,
		extensions: Object.values(type.accept)
			.flat()
			.map((extension) => extension.replace(/^\./, '')),
	}));
}

const NO_PICTURE_MESSAGE = 'The editor cannot show its image yet.';
const NO_COMMANDS_MESSAGE = 'The editor cannot take commands yet.';

/** Carries out a command and reports its result, or why it failed. */
function commandOutcome(
	requestId: number,
	listener: ((command: AssistantCommand) => AssistantResult) | null,
	command: AssistantCommand,
): WebviewMessage {
	try {
		if (!listener) throw new Error(NO_COMMANDS_MESSAGE);
		return { type: WebviewMessageType.CommandDone, requestId, result: listener(command) };
	} catch (error) {
		return {
			type: WebviewMessageType.CommandDone,
			requestId,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Answers a view request with the picture, or with why there is none. */
async function sendPicture(
	api: VsCodeWebviewApi,
	requestId: number,
	picture: Promise<ImagePicture> | undefined,
): Promise<void> {
	try {
		if (!picture) throw new Error(NO_PICTURE_MESSAGE);
		const { png, ...sizes } = await picture;
		api.postMessage({
			type: WebviewMessageType.Viewed,
			requestId,
			image: { contents: new Uint8Array(await png.arrayBuffer()), ...sizes },
		});
	} catch (error) {
		api.postMessage({
			type: WebviewMessageType.Viewed,
			requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** The editor inside a VS Code custom editor: the extension owns the file, dialogs and preferences. */
export function createVsCodePlatform(api: VsCodeWebviewApi): EditorPlatform {
	const channel = new HostChannel(api);
	const openListeners = new Set<(target: OpenTarget) => void>();
	const createListeners = new Set<(fileName: string, image?: NewImageSpec) => void>();
	let commandListener: ((command: AssistantCommand) => AssistantResult) | null = null;
	let saveListener: ((target: SaveTarget) => Promise<void>) | null = null;
	let pictureListener: ((maxSize: number) => Promise<ImagePicture>) | null = null;
	/** The name of the file the editor shows, saved into when the host names no other. */
	let documentName = '';

	window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
		const message = event.data;
		if (message.type === HostMessageType.Reply) {
			channel.resolve(message.requestId, message.value);
			return;
		}
		if (message.type === HostMessageType.Open) {
			const file = new File([receivedFileBytes(message.contents)], message.fileName, {
				type: mimeTypeOf(message.fileName),
			});
			const target: OpenTarget = {
				...hostTarget(channel, DOCUMENT_TARGET_ID, message.fileName),
				getFile: async () => file,
			};
			documentName = message.fileName;
			openListeners.forEach((listener) => listener(target));
			return;
		}
		if (message.type === HostMessageType.Command) {
			api.postMessage(commandOutcome(message.requestId, commandListener, message.command));
			return;
		}
		if (message.type === HostMessageType.View) {
			void sendPicture(api, message.requestId, pictureListener?.(message.maxSize));
			return;
		}
		if (message.type === HostMessageType.Create) {
			documentName = message.fileName;
			createListeners.forEach((listener) => listener(message.fileName, message.image));
			return;
		}
		const target = hostTarget(channel, DOCUMENT_TARGET_ID, message.fileName ?? documentName);
		void (saveListener?.(target) ?? Promise.resolve()).then(() => {
			documentName = target.name;
		}).then(
			() => api.postMessage({ type: WebviewMessageType.Saved, requestId: message.requestId }),
			(error: unknown) =>
				api.postMessage({
					type: WebviewMessageType.Saved,
					requestId: message.requestId,
					error: String(error),
				}),
		);
	});

	return {
		files: {
			canPickSaveTarget: () => true,
			async pickSaveTarget(options) {
				const picked = await channel.request((requestId) => ({
					type: WebviewMessageType.PickSaveTarget,
					requestId,
					suggestedName: options.suggestedName,
					filters: pickerFilters(options.types),
				}));
				if (!isPickedSaveTarget(picked)) throw new DOMException('Save was cancelled.', 'AbortError');
				return hostTarget(channel, picked.targetId, picked.name);
			},
			// Files are opened from VS Code itself, each in its own editor.
			canPickOpenTarget: () => false,
			pickOpenTargets: async () => [],
			async download(contents, fileName) {
				api.postMessage({
					type: WebviewMessageType.Download,
					fileName,
					contents: new Uint8Array(await contents.arrayBuffer()),
				});
			},
		},
		clipboard: {
			writeImage: (png) =>
				navigator.clipboard.write([new ClipboardItem({ [ImageMimeType.Png]: png })]),
			writeText: async (text) =>
				api.postMessage({ type: WebviewMessageType.CopyText, text }),
		},
		storage: hostStorage(channel),
		dialogs: {
			confirm: async (message) =>
				(await channel.request((requestId) => ({
					type: WebviewMessageType.Confirm,
					requestId,
					message,
				}))) === true,
			alert: (message) => api.postMessage({ type: WebviewMessageType.Alert, message }),
			prompt: async (message, defaultValue) => {
				const value = await channel.request((requestId) => ({
					type: WebviewMessageType.Prompt,
					requestId,
					message,
					defaultValue,
				}));
				return typeof value === 'string' ? value : null;
			},
		},
		// VS Code's own menus hold the file, edit and view commands.
		hostFeatures: new Set([HostFeature.ApplicationMenus]),
		// An editor tab is narrow, and floating toolbars would cover the image.
		workspaceLayout: WorkspaceLayout.Docked,
		document: {
			onOpen: (listener) => void openListeners.add(listener),
			onCreate: (listener) => void createListeners.add(listener),
			onSaveRequested: (listener) => {
				saveListener = listener;
			},
			changed: () => api.postMessage({ type: WebviewMessageType.Changed }),
			onCommand: (listener) => {
				commandListener = listener;
			},
			onPictureRequested: (listener) => {
				pictureListener = listener;
			},
		},
	};
}
