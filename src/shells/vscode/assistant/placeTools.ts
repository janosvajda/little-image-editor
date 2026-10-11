import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ImagePlacementRequest, PlaceableImages } from './openImages';
import { describeResult, outcome } from './toolResults';

export const PlaceTool = { Image: 'place_image' } as const;

/** Puts a picture file from the workspace on an image, as one movable, editable item. */
export function registerPlaceTools(server: McpServer, images: PlaceableImages): void {
	server.registerTool(
		PlaceTool.Image,
		{
			description:
				'Places a PNG, JPEG, WebP or SVG file from the workspace on the image as one movable item, centred and fitted unless x, y or a size is given.',
			inputSchema: {
				image: z.string().optional().describe('Image id or name; default: active image.'),
				path: z.string().min(1).describe('Picture path in the workspace, e.g. assets/logo.svg.'),
				workspace: z.string().optional().describe('Workspace folder, for multi-root workspaces.'),
				layer: z.string().optional().describe('Layer id or name; default: active layer.'),
				x: z.number().optional(),
				y: z.number().optional(),
				width: z.number().positive().optional().describe('Height follows the picture unless given.'),
				height: z.number().positive().optional(),
			},
			annotations: { openWorldHint: false },
		},
		({ image, ...request }) => outcome(async () => describeResult(await images.place(image, placementRequest(request)))),
	);
}

interface PlaceArguments {
	readonly path: string;
	readonly workspace?: string;
	readonly layer?: string;
	readonly x?: number;
	readonly y?: number;
	readonly width?: number;
	readonly height?: number;
}

/** The tool's arguments as a placement: a corner only when both x and y are given. */
function placementRequest({ path, workspace, layer, x, y, width, height }: PlaceArguments): ImagePlacementRequest {
	return {
		path,
		...(workspace ? { workspace } : {}),
		...(layer ? { layer } : {}),
		...(x !== undefined && y !== undefined ? { at: { x, y } } : {}),
		...(width ? { width } : {}),
		...(height ? { height } : {}),
	};
}
