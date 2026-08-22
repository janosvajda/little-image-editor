import { CanvasDocument } from "./app/canvas-document.js";
import { DrawingController } from "./app/drawing-controller.js";
import { element } from "./app/dom.js";
import { FileController } from "./app/file-controller.js";
import { ImageOperations } from "./app/image-operations.js";
import { NewImageController } from "./app/new-image-controller.js";
import { SpriteController } from "./app/sprite-controller.js";
import { WorkspaceUi } from "./app/workspace-ui.js";

const documentModel = new CanvasDocument();
const newImage = new NewImageController(documentModel);
const files = new FileController(documentModel);
const sprites = new SpriteController(documentModel);
const workspaceUi = new WorkspaceUi([newImage.dialog, sprites.dialog]);
const drawing = new DrawingController(documentModel);
new ImageOperations(documentModel);

drawing.setInitialColor(workspaceUi.resolvedTheme);

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
  if (!target.matches("input,select")) drawing.selectFromShortcut(key);
});
