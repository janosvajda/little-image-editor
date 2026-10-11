import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MAX_CANVAS_DIMENSION } from '../../../app/core/geometry/geometryHelpers';
import {
	type AssistantCommand,
	AssistantCommandKind,
	BOX_SHAPES,
	DrawingDefault,
} from '../../../app/features/assistant/assistantCommandTypes';
import { type DrawScript, parseDrawScript } from '../../../app/features/assistant/drawScript';
import { LineEnd } from '../../../app/features/annotations/lineEnd';
import { DIAGRAM_IMAGE_NAME, type DiagramDrawing, diagramImageSpec, drawMermaidDiagram } from '../../../app/features/diagrams/diagramDrawing';
import type { EditableImages } from './openImages';
import { describeResult, jsonOutcome, outcome } from './toolResults';

export const EditingTool = {
	CreateImage: 'create_image',
	DescribeImage: 'describe_image',
	AddLayer: 'add_layer',
	AddShape: 'add_shape',
	AddLine: 'add_line',
	AddText: 'add_text',
	RemoveItem: 'remove_item',
	Undo: 'undo',
	Draw: 'draw',
} as const;

const MAX_STROKE_WIDTH = 200;
const MAX_FONT_SIZE = 1000;
const NOTHING_TO_DRAW_MESSAGE = 'Give draw a script, a diagram, or both.';
/** A batch step's number, which the editor reports when that step fails. */
const FAILED_STEP = /^Step (\d+): /;

/**
 * Descriptions are kept short: every connected assistant reads them in each
 * conversation, so their length costs tokens even when nothing is drawn.
 */
const DRAW_DESCRIPTION = `Draws a whole picture in one call as ONE undo step; prefer it over the add_* tools. Give a script, a diagram, or both.
diagram: Mermaid flowchart, stateDiagram-v2, classDiagram or sequenceDiagram, laid out automatically. Use it for architecture, flow, state, class and sequence diagrams; without image it opens a new image sized to fit, named by name.
script: one statement per line, checked before drawing; x,y is a top left corner, except for text:
image apple.png 512x512 #ffffff   (optional first line: new image; or transparent)
layer Apple                       (new layer; following items go on it)
use Circles                       (draw on an existing layer)
circle 40,40 110 #3a86ff          (diameter)
ellipse 150,215 125x195 #d62828 rotate 20 opacity 0.8
rect 10,10 80x40 #222222 outline 3   (also roundrect triangle diamond star; outline = not filled; fill #ffffff = filled under the outline)
arrow 10,10 200,120 #000000 width 6  (also line; extra points are bends: arrow 10,10 100,10 100,80 #000000; dashed; head/tail triangle|diamond|filledDiamond|openArrow|circle|cross)
text 20,60 #000000 size 48 "Hello"   (x,y = left end of the baseline)
// comment`;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe('#rrggbb');
const imageChoice = z.string().optional().describe('Image id or name; default: active image.');
const layerChoice = z.string().optional().describe('Layer id or name; default: active layer.');
const opacity = z.number().min(0).max(1).default(DrawingDefault.Opacity);
const lineEnd = z.enum(Object.values(LineEnd) as [LineEnd, ...LineEnd[]]).optional();

