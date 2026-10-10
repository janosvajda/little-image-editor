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
| `CropTool` | Cut-and-move draft, overlay and extraction from one captured source |
| `drawingLayerTargetAt` | Shared Crop/eraser targeting, with visibility and lock checks |
| `BaseImageCropSelection` | Bitmap selection compatibility for integrations using only `CanvasDocument` |
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

Shape frames keep a normalized rectangle and optional `flipX`/`flipY` drawing
direction. The shared `rectOrientation` and `rectEndpoints` helpers preserve the
drag's start and end through rendering, moves and transforms. Direction stays
independent of item and layer rotation, so adding a shape to a rotated layer
matches its preview. These optional fields persist in `.limg` version 1; shapes
saved without them retain their existing orientation.

Cut-outs reuse the existing `RasterFragmentAnnotation` item and `.limg` version 1.
An object cut stays in its source layer. A photo cut removes the selected image
pixels and creates a layer immediately above the image containing the cut-out;
both changes form one linked undo step. Moving a cut-out uses the shared object
or layer transforms and their history. The source hole is transparent, including
when the imported photo was JPEG. Image export follows the chosen format's
transparency support.

Crop captures its source at the initial press. An explicitly selected item is
preferred when that press reaches it; otherwise the topmost visible item is used,
or the image where no item is hit. Locks are checked both when the selection
starts and before extraction. Overlapping items do not change the captured source.
Dragging anywhere inside a selected cut-out's frame moves it. After deselecting
it, transparent pixels and cut holes allow a new cut on the content underneath.

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
- The eraser targets the visible item beneath the initial press and erases
  every editable item of that item's layer that it reaches. A press on the
  background targets image pixels. That target stays fixed until release;
  crossing another layer during a drag does not erase it. A locked visible
  target blocks erasing through it, and hidden content is ignored.
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

Paint and shape tools share the last explicitly chosen colour. Numbered markers
have a separate colour profile, initially red. An explicit colour edit on a
selected item also updates the matching creation colour; selecting an item alone
does not. These profiles use `GenericToolbar` and persist with the document.

Fixed colours live in `ColorPalette`, using names such as `RoyalBlue`, `MintGreen`
and `White`. CSS uses generated `--color-*` variables; HTML defaults and standalone
SVG assets use `{{ColorPalette.Name}}` references. The shared palette asset helper
generates the stylesheet and resolves those references during both builds and
development updates. Unknown names fail validation. User-selected colours remain
ordinary colour values in objects and `.limg` projects.

Toolbars only present tools. The Tools panel and QA Reporting (`AnnotationPanel`)
use the same `ToolButtonGroup`. The central drawing catalogue declares which
additional toolbar views offer each tool; `toolsForToolbar` derives the QA
buttons, labels and icons. Both views dispatch to `DrawingController.select`.
QA Reporting opens through the generic toolbar auto-open mode.

Its issue title, ticket URL, reproduction steps, expected/actual behaviour and
editable Markdown use `PersistentDocumentToolbar`, preserving the existing
`annotationToolbar` key and `.limg` version 1. Restoring partial older records
resets newly added fields to their defaults. `BugReportController` listens for
capture metadata edits through the generic `CanvasDocument.onToolbarStateChange`
event; session restoration remains on `onDocumentChange`, so report regeneration
cannot overwrite incoming saved fields. Every browser capture records the source
page and available capture details. These are included automatically in generated
Markdown. Report and annotated-image copying use `ClipboardController`.

`ContentLayerCanvas` draws the layers and the selection for every tool, adds
them to exports, keeps them aligned through crops and saves them with the
document. `LayerMerger` flattens layers into the image, both for the Layers
panel's Flatten action and before the image is resized or turned.
