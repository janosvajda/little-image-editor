const TOOLTIP_SELECTOR = "[data-tooltip], [title]";
const SHOW_DELAY = 350;

export class TooltipController {
  readonly #tooltip = document.createElement("div");
  #activeTarget: HTMLElement | null = null;
  #showTimer: number | null = null;
  #keyboardNavigation = false;

  constructor(readonly root: Document = document) {
    this.#tooltip.id = "appTooltip";
    this.#tooltip.className = "app-tooltip";
    this.#tooltip.setAttribute("role", "tooltip");
    this.#tooltip.hidden = true;
    document.body.append(this.#tooltip);
    root.addEventListener("pointerover", event => this.onPointerOver(event));
    root.addEventListener("pointerout", event => this.onPointerOut(event));
    root.addEventListener("pointermove", event => this.positionFromPointer(event));
    root.addEventListener("pointerdown", () => { this.#keyboardNavigation = false; this.hide(); }, true);
    root.addEventListener("keydown", event => { if (["Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) this.#keyboardNavigation = true; }, true);
    root.addEventListener("focusin", event => { if (this.#keyboardNavigation) this.showFor(this.target(event), true); });
    root.addEventListener("focusout", event => { if (this.target(event) === this.#activeTarget) this.hide(); });
    window.addEventListener("blur", () => this.hide());
  }

  private target(event: Event): HTMLElement | null {
    return (event.target as HTMLElement | null)?.closest<HTMLElement>(TOOLTIP_SELECTOR) ?? null;
  }

  private tooltipText(target: HTMLElement): string {
    const text = target.dataset.tooltip ?? target.title;
    if (text && !target.dataset.tooltip) {
      target.dataset.tooltip = text;
      target.removeAttribute("title");
      if (!target.hasAttribute("aria-label")) target.setAttribute("aria-label", text);
    }
    return text;
  }

  private onPointerOver(event: PointerEvent): void {
    this.#keyboardNavigation = false;
    const target = this.target(event);
    if (!target || target === this.#activeTarget) return;
    this.showFor(target, false, event.clientX, event.clientY);
  }

  private onPointerOut(event: PointerEvent): void {
    const target = this.target(event);
    if (!target || target !== this.#activeTarget) return;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    this.hide();
  }

  private showFor(target: HTMLElement | null, immediate: boolean, x?: number, y?: number): void {
    if (!target) return;
    this.hide();
    const text = this.tooltipText(target);
    if (!text) return;
    this.#activeTarget = target;
    target.setAttribute("aria-describedby", this.#tooltip.id);
    const show = () => {
      if (target !== this.#activeTarget) return;
      this.#tooltip.textContent = text;
      this.#tooltip.hidden = false;
      if (x === undefined || y === undefined) this.positionFromTarget(target);
      else this.position(x + 12, y + 18);
    };
    if (immediate) show();
    else this.#showTimer = window.setTimeout(show, SHOW_DELAY);
  }

  private positionFromPointer(event: PointerEvent): void {
    if (this.#tooltip.hidden || !this.#activeTarget) return;
    this.position(event.clientX + 12, event.clientY + 18);
  }

  private positionFromTarget(target: HTMLElement): void {
    const bounds = target.getBoundingClientRect();
    this.position(bounds.left + bounds.width / 2, bounds.bottom + 8);
  }

  private position(x: number, y: number): void {
    const margin = 8;
    const width = this.#tooltip.offsetWidth, height = this.#tooltip.offsetHeight;
    this.#tooltip.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - width - margin))}px`;
    this.#tooltip.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - height - margin))}px`;
  }

  private hide(): void {
    if (this.#showTimer !== null) window.clearTimeout(this.#showTimer);
    this.#showTimer = null;
    this.#activeTarget?.removeAttribute("aria-describedby");
    this.#activeTarget = null;
    this.#tooltip.hidden = true;
  }
}
