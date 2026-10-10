import * as vscode from 'vscode';
import { vscodeEditorPage } from '../editorPage';
import {
	HostMessageType,
	ownedFileBytes,
	type PickerFileFilter,
	receivedFileBytes,
	type WebviewMessage,
	WebviewMessageType,
} from '../vscodeMessages';
import { AssistantCommand, AssistantConnection, OUTPUT_NAME } from './assistantConnection';
import { EditorDocument, EditorSession, fileNameOf } from './editorSession';
import { OpenEditors } from './openEditors';
import { IMAGE_VIEW_TYPE, openUntitledImage, untitledImageUri } from './untitledImages';

/** Must match `contributes.customEditors[].viewType` in the extension manifest. */
const ViewType = {
	/** Opens .limg projects by default. */
	Project: 'littleImageEditor.project',
	/** Offered for images through "Open With…", leaving VS Code's image preview the default. */
	Image: IMAGE_VIEW_TYPE,
} as const;
/** Must match `contributes.commands[].command` in the extension manifest. */
const Command = {
	NewImage: 'littleImageEditor.newImage',
} as const;
const PREFERENCES_KEY = 'littleImageEditor.preferences';
/** The built editor page and its assets, inside the extension. */
const WEBVIEW_ROOT = 'webview';
const EDITOR_PAGE = 'editor.html';
const NONCE_BYTES = 16;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
const CONFIRM_ACTION = 'Continue';

class LittleImageEditorProvider
	implements vscode.CustomEditorProvider<EditorDocument>
{
	readonly #changes = new vscode.EventEmitter<
		vscode.CustomDocumentContentChangeEvent<EditorDocument>
	>();
	readonly onDidChangeCustomDocument = this.#changes.event;
	readonly #sessions = new Map<EditorDocument, EditorSession>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly editors: OpenEditors,
	) {}

	openCustomDocument(uri: vscode.Uri): EditorDocument {
		return new EditorDocument(uri);
	}

	async resolveCustomEditor(
		document: EditorDocument,
		panel: vscode.WebviewPanel,
	): Promise<void> {
		const root = vscode.Uri.joinPath(this.context.extensionUri, WEBVIEW_ROOT);
		panel.webview.options = { enableScripts: true, localResourceRoots: [root] };
		panel.webview.html = await this.page(panel.webview, root);
		const session = new EditorSession(document, panel);
		this.#sessions.set(document, session);
		this.editors.add(session);
		panel.onDidDispose(() => this.#sessions.delete(document));
		panel.webview.onDidReceiveMessage((message: WebviewMessage) =>
			this.handle(session, message),
		);
	}

	saveCustomDocument(document: EditorDocument): Promise<void> {
		return this.session(document).save();
	}

	async saveCustomDocumentAs(
		document: EditorDocument,
		destination: vscode.Uri,
	): Promise<void> {
		const previous = document.destination;
		document.destination = destination;
		try {
			await this.session(document).save();
		} finally {
			document.destination = previous;
		}
	}

	async revertCustomDocument(document: EditorDocument): Promise<void> {
		await this.open(this.session(document));
	}

	/** Unsaved edits live in the page; nothing is kept for restoring after a crash. */
	backupCustomDocument(
		document: EditorDocument,
	): Promise<vscode.CustomDocumentBackup> {
		return Promise.resolve({
			id: document.uri.toString(),
			delete: () => undefined,
		});
	}

	private session(document: EditorDocument): EditorSession {
		const session = this.#sessions.get(document);
		if (!session) throw new Error('The image editor is not open.');
		return session;
	}

	/** Hands the page the file, or, for an untitled one, asks it to start a new image. */
	private async open(session: EditorSession): Promise<void> {
		const { document } = session;
		const fileName = document.name;
		if (document.isUntitled) {
			session.post({ type: HostMessageType.Create, fileName, image: this.editors.newImageSpec(document.uri) });
		} else {
			const contents = await vscode.workspace.fs.readFile(document.uri);
			session.post({ type: HostMessageType.Open, fileName, contents: ownedFileBytes(contents) });
		}
		session.opened();
	}

	private async handle(
		session: EditorSession,
		message: WebviewMessage,
	): Promise<void> {
		switch (message.type) {
			case WebviewMessageType.Ready:
				await this.open(session);
				return;
			case WebviewMessageType.Changed:
				this.#changes.fire({ document: session.document });
				return;
			case WebviewMessageType.Saved:
				session.finishSave(message.requestId, message.error);
				return;
			case WebviewMessageType.Write: {
				const uri = session.targetUri(message.targetId);
				if (uri)
					await vscode.workspace.fs.writeFile(uri, receivedFileBytes(message.contents));
				session.reply(message.requestId, uri !== undefined);
				return;
			}
			case WebviewMessageType.PickSaveTarget: {
				const uri = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.joinPath(
						session.document.uri,
						'..',
						message.suggestedName,
					),
					filters: saveFilters(message.filters),
				});
				session.reply(
					message.requestId,
					uri
						? {
								targetId: session.rememberTarget(uri),
								name: fileNameOf(uri) || message.suggestedName,
							}
						: null,
				);
				return;
			}
			case WebviewMessageType.Download: {
				const uri = await vscode.window.showSaveDialog({
					defaultUri: vscode.Uri.joinPath(session.document.uri, '..', message.fileName),
				});
				if (uri)
					await vscode.workspace.fs.writeFile(uri, receivedFileBytes(message.contents));
				return;
			}
			case WebviewMessageType.Confirm: {
				const choice = await vscode.window.showWarningMessage(
					message.message,
					{ modal: true },
					CONFIRM_ACTION,
				);
				session.reply(message.requestId, choice === CONFIRM_ACTION);
				return;
			}
			case WebviewMessageType.Prompt: {
				const value = await vscode.window.showInputBox({
					prompt: message.message,
					value: message.defaultValue,
				});
				session.reply(message.requestId, value ?? null);
				return;
			}
			case WebviewMessageType.Alert:
				void vscode.window.showInformationMessage(message.message);
				return;
			case WebviewMessageType.CopyText:
				await vscode.env.clipboard.writeText(message.text);
				return;
			case WebviewMessageType.StorePreference:
				await this.storePreference(message.key, message.value);
				return;
			case WebviewMessageType.Viewed:
			case WebviewMessageType.CommandDone:
				session.answer(message);
				return;
		}
	}

	private preferences(): Record<string, string> {
		return this.context.globalState.get<Record<string, string>>(PREFERENCES_KEY) ?? {};
	}

	private async storePreference(key: string, value: string | null): Promise<void> {
		const { [key]: _previous, ...others } = this.preferences();
		await this.context.globalState.update(
			PREFERENCES_KEY,
			value === null ? others : { ...others, [key]: value },
		);
	}

	/** The editor page with its files loaded through the webview. */
	private async page(webview: vscode.Webview, root: vscode.Uri): Promise<string> {
		const source = new TextDecoder().decode(
			await vscode.workspace.fs.readFile(vscode.Uri.joinPath(root, EDITOR_PAGE)),
		);
		return vscodeEditorPage(source, {
			baseUrl: `${webview.asWebviewUri(root).toString()}/`,
			resourceSource: webview.cspSource,
			nonce: createNonce(),
			preferences: this.preferences(),
		});
	}
}

