const STORAGE_KEY = "littleImageEditor.drawingPreferences";

export type PersistedValue = string | boolean;

interface ToolPanelState {
  activeTool: string;
  controls: Record<string, PersistedValue>;
}

export interface RestoredToolState {
  activeTool: string | null;
  restoredControlIds: ReadonlySet<string>;
}

export function saveToolState(root: ParentNode, activeTool: string, storage: Storage = localStorage): void {
  const controls = captureControlState(root);
  try { storage.setItem(STORAGE_KEY, JSON.stringify({ activeTool, controls } satisfies ToolPanelState)); } catch { /* Storage can be unavailable in restricted contexts. */ }
}

export function captureControlState(root: ParentNode): Record<string, PersistedValue> {
  const controls: Record<string, PersistedValue> = {};
  persistentControls(root).forEach(control => { controls[control.id] = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : control.value; });
  return controls;
}

export function restoreControlState(root: ParentNode, values: Readonly<Record<string, PersistedValue>>): ReadonlySet<string> {
  const restored = new Set<string>();
  persistentControls(root).forEach(control => { if (restoreControl(control, values[control.id])) restored.add(control.id); });
  return restored;
}

export function restoreToolState(root: ParentNode, storage: Storage = localStorage): RestoredToolState {
  const restoredControlIds = new Set<string>();
  try {
    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return { activeTool: null, restoredControlIds };
    const state = normalizeState(JSON.parse(serialized) as unknown);
    if (!state) throw new Error("Invalid tool state");
    restoreControlState(root, state.controls).forEach(id => restoredControlIds.add(id));
    return { activeTool: state.activeTool || null, restoredControlIds };
  } catch {
    try { storage.removeItem(STORAGE_KEY); } catch { /* Ignore unavailable storage. */ }
    return { activeTool: null, restoredControlIds };
  }
}

function persistentControls(root: ParentNode): Array<HTMLInputElement | HTMLSelectElement> {
  return [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[id], select[id]")];
}

function restoreControl(control: HTMLInputElement | HTMLSelectElement, value: PersistedValue | undefined): boolean {
  if (control instanceof HTMLInputElement && control.type === "checkbox") {
    if (typeof value !== "boolean") return false;
    control.checked = value; return true;
  }
  if (typeof value !== "string") return false;
  if (control instanceof HTMLSelectElement && ![...control.options].some(option => option.value === value)) return false;
  if (control instanceof HTMLInputElement && control.type === "color" && !/^#[0-9a-f]{6}$/i.test(value)) return false;
  if (control instanceof HTMLInputElement && control.type === "range" && !Number.isFinite(Number(value))) return false;
  control.value = value; return true;
}

function normalizeState(value: unknown): ToolPanelState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ToolPanelState> & Record<string, unknown>;
  if (candidate.controls && typeof candidate.controls === "object") {
    return { activeTool: typeof candidate.activeTool === "string" ? candidate.activeTool : "", controls: candidate.controls as Record<string, PersistedValue> };
  }
  // One-time migration from the original explicitly named preference record.
  const controls: Record<string, PersistedValue> = {};
  const legacyControls = { paintTool: "paintToolSelect", shapeTool: "shapeToolSelect", color: "colorInput", size: "sizeInput", opacity: "opacityInput", hardness: "hardnessInput", fill: "fillInput" } as const;
  for (const [oldName, controlId] of Object.entries(legacyControls)) {
    const controlValue = candidate[oldName];
    if (typeof controlValue === "string" || typeof controlValue === "boolean") controls[controlId] = controlValue;
  }
  return { activeTool: typeof candidate.tool === "string" ? candidate.tool : "", controls };
}
