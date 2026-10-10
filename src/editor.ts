import type { Tool } from './app/core/document/appTypes';
import {
	EditorHistory,
	HistoryDomain,
} from './app/core/history/editorHistory';
import { CanvasDocument } from './app/core/document/imageDocument';
import {
	AnnotationDocument,
	LinkedHistoryDirection,
} from './app/features/annotations/annotationDocument';
import {
	ANNOTATION_TOOLBAR_KEY,
	AnnotationPanel,
} from './app/features/annotations/annotationPanel';
import { LinkedHistoryDomain } from './app/features/annotations/annotationTypes';
import {
	BugReportController,
	type BugReportPreferences,
} from './app/features/annotations/bugReportController';
import { ContentLayerCanvas } from './app/features/annotations/contentLayerCanvas';
import { BrowserCaptureImporter } from './app/features/capture/browserCaptureImporter';
import { DrawingController } from './app/features/drawing/drawingController';
import { selectionPresentationFor } from './app/features/drawing/drawingToolBehavior';
import { EffectsController } from './app/features/effects/effectsController';
import { ImageOperations } from './app/features/effects/imageOperationsController';
import { ClipboardController } from './app/features/files/clipboardController';
import { FileController } from './app/features/files/fileController';
import { NewImageController } from './app/features/files/newImageController';
import { AssistantCommandRunner } from './app/features/assistant/assistantCommandRunner';
import { imagePicture } from './app/features/files/imagePicture';
import { isProjectFileName } from './app/features/files/openFileTypes';
import { SessionPersistence } from './app/features/files/sessionPersistence';
import { SpriteController } from './app/features/files/spriteController';
import { LayerMerger } from './app/features/layers/layerMerge';
import { LayersController } from './app/features/layers/layersController';
import { RasterSelection } from './app/features/selection/rasterSelection';
import { ProjectController } from './app/features/projects/projectController';
import { DocumentLimitController } from './app/features/projects/documentLimitController';
import {
	CanvasViewportController,
	ImagePlacement,
} from './app/features/workspace/canvasViewportController';
import { ToolbarManager } from './app/features/workspace/genericToolbar';
import { DockedWorkspace } from './app/features/workspace/dockedWorkspace';
import { enhancePanelButtons } from './app/features/workspace/panelButtonEnhancer';
import {
	ToolbarId,
	toolbarSelector,
} from './app/features/workspace/toolbarTypes';
import { TooltipController } from './app/features/workspace/tooltipController';
import { WorkspaceUi } from './app/features/workspace/workspaceController';
import {
	editorPlatform,
	HostFeature,
	hostProvides,
	type PlatformDocumentHost,
	presentPlatform,
	WorkspaceLayout,
	workspaceLayoutOf,
} from './app/platform/editorPlatform';
import { acceptsTyping, element } from './app/shared/dom/domHelpers';
import { KeyboardKey, ShortcutKey } from './app/shared/input/keyboardKeys';

const SPLASH_EXIT_TRANSITION_MS = 220;
const STARTUP_MODE_PARAMETER = 'mode';

element('#quickOpenButton').after(element('#quickSaveButton'));
element('#quickSaveButton').after(element('#quickCloseImageButton'));

const platform = editorPlatform();
presentPlatform(platform);
const documentModel = new CanvasDocument(
	element<HTMLCanvasElement>('#canvas'),
	element<HTMLCanvasElement>('#overlay'),
);
const vectorShapes = new AnnotationDocument();
const newImage = new NewImageController(documentModel);
const files = new FileController(
	documentModel,
	() => vectorShapes.state.objects.length > 0,
);
const clipboard = new ClipboardController(documentModel);
const sprites = new SpriteController(documentModel);
const annotationPanel = new AnnotationPanel((tool) => drawing.select(tool));
const layers = new LayersController(documentModel, vectorShapes);
element<HTMLElement>(toolbarSelector(ToolbarId.Transform)).before(
	annotationPanel.element,
	layers.panel.element,
);
const workspaceUi = new WorkspaceUi([
	newImage.dialog,
	sprites.dialog,
	files.closeDialog,
]);
workspaceUi.bindToolbarAvailability(documentModel);
const docked = workspaceLayoutOf(platform) === WorkspaceLayout.Docked;
// Docked, the canvas area is all there is around the image, so the image sits in its middle.
const viewport = new CanvasViewportController(
	documentModel,
	docked ? ImagePlacement.Center : ImagePlacement.Start,
);
const rasterSelection = new RasterSelection(documentModel, viewport);
new DocumentLimitController(documentModel, vectorShapes);
const drawing = new DrawingController(
	documentModel,
	viewport,
	vectorShapes,
	rasterSelection,
);
annotationPanel.showActiveTool(drawing.tool);
drawing.onToolChange((tool) => annotationPanel.showActiveTool(tool));
layers.onEditRequested((layerId) => drawing.editLayer(layerId));
layers.onItemChosen((itemId) => drawing.revealItem(itemId));
new ImageOperations(documentModel, rasterSelection);
new EffectsController(documentModel, rasterSelection);
const toolbarManager = new ToolbarManager(documentModel);
const bugReportPreferences = toolbarManager.get<BugReportPreferences>(
	ANNOTATION_TOOLBAR_KEY,
);
if (!bugReportPreferences)
	throw new Error(
		'The annotations panel was not registered by ToolbarManager.',
	);
