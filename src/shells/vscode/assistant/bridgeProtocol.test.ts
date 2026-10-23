import { describe, expect, it } from 'vitest';
import { AssistantCommandKind } from '../../../app/features/assistant/assistantCommandTypes';
import {
	BridgeOperation,
	BridgeRequestError,
	bridgeDiscoveryFile,
	isBridgeReply,
	parseBridgeDiscovery,
	parseBridgeRequest,
} from './bridgeProtocol';
import { McpTransport, parseMcpServerArguments } from './mcpServerArguments';

describe('bridge requests', () => {
	it('keeps only what each operation takes', () => {
		expect(parseBridgeRequest({ operation: BridgeOperation.List, extra: true })).toEqual({ operation: BridgeOperation.List });
		expect(parseBridgeRequest({ operation: BridgeOperation.View, maxSize: 64 })).toEqual({ operation: BridgeOperation.View, maxSize: 64 });
		expect(
			parseBridgeRequest({ operation: BridgeOperation.Place, image: 'a.png', request: { path: 'logo.svg', at: { x: 1, y: 2 }, admin: true } }),
		).toEqual({ operation: BridgeOperation.Place, image: 'a.png', request: { path: 'logo.svg', at: { x: 1, y: 2 } } });
		expect(
			parseBridgeRequest({ operation: BridgeOperation.Create, spec: { width: 1, height: 2, background: '#ffffff', transparent: true } }),
		).toEqual({ operation: BridgeOperation.Create, spec: { width: 1, height: 2, background: '#ffffff', transparent: true } });
	});

	it('refuses unknown operations, unknown command kinds and missing fields', () => {
		const malformed: unknown[] = [
			null,
			[],
			{ operation: 'shell' },
			{ operation: BridgeOperation.View },
			{ operation: BridgeOperation.View, maxSize: Number.NaN },
			{ operation: BridgeOperation.Command, command: { kind: 'eval' } },
			{ operation: BridgeOperation.Export, request: { path: 'a.png' } },
			{ operation: BridgeOperation.Place, request: { path: '' } },
			{ operation: BridgeOperation.List, image: 3 },
		];
		for (const request of malformed) expect(() => parseBridgeRequest(request)).toThrow(BridgeRequestError);
		expect(parseBridgeRequest({ operation: BridgeOperation.Command, command: { kind: AssistantCommandKind.Undo } })).toMatchObject({
			command: { kind: AssistantCommandKind.Undo },
		});
	});

	it('recognises replies and discovery files', () => {
		expect(isBridgeReply({ ok: true, result: [] })).toBe(true);
		expect(isBridgeReply({ ok: false, error: 'no' })).toBe(true);
		expect(isBridgeReply({ ok: false })).toBe(false);
		expect(() => parseBridgeDiscovery({ url: 'http://127.0.0.1:1/bridge', token: '', folder: '/p', pid: 1 })).toThrow(BridgeRequestError);
	});

	it('names one discovery file per project folder, inside the home folder', () => {
		const file = bridgeDiscoveryFile('/Users/me/site', '/home/me');
		expect(file).toBe(bridgeDiscoveryFile('/Users/me/site', '/home/me'));
		expect(file).not.toBe(bridgeDiscoveryFile('/Users/me/app', '/home/me'));
		expect(file.startsWith('/home/me/.little-image-editor/bridges/')).toBe(true);
	});
});

describe('the developer-run MCP server command line', () => {
	it('serves the folder it starts in over stdio by default', () => {
		expect(parseMcpServerArguments([], '/project')).toMatchObject({ workspace: '/project', transport: McpTransport.Stdio, port: 0 });
	});

	it('takes a workspace, HTTP transport, port and token', () => {
		expect(
			parseMcpServerArguments(['--workspace', '/site', '--transport', 'http', '--port', '4000', '--token', 'secret'], '/project'),
		).toEqual({ workspace: '/site', transport: McpTransport.Http, port: 4000, token: 'secret' });
	});

	it('refuses unknown transports, bad ports and unknown options', () => {
		expect(() => parseMcpServerArguments(['--transport', 'sse'], '/p')).toThrow('Usage');
		expect(() => parseMcpServerArguments(['--port', 'abc'], '/p')).toThrow('Usage');
		expect(() => parseMcpServerArguments(['--verbose'], '/p')).toThrow();
	});
});
