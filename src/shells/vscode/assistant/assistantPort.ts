/**
 * Ports for the assistant server. Each project folder has its own port, the
 * same every time, so the address registered for it stays valid across
 * restarts while several VS Code windows each serve their own project.
 */
export const AssistantPortRange = {
	First: 47_100,
	Size: 800,
	/** Consecutive ports tried when a folder's port is taken by another program. */
	Attempts: 10,
} as const;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** The ports to try for a folder, its own first, all inside the range. */
export function assistantPortsFor(folderPath: string): readonly number[] {
	const start = fnv1a(folderPath) % AssistantPortRange.Size;
	return Array.from(
		{ length: AssistantPortRange.Attempts },
		(_, attempt) => AssistantPortRange.First + ((start + attempt) % AssistantPortRange.Size),
	);
}

/** A small, stable string hash (FNV-1a, 32 bits). */
function fnv1a(text: string): number {
	let hash = FNV_OFFSET_BASIS;
	for (const character of text) {
		hash ^= character.codePointAt(0)!;
		hash = Math.imul(hash, FNV_PRIME);
	}
	return hash >>> 0;
}
