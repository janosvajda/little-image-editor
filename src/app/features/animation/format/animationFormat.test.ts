import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roundFileNumber } from './animationFileFormat';
import { AnimationFileError, parseAnimationFile } from './animationFileReader';
import { serializeAnimationFile } from './animationFileWriter';
import { type AnimationFile, AnimationFileIssue, animationFileSchema, AnimItemKind } from './animationSchema';
import { evaluateFrame, instanceFrame, transformMatrix } from './evaluateFrame';
import { PlayMode } from './animationSchema';

const FIXTURES = 'tests/fixtures/animation';
const FILE_SUFFIX = '.anim.json';
const FRAMES_SUFFIX = '.frames.json';
const fixtureNames = readdirSync(FIXTURES)
	.filter((name) => name.endsWith(FILE_SUFFIX))
	.map((name) => name.slice(0, -FILE_SUFFIX.length));

function fixtureText(name: string): string {
	return readFileSync(join(FIXTURES, `${name}${FILE_SUFFIX}`), 'utf8');
}

function fixture(name: string): AnimationFile {
	return parseAnimationFile(fixtureText(name));
}

/** A value as the golden files write it: numbers rounded as files round them. */
function asWritten(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value, (_key, item: unknown) => (typeof item === 'number' ? roundFileNumber(item) : item)));
}

/** What reading says of the symbol-instances fixture after `edit` changes it, or of the file `edit` returns instead. */
function problemsOf(edit: (file: AnimationFile) => object | void): string[] {
	const file = structuredClone(fixture('symbol-instances'));
	const edited = edit(file) ?? file;
	try {
		parseAnimationFile(JSON.stringify(edited));
		return [];
	} catch (error) {
		return error instanceof AnimationFileError ? [...error.problems] : [String(error)];
	}
}

describe('golden fixtures', () => {
	it('cover every kind of item, play mode and tween', () => {
		expect(fixtureNames.length).toBeGreaterThanOrEqual(5);
		const files = fixtureNames.map(fixture);
		const kinds = new Set<string>();
		const plays = new Set<string>();
		const visit = (items: AnimationFile['timeline']['layers'][number]['keyframes'][number]['items']): void => {
			for (const item of items) {
				kinds.add(item.kind);
				if (item.kind === AnimItemKind.Instance) plays.add(item.play);
				if (item.kind === AnimItemKind.Group) visit(item.items);
			}
		};
		for (const file of files) for (const timeline of [file.timeline, ...file.library.map((symbol) => symbol.timeline)]) for (const layer of timeline.layers) for (const keyframe of layer.keyframes) visit(keyframe.items);
		expect([...kinds].sort()).toEqual(Object.values(AnimItemKind).sort());
		expect([...plays].sort()).toEqual(Object.values(PlayMode).sort());
	});

	it.each(fixtureNames)('%s is accepted by the schema and written back byte for byte', (name) => {
		const text = fixtureText(name);
		expect(animationFileSchema.safeParse(JSON.parse(text)).success).toBe(true);
		expect(serializeAnimationFile(fixture(name))).toBe(text);
	});

	it.each(fixtureNames)('%s draws what its golden frames say', (name) => {
		const file = fixture(name);
		const { frames } = JSON.parse(readFileSync(join(FIXTURES, `${name}${FRAMES_SUFFIX}`), 'utf8')) as { frames: Record<string, unknown> };
		for (const [frame, expected] of Object.entries(frames)) expect(asWritten(evaluateFrame(file, Number(frame)))).toEqual(expected);
	});
});

