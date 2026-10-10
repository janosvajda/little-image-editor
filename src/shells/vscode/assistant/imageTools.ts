import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { registerEditingTools } from './editingTools';
import { canEdit, type OpenImages } from './openImages';

export const ImageTool = {
	List: 'list_images',
	View: 'view_image',
} as const;

const PictureSize = {
	/** About what vision models look at without scaling the picture down again. */
	Default: 1568,
	Minimum: 64,
	Maximum: 4096,
} as const;
const PNG_MIME_TYPE = 'image/png';
const BASE64 = 'base64';
const NO_IMAGES_MESSAGE =
	'No image is open in Little Image Editor. Open an image or a .limg project in VS Code with Little Image Editor first.';

/** The server's name and version, as an assistant's client lists them. */
export interface ImageToolsIdentity {
	readonly name: string;
	readonly version: string;
}

/** The tools that let an assistant see the images open in the editor. */
export function createImageToolServer(images: OpenImages, identity: ImageToolsIdentity): McpServer {
	const server = new McpServer(identity);
	server.registerTool(
		ImageTool.List,
		{
			title: 'List open images',
			description:
				'Lists the images and .limg projects open in Little Image Editor in VS Code, with the id to pass to the other tools. The active one is where the user is working.',
			annotations: { readOnlyHint: true },
		},
		() => {
			const open = images.list();
			return textResult(open.length ? JSON.stringify(open, null, 2) : NO_IMAGES_MESSAGE);
		},
	);
	server.registerTool(
		ImageTool.View,
		{
			title: 'View an open image',
			description:
				'Returns a picture of an image open in Little Image Editor: every visible layer and object, as the user sees it. Without an image id or name it shows the active image.',
			inputSchema: {
				image: z
					.string()
					.optional()
					.describe('The id or file name from list_images; leave out for the active image.'),
				max_size: z
					.number()
					.int()
					.min(PictureSize.Minimum)
					.max(PictureSize.Maximum)
					.optional()
					.describe(`The picture's longer side in pixels, ${PictureSize.Default} by default; a smaller image keeps its own size.`),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ image, max_size }) => {
			try {
				const view = await images.view(image, max_size ?? PictureSize.Default);
				return {
					content: [
						{ type: 'image', data: Buffer.from(view.png).toString(BASE64), mimeType: PNG_MIME_TYPE },
						{
							type: 'text',
							text: `${view.name}: ${view.imageWidth} × ${view.imageHeight} px, shown at ${view.width} × ${view.height} px.`,
						},
					],
				};
			} catch (error) {
				return textResult(error instanceof Error ? error.message : String(error), true);
			}
		},
	);
	if (canEdit(images)) registerEditingTools(server, images);
	return server;
}

function textResult(text: string, isError = false): CallToolResult {
	return { content: [{ type: 'text', text }], isError };
}
