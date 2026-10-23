import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ImageMimeType } from '../../../app/core/document/appTypes';
import { registerEditingTools } from './editingTools';
import { registerExportTools } from './exportTools';
import { registerPlaceTools } from './placeTools';
import { canEdit, canExport, canPlace, type OpenImages } from './openImages';
import { textResult } from './toolResults';

export const ImageTool = {
	List: 'list_images',
	View: 'view_image',
} as const;

const PictureSize = {
	/** Enough to check a drawing; a picture costs tokens by its area, so larger ones are asked for when needed. */
	Default: 768,
	Minimum: 64,
	Maximum: 4096,
} as const;
const BASE64 = 'base64';
const NO_IMAGES_MESSAGE =
	'No image is open in Little Image Editor. Open an image or an SVG in VS Code with Little Image Editor first.';
const ASSISTANT_INSTRUCTIONS =
	'Little Image Editor in VS Code: images with editable layers. To draw, send the whole picture in one draw call (one undo step) rather than many add_* calls. For an architecture, flow, state, class or sequence diagram, including one made from code you have read, pass Mermaid as draw\'s diagram; it is laid out automatically into editable shapes. Use describe_image before changing existing work, and view_image only when you need to see the result. Group parts on named layers. For a requested asset file, use export_image with the workspace PNG path.';

/** The server's name and version, as an assistant's client lists them. */
export interface ImageToolsIdentity {
	readonly name: string;
	readonly version: string;
}

/** The tools that let an assistant see the images open in the editor. */
export function createImageToolServer(
	images: OpenImages,
	identity: ImageToolsIdentity,
): McpServer {
	const server = new McpServer(identity, {
		instructions: ASSISTANT_INSTRUCTIONS,
	});
	server.registerTool(
		ImageTool.List,
		{
			description: 'Lists the open images and which one is active.',
			annotations: { readOnlyHint: true },
		},
		async () => {
			const open = await images.list();
			return textResult(
				open.length ? JSON.stringify(open) : NO_IMAGES_MESSAGE,
			);
		},
	);
	server.registerTool(
		ImageTool.View,
		{
			description: `Returns a picture of the image as the user sees it, ${PictureSize.Default}px by default; larger pictures cost more tokens.`,
			inputSchema: {
				image: z
					.string()
					.optional()
					.describe('Image id or name; default: active image.'),
				max_size: z
					.number()
					.int()
					.min(PictureSize.Minimum)
					.max(PictureSize.Maximum)
					.optional()
					.describe('Longer side in pixels.'),
			},
			annotations: { readOnlyHint: true },
		},
		async ({ image, max_size }) => {
			try {
				const view = await images.view(image, max_size ?? PictureSize.Default);
				return {
					content: [
						{
							type: 'image',
							data: Buffer.from(view.png).toString(BASE64),
							mimeType: ImageMimeType.Png,
						},
						{
							type: 'text',
							text: `${view.name}: ${view.imageWidth} × ${view.imageHeight} px, shown at ${view.width} × ${view.height} px.`,
						},
					],
				};
			} catch (error) {
				return textResult(
					error instanceof Error ? error.message : String(error),
					true,
				);
			}
		},
	);
	if (canEdit(images)) registerEditingTools(server, images);
	if (canExport(images)) registerExportTools(server, images);
	if (canPlace(images)) registerPlaceTools(server, images);
	return server;
}

