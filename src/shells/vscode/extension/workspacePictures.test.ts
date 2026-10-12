import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssistantCommand } from '../../../app/features/assistant/assistantCommandTypes';
import { type RunningAssistantServer, startAssistantServer } from '../assistant/assistantServer';
import type { ImagePlacementRequest, PlaceableImages } from '../assistant/openImages';
import { PlaceTool } from '../assistant/placeTools';
import { WorkspacePictureReader } from './workspacePictureReader';
import { WorkspacePaths } from './workspacePaths';

const LOGO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
let root: string;
let project: string;
let reader: WorkspacePictureReader;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'little-image-place-'));
	project = join(root, 'project');
	await mkdir(join(project, 'assets'), { recursive: true });
	await writeFile(join(project, 'assets/logo.svg'), LOGO);
	reader = new WorkspacePictureReader([{ name: 'Project', path: project }]);
});
afterEach(async () => rm(root, { recursive: true, force: true }));

describe('reading pictures from the workspace', () => {
	it('reads a picture by a path in the workspace, with its name', async () => {
		expect(await reader.read({ path: 'assets/logo.svg' }, undefined)).toEqual({ fileName: 'logo.svg', bytes: new Uint8Array(LOGO) });
		expect((await reader.read({ path: join(project, 'assets/logo.svg') }, undefined)).fileName).toBe('logo.svg');
	});

	it('refuses files that are not pictures, paths outside, and links that lead outside', async () => {
		await writeFile(join(project, 'notes.txt'), 'hi');
		await expect(reader.read({ path: 'notes.txt' }, undefined)).rejects.toThrow('Place a PNG, JPEG, WebP or SVG image.');
		await expect(reader.read({ path: '../outside.png' }, undefined)).rejects.toThrow('inside an open workspace folder');
		await writeFile(join(root, 'secret.png'), 'x');
		await symlink(join(root, 'secret.png'), join(project, 'assets/linked.png'));
		await expect(reader.read({ path: 'assets/linked.png' }, undefined)).rejects.toThrow('inside an open workspace folder');
		await expect(new WorkspacePictureReader([]).read({ path: 'assets/logo.svg' }, undefined)).rejects.toThrow('Open a local workspace folder');
	});

	it('chooses among several folders by name, or by where the open image is', () => {
		const other = join(root, 'other');
		const paths = new WorkspacePaths(
			[
				{ name: 'Project', path: project },
				{ name: 'Other', path: other },
			],
			{ noWorkspace: 'none', outside: 'outside' },
		);
		expect(paths.workspaceFor({ path: 'a.png', workspace: 'Other' }, undefined).name).toBe('Other');
		expect(paths.workspaceFor({ path: 'a.png' }, join(project, 'image.svg')).name).toBe('Project');
		expect(() => paths.workspaceFor({ path: 'a.png' }, undefined)).toThrow('Choose a workspace folder with workspace: Project, Other.');
		expect(() => paths.workspaceFor({ path: 'a.png', workspace: 'Missing' }, undefined)).toThrow('No workspace folder is called Missing.');
	});
});

describe('the place_image tool', () => {
	let server: RunningAssistantServer | null = null;
	afterEach(async () => {
		await server?.close();
		server = null;
	});

	it('places a workspace picture where asked, with a corner only when both x and y are given', async () => {
		const placed: ImagePlacementRequest[] = [];
		const images: PlaceableImages = {
			list: () => [],
			view: () => Promise.reject(new Error('not used')),
			command: async (_image: string | undefined, _command: AssistantCommand) => ({ undone: false }),
			create: () => Promise.reject(new Error('not used')),
			place: async (_image, request) => {
				placed.push(request);
				return { itemId: 'i', layerId: 'l', layerName: 'Logos' };
			},
		};
		server = await startAssistantServer({ port: 0, token: 't', images, identity: { name: 'little-image-editor', version: '0' } });
		const client = new Client({ name: 'test', version: '0' });
		await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: { Authorization: 'Bearer t' } } }));
		await client.callTool({ name: PlaceTool.Image, arguments: { path: 'assets/logo.svg', layer: 'Logos', x: 10, y: 20, width: 64 } });
		await client.callTool({ name: PlaceTool.Image, arguments: { path: 'assets/logo.svg', x: 10 } });
		expect(placed).toEqual([{ path: 'assets/logo.svg', layer: 'Logos', at: { x: 10, y: 20 }, width: 64 }, { path: 'assets/logo.svg' }]);
		await client.close();
	});
});
