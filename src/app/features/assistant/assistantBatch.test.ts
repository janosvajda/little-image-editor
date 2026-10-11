import { beforeEach, describe, expect, it } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { EditorHistory, HistoryDomain } from '../../core/history/editorHistory';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AssistantCommandRunner } from './assistantCommandRunner';
import { AssistantCommandKind, type DrawingCommand, shortId } from './assistantCommandTypes';

const RED = '#d62828';
const circle = (x: number): DrawingCommand => ({
	kind: AssistantCommandKind.AddShape,
	shape: 'ellipse',
	rect: { x, y: 10, width: 40, height: 40 },
	color: RED,
	fill: true,
	strokeWidth: 4,
	opacity: 1,
	rotation: 0,
});

let objects: AnnotationDocument;
let history: EditorHistory;
let runner: AssistantCommandRunner;

beforeEach(() => {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	model.create({ name: 'batch', width: 200, height: 100, transparent: false, background: '#ffffff' });
	objects = new AnnotationDocument();
	history = new EditorHistory({ [HistoryDomain.Document]: model, [HistoryDomain.Objects]: objects });
	runner = new AssistantCommandRunner(model, objects, history);
});

describe('an assistant drawing in one batch', () => {
	it('adds layers and items as one undo step, which one undo removes completely', () => {
		runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Before' });
		const result = runner.run({
			kind: AssistantCommandKind.Batch,
			commands: [{ kind: AssistantCommandKind.AddLayer, name: 'Circles' }, circle(10), circle(60), { kind: AssistantCommandKind.AddLayer, name: 'Top' }, circle(110)],
		});
		expect(result).toEqual({ batch: { layers: ['Circles', 'Top'], items: 3 } });
		expect(objects.state.layers.map((layer) => [layer.name, layer.itemIds.length])).toEqual([['Before', 0], ['Circles', 2], ['Top', 1]]);
		history.undo();
		expect(objects.state.layers.map((layer) => layer.name)).toEqual(['Before']);
		history.redo();
		expect(objects.state.objects).toHaveLength(3);
	});

	it('leaves nothing behind when a step fails, and says which step', () => {
		runner.run({ kind: AssistantCommandKind.AddLayer, name: 'Before' });
		const undoSteps = objects.undoDepth;
		expect(() =>
			runner.run({ kind: AssistantCommandKind.Batch, commands: [circle(10), { ...circle(60), layer: 'Missing' }] }),
		).toThrow('Step 2: No layer is called "Missing"');
		expect(objects.state.objects).toHaveLength(0);
		expect(objects.undoDepth).toBe(undoSteps);
		history.undo();
		expect(objects.state.layers).toHaveLength(0);
	});

	it('accepts the short ids it shows for items and layers', () => {
		runner.run({ kind: AssistantCommandKind.Batch, commands: [{ kind: AssistantCommandKind.AddLayer, name: 'Shapes' }, circle(10)] });
		const [layer] = objects.state.layers;
		const [item] = objects.state.objects;
		runner.run({ ...circle(60), layer: shortId(layer!.id) });
		expect(objects.state.objects).toHaveLength(2);
		expect(runner.run({ kind: AssistantCommandKind.RemoveItem, item: shortId(item!.id) })).toEqual({ removed: item!.id });
		// Too short to point at one item safely.
		expect(() => runner.run({ kind: AssistantCommandKind.RemoveItem, item: '' })).toThrow('No item has the id');
		for (const id of ['abcdefgh-0001', 'abcdefgh-0002']) objects.add({ ...objects.state.objects[0]!, id });
		expect(() => runner.run({ kind: AssistantCommandKind.RemoveItem, item: 'abcdefgh' })).toThrow('Several items start with abcdefgh');
	});
});
