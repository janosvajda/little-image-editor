import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenImageView } from '../assistant/openImages';
import { type VectorPicture, WorkspaceImageExporter } from './workspaceImageExporter';

const Vector: VectorPicture = { markup: '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"/>\n', width: 3, height: 2 };
const Path = 'docs/flow.svg';
let root: string;
let project: string;
let exporter: WorkspaceImageExporter;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'little-image-svg-'));
	project = join(root, 'project');
	await mkdir(project);
	exporter = new WorkspaceImageExporter([{ name: 'Project', path: project }]);
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const picture = vi.fn<() => Promise<OpenImageView>>();
const vector = async () => Vector;

describe('workspace SVG copies', () => {
	it('writes the SVG for a .svg path, with its size, without drawing a PNG', async () => {
		const result = await exporter.export({ path: Path, overwrite: false }, undefined, picture, vector);
		const bytes = new TextEncoder().encode(Vector.markup).byteLength;
		expect(result).toEqual({ path: join(project, Path), format: 'svg', width: 3, height: 2, bytesWritten: bytes });
		expect(await readFile(result.path, 'utf8')).toBe(Vector.markup);
		expect(picture).not.toHaveBeenCalled();
	});

	it('keeps an existing SVG unless overwrite was requested, and stays inside the workspace', async () => {
		await exporter.export({ path: Path, overwrite: false }, undefined, picture, vector);
		await expect(exporter.export({ path: Path, overwrite: false }, undefined, picture, vector)).rejects.toThrow('already exists');
		await exporter.export({ path: Path, overwrite: true }, undefined, picture, vector);
		expect(await readdir(join(project, 'docs'))).toEqual(['flow.svg']);
		await expect(exporter.export({ path: '../flow.svg', overwrite: true }, undefined, picture, vector)).rejects.toThrow('inside an open workspace');
	});

	it('refuses a .svg path when the editor cannot write SVG', async () => {
		await expect(exporter.export({ path: Path, overwrite: false }, undefined, picture)).rejects.toThrow('.png');
		expect(await readdir(project)).toEqual([]);
	});
});
