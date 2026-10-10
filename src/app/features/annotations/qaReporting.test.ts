import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintToolId, ShapeToolId, type Tool } from '../../core/document/appTypes';
import type { CaptureSourceMetadata } from '../../core/document/browserCapture';
import { ColorPalette } from '../../core/document/colorPalette';
import { CanvasDocument } from '../../core/document/imageDocument';
import { toolsForToolbar } from '../drawing/drawingToolCatalog';
import type { ClipboardController } from '../files/clipboardController';
import { ProjectCodec } from '../projects/projectCodec';
import { ProjectEditorAdapter } from '../projects/projectEditorAdapter';
import { CAPTURE_METADATA_KEY } from '../capture/browserCaptureImporter';
import { PersistentDocumentToolbar } from '../workspace/genericToolbar';
import { ToolbarId } from '../workspace/toolbarTypes';
import { AnnotationDocument } from './annotationDocument';
import { AnnotationPanel, ANNOTATION_TOOLBAR_KEY } from './annotationPanel';
import { BugReportController, type BugReportPreferences } from './bugReportController';
import { formatBugReport } from './bugReportMetadata';

const Source: CaptureSourceMetadata = {
	url: 'https://application.example/checkout?mode=test', capturedAt: '2026-10-10T10:00:00Z',
	userAgent: 'QA browser / OS', viewport: { width: 1280, height: 720 },
};
const Surface = { width: 240, height: 180 } as const;
const Issue = { title: 'Checkout fails', ticketUrl: 'https://tracker.example/browse/QA-123', steps: '1. Open checkout\n2. Submit the order', expected: 'Order completes.\nA confirmation appears.', actual: 'An error appears.' } as const;

let model: CanvasDocument;
let panel: AnnotationPanel;
let preferences: PersistentDocumentToolbar<BugReportPreferences>;
let clipboard: { copy: ReturnType<typeof vi.fn<ClipboardController['copy']>>; copyText: ReturnType<typeof vi.fn<ClipboardController['copyText']>> };

beforeEach(() => {
	model = new CanvasDocument(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLCanvasElement>('#overlay')!);
	panel = new AnnotationPanel(vi.fn());
	document.body.append(panel.element);
	preferences = new PersistentDocumentToolbar(panel.element, model, ANNOTATION_TOOLBAR_KEY);
	clipboard = { copy: vi.fn<ClipboardController['copy']>().mockResolvedValue(true), copyText: vi.fn<ClipboardController['copyText']>().mockResolvedValue(true) };
	new BugReportController(model, panel, preferences, clipboard);
	createImage();
});

