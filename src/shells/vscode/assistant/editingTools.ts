import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ShapeToolId } from '../../../app/core/document/appTypes';
import { MAX_CANVAS_DIMENSION } from '../../../app/core/geometry/geometryHelpers';
import {
	type AssistantCommand,
	AssistantCommandKind,
	type AssistantResult,
	type BoxShape,
} from '../../../app/features/assistant/assistantCommandTypes';
import type { EditableImages } from './openImages';

export const EditingTool = {
	CreateImage: 'create_image',
	DescribeImage: 'describe_image',
	AddLayer: 'add_layer',
	AddShape: 'add_shape',
	AddLine: 'add_line',
	AddText: 'add_text',
	RemoveItem: 'remove_item',
	Undo: 'undo',
} as const;

const MAX_STROKE_WIDTH = 200;
const MAX_FONT_SIZE = 1000;
const DefaultStyle = {
	Background: '#ffffff',
	StrokeWidth: 4,
	Opacity: 1,
	FontSize: 32,
} as const;
const BOX_SHAPES = Object.values(ShapeToolId).filter(
	(shape): shape is BoxShape => shape !== ShapeToolId.Line && shape !== ShapeToolId.Arrow,
) as [BoxShape, ...BoxShape[]];
const JSON_INDENT = 2;

const hexColor = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/)
	.describe('A colour as #rrggbb, for example #d62828.');
const coordinate = z.number().describe('In image pixels; 0,0 is the top left corner.');
const imageChoice = z
	.string()
	.optional()
	.describe('The id or file name from list_images; leave out for the active image.');
const layerChoice = z
	.string()
	.optional()
	.describe(
		'The layer to draw on, by id or name. Leave out to use the active layer; with only the image active, a new layer is made.',
	);
const opacity = z.number().min(0).max(1).default(DefaultStyle.Opacity).describe('From 0, invisible, to 1, solid.');

/**
 * Tools that let an assistant draw in the editor: create images, add
 * layers, shapes, lines and text, and undo. Every change is one undo step
 * in the editor and saves with the document, `.limg` projects included.
 */
export function registerEditingTools(server: McpServer, images: EditableImages): void {
	const run = (image: string | undefined, command: AssistantCommand) =>
		outcome(() => images.command(image, command));

	server.registerTool(
		EditingTool.CreateImage,
		{
			title: 'Create a new image',
			description:
				'Opens a new, unsaved image in Little Image Editor and makes it the active image. Draw on it with the other tools; the user saves it with Cmd/Ctrl+S, and the file name they choose decides the format (.png, .jpg, .webp, or .limg to keep layers editable).',
			inputSchema: {
				name: z.string().optional().describe('The file name, for example apple.png; Untitled by default.'),
				width: z.number().int().min(1).max(MAX_CANVAS_DIMENSION),
				height: z.number().int().min(1).max(MAX_CANVAS_DIMENSION),
				background: hexColor.default(DefaultStyle.Background),
				transparent: z.boolean().default(false).describe('A transparent background instead of the colour.'),
			},
		},
		({ name, width, height, background, transparent }) =>
			outcome(() => images.create(name, { width, height, background, transparent })),
	);
	server.registerTool(
		EditingTool.DescribeImage,
		{
			title: 'Describe the layers of an image',
			description:
				"Lists an image's size and its layers, bottom first, with each layer's items (type, shape, text, colour and bounds) and their ids. Use it before editing an existing image.",
			inputSchema: { image: imageChoice },
			annotations: { readOnlyHint: true },
		},
		({ image }) => run(image, { kind: AssistantCommandKind.Describe }),
	);
	server.registerTool(
		EditingTool.AddLayer,
		{
			title: 'Add a layer',
			description:
				'Adds an empty layer above the active layer and makes it active, so the next items go on it.',
			inputSchema: { image: imageChoice, name: z.string().optional().describe('The layer name, for example Apple.') },
		},
		({ image, name }) => run(image, { kind: AssistantCommandKind.AddLayer, ...(name ? { name } : {}) }),
	);
	server.registerTool(
		EditingTool.AddShape,
		{
			title: 'Add a shape',
			description:
				'Draws a shape inside a rectangle, on top of a layer. An ellipse with equal width and height is a circle. Later items cover earlier ones.',
			inputSchema: {
				image: imageChoice,
				layer: layerChoice,
				shape: z.enum(BOX_SHAPES),
				x: coordinate,
				y: coordinate,
				width: z.number().positive(),
				height: z.number().positive(),
				color: hexColor,
				fill: z.boolean().default(true).describe('Filled with the colour; false draws only the outline.'),
				stroke_width: z.number().positive().max(MAX_STROKE_WIDTH).default(DefaultStyle.StrokeWidth),
				opacity,
				rotation: z.number().default(0).describe('Degrees, clockwise, around the shape centre.'),
			},
		},
		({ image, layer, shape, x, y, width, height, color, fill, stroke_width, opacity, rotation }) =>
			run(image, {
				kind: AssistantCommandKind.AddShape,
				...(layer ? { layer } : {}),
				shape,
				rect: { x, y, width, height },
				color,
				fill,
				strokeWidth: stroke_width,
				opacity,
				rotation,
			}),
	);
	server.registerTool(
		EditingTool.AddLine,
		{
			title: 'Add a line or arrow',
			description: 'Draws a straight line between two points, with an arrowhead at the end when asked.',
			inputSchema: {
				image: imageChoice,
				layer: layerChoice,
				from_x: coordinate,
				from_y: coordinate,
				to_x: coordinate,
				to_y: coordinate,
				arrow: z.boolean().default(false),
				color: hexColor,
				width: z.number().positive().max(MAX_STROKE_WIDTH).default(DefaultStyle.StrokeWidth),
				opacity,
			},
		},
		({ image, layer, from_x, from_y, to_x, to_y, arrow, color, width, opacity }) =>
			run(image, {
				kind: AssistantCommandKind.AddLine,
				...(layer ? { layer } : {}),
				from: { x: from_x, y: from_y },
				to: { x: to_x, y: to_y },
				arrow,
				color,
				width,
				opacity,
			}),
	);
	server.registerTool(
		EditingTool.AddText,
		{
			title: 'Add text',
			description: 'Writes text with its top left corner at a point; the user can edit it in the editor afterwards.',
			inputSchema: {
				image: imageChoice,
				layer: layerChoice,
				text: z.string().min(1),
				x: coordinate,
				y: coordinate,
				color: hexColor,
				size: z.number().positive().max(MAX_FONT_SIZE).default(DefaultStyle.FontSize).describe('Font size in pixels.'),
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
			title: 'Remove an item',
			description: 'Removes one item, by the id describe_image or an add tool returned.',
			inputSchema: { image: imageChoice, item: z.string() },
			annotations: { destructiveHint: true },
		},
		({ image, item }) => run(image, { kind: AssistantCommandKind.RemoveItem, item }),
	);
	server.registerTool(
		EditingTool.Undo,
		{
			title: 'Undo',
			description: "Undoes the image's last change, as Cmd/Ctrl+Z in the editor does.",
			inputSchema: { image: imageChoice },
		},
		({ image }) => run(image, { kind: AssistantCommandKind.Undo }),
	);
}

/** The result as JSON text, or the reason it failed as a tool error. */
async function outcome(action: () => Promise<AssistantResult | object>): Promise<CallToolResult> {
	try {
		return { content: [{ type: 'text', text: JSON.stringify(await action(), null, JSON_INDENT) }] };
	} catch (error) {
		return {
			content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
			isError: true,
		};
	}
}