/** Opens a new, untitled image, beside the folder it was chosen in from the Explorer. */
async function newImage(folder?: vscode.Uri): Promise<void> {
	await openUntitledImage(untitledImageUri(folder));
}

function saveFilters(
	filters: readonly PickerFileFilter[],
): Record<string, string[]> {
	return Object.fromEntries(
		filters.map((filter) => [filter.description, [...filter.extensions]]),
	);
}

function createNonce(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)), (byte) =>
		byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
	).join('');
}

export function activate(context: vscode.ExtensionContext): void {
	const editors = new OpenEditors();
	// One provider per view type: VS Code looks up every changed document under the
	// view type it registered for, so a shared provider would report each edit to the other one.
	for (const viewType of Object.values(ViewType))
		context.subscriptions.push(
			vscode.window.registerCustomEditorProvider(viewType, new LittleImageEditorProvider(context, editors), {
				webviewOptions: { retainContextWhenHidden: true },
				supportsMultipleEditorsPerDocument: false,
			}),
		);
	context.subscriptions.push(vscode.commands.registerCommand(Command.NewImage, newImage));
	const log = vscode.window.createOutputChannel(OUTPUT_NAME);
	const assistant = new AssistantConnection(context, editors, log);
	context.subscriptions.push(
		log,
		assistant,
		vscode.commands.registerCommand(AssistantCommand.Connect, () => assistant.connect()),
		vscode.commands.registerCommand(AssistantCommand.Disconnect, () => assistant.disconnect()),
	);
	void assistant.resume();
}

export function deactivate(): void {}
