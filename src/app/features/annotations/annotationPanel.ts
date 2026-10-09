import { createManagedPanel } from '../workspace/managedPanel';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { ToolbarAutoOpenMode, ToolbarId } from '../workspace/toolbarTypes';
import { type AnnotationTool, AnnotationToolId } from './annotationTypes';

const BUG_REPORT_VISIBLE_ROWS = 7;

import { ColorPalette } from '../../core/document/colorPalette';

/** Toolbar preferences key; distinct from the annotation layers' document state. */
export const ANNOTATION_TOOLBAR_KEY = 'annotationToolbar';
const TOOLS: ReadonlyArray<
	Readonly<{ tool: AnnotationTool; icon: string; label: string; key?: string }>
> = [
	{ tool: AnnotationToolId.Select, icon: '↖', label: 'Select', key: 'V' },
	{ tool: AnnotationToolId.Arrow, icon: '↗', label: 'Arrow', key: 'A' },
	{ tool: AnnotationToolId.Step, icon: '①', label: 'Number', key: '1' },
	{ tool: AnnotationToolId.Box, icon: '□', label: 'Box', key: 'B' },
	{ tool: AnnotationToolId.Highlight, icon: '▰', label: 'Highlight', key: 'H' },
	{ tool: AnnotationToolId.Text, icon: 'T', label: 'Text', key: 'T' },
	{ tool: AnnotationToolId.Blur, icon: '▦', label: 'Blur', key: 'U' },
	{ tool: AnnotationToolId.Redact, icon: '■', label: 'Redact', key: 'R' },
	{ tool: AnnotationToolId.Crop, icon: '⌗', label: 'Crop', key: 'C' },
];

export class AnnotationPanel {
	readonly element: HTMLElement;
	readonly color = input('color', ColorPalette.Annotation);
	readonly size = input('range', '5', { min: '1', max: '40' });
	readonly opacity = input('range', '35', { min: '5', max: '100' });
	readonly blur = input('range', '12', { min: '2', max: '40' });
	readonly text = input('text', '', { placeholder: 'Callout text' });
	readonly nextStep = document.createElement('strong');
	readonly markerControls = document.createElement('div');
	readonly markerValue = input('number', '1', {
		min: '0',
		max: '9999',
		step: '1',
		'aria-label': 'Next marker number',
	});
	readonly undo = action('↶', 'Undo annotation');
	readonly redo = action('↷', 'Redo annotation');
	readonly restart = action('①', 'Restart numbering at 1');
	readonly flatten = action('✓', 'Apply annotations to image');
	readonly clear = action('⌫', 'Clear annotations');
	readonly reportPreview = document.createElement('textarea');
	readonly expected = input('text', '', { placeholder: 'Expected result' });
	readonly actual = input('text', '', { placeholder: 'Actual result' });
	readonly includeUrl = checkbox(true);
	readonly includeEnvironment = checkbox(true);
	readonly copyReport = action('⧉', 'Copy report details');
	readonly toolButtons = new Map<AnnotationTool, HTMLButtonElement>();

