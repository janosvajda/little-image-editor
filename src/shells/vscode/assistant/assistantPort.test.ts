import { describe, expect, it } from 'vitest';
import { AssistantPortRange, assistantPortsFor } from './assistantPort';

describe('assistant server ports', () => {
	it('gives a project the same ports every time, and different projects different ones', () => {
		const first = assistantPortsFor('/Users/me/projects/site');
		expect(assistantPortsFor('/Users/me/projects/site')).toEqual(first);
		expect(assistantPortsFor('/Users/me/projects/app')[0]).not.toBe(first[0]);
	});

	it('tries consecutive ports inside the range, wrapping at its end', () => {
		const ports = assistantPortsFor('/any/project');
		expect(ports).toHaveLength(AssistantPortRange.Attempts);
		const last = AssistantPortRange.First + AssistantPortRange.Size - 1;
		for (const port of ports) {
			expect(port).toBeGreaterThanOrEqual(AssistantPortRange.First);
			expect(port).toBeLessThanOrEqual(last);
		}
		for (const [index, port] of ports.slice(1).entries())
			expect(port === ports[index]! + 1 || (ports[index] === last && port === AssistantPortRange.First)).toBe(true);
	});
});
