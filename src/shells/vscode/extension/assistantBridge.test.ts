import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeDiscoveryFile, DiscoveryPermission } from '../assistant/bridgeProtocol';
import type { BridgeImages } from '../assistant/bridgeServer';

const mock = vi.hoisted(() => ({
	enabled: false,
	home: '',
	folders: [] as Array<{ name: string; uri: { fsPath: string; scheme: string } }>,
	configurationListeners: [] as Array<(change: { affectsConfiguration(section: string): boolean }) => void>,
	error: vi.fn(),
}));

vi.mock('vscode', () => ({
	workspace: {
		get workspaceFolders() {
			return mock.folders;
		},
		getConfiguration: () => ({ get: (_key: string, fallback: boolean) => mock.enabled ?? fallback }),
		onDidChangeConfiguration: (listener: (change: { affectsConfiguration(section: string): boolean }) => void) => {
			mock.configurationListeners.push(listener);
			return { dispose: () => undefined };
		},
		onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }),
	},
	window: { showErrorMessage: mock.error },
}));

import { AssistantBridge } from './assistantBridge';

const images: BridgeImages = {
	list: () => [],
	view: () => Promise.reject(new Error('not used')),
	command: () => Promise.reject(new Error('not used')),
	create: () => Promise.reject(new Error('not used')),
	export: () => Promise.reject(new Error('not used')),
	place: () => Promise.reject(new Error('not used')),
};

function context(): vscode.ExtensionContext {
	const secrets = new Map<string, string>();
	return {
		secrets: {
			get: async (key: string) => secrets.get(key),
			store: async (key: string, value: string) => void secrets.set(key, value),
		},
	} as unknown as vscode.ExtensionContext;
}

const PROJECT = '/projects/site';
let bridge: AssistantBridge | null = null;

beforeEach(async () => {
	mock.home = await mkdtemp(join(tmpdir(), 'bridge-home-'));
	mock.enabled = false;
	mock.folders = [{ name: 'site', uri: { fsPath: PROJECT, scheme: 'file' } }];
	mock.configurationListeners = [];
	mock.error.mockReset();
});

afterEach(async () => {
	bridge?.dispose();
	bridge = null;
	await rm(mock.home, { recursive: true, force: true });
});

async function discovery(): Promise<{ url: string; token: string; folder: string } | undefined> {
	try {
		return JSON.parse(await readFile(bridgeDiscoveryFile(PROJECT, mock.home), 'utf8'));
	} catch {
		return undefined;
	}
}

describe('the extension assistant bridge', () => {
	it('stays off, with nothing published, until its setting is turned on', async () => {
		bridge = new AssistantBridge(context(), images, { appendLine: () => undefined }, mock.home);
		await bridge.sync();
		expect(await discovery()).toBeUndefined();
	});

	it('serves the project when turned on, publishing its address privately, and withdraws it when turned off', async () => {
		mock.enabled = true;
		bridge = new AssistantBridge(context(), images, { appendLine: () => undefined }, mock.home);
		await bridge.sync();
		const published = await discovery();
		expect(published).toMatchObject({ folder: PROJECT, url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/bridge$/) });
		expect((await stat(bridgeDiscoveryFile(PROJECT, mock.home))).mode & 0o777).toBe(DiscoveryPermission.File);
		const answer = await fetch(published!.url, {
			method: 'POST',
			headers: { Authorization: `Bearer ${published!.token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ operation: 'list' }),
		});
		expect(await answer.json()).toEqual({ ok: true, result: [] });

		mock.enabled = false;
		for (const listener of mock.configurationListeners) listener({ affectsConfiguration: () => true });
		await bridge.sync();
		expect(await discovery()).toBeUndefined();
		await expect(fetch(published!.url, { method: 'POST' })).rejects.toThrow();
	});

	it('does not serve a remote folder, whose discovery file no local MCP server could read', async () => {
		mock.enabled = true;
		mock.folders = [{ name: 'remote', uri: { fsPath: PROJECT, scheme: 'vscode-remote' } }];
		bridge = new AssistantBridge(context(), images, { appendLine: () => undefined }, mock.home);
		await bridge.sync();
		expect(await discovery()).toBeUndefined();
		expect(mock.error).not.toHaveBeenCalled();
	});
});
