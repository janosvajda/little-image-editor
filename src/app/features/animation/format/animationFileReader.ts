import { DocumentType, type DocumentSessionSnapshot } from '../../../core/document/appTypes';
import { ColorPalette } from '../../../core/document/colorPalette';
import { formatCssColor } from '../../../core/document/cssColor';
import { DEFAULT_IMAGE_FORMAT } from '../../../core/document/imageFormats';
import { PIXELS_PER_INCH } from '../../../core/document/measurementUnits';
import { type AffineMatrix, IDENTITY_MATRIX, matrixParts, multiplyMatrices, transformPoint } from '../../../core/geometry/affineMatrix';
import { FillRule, mapPathPoints, type PathContour, type PathNode } from '../../../core/geometry/vectorPath';
import { BlendMode, LayerOpacity } from '../../../core/layers/layerTypes';
import { canvasContext } from '../../../shared/dom/domHelpers';
import { type AnnotationObject, AnnotationObjectTypeId, type AnnotationState, type ContentLayer, LineDash, type PathAnnotation } from '../../annotations/annotationTypes';
import type { EditorDocumentState } from '../../files/documentState';
import { importItemSvg } from '../../files/svgImport';
import { embeddedPictureItem } from '../../files/svgPictures';
import type { AnimationTimeline, Keyframe, LayerTimeline, Tween } from '../animationTypes';
import { presentFrame } from '../frameEvaluation';
import { ANIMATION_FORMAT_ID, ANIMATION_FORMAT_VERSION } from './animationFileFormat';
import {
	type AnimationFile,
	animationFileSchema,
	type AnimItem,
	AnimItemKind,
	type AnimLayer,
	type Contour,
	FileFillRule,
	type Paint,
	PaintKind,
	PathCommandName,
	type PathItem,
} from './animationSchema';
import { CHILD_ID_SEPARATOR } from './itemConversion';
import { transformMatrix } from './evaluateFrame';

/** Why a file could not be opened, each problem said with where it is. */
export class AnimationFileError extends Error {
	constructor(readonly problems: readonly string[]) {
		super(problems.join('\n'));
	}
}

export const AnimationFileProblem = {
	NotJson: 'The file is not JSON.',
	NotAnimation: `The file is not an animation: its format is not "${ANIMATION_FORMAT_ID}".`,
	UnknownVersion: 'The file is an animation of a version this editor does not know',
} as const;

/** What opening a file could not keep for editing. */
export const AnimationReadWarning = {
	/** Symbol instances are not editable yet; they are left out. */
	InstancesLeftOut: 'instancesLeftOut',
} as const;
export type AnimationReadWarning = (typeof AnimationReadWarning)[keyof typeof AnimationReadWarning];

export interface AnimationReadResult {
	readonly state: EditorDocumentState;
	readonly warnings: readonly AnimationReadWarning[];
}

/** A quadratic curve as a cubic one: each cubic handle lies two thirds of the way to the quadratic control point. */
const QuadraticHandle = { Share: 2, Of: 3 } as const;
const QUADRATIC_TO_CUBIC = QuadraticHandle.Share / QuadraticHandle.Of;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const FIRST_STEP = 1;

/**
 * Reads and checks an animation file: JSON, of this format, of a version this
 * editor knows, and valid by the schema. Unknown fields are ignored.
 */
