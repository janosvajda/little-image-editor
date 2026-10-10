# Drawing architecture

`DrawingController` coordinates canvas input and cross-toolbar ownership. It holds
one active gesture session, normalizes pointer coordinates, dispatches coalesced
samples when requested, and preserves viewport scroll during drawing.

| Component | Responsibility |
| --- | --- |
| `DrawingToolControls` | Toolbar presentation and persisted settings, through the existing `GenericToolbar` and `GroupedToolPalette` |
| `DrawingToolSettings` | Typed boundary between toolbar settings and tool actions |
| `DrawingToolRouter` | Chooses an action or gesture; does not implement painting, extraction or transforms |
| `ObjectInteractionTool` | Hit testing, selection precedence and cursors using `genericShape` and `AnnotationDocument` |
| `CropTool` | Crop draft, overlay and layer-aware selection dispatch |
| `BaseImageCropSelection` | Transient selection and pixel movement within the existing image layer, with document undo/redo |
| `DrawingImageActions` | Immediate fill and color sampling |
| `gestures/` | Paint, erasure, shape creation, object transforms and raster selection; each owns its draft state |
| `CanvasSelectionGesture` | Restores incidental paint clicks when the browser recognizes double-click selection |

A `DrawingGesture` supports `update`, `complete` and `cancel`. It declares whether
it consumes coalesced samples and whether drawing should hold the viewport scroll.
`RetainedDrawingGesture` provides the common commit/rollback boundary. The browser's
existing `pointercancel` handling still completes the gesture; switching tool
ownership cancels an unfinished gesture.

Gesture implementations receive the shared document/layer models and explicit
settings. They never receive the controller, query toolbar DOM, or keep parallel
copies of selected-layer state. Retained paint reuses `createPaintLayer`, raster
painting reuses `RasterPaintGesture`, and transforms use `genericShape`.

The layer and `.limg` models are unchanged. Base-image selections create no retained objects; moving their pixels commits
the existing image history, which already persists in `.limg`. Cropping retained
objects uses annotation history and serialization.

## Layer model

The image is the bottom layer. Above it, **content layers** hold **items**:
shapes, lines, arrows, text, markers, fills, cut pixel pieces and individual
brush strokes. `AnnotationState.layers` lists the layers bottom first, each with
its `itemIds` bottom first; `AnnotationState.objects` holds every item in render
order and is always derived from `layers` (`itemsInLayerOrder`).
`normalizeAnnotationState()` completes incoming states: unknown or repeated ids
are dropped, and an item outside every layer gets a layer of its own.

`AnnotationDocument` keeps one **active layer** (`activeLayer`, `null` for the
image) and at most one selection: one item (`selected`) or one whole layer
(`selectedLayer`).

- New items go on top of the active layer. With the image active, a layer is
  created for the item in the same undo step.
- Each brush drag is a new stroke item. Painting leaves the new stroke
  unselected so the brush settings stay in view; strokes are edited with Select.
- The Select tool works layer first: pressing an item selects its whole layer,
  which moves from inside its frame, resizes from its corners and rotates from
  just outside. A click on an item of the selected layer drills in to that
  item; with an item selected, its neighbours in the layer are picked directly;
  a double-click goes straight to an item. Switching from a drawing tool to
  Select hands over the drawn item's layer. Selecting an item makes its layer
  active and outlines that layer on the canvas. Layer-list clicks show their
  selection on the canvas with Select.
- A whole selected layer moves, resizes and rotates through its frame
  (`LayerTransformGesture`); each item is mapped from its starting geometry into
  the transformed frame (`mapGeometryBetweenFrames`). A layer keeps its own
  `rotation`, so its frame (`layerFrame`, measured by `orientedBounds`) stays
  turned with it and later resizes follow the layer's axes.
- Whole layers move by whole pixels, so their items stay pixel-exact.
- A stroke only moved by whole pixels is drawn from its cached source;
  resized, rotated or part-pixel-moved strokes are drawn from their points, so
  a line keeps its width and stays sharp at any size.
- While a whole layer is dragged, the render state carries a `layerMotion`.
  `LayerMotionPreview` then draws the content below, the layer (at its position
  before the drag) and the content above once, and each frame shifts the layer
  by the drag rounded to whole pixels, so a whole-pixel drag previews exactly as
  it is finally drawn. If a layer above blends with something other than Normal,
  frames are redrawn in full instead. Releasing redraws everything from the
  document, as always.
- `select(null)` and `clearSelection()` only deselect; the active layer stays.
  `activate(null)` makes the image active, as does a Select-tool click where
  there is no item, since the image is what is there.
- The eraser erases every item of the active layer that it reaches; with the
  image active it erases image pixels.
- The Fill tool keeps the selection and is limited by it: with an item or a
  whole layer selected, the fill stays inside that frame, only that item's or
  layer's lines stop it, and the fill is placed beneath them. Without a
  selection, everything visible stops the fill and it goes on top of the
  active layer.
- An item is editable when it and its layer are visible and unlocked.
- Deleting the active layer activates the layer beneath it.

Opacity, blend mode and name belong to the layer; `layerAppearance()` resolves
defaults. `compositeLayers()` draws each visible layer as one group, isolating
layers with their own opacity or blend mode. A visible non-Normal blend mode
makes the annotation surface present the image as its backdrop
(`CanvasDocument.setImagePresentedByComposite`), so blending matches export.

`LayerMerger` implements Merge Down: between two normally composited layers the
items move into the lower layer and stay editable; otherwise the result is
baked into one pixel item. Merging the bottom layer writes into the image as one
linked step. `EditorHistory` gives one chronological undo history over image and
layer steps.

`.limg` has a single format, version 1. `editableObjects` stores the layers and
their items.

## Tools and toolbars

Every canvas tool is one shared tool: brushes, shapes, markup (numbered
markers, highlight, blur, redaction, text) and utilities (Select, Crop, Fill,
Picker, Zoom). `DrawingToolControls` holds the one active tool and its options,
`DrawingToolRouter` turns pointer input into gestures, and each tool is listed
once in `drawingToolCatalog` (labels, icons, shortcuts) and registered once in
`DRAWING_TOOL_DOCUMENT_CONTRACT` for layers and `.limg`.

Toolbars only present tools. The Tools panel groups them; Capture & annotate
(`AnnotationPanel`) shows a subset of the same tools with the same buttons
(`createToolButton`) and picks them through `DrawingController.select`. Its
only own behaviour is opening by itself after a browser capture, through the
generic toolbar auto-open mode, and the bug report that goes with a capture
(`BugReportController`).

`ContentLayerCanvas` draws the layers and the selection for every tool, adds
them to exports, keeps them aligned through crops and saves them with the
document. `LayerMerger` flattens layers into the image, both for the Layers
panel's Flatten action and before the image is resized or turned.
