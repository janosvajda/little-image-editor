import type {
	AssistantCommand,
	AssistantResult,
	NewImageSpec,
} from '../features/assistant/assistantCommandTypes';
import { createBrowserPlatform } from './browserPlatform';

/**
 * What the editor needs from the environment it runs in: the web page, the
 * Chrome extension or the VS Code extension. The editor calls only these
 * interfaces, so each shell supplies its own implementation once at startup.
 */

/** Small string storage for preferences such as the toolbar layout. */
export interface KeyValueStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** One kind of file a picker offers, for example PNG images. */
export interface PickerFileType {
	readonly description: string;
	readonly accept: Readonly<Record<string, readonly string[]>>;
}

export interface SavePickerOptions {
	readonly suggestedName: string;
	readonly types: readonly PickerFileType[];
}

export interface OpenPickerOptions {
	readonly types: readonly PickerFileType[];
	readonly multiple: false;
}

/** An open stream to a save target; written once, then closed. */
export interface TargetWriter {
	write(contents: Blob): Promise<void>;
	close(): Promise<void>;
}

/**
 * A file the editor may write again without asking, such as the file a
 * document was saved to. The browser's file handles have this shape.
 */
export interface SaveTarget {
	readonly name: string;
	createWritable(): Promise<TargetWriter>;
}

/** Replaces a target's contents. */
export async function writeToTarget(
	target: SaveTarget,
	contents: Blob,
): Promise<void> {
	const writer = await target.createWritable();
	await writer.write(contents);
	await writer.close();
}

/** A chosen file that can be read now and written back later. */
export interface OpenTarget extends SaveTarget {
	getFile(): Promise<File>;
}

/**
 * Choosing, reading and writing files. A picker that is cancelled rejects
 * with an `AbortError`, as the browser's pickers do.
 */
export interface PlatformFiles {
	/** Whether a save location can be chosen; checked per save, as support can appear later. */
	canPickSaveTarget(): boolean;
	pickSaveTarget(options: SavePickerOptions): Promise<SaveTarget>;
	canPickOpenTarget(): boolean;
	pickOpenTargets(options: OpenPickerOptions): Promise<readonly OpenTarget[]>;
	/** Hands a file to the user where no save location can be chosen. */
	download(contents: Blob, fileName: string): void;
}

export interface PlatformClipboard {
	writeImage(png: Blob): Promise<void>;
	writeText(text: string): Promise<void>;
}

/** Questions and notices for the user; asynchronous, as a host may show them outside the page. */
export interface PlatformDialogs {
	confirm(message: string): Promise<boolean>;
	alert(message: string): void;
	prompt(message: string, defaultValue: string): Promise<string | null>;
}

/**
 * A host that owns the open file, such as a code editor: it hands the
 * editor the file, saves it on request and shows when it has unsaved edits.
 */
export interface PlatformDocumentHost {
	onOpen(listener: (target: OpenTarget) => void): void;
	/**
	 * The host opened a new, untitled file of this name; the editor starts a
	 * new image for it, asking for its size unless the host gives one.
	 */
	onCreate(listener: (fileName: string, image?: NewImageSpec) => void): void;
	/** An assistant asks for an edit; the listener carries it out and reports the outcome. */
	onCommand(listener: (command: AssistantCommand) => AssistantResult): void;
	/**
	 * Saving is requested by the host; the listener saves into the target, the
	 * opened file or the one chosen by Save As, in the format its name says.
	 */
	onSaveRequested(listener: (target: SaveTarget) => Promise<void>): void;
	/** The document was edited since it was opened or saved. */
	changed(): void;
	/** The host, for example for an assistant, asks for a picture of the whole image. */
	onPictureRequested(listener: (maxSize: number) => Promise<ImagePicture>): void;
}

/** The whole image, every layer and object, drawn at most a given size. */
export interface ImagePicture {
	readonly png: Blob;
	readonly width: number;
	readonly height: number;
	/** The size of the image itself, which the picture may show smaller. */
	readonly imageWidth: number;
	readonly imageHeight: number;
}

/** Parts of the editor's own interface that a host already provides, so the editor leaves them out. */
export const HostFeature = {
	/** File, Edit and View menus with their shortcuts. */
	ApplicationMenus: 'application-menus',
} as const;
export type HostFeature = (typeof HostFeature)[keyof typeof HostFeature];

/** How the toolbars share the editor's space. */
export const WorkspaceLayout = {
	/** Toolbars float over the canvas and can be moved, as in a full browser window. */
	Floating: 'floating',
	/** Tools in a strip on the left and the other toolbars as tabs in one side panel, for a narrow editor area. */
	Docked: 'docked',
} as const;
export type WorkspaceLayout =
	(typeof WorkspaceLayout)[keyof typeof WorkspaceLayout];

/** Who opens, saves and closes the file being edited. */
export const DocumentOwner = {
	/** The editor, with its own Open, Save and Close actions. */
	Editor: 'editor',
	/** A host such as a code editor, which already offers those actions. */
	Host: 'host',
} as const;
export type DocumentOwner = (typeof DocumentOwner)[keyof typeof DocumentOwner];

export interface EditorPlatform {
	readonly files: PlatformFiles;
	readonly clipboard: PlatformClipboard;
	readonly storage: KeyValueStorage;
	readonly dialogs: PlatformDialogs;
	/** Present where a host owns the file and its saving. */
	readonly document?: PlatformDocumentHost;
	readonly hostFeatures?: ReadonlySet<HostFeature>;
	/** Floating unless the platform's space calls for another layout. */
	readonly workspaceLayout?: WorkspaceLayout;
}

export function workspaceLayoutOf(platform: EditorPlatform): WorkspaceLayout {
	return platform.workspaceLayout ?? WorkspaceLayout.Floating;
}

export function hostProvides(platform: EditorPlatform, feature: HostFeature): boolean {
	return platform.hostFeatures?.has(feature) === true;
}

/** Marks the page with what the host provides and the layout it uses, so styles can follow them. */
export function presentPlatform(
	platform: EditorPlatform,
	root: HTMLElement = document.documentElement,
): void {
	if (platform.hostFeatures?.size)
		root.dataset.hostProvides = [...platform.hostFeatures].join(' ');
	root.dataset.workspaceLayout = workspaceLayoutOf(platform);
	root.dataset.documentOwner = platform.document ? DocumentOwner.Host : DocumentOwner.Editor;
}

let installed: EditorPlatform | null = null;

/** Called once by a shell before the editor starts; without it the editor uses the web page's platform. */
export function installEditorPlatform(platform: EditorPlatform): void {
	installed = platform;
}

export function editorPlatform(): EditorPlatform {
	installed ??= createBrowserPlatform();
	return installed;
}