export function parseAnimationFile(text: string): AnimationFile {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new AnimationFileError([AnimationFileProblem.NotJson]);
	}
	const header = json as Partial<Record<'format' | 'version', unknown>> | null;
	if (header?.format !== ANIMATION_FORMAT_ID) throw new AnimationFileError([AnimationFileProblem.NotAnimation]);
	if (header.version !== ANIMATION_FORMAT_VERSION) throw new AnimationFileError([`${AnimationFileProblem.UnknownVersion}: ${String(header.version)}.`]);
	const parsed = animationFileSchema.safeParse(json);
	if (!parsed.success) throw new AnimationFileError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'file'}: ${issue.message}`));
	return parsed.data;
}

/** An animation file as the editor's document: its stage, layers and timeline, showing frame 0. */
export async function readAnimationDocument(text: string, baseName: string): Promise<AnimationReadResult> {
	const file = parseAnimationFile(text);
	const warnings = new Set<AnimationReadWarning>();
	const layers: ContentLayer[] = file.timeline.layers.map(contentLayer);
	const timelines: Record<string, LayerTimeline> = {};
	for (const layer of file.timeline.layers) timelines[layer.id] = await layerTimeline(layer, warnings);
	const animation: AnimationTimeline = { fps: file.stage.fps, playhead: 0, layers: timelines };
	const state: AnnotationState = presentFrame({ objects: [], layers, nextStep: nextStep(timelines), animation });
	return {
		state: { document: stageDocument(file, baseName), editableObjects: { state, history: [structuredClone(state)], historyIndex: 0 } },
		warnings: [...warnings],
	};
}

function contentLayer(layer: AnimLayer): ContentLayer {
	return {
		id: layer.id,
		name: layer.name,
		itemIds: [],
		...(layer.visible ? {} : { visible: false }),
		...(layer.locked ? { locked: true } : {}),
		...(layer.opacity === LayerOpacity.Opaque ? {} : { opacity: layer.opacity }),
		...(layer.blendMode === BlendMode.Normal ? {} : { blendMode: layer.blendMode }),
	};
}

async function layerTimeline(layer: AnimLayer, warnings: Set<AnimationReadWarning>): Promise<LayerTimeline> {
	const keyframes: Keyframe[] = [];
	for (const keyframe of layer.keyframes) {
		const items: AnnotationObject[] = [];
		for (const item of keyframe.items) items.push(...(await editorItems(item, warnings)));
		const tween: Tween | null = keyframe.tween && { ...keyframe.tween, ease: keyframe.tween.ease };
		keyframes.push({ frame: keyframe.frame, items, tween });
	}
	return { length: layer.length, keyframes };
}

/** A file item as editor items: from its editing data where it has it, otherwise from what it draws. */
async function editorItems(item: AnimItem, warnings: Set<AnimationReadWarning>): Promise<AnnotationObject[]> {
	const edited = item.editor ? await importItemSvg(item.editor).catch(() => null) : null;
	if (edited) return [{ ...edited, id: item.id }];
	return drawnItems(item, IDENTITY_MATRIX, 1, warnings);
}

/**
 * Items for what a file item draws, written by another program: paths,
 * text and pictures, placed where the file places them; a group's children
 * each become an item, by the ids the file gives them.
 */
async function drawnItems(item: AnimItem, parent: AffineMatrix, parentOpacity: number, warnings: Set<AnimationReadWarning>): Promise<AnnotationObject[]> {
	const matrix = multiplyMatrices(parent, transformMatrix(item.transform));
	const opacity = parentOpacity * item.opacity;
	const visibility = item.visible ? {} : { visible: false };
	switch (item.kind) {
		case AnimItemKind.Path:
			return [{ ...drawnPath(item, matrix, opacity), ...visibility }];
		case AnimItemKind.Text: {
			const { rotation, scaleY } = matrixParts(matrix);
			return [{ id: item.id, type: AnnotationObjectTypeId.Text, at: transformPoint(matrix, { x: 0, y: 0 }), text: item.text, color: formatCssColor(item.color), size: item.font.size * Math.abs(scaleY), ...(rotation ? { rotation } : {}), ...visibility }];
		}
		case AnimItemKind.Image: {
			const picture = await embeddedPictureItem({ href: `${PNG_DATA_URL_PREFIX}${item.png}`, box: { x: 0, y: 0, width: item.width, height: item.height }, keepsProportions: false, matrix, visible: item.visible });
			return picture ? [{ ...picture, id: item.id }] : [];
		}
		case AnimItemKind.Group: {
			const children: AnnotationObject[] = [];
			for (const child of item.items) children.push(...(await drawnItems({ ...child, id: `${item.id}${CHILD_ID_SEPARATOR}${child.id}`, visible: item.visible && child.visible }, matrix, opacity, warnings)));
			return children;
		}
		case AnimItemKind.Instance:
			warnings.add(AnimationReadWarning.InstancesLeftOut);
			return [];
	}
}

/** A file path as an editable path, its points placed by the matrix; a gradient becomes its first colour. */
function drawnPath(item: PathItem, matrix: AffineMatrix, opacity: number): PathAnnotation {
	const line = item.stroke ? paintColor(item.stroke.paint) : null;
	const fill = item.fill ? paintColor(item.fill) : null;
	return {
		id: item.id,
		type: AnnotationObjectTypeId.Path,
		contours: mapPathPoints(item.contours.map(editorContour), (point) => transformPoint(matrix, point)),
		color: line ?? fill ?? ColorPalette.Black,
		width: item.stroke ? item.stroke.width * Math.abs(matrixParts(matrix).scaleX) : 0,
		opacity,
		fill: fill !== null,
		...(fill && line ? { fillColor: fill } : {}),
		...(item.fillRule === FileFillRule.EvenOdd ? { fillRule: FillRule.EvenOdd } : {}),
		dash: item.stroke?.dash.length ? LineDash.Dashed : LineDash.Solid,
	};
}

/** A file contour as the editor's: nodes with their curve handles, quadratic curves made cubic. */
function editorContour(contour: Contour): PathContour {
	const nodes: PathNode[] = [];
	for (const command of contour.commands) {
		const last = nodes.at(-1);
		switch (command[0]) {
			case PathCommandName.Move:
			case PathCommandName.Line:
				nodes.push({ point: { x: command[1], y: command[2] } });
				break;
			case PathCommandName.Cubic:
				if (last) nodes[nodes.length - 1] = { ...last, out: { x: command[1], y: command[2] } };
				nodes.push({ point: { x: command[5], y: command[6] }, in: { x: command[3], y: command[4] } });
				break;
			case PathCommandName.Quadratic: {
				const start = last?.point ?? { x: command[1], y: command[2] };
				const control = { x: command[1], y: command[2] };
				const end = { x: command[3], y: command[4] };
				const toward = (from: { x: number; y: number }) => ({ x: from.x + (control.x - from.x) * QUADRATIC_TO_CUBIC, y: from.y + (control.y - from.y) * QUADRATIC_TO_CUBIC });
				if (last) nodes[nodes.length - 1] = { ...last, out: toward(start) };
				nodes.push({ point: end, in: toward(end) });
				break;
			}
			case PathCommandName.Close:
				break;
		}
	}
	// A closed contour that returns to its start ends on its first node, which closing already reaches.
	const first = nodes[0];
	const final = nodes.at(-1);
	if (contour.closed && first && final && nodes.length > 1 && final.point.x === first.point.x && final.point.y === first.point.y) {
		nodes[0] = { ...first, ...(final.in ? { in: final.in } : {}) };
		nodes.pop();
	}
	return { nodes, closed: contour.closed };
}

/** A paint as one colour: a gradient's first stop. */
function paintColor(paint: Paint): string {
	return formatCssColor(paint.kind === PaintKind.Solid ? paint.color : paint.stops[0]!.color);
}

/** The step a new numbered marker takes: after every marker the animation holds. */
function nextStep(timelines: Readonly<Record<string, LayerTimeline>>): number {
	const values = Object.values(timelines).flatMap(({ keyframes }) => keyframes.flatMap(({ items }) => items.flatMap((item) => (item.type === AnnotationObjectTypeId.Step ? [item.value] : []))));
	return values.length ? Math.max(...values) + 1 : FIRST_STEP;
}

/** The stage as the document's image: its size, filled with its background. */
function stageDocument(file: AnimationFile, baseName: string): DocumentSessionSnapshot {
	const { width, height, background } = file.stage;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvasContext(canvas);
	if (background) {
		context.fillStyle = formatCssColor(background);
		context.fillRect(0, 0, width, height);
	}
	return {
		width,
		height,
		pixels: context.getImageData(0, 0, width, height).data,
		baseName,
		savedType: DEFAULT_IMAGE_FORMAT.mimeType,
		resolution: PIXELS_PER_INCH,
		history: [],
		historyIndex: 0,
		documentType: DocumentType.Animation,
	};
}