/** Tools that draw in the editor; every change is an undo step and saves with the document. */
export function registerEditingTools(server: McpServer, images: EditableImages): void {
	const run = (image: string | undefined, command: AssistantCommand) =>
		outcome(async () => describeResult(await images.command(image, command)));

	server.registerTool(
		EditingTool.CreateImage,
		{
			description: 'Opens a new unsaved image and makes it active. The user saves it; the file name decides the format.',
			inputSchema: {
				name: z.string().optional().describe('File name, e.g. apple.png.'),
				width: z.number().int().min(1).max(MAX_CANVAS_DIMENSION),
				height: z.number().int().min(1).max(MAX_CANVAS_DIMENSION),
				background: hexColor.default(DrawingDefault.Background),
				transparent: z.boolean().default(false),
			},
		},
		({ name, width, height, background, transparent }) =>
			jsonOutcome(() => images.create(name, { width, height, background, transparent })),
	);
	server.registerTool(
		EditingTool.DescribeImage,
		{
			description: "Lists the image's layers (bottom first) and their items with short ids, colours and bounds.",
			inputSchema: { image: imageChoice },
			annotations: { readOnlyHint: true },
		},
		({ image }) => run(image, { kind: AssistantCommandKind.Describe }),
	);
	server.registerTool(
		EditingTool.AddLayer,
		{
			description: 'Adds a layer above the active one and makes it active.',
			inputSchema: { image: imageChoice, name: z.string().optional() },
		},
		({ image, name }) => run(image, { kind: AssistantCommandKind.AddLayer, ...(name ? { name } : {}) }),
	);
	server.registerTool(
		EditingTool.AddShape,
		{
			description: 'Draws one shape in a rectangle (x,y top left). For several items use draw.',
			inputSchema: {
				image: imageChoice,
				layer: layerChoice,
				shape: z.enum(BOX_SHAPES),
				x: z.number(),
				y: z.number(),
				width: z.number().positive(),
				height: z.number().positive(),
				color: hexColor,
				fill: z.boolean().default(true),
				fill_color: hexColor.optional().describe('Fill under an outline in color.'),
				stroke_width: z.number().positive().max(MAX_STROKE_WIDTH).default(DrawingDefault.StrokeWidth),
				opacity,
				rotation: z.number().default(0).describe('Degrees clockwise.'),
			},
		},
		({ image, layer, shape, x, y, width, height, color, fill, fill_color, stroke_width, opacity, rotation }) =>
			run(image, {
				kind: AssistantCommandKind.AddShape,
				...(layer ? { layer } : {}),
				shape,
				rect: { x, y, width, height },
				color,
				fill,
				...(fill && fill_color ? { fillColor: fill_color } : {}),
				strokeWidth: stroke_width,
				opacity,
				rotation,
			}),
	);
	server.registerTool(
		EditingTool.AddLine,
		{
			description: 'Draws one line, or an arrow ending at to; via adds bends, and the line stays one item.',
			inputSchema: {
				image: imageChoice,
				layer: layerChoice,
				from_x: z.number(),
				from_y: z.number(),
				to_x: z.number(),
				to_y: z.number(),
				via: z.array(z.object({ x: z.number(), y: z.number() })).optional().describe('Bends between from and to.'),
				arrow: z.boolean().default(false),
				dashed: z.boolean().optional(),
				head: lineEnd.describe('End at to; overrides arrow.'),
				tail: lineEnd.describe('End at from.'),
				color: hexColor,
				width: z.number().positive().max(MAX_STROKE_WIDTH).default(DrawingDefault.StrokeWidth),
				opacity,
			},
		},
		({ image, layer, from_x, from_y, to_x, to_y, via, arrow, dashed, head, tail, color, width, opacity }) =>
			run(image, {
				kind: AssistantCommandKind.AddLine,
				...(layer ? { layer } : {}),
				from: { x: from_x, y: from_y },
				...(via?.length ? { via } : {}),
				to: { x: to_x, y: to_y },
				arrow,
				color,
				width,
				opacity,
				...(dashed ? { dashed } : {}),
				...(head ? { head } : {}),
				...(tail ? { tail } : {}),
			}),
	);
	server.registerTool(
		EditingTool.AddText,
		{
			description: 'Writes one text; x,y is the left end of its baseline (the letters sit on y).',
			inputSchema: {
				image: imageChoice,
				layer: layerChoice,
				text: z.string().min(1),
				x: z.number(),
				y: z.number(),
				color: hexColor,
				size: z.number().positive().max(MAX_FONT_SIZE).default(DrawingDefault.FontSize),
			},
		},
		({ image, layer, text, x, y, color, size }) =>
			run(image, {
				kind: AssistantCommandKind.AddText,
				...(layer ? { layer } : {}),
				at: { x, y },
				text,
				color,
				size,
			}),
	);
	server.registerTool(
		EditingTool.RemoveItem,
		{
			description: 'Removes one item by its id.',
			inputSchema: { image: imageChoice, item: z.string() },
			annotations: { destructiveHint: true },
		},
		({ image, item }) => run(image, { kind: AssistantCommandKind.RemoveItem, item }),
	);
	server.registerTool(
		EditingTool.Undo,
		{
			description: 'Undoes the last change, like Cmd/Ctrl+Z; a whole draw call is one change.',
			inputSchema: { image: imageChoice },
		},
		({ image }) => run(image, { kind: AssistantCommandKind.Undo }),
	);
	server.registerTool(
		EditingTool.Draw,
		{
			description: DRAW_DESCRIPTION,
			inputSchema: {
				image: imageChoice,
				script: z.string().optional(),
				diagram: z.string().optional().describe('Mermaid diagram source.'),
				name: z.string().optional().describe('File name of the image a diagram opens.'),
			},
		},
		(request) => outcome(() => draw(images, request)),
	);
}

