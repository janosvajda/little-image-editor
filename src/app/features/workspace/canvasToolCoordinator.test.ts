import { describe, expect, it, vi } from "vitest";
import { CanvasToolCoordinator, type CanvasToolParticipant } from "./canvasToolCoordinator";

describe("CanvasToolCoordinator", () => {
  it("suspends every competing controller when one requests canvas ownership", () => {
    const drawing = participant();
    const annotations = participant();
    new CanvasToolCoordinator([drawing.subject, annotations.subject]);

    annotations.request();
    expect(drawing.suspendInteractions).toHaveBeenCalledOnce();
    expect(annotations.suspendInteractions).not.toHaveBeenCalled();

    drawing.request();
    expect(annotations.suspendInteractions).toHaveBeenCalledOnce();
  });
});

function participant(): {
  subject: CanvasToolParticipant;
  request: () => void;
  suspendInteractions: ReturnType<typeof vi.fn>;
} {
  let listener = () => undefined;
  const suspendInteractions = vi.fn();
  return {
    subject: {
      onInteractionRequested(next): void { listener = next; },
      suspendInteractions
    },
    request: () => listener(),
    suspendInteractions
  };
}
