import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
	type AssistantResult,
	type DescribedItem,
	type DocumentDescription,
	shortId,
} from '../../../app/features/assistant/assistantCommandTypes';
import type { CropRect } from '../../../app/core/document/appTypes';

/**
 * Replies are short on purpose: an assistant reads and keeps every reply,
 * so each word costs tokens in the rest of the conversation.
 */
export function textResult(text: string, isError = false): CallToolResult {
	return { content: [{ type: 'text', text }], isError };
}

/** Runs an action and replies with its text, or with why it failed as a tool error. */
export async function outcome(action: () => Promise<string>): Promise<CallToolResult> {
	try {
		return textResult(await action());
	} catch (error) {
		return textResult(error instanceof Error ? error.message : String(error), true);
	}
}

/** Results without a text form of their own, as compact JSON. */
export function jsonOutcome<Result extends object>(action: () => Promise<Result>): Promise<CallToolResult> {
	return outcome(async () => JSON.stringify(await action()));
}

/** An editing command's result in a few words, with ids shortened. */
export function describeResult(result: AssistantResult): string {
	if ('document' in result) return describeDocument(result.document);
	if ('batch' in result) {
		const { layers, items } = result.batch;
		const added = layers.length ? `${count(layers.length, 'layer')} (${layers.join(', ')}), ` : '';
		return `ok: added ${added}${count(items, 'item')}`;
	}
	if ('itemId' in result) return `ok: item ${shortId(result.itemId)} on layer ${result.layerName} (${shortId(result.layerId)})`;
	if ('layerId' in result) return `ok: layer ${result.layerName} (${shortId(result.layerId)})`;
	if ('removed' in result) return `ok: removed ${shortId(result.removed)}`;
	return result.undone ? 'ok: undone' : 'nothing to undo';
}

function count(amount: number, noun: string): string {
	return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}

/** The image and its layers, bottom first: one line per layer and per item. */
function describeDocument(document: DocumentDescription): string {
	const lines = [`${document.name} ${document.width}x${document.height}; layers bottom first; ids can be passed back`];
	if (!document.layers.length) lines.push('(no layers yet)');
	for (const layer of document.layers) {
		const flags = [layer.active && 'active', !layer.visible && 'hidden', layer.locked && 'locked'].filter(Boolean);
		lines.push(`${layer.name} ${shortId(layer.id)}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
		for (const item of layer.items) lines.push(`  ${describeItem(item)}`);
	}
	return lines.join('\n');
}

function describeItem(item: DescribedItem): string {
	return [
		shortId(item.id),
		item.shape ?? item.type,
		item.color,
		item.bounds && describeBounds(item.bounds),
		item.text !== undefined && JSON.stringify(item.text),
	]
		.filter(Boolean)
		.join(' ');
}

function describeBounds({ x, y, width, height }: CropRect): string {
	return `${Math.round(x)},${Math.round(y)} ${Math.round(width)}x${Math.round(height)}`;
}
