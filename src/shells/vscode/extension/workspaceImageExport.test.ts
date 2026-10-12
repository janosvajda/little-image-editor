import { mkdtemp, mkdir, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenImageView } from '../assistant/openImages';
import { WorkspaceImageExporter } from './workspaceImageExporter';

const Png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7p8AAAAASUVORK5CYII=', 'base64');
const View: OpenImageView = { name: 'app-icon.svg', png: new Uint8Array(Png), width: 1, height: 1, imageWidth: 1, imageHeight: 1 };
const Asset = 'src/assets/app-icon.png';
let root: string;
let project: string;
let exporter: WorkspaceImageExporter;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'little-image-export-'));
	project = join(root, 'project');
	await mkdir(project);
	exporter = new WorkspaceImageExporter([{ name: 'Project', path: project }]);
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const picture = async () => View;

describe('workspace PNG copies', () => {
	it('creates asset directories and publishes the full PNG with useful metadata', async () => {
		const result = await exporter.export({ path: Asset, overwrite: false }, undefined, picture);
		expect(result).toEqual({ path: join(project, Asset), format: 'png', width: 1, height: 1, bytesWritten: Png.length });
		expect(await readFile(result.path)).toEqual(Png);
		expect(await readdir(join(project, 'src/assets'))).toEqual(['app-icon.png']);
	});

	it('keeps existing contents unless overwrite was requested', async () => {
		await exporter.export({ path: Asset, overwrite: false }, undefined, picture);
		const changed = async () => ({ ...View, png: new Uint8Array([...Png, 0]) });
		await expect(exporter.export({ path: Asset, overwrite: false }, undefined, changed)).rejects.toThrow('already exists');
		expect(await readFile(join(project, Asset))).toEqual(Png);
		await exporter.export({ path: Asset, overwrite: true }, undefined, changed);
		expect(await readFile(join(project, Asset))).toEqual(Buffer.from([...Png, 0]));
		expect(await readdir(join(project, 'src/assets'))).toEqual(['app-icon.png']);
	});

	it('refuses an existing file even when concurrent assistant clients export to it', async () => {
		const results = await Promise.allSettled([
			exporter.export({ path: Asset, overwrite: false }, undefined, picture),
			exporter.export({ path: Asset, overwrite: false }, undefined, picture),
		]);
		expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
		expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
		expect(await readFile(join(project, Asset))).toEqual(Png);
		expect(await readdir(join(project, 'src/assets'))).toEqual(['app-icon.png']);
	});

	it.each(['../outside.png', '/outside.png'])('rejects paths outside the workspace: %s', async (path) => {
		await expect(exporter.export({ path, overwrite: true }, undefined, picture)).rejects.toThrow('inside an open workspace');
	});

	it('rejects a linked directory that points outside, before creating any missing directories', async () => {
		const outside = join(root, 'outside');
		await mkdir(outside);
		await symlink(outside, join(project, 'linked'));
		await expect(exporter.export({ path: 'linked/assets/icon.png', overwrite: true }, undefined, picture)).rejects.toThrow('inside an open workspace');
		expect(await readdir(outside)).toEqual([]);
	});

	it('allows absolute paths within the workspace and uppercase PNG extensions', async () => {
		const path = join(project, 'ICON.PNG');
		expect((await exporter.export({ path, overwrite: false }, undefined, picture)).path).toBe(path);
	});

	it.each(['icon.gif', 'icon.jpg', 'png', '', 'icon\0.png'])('refuses an invalid PNG destination: %s', async (path) => {
		await expect(exporter.export({ path, overwrite: false }, undefined, picture)).rejects.toThrow();
		expect(await readdir(project)).toEqual([]);
	});

	it('requires original resolution and propagates rendering failures without publishing a partial file', async () => {
		await expect(exporter.export({ path: Asset, overwrite: false }, undefined, async () => ({ ...View, imageWidth: 2 }))).rejects.toThrow('original image size');
		await expect(exporter.export({ path: Asset, overwrite: false }, undefined, async () => { throw new Error('Editor closed.'); })).rejects.toThrow('Editor closed.');
		expect(await readdir(join(project, 'src/assets'))).toEqual([]);
	});

	it('uses the image’s workspace or an explicit choice in a multi-root window', async () => {
		const other = join(root, 'other');
		await mkdir(other);
		const multi = new WorkspaceImageExporter([{ name: 'Project', path: project }, { name: 'Other', path: other }]);
		expect((await multi.export({ path: Asset, overwrite: false }, join(other, 'drawing.svg'), picture)).path).toBe(join(other, Asset));
		expect((await multi.export({ path: Asset, workspace: 'Project', overwrite: false }, join(other, 'drawing.svg'), picture)).path).toBe(join(project, Asset));
		await expect(multi.export({ path: 'icon.png', overwrite: false }, undefined, picture)).rejects.toThrow('Choose a workspace folder');
		await expect(multi.export({ path: 'icon.png', workspace: 'Missing', overwrite: false }, undefined, picture)).rejects.toThrow('No workspace folder');
	});

	it('requires a workspace folder', async () => {
		await expect(new WorkspaceImageExporter([]).export({ path: Asset, overwrite: false }, undefined, picture)).rejects.toThrow('Open a local workspace');
	});
});
