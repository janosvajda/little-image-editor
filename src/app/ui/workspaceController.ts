import { element, elements } from "../helpers/domHelpers.js";

type PanelLayout = Record<string, { x: number; y: number; collapsed: boolean }>;
const LAYOUT_KEY = "little-editor.panel-layout.v2";
const THEME_KEY = "little-editor.theme.v1";

export class WorkspaceUi {
  readonly workspace = element<HTMLElement>(".workspace");
  readonly panels = elements<HTMLElement>(".panel");
  readonly menus = elements<HTMLDetailsElement>(".menu");
  readonly themeSelect = element<HTMLSelectElement>("#themeSelect");

  constructor(readonly dialogs: readonly HTMLDialogElement[]) {
    this.initializeMenus();
    this.initializePanels();
    this.initializeTheme();
    this.bindViewEvents();
  }

  get resolvedTheme(): string { return this.resolveTheme(this.themeSelect.value); }

  openFileMenu(): void { this.openMenu(element<HTMLDetailsElement>("#fileMenu"), true); }

  async toggleFocus(force?: boolean): Promise<void> {
    const enabled = force ?? !document.body.classList.contains("focus-mode");
    if (enabled) this.dialogs.forEach(dialog => dialog.close());
    document.body.classList.toggle("focus-mode", enabled);
    if (enabled && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    if (!enabled && document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    if (!enabled) requestAnimationFrame(() => this.clampAllPanels());
  }

  private initializeTheme(): void {
    const preference = localStorage.getItem(THEME_KEY) ?? "auto";
    this.applyTheme(preference);
    this.themeSelect.addEventListener("change", () => { localStorage.setItem(THEME_KEY, this.themeSelect.value); this.applyTheme(this.themeSelect.value); });
    [matchMedia("(prefers-color-scheme: light)"), matchMedia("(prefers-contrast: more)"), matchMedia("(forced-colors: active)")]
      .forEach(query => query.addEventListener("change", () => { if (this.themeSelect.value === "auto") this.applyTheme("auto"); }));
  }

  private resolveTheme(preference: string): string {
    if (preference !== "auto") return preference;
    if (matchMedia("(forced-colors: active)").matches || matchMedia("(prefers-contrast: more)").matches) return "contrast";
    return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  private applyTheme(preference: string): void {
    document.documentElement.dataset.theme = this.resolveTheme(preference);
    this.themeSelect.value = preference;
  }

  private initializePanels(): void {
    const layout = this.readLayout();
    this.panels.forEach(panel => {
      const saved = layout[panel.dataset.panel!];
      if (saved) {
        panel.classList.toggle("collapsed", saved.collapsed);
        element<HTMLButtonElement>(".collapse", panel).textContent = saved.collapsed ? "+" : "−";
        this.keepInView(panel, saved.x, saved.y);
      }
      const header = element<HTMLElement>(".panel-header", panel);
      header.addEventListener("pointerdown", event => this.startPanelDrag(panel, header, event));
      element<HTMLButtonElement>(".collapse", panel).addEventListener("click", event => {
        panel.classList.toggle("collapsed");
        (event.currentTarget as HTMLButtonElement).textContent = panel.classList.contains("collapsed") ? "+" : "−";
        this.keepInView(panel, panel.offsetLeft, panel.offsetTop); this.saveLayout();
      });
    });
  }

  private startPanelDrag(panel: HTMLElement, header: HTMLElement, event: PointerEvent): void {
    if ((event.target as HTMLElement).closest("button")) return;
    const origin = { x: panel.offsetLeft, y: panel.offsetTop };
    const pointer = { x: event.clientX, y: event.clientY };
    panel.classList.add("dragging-panel"); header.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => this.keepInView(panel, origin.x + next.clientX - pointer.x, origin.y + next.clientY - pointer.y);
    const end = () => {
      panel.classList.remove("dragging-panel");
      header.removeEventListener("pointermove", move); header.removeEventListener("pointerup", end); header.removeEventListener("pointercancel", end);
      this.saveLayout();
    };
    header.addEventListener("pointermove", move); header.addEventListener("pointerup", end); header.addEventListener("pointercancel", end);
  }

  private keepInView(panel: HTMLElement, x: number, y: number): void {
    if (document.body.classList.contains("focus-mode") || panel.offsetParent === null) return;
    panel.style.left = `${Math.max(0, Math.min(x, this.workspace.clientWidth - panel.offsetWidth))}px`;
    panel.style.top = `${Math.max(0, Math.min(y, this.workspace.clientHeight - panel.offsetHeight - 28))}px`;
    panel.style.right = "auto";
  }

  private clampAllPanels(): void { this.panels.forEach(panel => this.keepInView(panel, panel.offsetLeft, panel.offsetTop)); }

  private readLayout(): PanelLayout {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as PanelLayout; } catch { return {}; }
  }

  private saveLayout(): void {
    const layout = Object.fromEntries(this.panels.map(panel => [panel.dataset.panel!, { x: panel.offsetLeft, y: panel.offsetTop, collapsed: panel.classList.contains("collapsed") }]));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }

  private resetLayout(): void {
    localStorage.removeItem(LAYOUT_KEY);
    this.panels.forEach(panel => {
      panel.style.removeProperty("left"); panel.style.removeProperty("right"); panel.style.removeProperty("top"); panel.classList.remove("collapsed");
      element<HTMLButtonElement>(".collapse", panel).textContent = "−";
    });
    requestAnimationFrame(() => this.saveLayout());
  }

  private initializeMenus(): void {
    this.menus.forEach(menu => {
      const summary = element<HTMLElement>("summary", menu);
      summary.setAttribute("aria-haspopup", "menu"); summary.setAttribute("aria-expanded", "false");
      menu.addEventListener("toggle", () => summary.setAttribute("aria-expanded", String(menu.open)));
    });
    element(".menubar").addEventListener("keydown", event => this.navigateMenu(event));
    document.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      this.menus.filter(menu => menu.open).forEach(menu => { if (!menu.contains(target) || target.closest(".menu-popover button")) this.closeMenu(menu); });
    });
  }