	constructor() {
		const panel = createManagedPanel(
			ToolbarId.Annotations,
			'Capture & annotate',
			{
				className: 'annotation-panel',
				autoOpenMode: ToolbarAutoOpenMode.Annotate,
				defaultDock: ToolbarDock.Left,
			},
		);
		this.element = panel.element;
		this.element.dataset.toolbarKey = ANNOTATION_TOOLBAR_KEY;
		assignId(this.color, 'annotationColor');
		assignId(this.size, 'annotationSize');
		assignId(this.opacity, 'annotationOpacity');
		assignId(this.blur, 'annotationBlur');
		assignId(this.text, 'annotationText');
		assignId(this.expected, 'annotationExpected');
		assignId(this.actual, 'annotationActual');
		assignId(this.includeUrl, 'annotationIncludeUrl');
		assignId(this.includeEnvironment, 'annotationIncludeEnvironment');
		assignId(this.markerValue, 'annotationMarkerValue');
		assignId(this.reportPreview, 'annotationReportText');
		const tools = document.createElement('div');
		tools.className = 'annotation-tool-grid';
		for (const definition of TOOLS) {
			const button = action(definition.icon, definition.label);
			button.dataset.annotationTool = definition.tool;
			button.title = `${definition.label}${definition.key ? ` (${definition.key})` : ''}`;
			button.innerHTML = `<span aria-hidden="true">${definition.icon}</span><small>${definition.label}</small>`;
			this.toolButtons.set(definition.tool, button);
			tools.append(button);
		}
		this.nextStep.className = 'annotation-next-step';
		this.markerControls.className = 'annotation-marker-controls hidden';
		const markerInput = field('Set next', this.markerValue);
		this.restart.textContent = '↺ Reset to 1';
		this.restart.classList.add('annotation-reset-marker');
		this.markerControls.append(this.nextStep, markerInput, this.restart);
		const options = section(
			'Options',
			field('Color', this.color),
			field('Size', this.size),
			field('Opacity', this.opacity),
			field('Blur', this.blur),
			field('Text', this.text),
		);
		const history = document.createElement('div');
		history.className = 'annotation-actions';
		history.append(this.undo, this.redo, this.flatten, this.clear);
		const report = section(
			'Bug report',
			field('Expected', this.expected),
			field('Actual', this.actual),
			checkField('Include page URL', this.includeUrl),
			checkField('Include environment', this.includeEnvironment),
		);
		this.reportPreview.rows = BUG_REPORT_VISIBLE_ROWS;
		this.reportPreview.setAttribute('aria-label', 'Editable bug report');
		report.append(this.reportPreview, this.copyReport);
		panel.body.append(
			tools,
			this.markerControls,
			options,
			history,
			report,
		);
	}

	/** Crop is owned by the shared drawing tool; its button mirrors that tool's state. */
	reflectSharedCropTool(active: boolean): void {
		this.toolButtons
			.get(AnnotationToolId.Crop)
			?.classList.toggle('active', active);
	}

	setActiveTool(tool: AnnotationTool): void {
		this.toolButtons.forEach((button, candidate) =>
			button.classList.toggle('active', candidate === tool),
		);
		this.markerControls.classList.toggle(
			'hidden',
			tool !== AnnotationToolId.Step,
		);
		this.text
			.closest('label')
			?.classList.toggle('hidden', tool !== AnnotationToolId.Text);
		this.blur
			.closest('label')
			?.classList.toggle('hidden', tool !== AnnotationToolId.Blur);
		this.opacity
			.closest('label')
			?.classList.toggle('hidden', tool !== AnnotationToolId.Highlight);
	}
}

function input(
	type: string,
	value: string,
	attributes: Record<string, string> = {},
): HTMLInputElement {
	const result = document.createElement('input');
	result.type = type;
	result.value = value;
	Object.entries(attributes).forEach(([name, content]) =>
		result.setAttribute(name, content),
	);
	return result;
}

function checkbox(checked: boolean): HTMLInputElement {
	const result = input('checkbox', '');
	result.checked = checked;
	return result;
}
function action(icon: string, label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'annotation-action';
	button.textContent = icon;
	button.title = label;
	button.setAttribute('aria-label', label);
	return button;
}
function field(label: string, control: HTMLElement): HTMLLabelElement {
	const result = document.createElement('label');
	result.append(document.createTextNode(label), control);
	return result;
}
function checkField(
	label: string,
	control: HTMLInputElement,
): HTMLLabelElement {
	const result = field(label, control);
	result.className = 'annotation-check';
	return result;
}
function section(title: string, ...children: HTMLElement[]): HTMLElement {
	const result = document.createElement('section');
	const heading = document.createElement('h3');
	heading.textContent = title;
	result.append(heading, ...children);
	return result;
}
function assignId(element: HTMLElement, id: string): void {
	element.id = id;
}
