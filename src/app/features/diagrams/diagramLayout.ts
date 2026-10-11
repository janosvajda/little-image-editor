import type { CropRect, Point } from '../../core/document/appTypes';
import { TextShapeMetrics } from '../../core/geometry/textShapeMetrics';
import {
	type Flowchart,
	FlowDirection,
	type FlowchartGroup,
	type FlowchartLink,
	type FlowchartNode,
	LABEL_LINE_BREAK,
	NodeShape,
} from './mermaidFlowchart';

/**
 * Places a flowchart as a layered drawing. Nodes go into ranks along the
 * flow; a link that skips ranks gets an invisible waypoint in each rank it
 * crosses, so it has a lane of its own instead of running over boxes. Across
 * the flow, every group packs its members and inner groups into free space,
 * so a frame never holds a stranger. Links bend at right angles in the gaps
 * between ranks, each on its own track. Pure geometry with the editor's own
 * text metrics, so every editor shell can use it.
 */

export const DiagramMetrics = {
	FontSize: 16,
	PaddingX: 18,
	PaddingY: 10,
	MinimumWidth: 96,
	MinimumHeight: 42,
	NodeGap: 36,
	RankGap: 72,
	GroupPadding: 18,
	GroupTitle: 24,
	Margin: 24,
	/** A diamond holds its text in its middle half. */
	DiamondScale: 1.7,
	OrderingSweeps: 6,
	/** The room a link's waypoint takes across the flow. */
	WaypointWidth: 10,
	WaypointGap: 10,
	StartDiameter: 24,
	ChoiceSize: 32,
	EndDiameter: 28,
	/** A fork or join bar: long across the flow, thin along it. */
	BarLength: 72,
	BarThickness: 8,
	/** Space around the lines of a class's section, and the height of an empty one. */
	SectionPadding: 6,
	EmptySectionHeight: 8,
	/** A link back against the flow leaves and enters this far outside its ends' ranks, on a lane this far beside everything. */
	BackLinkOffset: 14,
	BackLaneGap: 24,
	/** A link from a node to itself loops this far out beside it. */
	SelfLoopSize: 24,
} as const;

export interface PlacedNode {
	readonly node: FlowchartNode;
	readonly rect: CropRect;
}

export interface PlacedLink {
	readonly link: FlowchartLink;
	/** From the first node's side to the second node's side; an arrowhead goes on the last point. */
	readonly points: readonly Point[];
	/** The middle of the link, where its label goes. */
	readonly middle: Point;
}

export interface PlacedGroup {
	readonly group: FlowchartGroup;
	readonly rect: CropRect;
}

export interface DiagramLayout {
	readonly width: number;
	readonly height: number;
	readonly nodes: readonly PlacedNode[];
	readonly links: readonly PlacedLink[];
	/** Outer groups first, so inner ones are drawn over them. */
	readonly groups: readonly PlacedGroup[];
}

interface Size {
	readonly width: number;
	readonly height: number;
}

const HALF = 2;
/** The height of one line of diagram text, for placing labels. */
export const DIAGRAM_LINE_HEIGHT = DiagramMetrics.FontSize * TextShapeMetrics.LineHeight;
/** The container of everything outside groups. */
const ROOT = '';
/** Waypoint ids cannot clash with node ids, which never contain this. */
const WAYPOINT_PREFIX = '~';
/** A link's two ends, by their property names. */
const LinkEnd = { From: 'from', To: 'to' } as const;
type LinkEnd = (typeof LinkEnd)[keyof typeof LinkEnd];
const VisitState = { Visiting: 'visiting', Done: 'done' } as const;
type VisitState = (typeof VisitState)[keyof typeof VisitState];

export function textSize(lines: readonly string[], fontSize: number = DiagramMetrics.FontSize): Size {
	const longest = Math.max(0, ...lines.map((line) => line.length));
	return {
		width: longest * fontSize * TextShapeMetrics.WidthPerCharacter,
		height: lines.length * fontSize * TextShapeMetrics.LineHeight,
	};
}

export function layoutFlowchart(chart: Flowchart): DiagramLayout {
	return new FlowchartLayout(chart).layout();
}

/** A rectangle in flow coordinates: `u` runs along the flow, `v` across it. */
interface FlowRect {
	readonly u: number;
	readonly v: number;
	readonly along: number;
	readonly across: number;
}

interface FlowPoint {
	readonly u: number;
	readonly v: number;
}

/** A node or a link's waypoint: one thing placed in a rank. */
interface Unit {
	readonly id: string;
	readonly rank: number;
	readonly container: string;
	readonly along: number;
	readonly across: number;
	/** The link a waypoint belongs to; nodes have none. */
	readonly route?: number;
}

