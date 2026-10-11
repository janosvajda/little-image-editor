import type { Flowchart, FlowchartGroup, FlowchartLink, FlowchartNode, FlowDirection } from './mermaidFlowchart';

/** Diagrams larger than this stop being readable as one picture. */
export const MAX_DIAGRAM_NODES = 200;

interface GroupDraft {
	id: string;
	label: string;
	nodeIds: string[];
	parent?: string;
}

/**
 * Collects a diagram's nodes, links and nested groups as a reader finds
 * them, for every Mermaid diagram drawn as a graph. A node belongs to the
 * group open where it first appears. A node that is only ever named, never
 * declared, and turns out to be a group's id stands for that group.
 */
export class GraphBuilder {
	readonly #nodes = new Map<string, FlowchartNode>();
	/** Nodes only named, never declared with a label or shape. */
	readonly #named = new Set<string>();
	readonly #links: FlowchartLink[] = [];
	readonly #groups: GroupDraft[] = [];
	readonly #openGroups: GroupDraft[] = [];

	constructor(private readonly tooMany: (maximum: number) => never) {}

	get openGroup(): string | undefined {
		return this.#openGroups.at(-1)?.id;
	}

	node(id: string): FlowchartNode | undefined {
		return this.#nodes.get(id);
	}

	/** Declares a node, or changes one already declared; its group stays the one it first appeared in. */
	declare(node: FlowchartNode): void {
		this.add(node);
		this.#named.delete(node.id);
	}

	/** Names a node, which is declared as itself unless declared otherwise elsewhere. */
	name(id: string, fallback: () => FlowchartNode): void {
		if (this.#nodes.has(id)) {
			this.place(id);
			return;
		}
		this.add(fallback());
		this.#named.add(id);
	}

	link(link: FlowchartLink): void {
		this.#links.push(link);
	}

	open(id: string, label: string): void {
		const parent = this.openGroup;
		const group: GroupDraft = { id, label, nodeIds: [], ...(parent ? { parent } : {}) };
		this.#groups.push(group);
		this.#openGroups.push(group);
	}

	/** Closes the innermost group; whether one was open. */
	close(): boolean {
		return Boolean(this.#openGroups.pop());
	}

	get unclosed(): string | undefined {
		return this.#openGroups.at(-1)?.label;
	}

	build(direction: FlowDirection): Flowchart {
		// A link to a group's id links to the group, not to a node of that name.
		const groupIds = new Set(this.#groups.map((group) => group.id));
		for (const id of this.#named) if (groupIds.has(id)) this.#nodes.delete(id);
		return {
			direction,
			nodes: [...this.#nodes.values()],
			links: this.#links,
			groups: this.#groups.map((group): FlowchartGroup => ({ ...group, nodeIds: group.nodeIds.filter((id) => this.#nodes.has(id)) })),
		};
	}

	private add(node: FlowchartNode): void {
		this.#nodes.set(node.id, node);
		if (this.#nodes.size > MAX_DIAGRAM_NODES) this.tooMany(MAX_DIAGRAM_NODES);
		this.place(node.id);
	}

	private place(id: string): void {
		const group = this.#openGroups.at(-1);
		if (group && !this.#groups.some((candidate) => candidate.nodeIds.includes(id))) group.nodeIds.push(id);
	}
}
