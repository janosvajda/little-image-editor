export interface CanvasToolParticipant {
	onInteractionRequested(listener: () => void): void;
	suspendInteractions(): void;
}

/** Gives exactly one tool controller ownership of canvas pointer input. */
export class CanvasToolCoordinator {
	constructor(readonly participants: readonly CanvasToolParticipant[]) {
		participants.forEach((active) =>
			active.onInteractionRequested(() => {
				participants.forEach((candidate) => {
					if (candidate !== active) candidate.suspendInteractions();
				});
			}),
		);
	}
}