/** A link between the nodes that stand for its ends, with the waypoints it passes. */
interface Route {
	readonly link: FlowchartLink;
	readonly from: string;
	readonly to: string;
	readonly stations: readonly string[];
	readonly forward: boolean;
}

/** Something packed across the flow inside a container: a unit, or a whole inner group. */
interface Block {
	readonly id: string;
	/** The units placed with the block: a node, or a link's waypoints sharing one lane. */
	readonly units: readonly string[];
	readonly group: boolean;
	readonly firstRank: number;
	readonly lastRank: number;
	readonly size: number;
	readonly order: number;
	readonly waypoint: boolean;
}

class FlowchartLayout {
	readonly #horizontal: boolean;
	readonly #reversed: boolean;
	readonly #groups: Map<string, FlowchartGroup>;
	readonly #containerOf = new Map<string, string>();
	readonly #ranks = new Map<string, number>();
	readonly #units = new Map<string, Unit>();
	readonly #routes: Route[] = [];
	readonly #position = new Map<string, number>();
	readonly #cross = new Map<string, number>();
	readonly #frames = new Map<string, FlowRect>();
	#layers: string[][] = [];
	#rankStarts: number[] = [];
	#thickness: number[] = [];

	constructor(private readonly chart: Flowchart) {
		this.#horizontal = chart.direction === FlowDirection.LeftRight || chart.direction === FlowDirection.RightLeft;
		this.#reversed = chart.direction === FlowDirection.BottomUp || chart.direction === FlowDirection.RightLeft;
		this.#groups = new Map(chart.groups.map((group) => [group.id, group]));
		for (const group of chart.groups) for (const id of group.nodeIds) this.#containerOf.set(id, group.id);
	}

	layout(): DiagramLayout {
		const ends = this.resolveEnds();
		this.addUnits(ends);
		this.order();
		this.placeAlong();
		this.placeAcross(ROOT, 0);
		this.frameGroups();
		const nodes = this.chart.nodes.map((node) => ({ node, rect: this.rectOf(node.id) }));
		const groups = this.placedGroups();
		const links = this.routeLinks();
		return fitToMargin(nodes, links, groups);
	}

