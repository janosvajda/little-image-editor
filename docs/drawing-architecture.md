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
