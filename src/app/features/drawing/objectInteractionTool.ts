import {
	type Point,
	type Tool,
	UtilityToolId,
} from '../../core/document/appTypes';
import { genericShape } from '../../core/geometry/genericShape';
import { DEFAULT_SHAPE_INTERACTION } from '../../core/geometry/shapeInteraction';
import {
	type ShapeHandle,
	ShapeHandleId,
	type TransformableGeometry,
} from '../../core/geometry/shapeTransformHelpers';
import type { AnnotationDocument } from '../annotations/annotationDocument';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import type { RasterSelection } from '../selection/rasterSelection';
import { drawingToolBehavior, isShapeTool } from './drawingToolBehavior';
import { ClickOrDragGesture } from './gestures/clickOrDragGesture';
import type { DrawingGesture } from './gestures/drawingGesture';
import {
	ObjectTransformGesture,
	ObjectTransformKind,
} from './gestures/objectTransformGesture';
import { LayerTransformGesture } from './gestures/layerTransformGesture';
import { RasterSelectionGesture } from './gestures/rasterSelectionGesture';

/** What a Select-tool press acts on, in priority order. */
const SelectTargetKind = {
	/** A corner handle, or the rotation band, of the selected item. */
	Handle: 'handle',
	/**
	 * A whole layer: the selected layer's frame, corner or rotation band, or the
	 * layer of an item pressed outside the current selection.
	 */
	Layer: 'layer',
	/** Another item of the selected item's layer; it becomes the selection. */
	Item: 'item',
	/** The selected item, pressed inside its frame where no other item is. */
	Selected: 'selected',
} as const;
type SelectTarget =
	| {
			readonly kind: typeof SelectTargetKind.Handle;
			readonly item: AnnotationObject;
			readonly handle: ShapeHandle;
	  }
	| {
			readonly kind: typeof SelectTargetKind.Layer;
			readonly layerId: string;
			readonly frame: TransformableGeometry;
			/** `null` moves the layer from inside its frame. */
			readonly handle: ShapeHandle | null;
	  }
	| { readonly kind: typeof SelectTargetKind.Item; readonly item: AnnotationObject }
	| { readonly kind: typeof SelectTargetKind.Selected; readonly item: AnnotationObject };

/**
 * Item and layer selection and transforms. The Select tool works layer
 * first: pressing an item selects its whole layer, which moves from inside
 * its frame, resizes from the corners and rotates from just outside. A click
 * on an item of the selected layer drills in to that item, and items next to
 * a selected item are picked directly; a double-click goes straight to an
 * item. Shape tools move and resize the shape they selected, so drawing next
 * to it never turns it. Paint tools never transform.
 */
export class ObjectInteractionTool {
	constructor(
		private readonly objects?: AnnotationDocument,
		private readonly rasterSelection?: RasterSelection,
	) {}

	begin(
		tool: Tool,
		point: Point,
		visualScale: number,
		shapeDraft: DrawingGesture | null,
	): DrawingGesture | null {
		if (!this.objects) return null;
		if (tool === UtilityToolId.Select)
			return this.beginSelect(point, visualScale);
		if (tool === UtilityToolId.Crop) return this.moveCutFragment(point);
		if (!shapeDraft) return null;
		return (
			this.selectedShapeTransform(point, visualScale) ??
			this.selectShapeOnClick(point, shapeDraft)
		);
	}

	cursor(tool: Tool, point: Point, visualScale: number): string {
		const defaultCursor = drawingToolBehavior(tool).cursor;
		if (tool === UtilityToolId.Crop)
			return this.cutFragmentAt(point) ? 'move' : 'crosshair';
		if (isShapeTool(tool))
			return this.selectedShapeCursor(point, visualScale) ?? defaultCursor;
		if (tool !== UtilityToolId.Select) return defaultCursor;
		const target = this.selectTarget(point, visualScale);
		if (!target) return defaultCursor;
		if (target.kind === SelectTargetKind.Handle)
			return genericShape(target.item).handleCursorAt(point, visualScale) ?? defaultCursor;
		if (target.kind === SelectTargetKind.Layer && target.handle)
			return (
				DEFAULT_SHAPE_INTERACTION.handleCursor(target.frame, point, visualScale) ??
				defaultCursor
			);
		return 'move';
	}