	/**
	 * Each link by the nodes that stand for its ends. A link to a group
	 * constrains all the group's entry nodes (and one from a group all its exit
	 * nodes) when ranking; it is drawn to the entry nearest the flow's start.
	 */
	private resolveEnds(): { link: FlowchartLink; from: string; to: string }[] {
		const nodeLinks = this.chart.links.filter((link) => !this.#groups.has(link.from) && !this.#groups.has(link.to));
		const ends = (link: FlowchartLink, end: LinkEnd): string[] => {
			const id = link[end];
			return this.#groups.has(id) ? this.boundary(id, nodeLinks, end === LinkEnd.To) : [id];
		};
		this.rank(
			this.chart.links.flatMap((link) =>
				ends(link, LinkEnd.From).flatMap((from) => ends(link, LinkEnd.To).filter((to) => to !== from).map((to) => [from, to] as [string, string])),
			),
		);
		const byRank = (ids: string[]) => [...ids].sort((left, right) => this.#ranks.get(left)! - this.#ranks.get(right)!);
		return this.chart.links.flatMap((link) => {
			const from = byRank(ends(link, LinkEnd.From)).at(-1);
			const to = byRank(ends(link, LinkEnd.To))[0];
			return from && to && link.from !== link.to ? [{ link, from, to }] : [];
		});
	}

	/** A group's entry nodes (nothing inside leads to them) or exit nodes (they lead nowhere inside). */
	private boundary(group: string, nodeLinks: readonly FlowchartLink[], entry: boolean): string[] {
		const inside = new Set(this.descendants(group));
		const boundary = [...inside].filter(
			(id) => !nodeLinks.some((link) => (entry ? link.to === id && inside.has(link.from) : link.from === id && inside.has(link.to))),
		);
		return boundary.length ? boundary : [...inside];
	}

	/**
	 * Each node's rank: the longest chain of links leading to it, ignoring the
	 * links that close a cycle; a node nothing leads to then moves down to just
	 * before the nearest node it leads to, instead of waiting at the top.
	 */
	private rank(pairs: readonly [string, string][]): void {
		const forward = this.acyclic(pairs);
		const ids = this.chart.nodes.map(({ id }) => id);
		const incoming = new Map(ids.map((id) => [id, 0]));
		for (const targets of forward.values()) for (const target of targets) incoming.set(target, incoming.get(target)! + 1);
		const sources = ids.filter((id) => incoming.get(id) === 0);
		for (const id of ids) this.#ranks.set(id, 0);
		const ready = [...sources];
		while (ready.length) {
			const id = ready.shift()!;
			for (const next of forward.get(id)!) {
				this.#ranks.set(next, Math.max(this.#ranks.get(next)!, this.#ranks.get(id)! + 1));
				incoming.set(next, incoming.get(next)! - 1);
				if (incoming.get(next) === 0) ready.push(next);
			}
		}
		for (const id of sources) {
			const targets = forward.get(id)!;
			if (targets.length) this.#ranks.set(id, Math.min(...targets.map((target) => this.#ranks.get(target)!)) - 1);
		}
	}

	/** The links that keep their direction once the links closing cycles are left out. */
	private acyclic(pairs: readonly [string, string][]): Map<string, string[]> {
		const ids = this.chart.nodes.map(({ id }) => id);
		const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
		for (const [from, to] of pairs) outgoing.get(from)!.push(to);
		const forward = new Map(ids.map((id) => [id, [] as string[]]));
		const state = new Map<string, VisitState>();
		const visit = (id: string): void => {
			state.set(id, VisitState.Visiting);
			for (const next of outgoing.get(id)!) {
				if (state.get(next) === VisitState.Visiting) continue;
				forward.get(id)!.push(next);
				if (!state.has(next)) visit(next);
			}
			state.set(id, VisitState.Done);
		};
		for (const id of ids) if (!state.has(id)) visit(id);
		return forward;
	}

	/** Nodes, and a waypoint in every rank a forward link passes, in the container both its ends share. */
	private addUnits(ends: readonly { link: FlowchartLink; from: string; to: string }[]): void {
		for (const node of this.chart.nodes) {
			const size = nodeSize(node, this.#horizontal);
			this.#units.set(node.id, {
				id: node.id,
				rank: this.#ranks.get(node.id)!,
				container: this.#containerOf.get(node.id) ?? ROOT,
				along: this.#horizontal ? size.width : size.height,
				across: this.#horizontal ? size.height : size.width,
			});
		}
		ends.forEach(({ link, from, to }, index) => {
			const first = this.#ranks.get(from)!;
			const last = this.#ranks.get(to)!;
			const forward = last > first;
			const container = this.commonContainer(this.endContainer(link.from), this.endContainer(link.to));
			const stations = [from];
			for (let rank = first + 1; forward && rank < last; rank++) {
				const id = `${WAYPOINT_PREFIX}${index}${WAYPOINT_PREFIX}${rank}`;
				this.#units.set(id, {
					id,
					rank,
					container,
					along: 0,
					across: DiagramMetrics.WaypointWidth,
					route: index,
				});
				stations.push(id);
			}
			stations.push(to);
			this.#routes.push({ link, from: link.from, to: link.to, stations, forward });
		});
	}

	/** Units per rank, reordered by the average position of their neighbours to reduce crossing links. */
	private order(): void {
		for (const unit of this.#units.values()) (this.#layers[unit.rank] ??= []).push(unit.id);
		for (let rank = 0; rank < this.#layers.length; rank++) this.#layers[rank] ??= [];
		const { above, below } = this.neighbours();
		this.rememberOrder();
		for (let sweep = 0; sweep < DiagramMetrics.OrderingSweeps; sweep++) {
			const downward = sweep % HALF === 0;
			for (const layer of downward ? this.#layers : [...this.#layers].reverse()) {
				layer.sort((left, right) => this.barycentre(left, downward ? above : below) - this.barycentre(right, downward ? above : below));
				this.rememberOrder();
			}
		}
	}

	/** Each unit's neighbours in the rank before and after it, along the forward links. */
	private neighbours(): { above: Map<string, string[]>; below: Map<string, string[]> } {
		const above = new Map<string, string[]>();
		const below = new Map<string, string[]>();
		for (const { stations } of this.#routes.filter((route) => route.forward))
			for (const [index, id] of stations.slice(1).entries()) {
				const previous = stations[index]!;
				above.set(id, [...(above.get(id) ?? []), previous]);
				below.set(previous, [...(below.get(previous) ?? []), id]);
			}
		return { above, below };
	}

	private barycentre(id: string, neighbours: Map<string, string[]>): number {
		const others = neighbours.get(id) ?? [];
		return others.length ? others.reduce((sum, other) => sum + this.#position.get(other)!, 0) / others.length : this.#position.get(id)!;
	}

	private rememberOrder(): void {
		for (const layer of this.#layers) layer.forEach((id, index) => this.#position.set(id, (index + 1) / (layer.length + 1)));
	}

	/** Where each rank starts along the flow, leaving room in each gap for the group frames that end or start there. */
	private placeAlong(): void {
		this.#thickness = this.#layers.map((layer) => Math.max(0, ...layer.map((id) => this.#units.get(id)!.along)));
		let start = 0;
		this.#rankStarts = this.#thickness.map((thickness, rank) => {
			const rankStart = start;
			start += thickness + this.gapAfter(rank);
			return rankStart;
		});
	}

	private gapAfter(rank: number): number {
		return DiagramMetrics.RankGap + this.frameSpace(rank, true) + this.frameSpace(rank + 1, false);
	}

	/**
	 * The room nested frames need beside a rank: their padding, and on a
	 * vertical flow their titles too, for as many frames as end (or start) there inside one another.
	 */
	private frameSpace(rank: number, ending: boolean): number {
		const edge = (group: FlowchartGroup) => {
			const ranks = this.descendantUnits(group.id).map((unit) => unit.rank);
			return ranks.length ? (ending ? Math.max(...ranks) : Math.min(...ranks)) : undefined;
		};
		const matching = new Set(this.chart.groups.filter((group) => edge(group) === rank).map((group) => group.id));
		const nesting = (id: string): number => {
			const parent = this.#groups.get(id)?.parent;
			return 1 + (parent && matching.has(parent) ? nesting(parent) : 0);
		};
		const depth = Math.max(0, ...[...matching].map(nesting));
		const title = this.#horizontal ? 0 : DiagramMetrics.GroupTitle;
		return depth * (DiagramMetrics.GroupPadding + title);
	}

	/** Packs a container's blocks into free space across the flow, then places what is inside each. */
	private placeAcross(container: string, offset: number): number {
		const placed: { block: Block; start: number }[] = [];
		for (const block of this.blocksIn(container)) {
			let start = 0;
			for (let blocker = firstBlocker(block, start, placed); blocker; blocker = firstBlocker(block, start, placed))
				start = blocker.start + blocker.block.size + gapBetween(block, blocker.block);
			placed.push({ block, start });
			if (block.group) this.placeAcross(block.id, offset + start + this.frameLead());
			else for (const id of block.units) this.#cross.set(id, offset + start + block.size / HALF);
		}
		return Math.max(0, ...placed.map(({ block, start }) => start + block.size));
	}

	/** A container's units and inner groups as blocks, in the order the ranks were sorted into. */
	private blocksIn(container: string): Block[] {
		const units = [...this.#units.values()].filter((unit) => unit.container === container);
		const nodes = units.filter((unit) => unit.route === undefined);
		const lanes = new Map<number, Unit[]>();
		for (const unit of units)
			if (unit.route !== undefined) lanes.set(unit.route, [...(lanes.get(unit.route) ?? []), unit]);
		const groups = this.chart.groups.filter((group) => (group.parent ?? ROOT) === container && this.descendantUnits(group.id).length);
		const blocks: Block[] = [
			...nodes.map((unit) => ({
				id: unit.id,
				units: [unit.id],
				group: false,
				firstRank: unit.rank,
				lastRank: unit.rank,
				size: unit.across,
				order: this.#position.get(unit.id)!,
				waypoint: false,
			})),
			// A link's waypoints form one lane, so the link runs straight past everything beside it.
			...[...lanes.values()].map((waypoints) => ({
				id: waypoints[0]!.id,
				units: waypoints.map((unit) => unit.id),
				group: false,
				firstRank: Math.min(...waypoints.map((unit) => unit.rank)),
				lastRank: Math.max(...waypoints.map((unit) => unit.rank)),
				size: DiagramMetrics.WaypointWidth,
				order: waypoints.reduce((sum, unit) => sum + this.#position.get(unit.id)!, 0) / waypoints.length,
				waypoint: true,
			})),
			...groups.map((group) => {
				const inside = this.descendantUnits(group.id);
				const ranks = inside.map((unit) => unit.rank);
				return {
					id: group.id,
					units: [],
					group: true,
					firstRank: Math.min(...ranks),
					lastRank: Math.max(...ranks),
					size: this.innerSize(group.id) + this.frameLead() + DiagramMetrics.GroupPadding,
					order: inside.reduce((sum, unit) => sum + this.#position.get(unit.id)!, 0) / inside.length,
					waypoint: false,
				};
			}),
		];
		return blocks.sort((left, right) => left.order - right.order);
	}

	/** How wide a group's contents are across the flow, by packing them on their own. */
	private innerSize(group: string): number {
		const saved = new Map(this.#cross);
		const size = this.placeAcross(group, 0);
		this.#cross.clear();
		for (const [id, value] of saved) this.#cross.set(id, value);
		return size;
	}

	/** Room across the flow before a group's contents: its padding, and on a horizontal flow its title. */
	private frameLead(): number {
		return DiagramMetrics.GroupPadding + (this.#horizontal ? DiagramMetrics.GroupTitle : 0);
	}

	/** Each group's frame in flow coordinates, around its units and inner frames. */
	private frameGroups(): void {
		const frame = (group: FlowchartGroup): FlowRect | undefined => {
			if (this.#frames.has(group.id)) return this.#frames.get(group.id);
			const inner = [
				...this.chart.groups.filter((child) => child.parent === group.id).map(frame),
				...[...this.#units.values()].filter((unit) => unit.container === group.id).map((unit) => this.flowRectOf(unit.id)),
			].filter((rect): rect is FlowRect => Boolean(rect));
			if (!inner.length) return undefined;
			const bounds = flowUnion(inner);
			const title = DiagramMetrics.GroupTitle;
			const pad = DiagramMetrics.GroupPadding;
			// The title sits at the top of the picture: across the flow when it runs sideways, along it otherwise.
			const titleBefore = !this.#horizontal && !this.#reversed ? title : 0;
			const titleAfter = !this.#horizontal && this.#reversed ? title : 0;
			const titleAcross = this.#horizontal ? title : 0;
			const rect = {
				u: bounds.u - pad - titleBefore,
				v: bounds.v - pad - titleAcross,
				along: bounds.along + pad * HALF + titleBefore + titleAfter,
				across: bounds.across + pad * HALF + titleAcross,
			};
			this.#frames.set(group.id, rect);
			return rect;
		};
		for (const group of this.chart.groups) frame(group);
	}

	private placedGroups(): PlacedGroup[] {
		const depth = (group: FlowchartGroup): number => {
			const parent = group.parent ? this.#groups.get(group.parent) : undefined;
			return parent ? depth(parent) + 1 : 0;
		};
		return this.chart.groups
			.filter((group) => this.#frames.has(group.id))
			.sort((left, right) => depth(left) - depth(right))
			.map((group) => ({ group, rect: this.toRect(this.#frames.get(group.id)!) }));
	}

	/**
	 * A forward link leaves its first end on the side facing the flow, turns
	 * in each gap between ranks on a track of its own and passes its
	 * waypoints, entering its last end from the side facing back. Links
	 * against the flow join the nearest sides directly.
	 */
	private routeLinks(): PlacedLink[] {
		const tracks = this.assignTracks();
		const backLanes = this.#routes.filter((route) => !route.forward && this.rankOf(route.from) !== this.rankOf(route.to));
		const selfLoops = this.chart.links.filter((link) => link.from === link.to && this.#units.has(link.from)).map((link) => this.selfLoop(link));
		return [...this.#routes.map((route, index) => {
			const from = this.toRect(this.endRect(route.from));
			const to = this.toRect(this.endRect(route.to));
			if (!route.forward && this.rankOf(route.from) === this.rankOf(route.to)) {
				const points = nearestSides(from, to);
				return { link: route.link, points, middle: midpoint(points[0]!, points[1]!) };
			}
			if (!route.forward) return this.backLink(route, backLanes.indexOf(route));
			const start = this.endRect(route.from);
			const end = this.endRect(route.to);
			const path: FlowPoint[] = [{ u: start.u + start.along, v: start.v + start.across / HALF }];
			const crossings = route.stations.slice(1).map((station, step) => ({
				track: tracks.get(`${index}${WAYPOINT_PREFIX}${step}`)!,
				v: station === route.stations.at(-1) ? end.v + end.across / HALF : this.#cross.get(station)!,
			}));
			let middle: FlowPoint | undefined;
			for (const [step, { track, v }] of crossings.entries()) {
				const previous = path.at(-1)!;
				path.push({ u: track, v: previous.v }, { u: track, v });
				if (step === Math.floor((crossings.length - 1) / HALF)) middle = { u: track, v: (previous.v + v) / HALF };
			}
			path.push({ u: end.u, v: end.v + end.across / HALF });
			const points = simplify(path.map((point) => this.toPoint(point)));
			const straight = points.length === HALF;
			return {
				link: route.link,
				points,
				middle: straight || !middle ? midpoint(points[0]!, points.at(-1)!) : this.toPoint(middle),
			};
		}), ...selfLoops];
	}

	/**
	 * A link against the flow goes around everything, on the side its source is
 * nearer: out of its source into
	 * the gap before the source's rank, along its own lane beside the diagram,
	 * and into its target from the gap after the target's rank. It leaves and
	 * enters off centre, on the lane's side, so it does not share the points
	 * where links along the flow meet the boxes.
	 */
	private backLink(route: Route, lane: number): PlacedLink {
		const start = this.endRect(route.from);
		const end = this.endRect(route.to);
		const bounds = this.acrossBounds();
		const centre = start.v + start.across / HALF;
		const outward = centre > (bounds.first + bounds.last) / HALF ? 1 : -1;
		const spread = lane * DiagramMetrics.WaypointGap;
		const laneV = outward > 0 ? bounds.last + DiagramMetrics.BackLaneGap + spread : bounds.first - DiagramMetrics.BackLaneGap - spread;
		const startV = start.v + start.across / HALF + (outward * start.across) / (HALF * HALF);
		const endV = end.v + end.across / HALF + (outward * end.across) / (HALF * HALF);
		const exitU = this.band(route.from).start - DiagramMetrics.BackLinkOffset - spread;
		const entryU = this.band(route.to).end + DiagramMetrics.BackLinkOffset + spread;
		const path: FlowPoint[] = [
			{ u: start.u, v: startV },
			{ u: exitU, v: startV },
			{ u: exitU, v: laneV },
			{ u: entryU, v: laneV },
			{ u: entryU, v: endV },
			{ u: end.u + end.along, v: endV },
		];
		return { link: route.link, points: path.map((point) => this.toPoint(point)), middle: this.toPoint({ u: (exitU + entryU) / HALF, v: laneV }) };
	}

	/** A small loop out of a node's far side and back in. */
	private selfLoop(link: FlowchartLink): PlacedLink {
		const rect = this.flowRectOf(link.from);
		const side = rect.v + rect.across;
		const outer = side + DiagramMetrics.SelfLoopSize;
		const first = rect.u + rect.along / (HALF * HALF);
		const last = rect.u + rect.along - rect.along / (HALF * HALF);
		const path: FlowPoint[] = [
			{ u: first, v: side },
			{ u: first, v: outer },
			{ u: last, v: outer },
			{ u: last, v: side },
		];
		return { link, points: path.map((point) => this.toPoint(point)), middle: this.toPoint({ u: (first + last) / HALF, v: outer }) };
	}

	/** The rank a link end is in, or for a group the first rank it holds. */
	private rankOf(id: string): number {
		return this.#units.get(id)?.rank ?? Math.min(...this.descendantUnits(id).map((unit) => unit.rank));
	}

	/** Where along the flow a link end's rank, or a group's frame, starts and ends. */
	private band(id: string): { start: number; end: number } {
		const frame = this.#frames.get(id);
		if (frame) return { start: frame.u, end: frame.u + frame.along };
		const rank = this.#units.get(id)!.rank;
		return { start: this.#rankStarts[rank]!, end: this.#rankStarts[rank]! + this.#thickness[rank]! };
	}

	/** The first and last positions across the flow that anything takes. */
	private acrossBounds(): { first: number; last: number } {
		const rects = [...this.#frames.values(), ...[...this.#units.keys()].map((id) => this.flowRectOf(id))];
		return { first: Math.min(...rects.map((rect) => rect.v)), last: Math.max(...rects.map((rect) => rect.v + rect.across)) };
	}

	/** In each gap between ranks, the links crossing it turn on evenly spread tracks, ordered so they cross little. */
	private assignTracks(): Map<string, number> {
		const pieces: { key: string; rank: number; fromV: number; toV: number }[] = [];
		this.#routes.forEach((route, index) => {
			if (!route.forward) return;
			for (const [step, station] of route.stations.slice(1).entries()) {
				const previous = route.stations[step]!;
				pieces.push({
					key: `${index}${WAYPOINT_PREFIX}${step}`,
					rank: this.#units.get(previous)!.rank,
					fromV: this.#cross.get(previous)!,
					toV: this.#cross.get(station)!,
				});
			}
		});
		const tracks = new Map<string, number>();
		for (let rank = 0; rank < this.#layers.length; rank++) {
			const crossing = pieces.filter((piece) => piece.rank === rank).sort((left, right) => left.fromV - right.fromV || left.toV - right.toV);
			const gapStart = this.#rankStarts[rank]! + this.#thickness[rank]! + this.frameSpace(rank, true);
			const gapEnd = gapStart + DiagramMetrics.RankGap;
			crossing.forEach((piece, index) =>
				tracks.set(piece.key, gapStart + ((index + 1) * (gapEnd - gapStart)) / (crossing.length + 1)),
			);
		}
		return tracks;
	}

	/** The rectangle a link end attaches to: a node's box, or a whole group's frame. */
	private endRect(id: string): FlowRect {
		return this.#frames.get(id) ?? this.flowRectOf(id);
	}

	private flowRectOf(id: string): FlowRect {
		const unit = this.#units.get(id)!;
		const rankStart = this.#rankStarts[unit.rank]!;
		const thickness = this.#thickness[unit.rank]!;
		return {
			u: rankStart + (thickness - unit.along) / HALF,
			v: this.#cross.get(id)! - unit.across / HALF,
			along: unit.along,
			across: unit.across,
		};
	}

	private rectOf(id: string): CropRect {
		return this.toRect(this.flowRectOf(id));
	}

	/** From flow coordinates to the picture's, flipping the flow for bottom-up and right-to-left. */
	private toRect(rect: FlowRect): CropRect {
		const u = this.#reversed ? this.flowLength() - rect.u - rect.along : rect.u;
		return this.#horizontal
			? { x: u, y: rect.v, width: rect.along, height: rect.across }
			: { x: rect.v, y: u, width: rect.across, height: rect.along };
	}

	private toPoint(point: FlowPoint): Point {
		const u = this.#reversed ? this.flowLength() - point.u : point.u;
		return this.#horizontal ? { x: u, y: point.v } : { x: point.v, y: u };
	}

	private flowLength(): number {
		const last = this.#layers.length - 1;
		return (this.#rankStarts[last] ?? 0) + (this.#thickness[last] ?? 0);
	}

	private descendants(group: string): string[] {
		const direct = this.#groups.get(group)?.nodeIds ?? [];
		const inner = this.chart.groups.filter((child) => child.parent === group).flatMap((child) => this.descendants(child.id));
		return [...direct, ...inner];
	}

	/** The units inside a group, at any depth, waypoints included. */
	private descendantUnits(group: string): Unit[] {
		return [...this.#units.values()].filter((unit) => this.isInside(unit.container, group));
	}

	private isInside(container: string, group: string): boolean {
		if (container === group) return true;
		const parent = this.#groups.get(container)?.parent;
		return parent ? this.isInside(parent, group) : false;
	}

	/** Where a link end lives: a node's group, or around a group the group's parent. */
	private endContainer(id: string): string {
		return this.#groups.has(id) ? (this.#groups.get(id)!.parent ?? ROOT) : (this.#containerOf.get(id) ?? ROOT);
	}

	/** The innermost container holding both. */
	private commonContainer(left: string, right: string): string {
		const chain = (id: string): string[] => (id === ROOT ? [ROOT] : [id, ...chain(this.#groups.get(id)?.parent ?? ROOT)]);
		const rights = new Set(chain(right));
		return chain(left).find((id) => rights.has(id)) ?? ROOT;
	}
}

function nodeSize(node: FlowchartNode, horizontal: boolean): Size {
	switch (node.shape) {
		case NodeShape.Start:
			return { width: DiagramMetrics.StartDiameter, height: DiagramMetrics.StartDiameter };
		case NodeShape.End:
			return { width: DiagramMetrics.EndDiameter, height: DiagramMetrics.EndDiameter };
		case NodeShape.Choice:
			return { width: DiagramMetrics.ChoiceSize, height: DiagramMetrics.ChoiceSize };
		case NodeShape.Bar:
			return horizontal
				? { width: DiagramMetrics.BarThickness, height: DiagramMetrics.BarLength }
				: { width: DiagramMetrics.BarLength, height: DiagramMetrics.BarThickness };
		case NodeShape.Class:
			return classSize(node);
	}
	const text = textSize(node.label);
	const width = Math.max(DiagramMetrics.MinimumWidth, text.width + DiagramMetrics.PaddingX * HALF);
	const height = Math.max(DiagramMetrics.MinimumHeight, text.height + DiagramMetrics.PaddingY * HALF);
	if (node.shape === NodeShape.Circle) {
		const diameter = Math.hypot(text.width, text.height) + DiagramMetrics.PaddingX;
		return { width: Math.max(height, diameter), height: Math.max(height, diameter) };
	}
	if (node.shape === NodeShape.Diamond)
		return { width: width * DiagramMetrics.DiamondScale, height: height * DiagramMetrics.DiamondScale };
	return { width, height };
}

/** A class box: its title, then each section's lines, as wide as the longest. */
function classSize(node: FlowchartNode): Size {
	const sections = node.sections ?? [];
	const title = textSize(node.label);
	const width = Math.max(DiagramMetrics.MinimumWidth, ...[node.label, ...sections].map((lines) => textSize(lines).width + DiagramMetrics.PaddingX * HALF));
	const height = title.height + DiagramMetrics.PaddingY * HALF + sections.reduce((total, lines) => total + sectionHeight(lines), 0);
	return { width, height };
}

/** The height a class's section takes: its lines with padding, or a thin strip when empty. */
export function sectionHeight(lines: readonly string[]): number {
	return lines.length ? textSize(lines).height + DiagramMetrics.SectionPadding * HALF : DiagramMetrics.EmptySectionHeight;
}

/** A placed block in the same ranks that the block would touch at this start, if any. */
function firstBlocker(
	block: Block,
	start: number,
	placed: readonly { block: Block; start: number }[],
): { block: Block; start: number } | undefined {
	return placed.find((other) => {
		const sharesRanks = other.block.firstRank <= block.lastRank && other.block.lastRank >= block.firstRank;
		const gap = gapBetween(block, other.block);
		return sharesRanks && start < other.start + other.block.size + gap && other.start < start + block.size + gap;
	});
}

/** Waypoints sit close together; anything beside a box keeps a clear gap. */
function gapBetween(left: Block, right: Block): number {
	return left.waypoint || right.waypoint ? DiagramMetrics.WaypointGap : DiagramMetrics.NodeGap;
}

/** Drops points that do not turn the path, so each line is one straight piece. */
function simplify(points: readonly Point[]): Point[] {
	const kept: Point[] = [];
	for (const point of points) {
		const last = kept.at(-1);
		if (last && last.x === point.x && last.y === point.y) continue;
		const before = kept.at(-2);
		if (before && last && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) kept.pop();
		kept.push(point);
	}
	return kept;
}

/** The middle of a rectangle's side: its far side, or its near side. */
function side(rect: CropRect, horizontal: boolean, far: boolean): Point {
	const centre = middleOf(rect);
	if (horizontal) return { x: far ? rect.x + rect.width : rect.x, y: centre.y };
	return { x: centre.x, y: far ? rect.y + rect.height : rect.y };
}

function nearestSides(from: CropRect, to: CropRect): Point[] {
	const a = middleOf(from);
	const b = middleOf(to);
	const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
	if (horizontal) {
		const rightward = b.x >= a.x;
		return [side(from, true, rightward), side(to, true, !rightward)];
	}
	const downward = b.y >= a.y;
	return [side(from, false, downward), side(to, false, !downward)];
}

/** Moves everything so the whole diagram starts at the margin, and measures it. */
function fitToMargin(nodes: PlacedNode[], links: PlacedLink[], groups: PlacedGroup[]): DiagramLayout {
	const bounds = union([
		...nodes.map(({ rect }) => rect),
		...groups.map(({ rect }) => rect),
		...links.flatMap(({ points }) => points.map(({ x, y }) => ({ x, y, width: 0, height: 0 }))),
		...links.flatMap(({ link, middle }) => (link.label ? [labelRect(link.label.split(LABEL_LINE_BREAK), middle)] : [])),
	]);
	const dx = DiagramMetrics.Margin - bounds.x;
	const dy = DiagramMetrics.Margin - bounds.y;
	const move = (rect: CropRect): CropRect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });
	const shift = (point: Point): Point => ({ x: point.x + dx, y: point.y + dy });
	return {
		width: Math.ceil(bounds.width + DiagramMetrics.Margin * HALF),
		height: Math.ceil(bounds.height + DiagramMetrics.Margin * HALF),
		nodes: nodes.map((placed) => ({ ...placed, rect: move(placed.rect) })),
		links: links.map((placed) => ({ ...placed, points: placed.points.map(shift), middle: shift(placed.middle) })),
		groups: groups.map((placed) => ({ ...placed, rect: move(placed.rect) })),
	};
}

/** The room a link's label takes around its middle. */
function labelRect(lines: readonly string[], middle: Point): CropRect {
	const size = textSize(lines);
	return { x: middle.x - size.width / HALF, y: middle.y - size.height / HALF, width: size.width, height: size.height };
}

function middleOf(rect: CropRect): Point {
	return { x: rect.x + rect.width / HALF, y: rect.y + rect.height / HALF };
}

function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / HALF, y: (a.y + b.y) / HALF };
}

function flowUnion(rects: readonly FlowRect[]): FlowRect {
	const u = Math.min(...rects.map((rect) => rect.u));
	const v = Math.min(...rects.map((rect) => rect.v));
	return {
		u,
		v,
		along: Math.max(...rects.map((rect) => rect.u + rect.along)) - u,
		across: Math.max(...rects.map((rect) => rect.v + rect.across)) - v,
	};
}

function union(rects: readonly CropRect[]): CropRect {
	if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
	const left = Math.min(...rects.map((rect) => rect.x));
	const top = Math.min(...rects.map((rect) => rect.y));
	const right = Math.max(...rects.map((rect) => rect.x + rect.width));
	const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}
