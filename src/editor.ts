import { element } from "./app/helpers/domHelpers";
import { CanvasDocument } from "./app/models/imageDocument";
import { DrawingController } from "./app/ui/drawingController";
import { ImageOperations } from "./app/ui/imageOperationsController";
import { NewImageController } from "./app/ui/newImageController";
import { WorkspaceUi } from "./app/ui/workspaceController";
import { FileController } from "./app/workflows/fileController";
import { SpriteController } from "./app/workflows/spriteController";
import { SessionPersistence } from "./app/workflows/sessionPersistence";
import { ToolbarManager } from "./app/ui/genericToolbar";
import { CanvasViewportController } from "./app/ui/canvasViewportController";
import { TooltipController } from "./app/ui/tooltipController";
import { EffectsController } from "./app/ui/effectsController";
import { enhancePanelButtons } from "./app/ui/panelButtonEnhancer";

element("#quickOpenButton").after(element("#quickSaveButton"));

const documentModel = new CanvasDocument(element<HTMLCanvasElement>("#canvas"), element<HTMLCanvasElement>("#overlay"));
const newImage = new NewImageController(documentModel);
const files = new FileController(documentModel);
const sprites = new SpriteController(documentModel);
const workspaceUi = new WorkspaceUi([newImage.dialog, sprites.dialog]);
const viewport = new CanvasViewportController(documentModel);
const drawing = new DrawingController(documentModel, viewport);
new ImageOperations(documentModel);
new EffectsController(documentModel);
enhancePanelButtons();
const sessionPersistence = new SessionPersistence(documentModel);
new TooltipController();

drawing.setInitialColor(workspaceUi.resolvedTheme);

documentModel.onDocumentChange(({ hasImage, width, height }) => {
  element("#dimensions").textContent = hasImage ? `${width} × ${height} px` : "No image";
  element<HTMLInputElement>("#widthInput").value = hasImage ? String(width) : "";
  element<HTMLInputElement>("#heightInput").value = hasImage ? String(height) : "";
  element("#emptyState").classList.toggle("hidden", hasImage);
  element("#canvasWrap").classList.toggle("hidden", !hasImage);
  if (hasImage) element<HTMLSelectElement>("#formatSelect").value = documentModel.savedType;
});

new ToolbarManager(documentModel);
void finishStartup();

async function finishStartup(): Promise<void> {
  const splash = element<HTMLElement>("#startupSplash");
  try {
    await sessionPersistence.restore();
  } finally {
    splash.classList.add("is-hidden");
    window.setTimeout(() => splash.remove(), 220);
  }
}

const undoButtons = [element<HTMLButtonElement>("#undoButton"), element<HTMLButtonElement>("#menuUndoButton")];
const redoButtons = [element<HTMLButtonElement>("#redoButton"), element<HTMLButtonElement>("#menuRedoButton")];
documentModel.onHistoryChange((canUndo, canRedo) => {
  undoButtons.forEach(button => { button.disabled = !canUndo; });
  redoButtons.forEach(button => { button.disabled = !canRedo; });
});
undoButtons.forEach(button => button.addEventListener("click", () => documentModel.undo()));
redoButtons.forEach(button => button.addEventListener("click", () => documentModel.redo()));

const workspace = element<HTMLElement>(".workspace");
for (const eventName of ["dragenter", "dragover"]) {
  workspace.addEventListener(eventName, event => { event.preventDefault(); workspace.classList.add("dragging"); });
}
for (const eventName of ["dragleave", "drop"]) {
  workspace.addEventListener(eventName, event => { event.preventDefault(); workspace.classList.remove("dragging"); });
}
workspace.addEventListener("drop", event => {
  const file = (event as DragEvent).dataTransfer?.files[0];
  if (file) void documentModel.load(file);
});
document.addEventListener("paste", event => {
  const file = [...(event.clipboardData?.files ?? [])].find(candidate => candidate.type.startsWith("image/"));
  if (file) void documentModel.load(file);
});

document.addEventListener("keydown", event => {
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && key === "f") { event.preventDefault(); workspaceUi.openFileMenu(); return; }
  if (modifier && key === "n") { event.preventDefault(); newImage.open(); return; }
  if (modifier && key === "o") { event.preventDefault(); files.open(); return; }
  if (modifier && key === "s") { event.preventDefault(); event.shiftKey ? void files.saveAs() : void files.save(); return; }
  if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? documentModel.redo() : documentModel.undo(); return; }
  if (modifier && key === "y") { event.preventDefault(); documentModel.redo(); return; }
  const target = event.target as HTMLElement;
  if (event.key === "Tab" && !target.matches("input,select")) { event.preventDefault(); void workspaceUi.toggleFocus(); return; }
  if (event.key === "Escape" && document.body.classList.contains("focus-mode")) { void workspaceUi.toggleFocus(false); return; }
  if (!modifier && !target.matches("input,select")) drawing.selectFromShortcut(key);
});