	private beginSelect(point: Point, visualScale: number): DrawingGesture | null {
		if (!this.objects) return null;
		const target = this.selectTarget(point, visualScale);
		const hitId = this.objects.hitTest(point)?.id ?? null;
		switch (target?.kind) {
			case SelectTargetKind.Handle:
				return new ObjectTransformGesture(this.objects, target.item.id, point, {
					kind: ObjectTransformKind.Handle,
					handle: target.handle,
					clickTargetId: hitId,
				});
			case SelectTargetKind.Layer: {
				// The first press selects the layer; a click on it again drills in to the item.
				const entering = this.objects.selectedLayer?.id !== target.layerId;
				if (entering) {
					this.rasterSelection?.clear();
					this.objects.selectLayer(target.layerId);
				}
				return new LayerTransformGesture(
					this.objects,
					target.layerId,
					target.frame,
					point,
					target.handle,
					entering ? null : hitId,
				);
			}
			case SelectTargetKind.Item:
				return this.selectAndMove(target.item, point);
			case SelectTargetKind.Selected:
				return new ObjectTransformGesture(this.objects, target.item.id, point, {
					kind: ObjectTransformKind.Move,
					clickTargetId: hitId ?? undefined,
				});
			default:
				// Where no item is under the pointer, the image is what was clicked.
				this.objects.activate(null);
				return this.rasterSelection
					? new RasterSelectionGesture(this.rasterSelection, point)
					: null;
		}
	}

	/** Decides what a Select-tool press at `point` acts on; the cursor shows the same. */
	private selectTarget(point: Point, visualScale: number): SelectTarget | null {
		const selected = this.editableSelection();
		const handle = selected
			? genericShape(selected).hitHandle(point, visualScale)
			: null;
		if (selected && handle && handle !== ShapeHandleId.Rotate)
			return { kind: SelectTargetKind.Handle, item: selected, handle };
		const layer = this.selectedLayerTarget(point, visualScale);
		if (layer && layer.handle !== ShapeHandleId.Rotate) return layer;
		const hit = this.editableHit(point);
		// Items of a selected layer are part of that selection, not new targets.
		const inSelectedLayer =
			hit !== null && layer !== null && this.objects?.layerOf(hit.id)?.id === layer.layerId;
		if (hit && hit.id !== selected?.id && !inSelectedLayer)
			return this.besideSelected(hit, selected)
				? { kind: SelectTargetKind.Item, item: hit }
				: (this.layerOfItemTarget(hit) ?? { kind: SelectTargetKind.Item, item: hit });
		if (layer) return layer;
		const selectedTarget = selected
			? this.selectedItemTarget(selected, handle, hit, point)
			: null;
		return selectedTarget ?? (hit ? { kind: SelectTargetKind.Item, item: hit } : null);
	}

	/** The selected item's rotation band, or its frame where no other item is. */
	private selectedItemTarget(
		selected: AnnotationObject,
		handle: ShapeHandle | null,
		hit: AnnotationObject | null,
		point: Point,
	): SelectTarget | null {
		if (handle) return { kind: SelectTargetKind.Handle, item: selected, handle };
		// An empty part of a cut piece's frame is left for a new selection.
		const emptyCutPiece =
			!hit && selected.type === AnnotationObjectTypeId.RasterFragment;
		return genericShape(selected).contains(point) && !emptyCutPiece
			? { kind: SelectTargetKind.Selected, item: selected }
			: null;
	}

	/** Whether an item shares the layer of the selected item, so it is picked on its own. */
	private besideSelected(
		item: AnnotationObject,
		selected: AnnotationObject | null,
	): boolean {
		return (
			selected !== null &&
			this.objects?.layerOf(item.id) === this.objects?.layerOf(selected.id)
		);
	}

	/** The whole layer of an item, to be selected and dragged from inside its frame. */
	private layerOfItemTarget(
		item: AnnotationObject,
	): Extract<SelectTarget, { kind: typeof SelectTargetKind.Layer }> | null {
		const layer = this.objects?.layerOf(item.id);
		const frame = layer ? this.objects?.layerFrame(layer.id) : null;
		return layer && frame && this.objects?.isLayerEditable(layer.id)
			? { kind: SelectTargetKind.Layer, layerId: layer.id, frame, handle: null }
			: null;
	}

