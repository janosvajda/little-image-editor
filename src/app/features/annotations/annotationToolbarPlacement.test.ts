import { describe, expect, it } from 'vitest';
import { ToolbarDock } from '../workspace/managedToolbarPanel';
import { AnnotationPanel } from './annotationPanel';

describe('annotation toolbar placement metadata', () => {
	it('declares generic auto-open and first-run left docking metadata', () => {
		const panel = new AnnotationPanel().element;
		expect(panel.dataset.autoOpenMode).toBe('annotate');
		expect(panel.dataset.defaultDock).toBe(ToolbarDock.Left);
	});
});
