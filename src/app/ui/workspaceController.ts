import { element, elements } from "../helpers/domHelpers";

type PanelLayout = Record<string, { x: number; y: number; collapsed: boolean; visible?: boolean }>;
const LAYOUT_KEY = "little-editor.panel-layout.v2";
const THEME_KEY = "little-editor.theme.v1";
const PANEL_MARGIN = 14;
const PANEL_GAP = 14;
const LEFT_DOCK_PANELS = new Set(["tools"]);
const DEFAULT_VISIBLE_PANELS = new Set(["tools", "effects"]);

export class WorkspaceUi {
  readonly workspace = element<HTMLElement>(".workspace");
  readonly panels = elements<HTMLElement>(".panel");
  readonly menus = elements<HTMLDetailsElement>(".menu");
  readonly themeSelect = element<HTMLSelectElement>("#themeSelect");

  constructor(readonly dialogs: readonly HTMLDialogElement[]) {
    this.initializeFullscreenLabels();
    this.initializeMenus();
    this.initializePanels();
    this.initializePanelToggles();
    this.initializeTheme();
    this.bindViewEvents();
  }

  get resolvedTheme(): string { return this.resolveTheme(this.themeSelect.value); }

  private initializeFullscreenLabels(): void {
    element<HTMLElement>("#menuFocusButton span").textContent = "Fullscreen";
    element<HTMLElement>("#focusButton").title = "Fullscreen (Tab)";
    element<HTMLElement>("#exitFocusButton").textContent = "Exit fullscreen";
    const help = document.querySelector<HTMLElement>(".status-help");
    if (help) help.textContent = "Drag panels to arrange · Tab for fullscreen";
  }

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
    const hasSavedLayout = Object.keys(layout).length > 0;
    this.panels.forEach(panel => {
      const saved = layout[panel.dataset.panel!];
      panel.hidden = !(saved?.visible ?? DEFAULT_VISIBLE_PANELS.has(panel.dataset.panel ?? ""));
      if (saved) {
        panel.classList.toggle("collapsed", saved.collapsed);
        element<HTMLButtonElement>(".collapse", panel).textContent = saved.collapsed ? "+" : "−";
        this.keepInView(panel, saved.x, saved.y);
      }
      const header = element<HTMLElement>(".panel-header", panel);
      header.addEventListener("pointerdown", event => this.startPanelDrag(panel, header, event));
      const collapse = element<HTMLButtonElement>(".collapse", panel);
      const panelName = element<HTMLElement>(".panel-header span", panel).textContent?.trim() || "toolbar";
      collapse.title = `Collapse ${panelName}`;
      collapse.setAttribute("aria-label", `Collapse ${panelName}`);
      collapse.setAttribute("aria-expanded", String(!panel.classList.contains("collapsed")));
      collapse.addEventListener("click", event => {
        panel.classList.toggle("collapsed");
        const collapsed = panel.classList.contains("collapsed");
        const button = event.currentTarget as HTMLButtonElement;
        button.textContent = collapsed ? "+" : "−";
        button.title = `${collapsed ? "Expand" : "Collapse"} ${panelName}`;
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-expanded", String(!collapsed));
        this.keepInView(panel, panel.offsetLeft, panel.offsetTop); this.saveLayout();
      });
    });
    if (!hasSavedLayout) requestAnimationFrame(() => this.applyDefaultLayout());
  }

  private initializePanelToggles(): void {
    const picker = document.createElement("div"); picker.className = "toolbar-picker";
    const trigger = document.createElement("button");
    trigger.type = "button"; trigger.id = "toolbarPickerButton"; trigger.className = "icon-button toolbar-picker-trigger";
    trigger.title = "Show or hide toolbars"; trigger.setAttribute("aria-label", "Toolbars"); trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="7"></rect><rect x="14" y="4" width="7" height="7"></rect><rect x="3" y="15" width="7" height="5"></rect><rect x="14" y="15" width="7" height="5"></rect></svg><span>Toolbars</span>';
    const fieldset = document.createElement("fieldset");
    fieldset.className = "toolbar-visibility hidden";
    fieldset.setAttribute("role", "listbox");
    fieldset.setAttribute("aria-label", "Toolbars");
    this.panels.forEach(panel => {
      const key = panel.dataset.panel!;
      const label = document.createElement("label");
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = !panel.hidden; checkbox.dataset.panelToggle = key;
      label.append(checkbox, element<HTMLElement>(".panel-header span", panel).textContent ?? key);
      checkbox.setAttribute("role", "option");
      checkbox.setAttribute("aria-selected", String(checkbox.checked));
      checkbox.addEventListener("change", () => {
        checkbox.setAttribute("aria-selected", String(checkbox.checked));
        panel.hidden = !checkbox.checked;
        if (checkbox.checked) requestAnimationFrame(() => { this.placeVisiblePanel(panel); this.saveLayout(); });
        else this.saveLayout();
      });
      fieldset.append(label);
    });
    const setOpen = (open: boolean) => { fieldset.classList.toggle("hidden", !open); trigger.setAttribute("aria-expanded", String(open)); };
    trigger.addEventListener("click", event => { event.stopPropagation(); setOpen(fieldset.classList.contains("hidden")); });
    trigger.addEventListener("keydown", event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); fieldset.querySelector<HTMLInputElement>("input")?.focus(); }
      else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    });
    fieldset.addEventListener("keydown", event => {
      const options = [...fieldset.querySelectorAll<HTMLInputElement>("input")];
      const index = options.indexOf(event.target as HTMLInputElement);
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.focus(); return; }
      if (event.key === "Tab") { setOpen(false); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") options[0]?.focus();
      else if (event.key === "End") options.at(-1)?.focus();
      else options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
    });
    document.addEventListener("click", event => { if (!picker.contains(event.target as Node)) setOpen(false); });
    picker.append(trigger, fieldset);
    element(".toolbar").append(picker);
  }

  private placeVisiblePanel(panel: HTMLElement): void {
    const hasPosition = panel.style.left !== "" && panel.style.top !== "" && (panel.offsetLeft !== 0 || panel.offsetTop !== 0);
    if (hasPosition) { this.keepInView(panel, panel.offsetLeft, panel.offsetTop); return; }
    const dock = LEFT_DOCK_PANELS.has(panel.dataset.panel ?? "") ? "left" : "right";
    const others = this.panels.filter(candidate => candidate !== panel && !candidate.hidden && candidate.offsetParent !== null);
    let x = dock === "left" ? PANEL_MARGIN : this.workspaceWidth() - panel.offsetWidth - PANEL_MARGIN;
    const maximumBottom = this.workspaceHeight() - 28 - PANEL_MARGIN;
    for (let column = 0; column < this.panels.length; column += 1) {
      let y = PANEL_MARGIN;
      while (y + panel.offsetHeight <= maximumBottom) {
        const collision = others.find(candidate => x < candidate.offsetLeft + candidate.offsetWidth && x + panel.offsetWidth > candidate.offsetLeft && y < candidate.offsetTop + candidate.offsetHeight && y + panel.offsetHeight > candidate.offsetTop);
        if (!collision) { this.keepInView(panel, x, y); return; }
        y = collision.offsetTop + collision.offsetHeight + PANEL_GAP;
      }
      x += dock === "left" ? panel.offsetWidth + PANEL_GAP : -(panel.offsetWidth + PANEL_GAP);
    }
    this.keepInView(panel, x, PANEL_MARGIN);
  }

  private applyDefaultLayout(): void {
    const columns = { left: [] as HTMLElement[], right: [] as HTMLElement[] };
    this.panels.filter(panel => panel.offsetParent !== null).forEach(panel => {
      const dock = LEFT_DOCK_PANELS.has(panel.dataset.panel ?? "") ? "left" : "right";
      columns[dock].push(panel);
    });
    for (const [dock, panels] of Object.entries(columns) as Array<[keyof typeof columns, HTMLElement[]]>) {
      if (panels.length === 0) continue;
      let y = PANEL_MARGIN;
      let columnWidth = 0;
      let x = dock === "left" ? PANEL_MARGIN : this.workspaceWidth() - panels[0]!.offsetWidth - PANEL_MARGIN;
      panels.forEach(panel => {
        const maximumBottom = this.workspaceHeight() - 28 - PANEL_MARGIN;
        if (y > PANEL_MARGIN && y + panel.offsetHeight > maximumBottom) {
          y = PANEL_MARGIN;
          x += dock === "left" ? columnWidth + PANEL_GAP : -(panel.offsetWidth + PANEL_GAP);
          columnWidth = 0;
        }
        this.keepInView(panel, x, y);
        columnWidth = Math.max(columnWidth, panel.offsetWidth);
        y += panel.offsetHeight + PANEL_GAP;
      });
    }
    this.saveLayout();
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
    panel.style.left = `${Math.max(0, Math.min(x, this.workspaceWidth() - panel.offsetWidth))}px`;
    panel.style.top = `${Math.max(0, Math.min(y, this.workspaceHeight() - panel.offsetHeight - 28))}px`;
    panel.style.right = "auto";
  }

  private clampAllPanels(): void { this.panels.forEach(panel => this.keepInView(panel, panel.offsetLeft, panel.offsetTop)); }

  private workspaceWidth(): number { return this.workspace.clientWidth || document.documentElement.clientWidth || window.innerWidth; }
  private workspaceHeight(): number { return this.workspace.clientHeight || document.documentElement.clientHeight || window.innerHeight; }

  private readLayout(): PanelLayout {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") as PanelLayout; } catch { return {}; }
  }

  private saveLayout(): void {
    const layout = Object.fromEntries(this.panels.map(panel => [panel.dataset.panel!, { x: panel.offsetLeft, y: panel.offsetTop, collapsed: panel.classList.contains("collapsed"), visible: !panel.hidden }]));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }

  private resetLayout(): void {
    localStorage.removeItem(LAYOUT_KEY);
    this.panels.forEach(panel => {
      panel.style.removeProperty("left"); panel.style.removeProperty("right"); panel.style.removeProperty("top"); panel.classList.remove("collapsed");
      panel.hidden = !DEFAULT_VISIBLE_PANELS.has(panel.dataset.panel ?? "");
      const toggle = document.querySelector<HTMLInputElement>(`[data-panel-toggle="${panel.dataset.panel}"]`);
      if (toggle) { toggle.checked = !panel.hidden; toggle.setAttribute("aria-selected", String(toggle.checked)); }
      const collapse = element<HTMLButtonElement>(".collapse", panel);
      const panelName = element<HTMLElement>(".panel-header span", panel).textContent?.trim() || "toolbar";
      collapse.textContent = "−"; collapse.title = `Collapse ${panelName}`; collapse.setAttribute("aria-label", collapse.title); collapse.setAttribute("aria-expanded", "true");
    });
    requestAnimationFrame(() => this.applyDefaultLayout());
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
    if (focusItem) this.menuItems(menu)[0]?.focus();
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