	private editableHit(point: Point): AnnotationObject | null {
		const hit = this.objects?.hitTest(point) ?? null;
		return hit && this.objects?.isEditable(hit.id) ? hit : null;
	}

	/** Corner handles resize the selected shape; dragging the shape itself moves it. */
	private selectedShapeTransform(
		point: Point,
		visualScale: number,
	): DrawingGesture | null {
		const selected = this.selectedShape();
		if (!this.objects || !selected) return null;
		const handle = genericShape(selected).hitHandle(point, visualScale);
		if (handle && handle !== ShapeHandleId.Rotate)
			return new ObjectTransformGesture(this.objects, selected.id, point, {
				kind: ObjectTransformKind.Handle,
				handle,
			});
		return this.objects.hitTest(point)?.id === selected.id
			? new ObjectTransformGesture(this.objects, selected.id, point, {
					kind: ObjectTransformKind.Move,
				})
			: null;
	}

	private selectedShapeCursor(point: Point, visualScale: number): string | null {
		const selected = this.selectedShape();
		if (!selected) return null;
		const shape = genericShape(selected);
		const handle = shape.hitHandle(point, visualScale);
		if (handle && handle !== ShapeHandleId.Rotate)
			return shape.handleCursorAt(point, visualScale);
		return this.objects?.hitTest(point)?.id === selected.id ? 'move' : null;
	}

	/** The selected layer's frame under the pointer: a corner, the rotation band or inside. */
	private selectedLayerTarget(
		point: Point,
		visualScale: number,
	): Extract<SelectTarget, { kind: typeof SelectTargetKind.Layer }> | null {
		const layer = this.objects?.selectedLayer;
		if (!layer || !this.objects?.isLayerEditable(layer.id)) return null;
		const frame = this.objects.layerFrame(layer.id);
		if (!frame) return null;
		const handle = DEFAULT_SHAPE_INTERACTION.hitHandle(frame, point, visualScale);
		if (!handle && !DEFAULT_SHAPE_INTERACTION.contains(frame, point, 0)) return null;
		return { kind: SelectTargetKind.Layer, layerId: layer.id, frame, handle };
	}

	/** Pressing an item selects it, and its layer, and lets the same drag move it. */
	private selectAndMove(item: AnnotationObject, point: Point): DrawingGesture | null {
		if (!this.objects) return null;
		this.rasterSelection?.clear();
		this.objects.select(item.id);
		return new ObjectTransformGesture(this.objects, item.id, point, {
			kind: ObjectTransformKind.Move,
		});
	}

	/** A cut piece stays movable with the Crop tool, so cuts can be placed at once. */
	private moveCutFragment(point: Point): DrawingGesture | null {
		const fragment = this.cutFragmentAt(point);
		return this.objects && fragment
			? new ObjectTransformGesture(this.objects, fragment.id, point, {
					kind: ObjectTransformKind.Move,
				})
			: null;
	}

	/** Shape tools select an existing shape on click and draw a new one on drag. */
	private selectShapeOnClick(
		point: Point,
		shapeDraft: DrawingGesture,
	): DrawingGesture | null {
		const hit = this.objects?.hitTest(point);
		if (
			!hit ||
			hit.type !== AnnotationObjectTypeId.Shape ||
			!this.objects?.isEditable(hit.id)
		)
			return null;
		this.rasterSelection?.clear();
		return new ClickOrDragGesture(point, shapeDraft, () =>
			this.objects?.select(hit.id),
		);
	}

	private cutFragmentAt(point: Point): AnnotationObject | null {
		const selected = this.editableSelection();
		return selected?.type === AnnotationObjectTypeId.RasterFragment &&
			genericShape(selected).contains(point)
			? selected
			: null;
	}

	private selectedShape(): AnnotationObject | null {
		const selected = this.editableSelection();
		return selected?.type === AnnotationObjectTypeId.Shape ? selected : null;
	}

	private editableSelection(): AnnotationObject | null {
		const selected = this.objects?.selected ?? null;
		return selected && this.objects?.isEditable(selected.id) ? selected : null;
	}
}
