import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShapeToolId } from '../../core/document/appTypes';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, type ShapeAnnotation } from '../annotations/annotationTypes';
import { AssistantCommandRunner } from './assistantCommandRunner';
import { AssistantCommandKind, type AssistantResult } from './assistantCommandTypes';

const RED = '#d62828';
const GREEN = '#2a9d48';

let model: CanvasDocument;
let objects: AnnotationDocument;
let history: { canUndo: boolean; undo: ReturnType<typeof vi.fn> };
let runner: AssistantCommandRunner;

beforeEach(() => {
	model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	model.create({ name: 'apple', width: 512, height: 512, transparent: false, background: '#ffffff' });
	objects = new AnnotationDocument();
	history = { canUndo: true, undo: vi.fn() };
	runner = new AssistantCommandRunner(model, objects, history);
});

function field<Key extends string>(result: AssistantResult, key: Key): unknown {
	return (result as Record<string, unknown>)[key];
}

describe('an assistant drawing in the editor', () => {
	it('adds named layers and draws circles on one and an apple on the other, each as editable items', () => {
		const circles = runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Circles' });
		const circle = {
			kind: AssistantCommandKind.AddShape,
			shape: ShapeToolId.Ellipse,
			color: RED,
			fill: true,
			strokeWidth: 4,
			opacity: 1,
			rotation: 0,
		} as const;
		runner.run({ ...circle, rect: { x: 40, y: 40, width: 100, height: 100 } });
		runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Apple' });
		runner.run({ ...circle, rect: { x: 200, y: 200, width: 160, height: 150 } });
		// Back to the first layer by name, whichever layer is active.
		const third = runner.run({ ...circle, layer: 'circles', color: GREEN, rect: { x: 300, y: 40, width: 100, height: 100 } });

		expect(field(third, 'layerId')).toBe(field(circles, 'layerId'));
		const described = field(runner.run({ kind: AssistantCommandKind.Describe }), 'document') as {
			name: string;
			width: number;
			layers: { name: string; items: { type: string; shape?: string; color?: string }[] }[];
		};
		expect(described).toMatchObject({ name: 'apple', width: 512 });
		expect(described.layers.map((layer) => [layer.name, layer.items.length])).toEqual([
			['Circles', 2],
			['Apple', 1],
		]);
		expect(described.layers[0]!.items.map((item) => item.color)).toEqual([RED, GREEN]);
		// Nothing is left selected, so no transform handles cover the drawing.
		expect(objects.selected).toBeNull();
	});

	it('draws lines and arrows in their direction, and text where it is asked', () => {
		const arrow = runner.run({
			kind: AssistantCommandKind.AddLine,
			from: { x: 300, y: 300 },
			to: { x: 100, y: 120 },
			arrow: true,
			color: RED,
			width: 6,
			opacity: 1,
		});
		const line = objects.object(field(arrow, 'itemId') as string) as ShapeAnnotation;
		expect(line).toMatchObject({
			shape: ShapeToolId.Arrow,
			rect: { x: 100, y: 120, width: 200, height: 180 },
			flipX: true,
			flipY: true,
		});
		const text = runner.run({ kind: AssistantCommandKind.AddText, at: { x: 20, y: 30 }, text: 'Apple', color: GREEN, size: 48 });
		expect(objects.object(field(text, 'itemId') as string)).toMatchObject({
			type: AnnotationObjectTypeId.Text,
			at: { x: 20, y: 30 },
			text: 'Apple',
			size: 48,
		});
	});

	it('removes an item and undoes through the editor history, as Cmd/Ctrl+Z does', () => {
		const added = runner.run({ kind: AssistantCommandKind.AddText, at: { x: 0, y: 0 }, text: 'x', color: RED, size: 20 });
		const itemId = field(added, 'itemId') as string;
		expect(runner.run({ kind: AssistantCommandKind.RemoveItem, item: itemId })).toEqual({ removed: itemId });
		expect(objects.object(itemId)).toBeNull();
		expect(runner.run({ kind: AssistantCommandKind.Undo })).toEqual({ undone: true });
		expect(history.undo).toHaveBeenCalledOnce();
	});

	it('explains what went wrong: an unknown layer or item, a locked layer, or no image', () => {
		const text = { kind: AssistantCommandKind.AddText, at: { x: 0, y: 0 }, text: 'x', color: RED, size: 20 } as const;
		runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Background' });
		expect(() => runner.run({ ...text, layer: 'Sky' })).toThrow('No layer is called "Sky". The layers are: "Background".');
		expect(() => runner.run({ kind: AssistantCommandKind.RemoveItem, item: 'missing' })).toThrow('No item has the id missing.');
		objects.setLayerLocked(objects.state.layers[0]!.id, true);
		expect(() => runner.run({ ...text, layer: 'Background' })).toThrow('is locked or hidden');
		const empty = new CanvasDocument(
			document.querySelector<HTMLCanvasElement>('#canvas')!,
			document.querySelector<HTMLCanvasElement>('#overlay')!,
		);
		expect(() => new AssistantCommandRunner(empty, objects, history).run({ kind: AssistantCommandKind.Describe })).toThrow(
			'No image is open',
		);
	});
});
