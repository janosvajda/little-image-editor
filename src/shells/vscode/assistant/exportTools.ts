import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ExportableImages } from './openImages';
import { jsonOutcome } from './toolResults';

export const ExportTool = { Image: 'export_image' } as const;

/** Both assistant clients export through the same workspace writer and image compositor. */
export function registerExportTools(server: McpServer, images: ExportableImages): void {
	server.registerTool(
		ExportTool.Image,
		{
			description:
				'Saves the image, with every visible layer, as a full-size PNG, or as SVG for a .svg path (shapes, paths, gradients and text as vectors), in the workspace; the open image stays editable. Missing folders are created; existing files are kept unless overwrite is true.',
			inputSchema: {
				image: z.string().optional().describe('Image id or name; default: active image.'),
				path: z.string().min(1).describe('PNG or SVG path in the workspace, e.g. src/assets/icon.png or docs/diagram.svg.'),
				workspace: z.string().optional().describe('Workspace folder, for multi-root workspaces.'),
				overwrite: z.boolean().default(false).describe('Only when the user asked to replace the file.'),
			},
			annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
		},
		({ image, path, workspace, overwrite }) =>
			jsonOutcome(() => images.export(image, { path, overwrite, ...(workspace ? { workspace } : {}) })),
	);
}