describe('the reference player', () => {
	it('composes a transform as translate · rotate · skewX · scale · translate(−pivot)', () => {
		expect(transformMatrix({ x: 10, y: 20, rotation: 0, scaleX: 2, scaleY: 3, skewX: 0, pivot: { x: 1, y: 1 } })).toEqual([2, 0, 0, 3, 8, 17]);
	});

	it('counts instance time from the keyframe that placed it, at frame boundaries', () => {
		expect(instanceFrame(PlayMode.Single, 2, 9, 4)).toBe(2);
		expect([0, 1, 2, 3, 4, 5].map((elapsed) => instanceFrame(PlayMode.Loop, 1, elapsed, 4))).toEqual([1, 2, 3, 0, 1, 2]);
		expect([0, 1, 2, 3].map((elapsed) => instanceFrame(PlayMode.Once, 1, elapsed, 4))).toEqual([1, 2, 3, 3]);
	});

	it('draws nothing for hidden items, missing symbols or frames outside a layer', () => {
		const file = fixture('motion-linear');
		expect(evaluateFrame(file, 11).layers[0]!.items).toEqual([]);
		expect(evaluateFrame(file, -1).layers[0]!.items).toEqual([]);
		const hidden = structuredClone(file);
		hidden.timeline.layers[0]!.keyframes[0]!.items[0]!.visible = false;
		expect(evaluateFrame(hidden, 0).layers[0]!.items).toEqual([]);
	});
});

describe('schema rules', () => {
	it('rejects an unknown version and files that are not animations', () => {
		expect(problemsOf((file) => ({ ...file, version: 2 }))[0]).toContain('version this editor does not know: 2');
		expect(problemsOf((file) => ({ ...file, format: 'other' }))[0]).toContain('not an animation');
	});

	it('rejects unsorted or repeated keyframes, and keyframes past their layer', () => {
		expect(
			problemsOf((file) => {
				file.timeline.layers[0]!.keyframes.reverse();
			}),
		).toContain(`timeline.layers.0.keyframes.1: ${AnimationFileIssue.UnsortedKeyframes}`);
		expect(
			problemsOf((file) => {
				file.timeline.layers[0]!.length = 1;
			}),
		).toContain(`timeline.layers.0.keyframes.1: ${AnimationFileIssue.KeyframePastLayer}`);
	});

	it('rejects repeated layer, item and symbol ids', () => {
		expect(
			problemsOf((file) => {
				file.timeline.layers.push(structuredClone(file.timeline.layers[0]!));
			}),
		).toContain(`timeline.layers: ${AnimationFileIssue.DuplicateLayerId}`);
		expect(
			problemsOf((file) => {
				const items = file.timeline.layers[0]!.keyframes[1]!.items;
				items.push(structuredClone(items[0]!));
			}),
		).toContain(`timeline.layers.0.keyframes.1.items: ${AnimationFileIssue.DuplicateItemId}`);
		expect(
			problemsOf((file) => {
				file.library.push(structuredClone(file.library[0]!));
			}),
		).toContain(`library: ${AnimationFileIssue.DuplicateSymbolId}`);
	});

	it('rejects instances of missing symbols, first frames past their symbol, and symbols that contain themselves', () => {
		expect(
			problemsOf((file) => {
				file.library.splice(0, 1);
			}),
		).toContain(`timeline.layers.0.keyframes.1.items: ${AnimationFileIssue.MissingSymbol}`);
		expect(
			problemsOf((file) => {
				const item = file.timeline.layers[0]!.keyframes[1]!.items[0]!;
				if (item.kind === AnimItemKind.Instance) item.firstFrame = 9;
			}),
		).toContain(`timeline.layers.0.keyframes.1.items: ${AnimationFileIssue.FirstFramePastSymbol}`);
		expect(
			problemsOf((file) => {
				const ring = file.library[1]!.timeline.layers[0]!.keyframes[0]!.items[0]!;
				if (ring.kind === AnimItemKind.Instance) ring.symbol = 'orbit';
			}),
		).toContain(`library: ${AnimationFileIssue.SymbolCycle}`);
	});

	it('rejects malformed fields with where they are, and ignores unknown fields', () => {
		expect(
			problemsOf((file) => {
				file.stage.fps = 0;
			})[0],
		).toMatch(/^stage\.fps: /);
		expect(problemsOf((file) => ({ ...file, stage: { ...file.stage, background: [2, 0, 0, 1] } }))[0]).toMatch(/^stage\.background\.0: /);
		expect(problemsOf((file) => ({ ...file, comment: 'written by hand', stage: { ...file.stage, extra: true } }))).toEqual([]);
	});
});
