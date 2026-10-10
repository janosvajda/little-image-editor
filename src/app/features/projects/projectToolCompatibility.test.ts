import { describe, expect, it } from 'vitest';
import {
	DRAWING_TOOL_DEFINITIONS,
} from '../drawing/drawingToolCatalog';
import { UtilityToolId } from '../../core/document/appTypes';
import {
	DRAWING_TOOL_PROJECT_COMPATIBILITY,
	PROJECT_CAPABILITY_MANIFEST,
} from './projectCompatibility';

describe('.limg tool compatibility contract', () => {
	it('classifies every picture-affecting tool and excludes UI-only interactions', () => {
		const uiOnlyTools = new Set([
			UtilityToolId.Select,
			UtilityToolId.Picker,
			UtilityToolId.Zoom,
		]);
		expect(Object.keys(DRAWING_TOOL_PROJECT_COMPATIBILITY).sort()).toEqual(
			DRAWING_TOOL_DEFINITIONS.map(({ id }) => id)
				.filter((id) => !uiOnlyTools.has(id as UtilityToolId))
				.sort(),
		);
		expect(Object.keys(PROJECT_CAPABILITY_MANIFEST)).toEqual(['drawingTools']);
		for (const tool of uiOnlyTools)
			expect(DRAWING_TOOL_PROJECT_COMPATIBILITY).not.toHaveProperty(tool);
	});
});
