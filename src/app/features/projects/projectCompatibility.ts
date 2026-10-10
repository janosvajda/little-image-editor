import {
	DRAWING_TOOL_DOCUMENT_CONTRACT,
	type ImageAffectingDrawingTool,
	type ToolDocumentRegistration,
} from './editorToolContract';

/**
 * Public compatibility aliases retained for the project boundary. Their
 * values now describe required editor behavior instead of merely reporting
 * that flattened raster history happened to contain a tool's pixels.
 */
export const DRAWING_TOOL_PROJECT_COMPATIBILITY =
	DRAWING_TOOL_DOCUMENT_CONTRACT satisfies Record<
		ImageAffectingDrawingTool,
		ToolDocumentRegistration
	>;

export interface ProjectCapabilityManifest {
	readonly drawingTools: readonly ImageAffectingDrawingTool[];
}

/** Serialized into every project; tool additions therefore change the format. */
export const PROJECT_CAPABILITY_MANIFEST: ProjectCapabilityManifest = {
	drawingTools: Object.keys(
		DRAWING_TOOL_DOCUMENT_CONTRACT,
	) as ImageAffectingDrawingTool[],
};
