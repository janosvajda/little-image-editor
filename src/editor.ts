import { CanvasDocument } from './app/core/document/imageDocument';
import { AnnotationController } from './app/features/annotations/annotationController';
import {
	AnnotationDocument,
	LinkedHistoryDirection,
} from './app/features/annotations/annotationDocument';
import { AnnotationPanel } from './app/features/annotations/annotationPanel';
import type { AnnotationTool } from './app/features/annotations/annotationTypes';
import { LinkedHistoryDomain } from './app/features/annotations/annotationTypes';
import { BrowserCaptureImporter } from './app/features/capture/browserCaptureImporter';
import { DrawingController } from './app/features/drawing/drawingController';
import { EffectsController } from './app/features/effects/effectsController';
import { ImageOperations } from './app/features/effects/imageOperationsController';
import { ClipboardController } from './app/features/files/clipboardController';
import { FileController } from './app/features/files/fileController';
import { NewImageController } from './app/features/files/newImageController';
import { SessionPersistence } from './app/features/files/sessionPersistence';
import { SpriteController } from './app/features/files/spriteController';
import { LayersController } from './app/features/layers/layersController';
import { RasterSelection } from './app/features/selection/rasterSelection';
import { ProjectController } from './app/features/projects/projectController';
import { DocumentLimitController } from './app/features/projects/documentLimitController';
import { CanvasToolCoordinator } from './app/features/workspace/canvasToolCoordinator';
import { CanvasViewportController } from './app/features/workspace/canvasViewportController';
import { ToolbarManager } from './app/features/workspace/genericToolbar';
import { enhancePanelButtons } from './app/features/workspace/panelButtonEnhancer';
import {
	ToolbarId,
	toolbarSelector,
} from './app/features/workspace/toolbarTypes';
import { TooltipController } from './app/features/workspace/tooltipController';
import { WorkspaceUi } from './app/features/workspace/workspaceController';
import { element } from './app/shared/dom/domHelpers';
import { KeyboardKey, ShortcutKey } from './app/shared/input/keyboardKeys';

const SPLASH_EXIT_TRANSITION_MS = 220;
const STARTUP_MODE_PARAMETER = 'mode';

element('#quickOpenButton').after(element('#quickSaveButton'));
element('#quickSaveButton').after(element('#quickCloseImageButton'));

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
const annotationPanel = new AnnotationPanel();
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
const viewport = new CanvasViewportController(documentModel);
const rasterSelection = new RasterSelection(documentModel, viewport);
new DocumentLimitController(documentModel, vectorShapes);
const drawing = new DrawingController(
	documentModel,
	viewport,
	vectorShapes,
	rasterSelection,
);
layers.onEditRequested((objectId) => {
	drawing.editObject(objectId);
});
new ImageOperations(documentModel, rasterSelection);
new EffectsController(documentModel, rasterSelection);
const toolbarManager = new ToolbarManager(documentModel);
const annotationPreferences = toolbarManager.get<{
	tool: AnnotationTool;
	reportEdited: boolean;
}>('annotationToolbar');
if (!annotationPreferences)
	throw new Error(
		'The annotations panel was not registered by ToolbarManager.',
	);
const annotations = new AnnotationController(
	documentModel,
	viewport,
	annotationPanel,
	annotationPreferences,
	vectorShapes,
);
const projects = new ProjectController(documentModel, undefined, vectorShapes);
files.setProjectSaveHandler((saveAs) => projects.save(saveAs));
files.setProjectOpenHandler((file) => projects.openFile(file));
new CanvasToolCoordinator([drawing, annotations]);
enhancePanelButtons();
const sessionPersistence = new SessionPersistence(documentModel);
new TooltipController();

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

async function finishStartup(): Promise<void> {
	const splash = element<HTMLElement>('#startupSplash');
	try {
		const importedCapture = await new BrowserCaptureImporter(
			documentModel,
		).importFromLocation();
		if (!importedCapture) await sessionPersistence.restore();
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
let documentCanUndo = false;
let documentCanRedo = false;
let objectCanUndo = false;
let objectCanRedo = false;
let historyDomain: 'document' | 'objects' = 'document';
const updateHistoryButtons = () => {
	const useObjects = historyDomain === 'objects';
	const canUndo = useObjects ? objectCanUndo : documentCanUndo;
	const canRedo = useObjects ? objectCanRedo : documentCanRedo;
	undoButtons.forEach((button) => {
		button.disabled = !canUndo;
	});
	redoButtons.forEach((button) => {
		button.disabled = !canRedo;
	});
};
documentModel.onHistoryChange((canUndo, canRedo) => {
	documentCanUndo = canUndo;
	documentCanRedo = canRedo;
	historyDomain = 'document';
	updateHistoryButtons();
});
vectorShapes.onHistoryChange((canUndo, canRedo) => {
	objectCanUndo = canUndo;
	objectCanRedo = canRedo;
	historyDomain = 'objects';
	updateHistoryButtons();
});
vectorShapes.onLinkedHistoryAction((domain, direction) => {
	if (domain !== LinkedHistoryDomain.Document) return;
	if (direction === LinkedHistoryDirection.Undo) documentModel.undo();
	else documentModel.redo();
});
const undo = () =>
	historyDomain === 'objects'
		? vectorShapes.undo()
		: documentModel.undo();
const redo = () =>
	historyDomain === 'objects'
		? vectorShapes.redo()
		: documentModel.redo();
undoButtons.forEach((button) => button.addEventListener('click', undo));
redoButtons.forEach((button) => button.addEventListener('click', redo));

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
	if (!modifier && !target.matches('input,select'))
		drawing.selectFromShortcut(key);
}

function handleModifiedShortcut(
	event: KeyboardEvent,
	key: string,
	target: HTMLElement,
): boolean {
	const commands: Readonly<Record<string, () => void>> = {
		[ShortcutKey.FileMenu]: () => workspaceUi.openFileMenu(),
		[ShortcutKey.NewImage]: () => newImage.open(),
		[ShortcutKey.OpenImage]: () => files.open(),
		[ShortcutKey.Redo]: redo,
	};
	const command = commands[key];
	if (command) {
		event.preventDefault();
		command();
		return true;
	}
	if (key === ShortcutKey.Save) {
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