describe('QA Markdown reports', () => {
	it('formats multiline issue details, ticket and capture metadata as distinct Markdown sections', () => {
		const report = formatBugReport({ ...Issue, source: Source, screenshot: Surface });
		expect(report).toContain(`# ${Issue.title}\n`);
		expect(report).toContain(`Issue ticket: <${Issue.ticketUrl}>`);
		expect(report).toContain(`## Steps to reproduce\n\n${Issue.steps}`);
		expect(report).toContain(`## Expected behaviour\n\n${Issue.expected}`);
		expect(report).toContain(`## Actual behaviour\n\n${Issue.actual}`);
		expect(report).toContain(`- Source page: <${Source.url}>`);
		expect(report).toContain('- Viewport: 1280 × 720 px');
		expect(report).toContain(`- Browser / OS (user agent): ${Source.userAgent}`);
	});

	it('does not invent a source URL or environment for an ordinary imported image', () => {
		expect(panel.sourcePage.textContent).toContain('No source page recorded');
		expect(panel.reportPreview.value).toContain('## Capture details');
		expect(panel.reportPreview.value).not.toContain(location.href);
		expect(panel.reportPreview.value).not.toContain('Source page:');
		expect(panel.reportPreview.value).not.toContain('Browser / OS');
		expect(panel.element.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
	});

	it('refreshes immediately when capture metadata arrives after the image loads', () => {
		model.setToolbarState(CAPTURE_METADATA_KEY, Source);
		expect(panel.sourcePage.textContent).toBe(Source.url);
		expect(panel.reportPreview.value).toContain(`<${Source.url}>`);
		expect(model.toolbarState<{ controls: Record<string, string> }>(ANNOTATION_TOOLBAR_KEY)?.controls.annotationReportText).toBe(panel.reportPreview.value);
	});

	it('keeps URLs inside their Markdown link boundaries', () => {
		const report = formatBugReport({ ...Issue, ticketUrl: 'https://tracker.example/a>\n#Injected', source: { ...Source, url: 'https://application.example/a<test>' }, screenshot: Surface });
		expect(report).toContain('<https://tracker.example/a%3E%0A#Injected>');
		expect(report).toContain('<https://application.example/a%3Ctest%3E>');
	});

	it('copies the visible Markdown using the shared clipboard controller and reports success', async () => {
		edit(panel.issueTitle, Issue.title);
		panel.copyReport.click();
		await vi.waitFor(() => expect(panel.feedback.textContent).toBe('Report copied as Markdown.'));
		expect(clipboard.copyText).toHaveBeenCalledWith(panel.reportPreview.value, 'Markdown report');
		expect(panel.feedback.classList.contains('error')).toBe(false);
	});

	it('reports clipboard failures and uses the shared composited-image copy action', async () => {
		clipboard.copyText.mockResolvedValue(false);
		panel.copyReport.click();
		await vi.waitFor(() => expect(panel.feedback.classList.contains('error')).toBe(true));
		panel.copyImage.click();
		await vi.waitFor(() => expect(panel.feedback.textContent).toBe('Annotated screenshot copied.'));
		expect(clipboard.copy).toHaveBeenCalledOnce();
	});

	it('rejects an invalid ticket URL without copying and clears old feedback when fields change', async () => {
		edit(panel.ticketUrl, 'invalid-ticket-url');
		panel.copyReport.click();
		expect(clipboard.copyText).not.toHaveBeenCalled();
		expect(panel.feedback.classList.contains('error')).toBe(true);
		edit(panel.ticketUrl, Issue.ticketUrl);
		expect(panel.feedback.textContent).toBe('');
	});

	it('preserves all issue fields and manual Markdown through the .limg boundary', () => {
		model.setToolbarState(CAPTURE_METADATA_KEY, Source);
		for (const [control, value] of [[panel.issueTitle, Issue.title], [panel.ticketUrl, Issue.ticketUrl], [panel.steps, Issue.steps], [panel.expected, Issue.expected], [panel.actual, Issue.actual]] as const) edit(control, value);
		const custom = `${panel.reportPreview.value}\n## Additional notes\nInvestigate the request timeout.\n`;
		edit(panel.reportPreview, custom);
		const adapter = new ProjectEditorAdapter(model, new AnnotationDocument());
		const codec = new ProjectCodec();
		const saved = codec.serializeEditorState(adapter.capture());
		createImage();
		expect(panel.ticketUrl.value).toBe('');
		adapter.restore(codec.toEditorState(codec.parse(saved)));
		expect(panel.issueTitle.value).toBe(Issue.title);
		expect(panel.ticketUrl.value).toBe(Issue.ticketUrl);
		expect(panel.steps.value).toBe(Issue.steps);
		expect(panel.expected.value).toBe(Issue.expected);
		expect(panel.actual.value).toBe(Issue.actual);
		expect(panel.reportPreview.value).toBe(custom);
		expect(panel.sourcePage.textContent).toBe(Source.url);
	});

	it('restores older projects without leaking newly added fields from a previous report', () => {
		edit(panel.issueTitle, Issue.title);
		edit(panel.ticketUrl, Issue.ticketUrl);
		const saved = model.snapshotSession();
		model.restoreSession({ ...saved, toolbarStates: { [ANNOTATION_TOOLBAR_KEY]: { controls: { annotationExpected: 'Legacy expectation', annotationActual: 'Legacy failure', annotationIncludeUrl: false }, extra: { reportEdited: false } }, [CAPTURE_METADATA_KEY]: Source } });
		expect(panel.issueTitle.value).toBe('');
		expect(panel.ticketUrl.value).toBe('');
		expect(panel.reportPreview.value).toContain('Legacy expectation');
		expect(panel.reportPreview.value).toContain(`<${Source.url}>`);
	});
});

describe('QA tools are a generic catalogue view', () => {
	it('renders catalogue definitions without maintaining a panel-specific tool list or handlers', () => {
		const chosen: Tool[] = [];
		const view = new AnnotationPanel((tool) => chosen.push(tool));
		const definitions = toolsForToolbar(ToolbarId.Annotations);
		const buttons = [...view.tools.querySelectorAll<HTMLButtonElement>('button')];
		expect(buttons.map((button) => button.dataset.tool)).toEqual(definitions.map((definition) => definition.id));
		for (const [index, button] of buttons.entries()) {
			expect(button.getAttribute('aria-label')).toBe(definitions[index]!.label);
			button.click();
		}
		expect(chosen).toEqual(definitions.map((definition) => definition.id));
		view.showActiveTool(ShapeToolId.Rectangle);
		expect(view.tools.querySelector('[aria-pressed="true"]')?.getAttribute('data-tool')).toBe(ShapeToolId.Rectangle);
		view.showActiveTool(PaintToolId.Brush);
		expect(view.tools.querySelector('[aria-pressed="true"]')).toBeNull();
	});
});

function createImage(): void { model.create({ name: 'QA report', ...Surface, transparent: false, background: ColorPalette.White }); }
function edit(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	control.value = value;
	control.dispatchEvent(new Event('input', { bubbles: true }));
}