new BugReportController(documentModel, annotationPanel, bugReportPreferences, clipboard);
const layerMerger = new LayerMerger(documentModel, vectorShapes);
const layerCanvas = new ContentLayerCanvas(
	documentModel,
	viewport,
	vectorShapes,
	() => layerMerger.flattenBeforeGeometryChange(),
);
const presentSelectionFor = (tool: Tool) =>
	layerCanvas.setSelectionPresentation(selectionPresentationFor(tool));
presentSelectionFor(drawing.tool);
drawing.onToolChange(presentSelectionFor);
const projects = new ProjectController(documentModel, undefined, vectorShapes);
files.setProjectSaveHandler((saveAs) => projects.save(saveAs));
files.setProjectOpenHandler((file, target) => projects.openFile(file, target));
enhancePanelButtons();
// A host that owns the file restores it itself, so reload recovery stays off.
const sessionPersistence = platform.document
	? null
	: new SessionPersistence(documentModel);
new TooltipController();
if (docked)
	new DockedWorkspace(
		{
			workspace: element<HTMLElement>('.workspace'),
			toolButtons: element<HTMLElement>('.utility-tools'),
			toolSettings: element<HTMLElement>(toolbarSelector(ToolbarId.Tools)),
			optionsBarAfter: element<HTMLElement>('#redoButton'),
			viewControls: element<HTMLElement>('.viewport-controls'),
			statusBar: element<HTMLElement>('#statusBar'),
		},
		platform.storage,
	);

drawing.setInitialColor(workspaceUi.resolvedTheme);

documentModel.onDocumentChange(({ hasImage, width, height }) => {
	element('#dimensions').textContent = hasImage
		? `${width} × ${height} px`
		: 'No image';
	element<HTMLInputElement>('#widthInput').value = hasImage
		? String(width)
		: '';
	element<HTMLInputElement>('#heightInput').value = hasImage
		? String(height)
		: '';
	element('#emptyState').classList.toggle('hidden', hasImage);
	element('#canvasWrap').classList.toggle('hidden', !hasImage);
});

void finishStartup();

/** Opens the host's file, saves into it on request and reports edits, but not the opening itself. */
function connectDocumentHost(host: PlatformDocumentHost): void {
	host.onOpen(
		(target) =>
			void files
				.openTarget(target)
				// The whole image is in view when it opens, as in the host's own image preview.
				.then(() => viewport.showWholeImage())
				.catch(() =>
					platform.dialogs.alert(`${target.name} could not be opened as an image or project.`),
				),
	);
	// A new, untitled file starts as a new image, unsaved until the host saves it.
	host.onCreate((fileName, image) =>
		image ? newImage.createImage(fileName, image) : newImage.open(fileName),
	);
	const assistant = new AssistantCommandRunner(documentModel, vectorShapes, editorHistory);
	host.onCommand((command) => assistant.run(command));
	newImage.onCreate(() => host.changed());
	host.onPictureRequested((maxSize) => imagePicture(documentModel, maxSize));
	host.onSaveRequested((target) =>
		isProjectFileName(target.name) ? projects.saveInto(target) : files.saveInto(target),
	);
	// Opening resets the history, so only a step that can be undone is an edit.
	documentModel.onHistoryChange((canUndo) => {
		if (canUndo) host.changed();
	});
	vectorShapes.onCommit(() => host.changed());
}

async function finishStartup(): Promise<void> {
	const splash = element<HTMLElement>('#startupSplash');
	try {
		const importedCapture = await new BrowserCaptureImporter(
			documentModel,
		).importFromLocation();
		if (!importedCapture) await sessionPersistence?.restore();
		const startupMode = new URLSearchParams(location.search).get(
			STARTUP_MODE_PARAMETER,
		);
		if (startupMode && workspaceUi.autoOpenToolbar(startupMode)) {
			consumeStartupMode();
		}
	} finally {
		splash.classList.add('is-hidden');
		window.setTimeout(() => splash.remove(), SPLASH_EXIT_TRANSITION_MS);
	}
}

