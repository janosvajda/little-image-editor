import * as vscode from 'vscode';
import type {
	AssistantCommand,
	AssistantResult,
	NewImageSpec,
} from '../../../app/features/assistant/assistantCommandTypes';
import type { EditableImages, OpenImageSummary, OpenImageView } from '../assistant/openImages';
import type { EditorSession } from './editorSession';
import { openUntitledImage, untitledImageUri } from './untitledImages';

const FILE_SCHEME = 'file';
const NO_EDITOR_MESSAGE =
	'No image is open in Little Image Editor. Open an image or a .limg project in VS Code with Little Image Editor first, or create one with create_image.';
const CHOOSE_IMAGE_MESSAGE =
	'Several images are open and none is active; pass the id or name of one from list_images.';

/**
 * Every open Little Image Editor tab, whichever file type opened it, and the
 * one the user works in. Assistant tools reach the images through it.
 */
export class OpenEditors implements EditableImages {
	readonly #sessions = new Set<EditorSession>();
	#active: EditorSession | null = null;
	/** Sizes for untitled images an assistant asked for, until their editors open. */
	readonly #newImageSpecs = new Map<string, NewImageSpec>();
	readonly #openWaiters = new Map<string, (session: EditorSession) => void>();

	add(session: EditorSession): void {
		const { panel, document } = session;
		this.#sessions.add(session);
		if (panel.active) this.#active = session;
		panel.onDidChangeViewState(({ webviewPanel }) => {
			if (webviewPanel.active) this.#active = session;
		});
		panel.onDidDispose(() => {
			this.#sessions.delete(session);
			if (this.#active === session) this.#active = null;
		});
		const key = document.uri.toString();
		this.#openWaiters.get(key)?.(session);
		this.#openWaiters.delete(key);
	}

	/** The size an assistant asked for an untitled image, handed over once as its editor opens. */
	newImageSpec(uri: vscode.Uri): NewImageSpec | undefined {
		const key = uri.toString();
		const spec = this.#newImageSpecs.get(key);
		this.#newImageSpecs.delete(key);
		return spec;
	}

	list(): readonly OpenImageSummary[] {
		return [...this.#sessions].map((session) => this.summary(session));
	}

	async view(image: string | undefined, maxSize: number): Promise<OpenImageView> {
		const session = this.find(image);
		const { contents, ...sizes } = await session.view(maxSize);
		return { name: session.document.name, png: contents, ...sizes };
	}

	command(image: string | undefined, command: AssistantCommand): Promise<AssistantResult> {
		return this.find(image).command(command);
	}

	/** Opens a new, unsaved image in the project and waits until its editor has created it. */
	async create(name: string | undefined, spec: NewImageSpec): Promise<OpenImageSummary> {
		const uri = untitledImageUri(vscode.workspace.workspaceFolders?.[0]?.uri, name);
		const key = uri.toString();
		this.#newImageSpecs.set(key, spec);
		const opened = new Promise<EditorSession>((resolve) => this.#openWaiters.set(key, resolve));
		await openUntitledImage(uri);
		const session = await opened;
		await session.ready;
		this.#active = session;
		return this.summary(session);
	}

	private summary({ document }: EditorSession): OpenImageSummary {
		return {
			id: document.uri.toString(),
			name: document.name,
			location: locationOf(document.uri),
			active: this.#active?.document === document,
		};
	}

	/** The image by id or name; without either, the active one, or the only one open. */
	private find(image: string | undefined): EditorSession {
		const sessions = [...this.#sessions];
		if (image === undefined) {
			if (this.#active) return this.#active;
			if (sessions.length === 1) return sessions[0]!;
			throw new Error(sessions.length ? CHOOSE_IMAGE_MESSAGE : NO_EDITOR_MESSAGE);
		}
		const found = sessions.find(
			({ document }) => document.uri.toString() === image || document.name === image,
		);
		if (!found) throw new Error(`No open image is called ${image}. Use list_images to see the open ones.`);
		return found;
	}
}

function locationOf(uri: vscode.Uri): string {
	return uri.scheme === FILE_SCHEME ? uri.fsPath : uri.toString();
}
