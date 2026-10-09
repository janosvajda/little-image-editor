import type { Tool } from '../../core/document/appTypes';
import {
	type AnnotationObject,
	AnnotationObjectTypeId,
} from '../annotations/annotationTypes';
import {
	PAINT_TOOL_DEFINITIONS,
	SHAPE_TOOL_DEFINITIONS,
} from '../drawing/drawingToolCatalog';

const ItemTypeLabel: Readonly<Record<AnnotationObject['type'], string>> = {
	[AnnotationObjectTypeId.Arrow]: 'Arrow',
	[AnnotationObjectTypeId.Step]: 'Number marker',
	[AnnotationObjectTypeId.Box]: 'Box',
	[AnnotationObjectTypeId.Highlight]: 'Highlight',
	[AnnotationObjectTypeId.Text]: 'Text',
	[AnnotationObjectTypeId.Blur]: 'Blur',
	[AnnotationObjectTypeId.Redact]: 'Redaction',
	[AnnotationObjectTypeId.Shape]: 'Shape',
	[AnnotationObjectTypeId.Stroke]: 'Stroke',
	[AnnotationObjectTypeId.Fill]: 'Fill',
	[AnnotationObjectTypeId.RasterFragment]: 'Pixels',
};
const STROKE_SUFFIX = ' stroke';
const TEXT_PREVIEW_LENGTH = 24;
const TEXT_PREVIEW_ELLIPSIS = '…';
const TEXT_PREVIEW_SEPARATOR = ': ';

const TOOL_LABELS: ReadonlyMap<Tool, string> = new Map(
	[...PAINT_TOOL_DEFINITIONS, ...SHAPE_TOOL_DEFINITIONS].map((definition) => [
		definition.id,
		definition.label,
	]),
);

/** What an item is, as shown in the layer list: "Rectangle", "Brush stroke", "Text: Hello". */
export function layerItemLabel(item: AnnotationObject): string {
	switch (item.type) {
		case AnnotationObjectTypeId.Shape:
			return TOOL_LABELS.get(item.shape) ?? ItemTypeLabel[item.type];
		case AnnotationObjectTypeId.Stroke:
			return `${TOOL_LABELS.get(item.tool) ?? ItemTypeLabel[item.type]}${STROKE_SUFFIX}`;
		case AnnotationObjectTypeId.Step:
			return `${ItemTypeLabel[item.type]} ${item.value}`;
		case AnnotationObjectTypeId.Text:
			return item.text.trim()
				? `${ItemTypeLabel[item.type]}${TEXT_PREVIEW_SEPARATOR}${textPreview(item.text)}`
				: ItemTypeLabel[item.type];
		default:
			return ItemTypeLabel[item.type];
	}
}

function textPreview(text: string): string {
	const line = text.trim().split('\n')[0] ?? '';
	return line.length > TEXT_PREVIEW_LENGTH
		? `${line.slice(0, TEXT_PREVIEW_LENGTH)}${TEXT_PREVIEW_ELLIPSIS}`
		: line;
}
