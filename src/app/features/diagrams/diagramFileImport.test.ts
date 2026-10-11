import { describe, expect, it, vi } from 'vitest';
import { CanvasDocument } from '../../core/document/imageDocument';
import { AnnotationDocument } from '../annotations/annotationDocument';
import { AssistantCommandRunner } from '../assistant/assistantCommandRunner';
import { NewImageController } from '../files/newImageController';
import { DiagramImportController } from './diagramImportController';
import { MERMAID_FILE_ACCEPT, mermaidCode, parseFlowchart } from './mermaidFlowchart';

const CODE = 'flowchart LR\n  web[Web] --> api[API]';
const MARKDOWN = `# Architecture\n\nSome words.\n\n\`\`\`mermaid\n${CODE}\n\`\`\`\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;

function importer() {
	const model = new CanvasDocument(
		document.querySelector<HTMLCanvasElement>('#canvas')!,
		document.querySelector<HTMLCanvasElement>('#overlay')!,
	);
	const objects = new AnnotationDocument();
	const dialog = document.querySelector<HTMLDialogElement>('#diagramDialog')!;
	const showModal = vi.fn();
	const close = vi.fn();
	Object.defineProperty(dialog, 'showModal', { configurable: true, value: showModal });
	Object.defineProperty(dialog, 'close', { configurable: true, value: close });
	const runner = new AssistantCommandRunner(model, objects, { undo: vi.fn(), canUndo: false });
	new DiagramImportController(model, new NewImageController(model), runner, dialog);
	const input = document.querySelector<HTMLInputElement>('#diagramFileInput')!;
	const source = document.querySelector<HTMLTextAreaElement>('#mermaidSource')!;
	const error = document.querySelector<HTMLElement>('#diagramError')!;
	const choose = async (file: File) => {
		Object.defineProperty(input, 'files', { configurable: true, value: [file] });
		input.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(source.value).not.toBe(''));
	};
	return { model, objects, showModal, close, input, source, error, choose };
}

describe('Mermaid in Markdown', () => {
	it('is the first mermaid block, and plain Mermaid stays as it is', () => {
		expect(mermaidCode(MARKDOWN)).toBe(CODE);
		expect(mermaidCode(CODE)).toBe(CODE);
		expect(mermaidCode(`~~~mermaid\r\n${CODE}\r\n~~~`)).toBe(CODE);
	});

	it('is read as a flowchart, wherever a diagram is drawn from', () => {
		expect(parseFlowchart(MARKDOWN).nodes.map(({ id }) => id)).toEqual(['web', 'api']);
	});
});

describe('the File menu', () => {
	it('opens the diagram dialog empty and ready for typing', () => {
		const { showModal, source, error } = importer();
		error.textContent = 'old';
		document.querySelector<HTMLButtonElement>('#insertDiagramMenuButton')!.click();
		expect(showModal).toHaveBeenCalledOnce();
		expect(error.textContent).toBe('');
		expect(document.activeElement).toBe(source);
	});

	it('imports Mermaid and Markdown files', () => {
		const { input } = importer();
		const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
		document.querySelector<HTMLButtonElement>('#importDiagramButton')!.click();
		expect(click).toHaveBeenCalledOnce();
		expect(input.accept).toBe(MERMAID_FILE_ACCEPT);
		expect(MERMAID_FILE_ACCEPT.split(',')).toEqual(['.mmd', '.mermaid', '.md', '.markdown']);
	});
});

describe('importing a diagram file', () => {
	it('draws the diagram in a Markdown file without showing the dialog', async () => {
		const { model, objects, showModal, input, choose } = importer();
		await choose(new File([MARKDOWN], 'architecture.md', { type: 'text/markdown' }));
		await vi.waitFor(() => expect(objects.state.objects.length).toBeGreaterThan(0));
		expect(model.hasImage).toBe(true);
		expect(showModal).not.toHaveBeenCalled();
		expect(input.value).toBe('');
	});

	it('shows a file that cannot be drawn in the dialog, with what is wrong', async () => {
		const { objects, showModal, source, error, choose } = importer();
		await choose(new File(['flowchart LR\n  a -->'], 'broken.mmd'));
		await vi.waitFor(() => expect(showModal).toHaveBeenCalledOnce());
		expect(source.value).toBe('flowchart LR\n  a -->');
		expect(error.textContent).not.toBe('');
		expect(objects.state.objects).toHaveLength(0);
	});

	it('does nothing when no file is chosen', () => {
		const { input, showModal, source } = importer();
		Object.defineProperty(input, 'files', { configurable: true, value: [] });
		input.dispatchEvent(new Event('change'));
		expect(source.value).toBe('');
		expect(showModal).not.toHaveBeenCalled();
	});
});