  private menuItems(menu: HTMLDetailsElement): HTMLElement[] {
    return elements<HTMLElement>(".menu-popover button:not(:disabled), .menu-popover select", menu);
  }

  private openMenu(menu: HTMLDetailsElement, focusItem = false): void {
    this.menus.forEach(other => { if (other !== menu) this.closeMenu(other); });
    menu.open = true;
    if (focusItem) requestAnimationFrame(() => this.menuItems(menu)[0]?.focus());
  }

  private closeMenu(menu: HTMLDetailsElement, restoreFocus = false): void {
    menu.open = false;
    if (restoreFocus) element<HTMLElement>("summary", menu).focus();
  }

  private navigateMenu(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const menu = target.closest<HTMLDetailsElement>(".menu");
    if (!menu) return;
    const menuIndex = this.menus.indexOf(menu), items = this.menuItems(menu), itemIndex = items.indexOf(target);
    const onSummary = target.matches("summary, summary *");
    const switchMenu = (offset: number) => {
      const next = this.menus[(menuIndex + offset + this.menus.length) % this.menus.length]!;
      if (menu.open) this.openMenu(next, true); else element<HTMLElement>("summary", next).focus();
    };
    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && target.tagName !== "SELECT") { event.preventDefault(); switchMenu(event.key === "ArrowRight" ? 1 : -1); }
    else if (event.key === "ArrowDown" && target.tagName !== "SELECT") { event.preventDefault(); onSummary ? this.openMenu(menu, true) : items[(itemIndex + 1) % items.length]?.focus(); }
    else if (event.key === "ArrowUp" && target.tagName !== "SELECT") { event.preventDefault(); if (onSummary) { this.openMenu(menu); items.at(-1)?.focus(); } else items[(itemIndex - 1 + items.length) % items.length]?.focus(); }
    else if ((event.key === "Enter" || event.key === " ") && onSummary) { event.preventDefault(); menu.open ? this.closeMenu(menu) : this.openMenu(menu, true); }
    else if (event.key === "Escape") { event.preventDefault(); this.closeMenu(menu, true); }
    else if ((event.key === "Home" || event.key === "End") && onSummary) { event.preventDefault(); element<HTMLElement>("summary", this.menus[event.key === "Home" ? 0 : this.menus.length - 1]!).focus(); }
  }

  private bindViewEvents(): void {
    element("#focusButton").addEventListener("click", () => void this.toggleFocus());
    element("#menuFocusButton").addEventListener("click", () => void this.toggleFocus());
    element("#exitFocusButton").addEventListener("click", () => void this.toggleFocus(false));
    element("#resetLayoutButton").addEventListener("click", () => this.resetLayout());
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) { document.body.classList.remove("focus-mode"); requestAnimationFrame(() => this.clampAllPanels()); } });
    window.addEventListener("resize", () => { if (!document.body.classList.contains("focus-mode")) this.clampAllPanels(); });
  }
}
