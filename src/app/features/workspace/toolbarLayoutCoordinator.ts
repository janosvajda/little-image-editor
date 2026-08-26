import type { ManagedToolbarPanel } from './managedToolbarPanel';
import {
	type ToolbarLayoutBounds,
	ToolbarLayoutEngine,
	type ToolbarRectangle,
} from './toolbarLayoutEngine';

export interface ToolbarWorkspaceMetrics {
	getBounds(): ToolbarLayoutBounds;
	isLayoutSuspended(): boolean;
}

export class ToolbarLayoutCoordinator {
	constructor(
		private readonly panels: readonly ManagedToolbarPanel[],
		private readonly engine: ToolbarLayoutEngine,
		private readonly workspace: ToolbarWorkspaceMetrics,
	) {}

	placeNew(
		panel: ManagedToolbarPanel,
		preservePosition = panel.positioned,
	): void {
		if (!panel.rendered || this.workspace.isLayoutSuspended()) return;
		if (preservePosition) {
			const preferredPosition = panel.preferredPosition ?? panel.position;
			panel.setResolvedPosition(
				this.engine.resolveNearest(
					preferredPosition,
					panel.size,
					this.obstaclesFor(panel),
					this.workspace.getBounds(),
				),
			);
			return;
		}
		panel.setPosition(
			this.engine.findDockPosition(
				panel.size,
				panel.defaultDock,
				this.obstaclesFor(panel),
				this.workspace.getBounds(),
			),
		);
	}

	arrangeDefault(): void {
		const placed: ManagedToolbarPanel[] = [];
		for (const panel of this.panels.filter((candidate) => candidate.mounted)) {
			panel.setPosition(
				this.engine.findDockPosition(
					panel.size,
					panel.defaultDock,
					placed.map((candidate) => this.rectangle(candidate)),
					this.workspace.getBounds(),
				),
			);
			placed.push(panel);
		}
	}

	resolve(panel: ManagedToolbarPanel, commitPosition = false): void {
		if (!panel.rendered || this.workspace.isLayoutSuspended()) return;
		const resolved = this.engine.resolveNearest(
			panel.position,
			panel.size,
			this.obstaclesFor(panel),
			this.workspace.getBounds(),
		);
		if (commitPosition) panel.setPosition(resolved);
		else panel.setResolvedPosition(resolved);
	}

	constrain(panel: ManagedToolbarPanel, x: number, y: number): void {
		if (!panel.mounted || this.workspace.isLayoutSuspended()) return;
		panel.setResolvedPosition(
			this.engine.clamp({ x, y }, panel.size, this.workspace.getBounds()),
		);
	}

	move(panel: ManagedToolbarPanel, x: number, y: number): void {
		if (!panel.mounted || this.workspace.isLayoutSuspended()) return;
		panel.setPosition(
			this.engine.clamp({ x, y }, panel.size, this.workspace.getBounds()),
		);
	}

	resolveAll(): void {
		if (this.workspace.isLayoutSuspended()) return;
		const placed: ManagedToolbarPanel[] = [];
		for (const panel of this.panels.filter((candidate) => candidate.rendered)) {
			panel.setResolvedPosition(
				this.engine.resolveNearest(
					panel.position,
					panel.size,
					placed.map((candidate) => this.rectangle(candidate)),
					this.workspace.getBounds(),
				),
			);
			placed.push(panel);
		}
	}

	private obstaclesFor(panel: ManagedToolbarPanel): ToolbarRectangle[] {
		return this.panels
			.filter((candidate) => candidate !== panel && candidate.rendered)
			.map((candidate) => this.rectangle(candidate));
	}

	private rectangle(panel: ManagedToolbarPanel): ToolbarRectangle {
		return { ...panel.position, ...panel.size };
	}
}
