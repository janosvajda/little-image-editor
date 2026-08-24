import { describe, expect, it, vi } from "vitest";
import { AnnotationDocument } from "./annotationDocument";

const INITIAL_CHANGE_NOTIFICATION_COUNT = 1;

describe("annotation selection events", () => {
  it("does not emit a document change when the requested selection is already active", () => {
    const annotations = new AnnotationDocument();
    const changed = vi.fn();
    annotations.onChange(changed);

    annotations.select(null);

    expect(changed).toHaveBeenCalledTimes(INITIAL_CHANGE_NOTIFICATION_COUNT);
  });
});