interface DrawRequest {
	readonly image?: string;
	readonly script?: string;
	readonly diagram?: string;
	readonly name?: string;
}

/**
 * Draws a diagram and a script as one batch: the diagram first, laid out by
 * the shared diagram code, then the script on top. A new image is opened when
 * the script starts with one, or for a diagram when no image is named.
 */
async function draw(images: EditableImages, request: DrawRequest): Promise<string> {
	const script = hasText(request.script) ? parseDrawScript(request.script!) : undefined;
	const diagram = hasText(request.diagram) ? diagramDrawing(request.diagram!) : undefined;
	if (!script && !diagram) throw new Error(NOTHING_TO_DRAW_MESSAGE);
	const newImage = imageToOpen(request, script, diagram);
	const target = newImage ? (await images.create(newImage.name, newImage.spec)).id : request.image;
	const created = newImage ? `created ${newImage.name}; ` : '';
	const commands = [...(diagram?.commands ?? []), ...(script?.commands ?? [])];
	if (!commands.length) return `ok: ${created}nothing else to draw`;
	// Diagram steps have no script line; their errors keep the editor's own wording.
	const lines = [...(diagram?.commands.map(() => undefined) ?? []), ...(script?.lines ?? [])];
	try {
		const result = await images.command(target, { kind: AssistantCommandKind.Batch, commands });
		return describeResult(result).replace(/^ok: /, `ok: ${created}`);
	} catch (error) {
		throw new Error(`${pointAtLine(error, lines)} Nothing was drawn.`);
	}
}

/** The image to open first: the one the script names, or one sized to a diagram when no image is given. */
function imageToOpen(request: DrawRequest, script: DrawScript | undefined, diagram: DiagramDrawing | undefined): DrawScript['image'] {
	if (script?.image) return script.image;
	if (!diagram || request.image) return undefined;
	return {
		name: request.name ?? DIAGRAM_IMAGE_NAME,
		spec: diagramImageSpec(diagram),
	};
}

function hasText(value: string | undefined): boolean {
	return Boolean(value?.trim());
}

/** A diagram's drawing, with its syntax errors named as the diagram's. */
function diagramDrawing(source: string): DiagramDrawing {
	try {
		return drawMermaidDiagram(source);
	} catch (error) {
		throw new Error(`Diagram: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** The editor names a failed batch step; the assistant knows the script by its lines. */
function pointAtLine(error: unknown, lines: readonly (number | undefined)[]): string {
	const message = error instanceof Error ? error.message : String(error);
	const step = FAILED_STEP.exec(message);
	const line = step ? lines[Number(step[1]) - 1] : undefined;
	return line ? message.replace(FAILED_STEP, `Line ${line}: `) : message;
}
