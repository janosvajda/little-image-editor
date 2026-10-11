import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { elbowPath } from '../../core/geometry/elbowPath';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AnnotationObjectTypeId, LineDash } from '../annotations/annotationTypes';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { ConnectorDrawingGesture } from '../drawing/gestures/connectorDrawingGesture';
import { NewImageController } from '../files/newImageController';
import { DiagramImportController } from './diagramImportController';
import { drawMermaidFlowchart } from './diagramDrawing';

const DIAGRAM = 'flowchart LR\n  web[Web] --> api[API] --> db[(Database)]';
const STYLE = { color: '#123456', size: 3, opacity: 0.5 };

function documentModel(): CanvasDocument {
	const overlay = document.querySelector<HTMLCanvasElement>('#overlay')!;
	Object.assign(overlay.getContext('2d')!, { setLineDash: vi.fn() });
	return new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, overlay);
}

function importer(model: CanvasDocument) {
	const objects = new AnnotationDocument();
	const dialog = document.querySelector<HTMLDialogElement>('#functionsDialog')!;
	Object.defineProperty(dialog, 'close', { configurable: true, value: vi.fn() });
	const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
	new DiagramImportController(model, new NewImageController(model), runner, dialog);
	const source = document.querySelector<HTMLTextAreaElement>('#mermaidSource')!;
	const error = document.querySelector<HTMLElement>('#diagramError')!;
	const insert = (text: string) => {
		source.value = text;
		document.querySelector<HTMLButtonElement>('#insertDiagramButton')!.click();
	};
	return { objects, dialog, source, error, insert };
}

describe('elbow paths', () => {
	it('go out along the wider direction, across at the middle, then in', () => {
		expect(elbowPath({ x: 0, y: 0 }, { x: 100, y: 40 })).toEqual([
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 50, y: 40 },
			{ x: 100, y: 40 },
		]);
		expect(elbowPath({ x: 0, y: 0 }, { x: 30, y: 100 })).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 50 },
			{ x: 30, y: 50 },
			{ x: 30, y: 100 },
		]);
	});

	it('need no bends between points in line', () => {
		expect(elbowPath({ x: 5, y: 5 }, { x: 5, y: 90 })).toHaveLength(2);
		expect(elbowPath({ x: 5, y: 5 }, { x: 90, y: 5 })).toHaveLength(2);
	});
});

describe('the elbow arrow tool', () => {
	it('previews while dragging and adds one connector with an arrowhead in the chosen style', () => {
		const model = documentModel();
		model.create({ name: 'arrows', width: 200, height: 200, transparent: false, background: '#ffffff' });
		const objects = new AnnotationDocument();
		const clear = vi.spyOn(model, 'clearOverlay');
		const gesture = new ConnectorDrawingGesture(model, objects, { x: 10, y: 10 }, () => STYLE);
		gesture.update({ x: 120, y: 60 });
		expect(objects.state.objects).toHaveLength(0);
		gesture.complete({ x: 150, y: 80 });
		expect(clear).toHaveBeenCalledTimes(2);
		expect(objects.state.objects).toEqual([
			expect.objectContaining({
				type: AnnotationObjectTypeId.Connector,
				points: elbowPath({ x: 10, y: 10 }, { x: 150, y: 80 }),
				color: STYLE.color,
				width: STYLE.size,
				opacity: STYLE.opacity,
				arrow: true,
				dash: LineDash.Solid,
			}),
		]);
	});

	it('adds nothing for a click or a cancelled drag', () => {
		const model = documentModel();
		model.create({ name: 'arrows', width: 200, height: 200, transparent: false, background: '#ffffff' });
		const objects = new AnnotationDocument();
		new ConnectorDrawingGesture(model, objects, { x: 10, y: 10 }, () => STYLE).complete({ x: 11, y: 10 });
		const cancelled = new ConnectorDrawingGesture(model, objects, { x: 10, y: 10 }, () => STYLE);
		cancelled.update({ x: 100, y: 100 });
		cancelled.cancel();
		expect(objects.state.objects).toHaveLength(0);
	});
});

describe('importing a Mermaid diagram', () => {
	it('opens a new image sized to the diagram when none is open, and closes the dialog', () => {
		const model = documentModel();
		const { objects, dialog, insert } = importer(model);
		insert(DIAGRAM);
		const drawing = drawMermaidFlowchart(DIAGRAM);
		expect(model.hasImage).toBe(true);
		expect([model.width, model.height]).toEqual([drawing.width, drawing.height]);
		expect(objects.state.layers.map(({ name }) => name)).toEqual(expect.arrayContaining(['Connections', 'Nodes']));
		expect(objects.state.objects.length).toBeGreaterThan(0);
		expect(dialog.close).toHaveBeenCalledOnce();
	});

	it('centres the diagram on a larger open image', () => {
		const model = documentModel();
		const drawing = drawMermaidFlowchart(DIAGRAM);
		const margin = 100;
		model.create({ name: 'big', width: drawing.width + margin * 2, height: drawing.height + margin * 2, transparent: false, background: '#ffffff' });
		const { objects, insert } = importer(model);
		insert(DIAGRAM);
		const centred = drawMermaidFlowchart(DIAGRAM, { x: margin, y: margin });
		expect(objects.state.objects).toHaveLength(centred.commands.filter((command) => 'color' in command).length);
		expect([model.width, model.height]).toEqual([drawing.width + margin * 2, drawing.height + margin * 2]);
	});

	it('shows what is wrong with a broken diagram, draws nothing, and clears the message on typing', () => {
		const model = documentModel();
		const { objects, dialog, source, error, insert } = importer(model);
		insert('not a flowchart');
		expect(error.textContent).not.toBe('');
		expect(objects.state.objects).toHaveLength(0);
		expect(model.hasImage).toBe(false);
		expect(dialog.close).not.toHaveBeenCalled();
		source.dispatchEvent(new Event('input'));
		expect(error.textContent).toBe('');
	});
});