function consumeStartupMode(): void {
	const url = new URL(location.href);
	url.searchParams.delete(STARTUP_MODE_PARAMETER);
	history.replaceState(
		history.state,
		'',
		`${url.pathname}${url.search}${url.hash}`,
	);
}

const undoButtons = [
	element<HTMLButtonElement>('#undoButton'),
	element<HTMLButtonElement>('#menuUndoButton'),
];
const redoButtons = [
	element<HTMLButtonElement>('#redoButton'),
	element<HTMLButtonElement>('#menuRedoButton'),
];
const editorHistory = new EditorHistory({
	[HistoryDomain.Document]: documentModel,
	[HistoryDomain.Objects]: vectorShapes,
});
editorHistory.onChange((canUndo, canRedo) => {
	undoButtons.forEach((button) => {
		button.disabled = !canUndo;
	});
	redoButtons.forEach((button) => {
		button.disabled = !canRedo;
	});
});
vectorShapes.onLinkedHistoryAction((domain, direction) => {
	if (domain !== LinkedHistoryDomain.Document) return;
	if (direction === LinkedHistoryDirection.Undo) documentModel.undo();
	else documentModel.redo();
});
const undo = () => editorHistory.undo();
const redo = () => editorHistory.redo();
undoButtons.forEach((button) => button.addEventListener('click', undo));
redoButtons.forEach((button) => button.addEventListener('click', redo));
// After the history, which the host's commands undo through.
if (platform.document) connectDocumentHost(platform.document);

const workspace = element<HTMLElement>('.workspace');
for (const eventName of ['dragenter', 'dragover']) {
	workspace.addEventListener(eventName, (event) => {
		event.preventDefault();
		workspace.classList.add('dragging');
	});
}
for (const eventName of ['dragleave', 'drop']) {
	workspace.addEventListener(eventName, (event) => {
		event.preventDefault();
		workspace.classList.remove('dragging');
	});
}
workspace.addEventListener('drop', (event) => {
	const file = (event as DragEvent).dataTransfer?.files[0];
	if (file) void documentModel.load(file);
});
document.addEventListener('paste', (event) => {
	const file = [...(event.clipboardData?.files ?? [])].find((candidate) =>
		candidate.type.startsWith('image/'),
	);
	if (file) void documentModel.load(file);
});

document.addEventListener('keydown', handleKeyboardShortcut);

function handleKeyboardShortcut(event: KeyboardEvent): void {
	if (event.defaultPrevented) return;
	const modifier = event.ctrlKey || event.metaKey;
	const key = event.key.toLowerCase();
	const target = event.target as HTMLElement;
	if (modifier && handleModifiedShortcut(event, key, target)) return;
	if (handleWorkspaceShortcut(event, target)) return;
	if (!modifier && !acceptsTyping(target)) drawing.selectFromShortcut(key);
}

function handleModifiedShortcut(
	event: KeyboardEvent,
	key: string,
	target: HTMLElement,
): boolean {
	// The application menus' shortcuts belong to a host that provides those menus.
	const menuCommands: Readonly<Record<string, () => void>> = hostProvides(
		platform,
		HostFeature.ApplicationMenus,
	)
		? {}
		: {
				[ShortcutKey.FileMenu]: () => workspaceUi.openFileMenu(),
				[ShortcutKey.NewImage]: () => newImage.open(),
				[ShortcutKey.OpenImage]: () => files.open(),
			};
	const commands: Readonly<Record<string, () => void>> = {
		...menuCommands,
		[ShortcutKey.Redo]: redo,
	};
	const command = commands[key];
	if (command) {
		event.preventDefault();
		command();
		return true;
	}
	// A host that owns the file saves it on its own shortcut.
	if (key === ShortcutKey.Save && !platform.document) {
		event.preventDefault();
		event.shiftKey ? void files.saveAs() : void files.save();
		return true;
	}
	if (key === ShortcutKey.Undo) {
		event.preventDefault();
		event.shiftKey ? redo() : undo();
		return true;
	}
	if (
		key === ShortcutKey.Copy &&
		!event.shiftKey &&
		!target.matches('input,textarea,select,[contenteditable=true]')
	) {
		event.preventDefault();
		void clipboard.copy();
		return true;
	}
	return false;
}

function handleWorkspaceShortcut(
	event: KeyboardEvent,
	target: HTMLElement,
): boolean {
	if (event.key === KeyboardKey.Tab && !target.matches('input,select')) {
		event.preventDefault();
		void workspaceUi.toggleFocus();
		return true;
	}
	if (
		event.key === KeyboardKey.Escape &&
		document.body.classList.contains('focus-mode')
	) {
		void workspaceUi.toggleFocus(false);
		return true;
	}
	return false;
}
