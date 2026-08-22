import { element, elements } from "./dom.js";
const LAYOUT_KEY = "little-editor.panel-layout.v2";
const THEME_KEY = "little-editor.theme.v1";
export class WorkspaceUi {
    dialogs;
    workspace = element(".workspace");
    panels = elements(".panel");
    menus = elements(".menu");
    themeSelect = element("#themeSelect");
    constructor(dialogs) {
        this.dialogs = dialogs;
        this.initializeMenus();
        this.initializePanels();
        this.initializeTheme();
        this.bindViewEvents();
    }
    get resolvedTheme() { return this.resolveTheme(this.themeSelect.value); }
    openFileMenu() { this.openMenu(element("#fileMenu"), true); }
    async toggleFocus(force) {
        const enabled = force ?? !document.body.classList.contains("focus-mode");
        if (enabled)
            this.dialogs.forEach(dialog => dialog.close());
        document.body.classList.toggle("focus-mode", enabled);
        if (enabled && !document.fullscreenElement)
            await document.documentElement.requestFullscreen().catch(() => undefined);
        if (!enabled && document.fullscreenElement)
            await document.exitFullscreen().catch(() => undefined);
        if (!enabled)
            requestAnimationFrame(() => this.clampAllPanels());
    }
    initializeTheme() {
        const preference = localStorage.getItem(THEME_KEY) ?? "auto";
        this.applyTheme(preference);
        this.themeSelect.addEventListener("change", () => { localStorage.setItem(THEME_KEY, this.themeSelect.value); this.applyTheme(this.themeSelect.value); });
        [matchMedia("(prefers-color-scheme: light)"), matchMedia("(prefers-contrast: more)"), matchMedia("(forced-colors: active)")]
            .forEach(query => query.addEventListener("change", () => { if (this.themeSelect.value === "auto")
            this.applyTheme("auto"); }));
    }
    resolveTheme(preference) {
        if (preference !== "auto")
            return preference;
        if (matchMedia("(forced-colors: active)").matches || matchMedia("(prefers-contrast: more)").matches)
            return "contrast";
        return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    applyTheme(preference) {
        document.documentElement.dataset.theme = this.resolveTheme(preference);
        this.themeSelect.value = preference;
    }
    initializePanels() {
        const layout = this.readLayout();
        this.panels.forEach(panel => {
            const saved = layout[panel.dataset.panel];
            if (saved) {
                panel.classList.toggle("collapsed", saved.collapsed);
                element(".collapse", panel).textContent = saved.collapsed ? "+" : "−";
                this.keepInView(panel, saved.x, saved.y);
            }
            const header = element(".panel-header", panel);
            header.addEventListener("pointerdown", event => this.startPanelDrag(panel, header, event));
            element(".collapse", panel).addEventListener("click", event => {
                panel.classList.toggle("collapsed");
                event.currentTarget.textContent = panel.classList.contains("collapsed") ? "+" : "−";
                this.keepInView(panel, panel.offsetLeft, panel.offsetTop);
                this.saveLayout();
            });
        });
    }
    startPanelDrag(panel, header, event) {
        if (event.target.closest("button"))
            return;
        const origin = { x: panel.offsetLeft, y: panel.offsetTop };
        const pointer = { x: event.clientX, y: event.clientY };
        panel.classList.add("dragging-panel");
        header.setPointerCapture(event.pointerId);
        const move = (next) => this.keepInView(panel, origin.x + next.clientX - pointer.x, origin.y + next.clientY - pointer.y);
        const end = () => {
            panel.classList.remove("dragging-panel");
            header.removeEventListener("pointermove", move);
            header.removeEventListener("pointerup", end);
            header.removeEventListener("pointercancel", end);
            this.saveLayout();
        };
        header.addEventListener("pointermove", move);
        header.addEventListener("pointerup", end);
        header.addEventListener("pointercancel", end);
    }
    keepInView(panel, x, y) {
        if (document.body.classList.contains("focus-mode") || panel.offsetParent === null)
            return;
        panel.style.left = `${Math.max(0, Math.min(x, this.workspace.clientWidth - panel.offsetWidth))}px`;
        panel.style.top = `${Math.max(0, Math.min(y, this.workspace.clientHeight - panel.offsetHeight - 28))}px`;
        panel.style.right = "auto";
    }
    clampAllPanels() { this.panels.forEach(panel => this.keepInView(panel, panel.offsetLeft, panel.offsetTop)); }
    readLayout() {
        try {
            return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}");
        }
        catch {
            return {};
        }
    }
    saveLayout() {
        const layout = Object.fromEntries(this.panels.map(panel => [panel.dataset.panel, { x: panel.offsetLeft, y: panel.offsetTop, collapsed: panel.classList.contains("collapsed") }]));
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    }
    resetLayout() {
        localStorage.removeItem(LAYOUT_KEY);
        this.panels.forEach(panel => {
            panel.style.removeProperty("left");
            panel.style.removeProperty("right");
            panel.style.removeProperty("top");
            panel.classList.remove("collapsed");
            element(".collapse", panel).textContent = "−";
        });
        requestAnimationFrame(() => this.saveLayout());
    }
    initializeMenus() {
        this.menus.forEach(menu => {
            const summary = element("summary", menu);
            summary.setAttribute("aria-haspopup", "menu");
            summary.setAttribute("aria-expanded", "false");
            menu.addEventListener("toggle", () => summary.setAttribute("aria-expanded", String(menu.open)));
        });
        element(".menubar").addEventListener("keydown", event => this.navigateMenu(event));
        document.addEventListener("click", event => {
            const target = event.target;
            this.menus.filter(menu => menu.open).forEach(menu => { if (!menu.contains(target) || target.closest(".menu-popover button"))
                this.closeMenu(menu); });
        });
    }
    menuItems(menu) {
        return elements(".menu-popover button:not(:disabled), .menu-popover select", menu);
    }
    openMenu(menu, focusItem = false) {
        this.menus.forEach(other => { if (other !== menu)
            this.closeMenu(other); });
        menu.open = true;
        if (focusItem)
            requestAnimationFrame(() => this.menuItems(menu)[0]?.focus());
    }
    closeMenu(menu, restoreFocus = false) {
        menu.open = false;
        if (restoreFocus)
            element("summary", menu).focus();
    }
    navigateMenu(event) {
        const target = event.target;
        const menu = target.closest(".menu");
        if (!menu)
            return;
        const menuIndex = this.menus.indexOf(menu), items = this.menuItems(menu), itemIndex = items.indexOf(target);
        const onSummary = target.matches("summary, summary *");
        const switchMenu = (offset) => {
            const next = this.menus[(menuIndex + offset + this.menus.length) % this.menus.length];
            if (menu.open)
                this.openMenu(next, true);
            else
                element("summary", next).focus();
        };
        if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && target.tagName !== "SELECT") {
            event.preventDefault();
            switchMenu(event.key === "ArrowRight" ? 1 : -1);
        }
        else if (event.key === "ArrowDown" && target.tagName !== "SELECT") {
            event.preventDefault();
            onSummary ? this.openMenu(menu, true) : items[(itemIndex + 1) % items.length]?.focus();
        }
        else if (event.key === "ArrowUp" && target.tagName !== "SELECT") {
            event.preventDefault();
            if (onSummary) {
                this.openMenu(menu);
                items.at(-1)?.focus();
            }
            else
                items[(itemIndex - 1 + items.length) % items.length]?.focus();
        }
        else if ((event.key === "Enter" || event.key === " ") && onSummary) {
            event.preventDefault();
            menu.open ? this.closeMenu(menu) : this.openMenu(menu, true);
        }
        else if (event.key === "Escape") {
            event.preventDefault();
            this.closeMenu(menu, true);
        }
        else if ((event.key === "Home" || event.key === "End") && onSummary) {
            event.preventDefault();
            element("summary", this.menus[event.key === "Home" ? 0 : this.menus.length - 1]).focus();
        }
    }
    bindViewEvents() {
        element("#focusButton").addEventListener("click", () => void this.toggleFocus());
        element("#menuFocusButton").addEventListener("click", () => void this.toggleFocus());
        element("#exitFocusButton").addEventListener("click", () => void this.toggleFocus(false));
        element("#resetLayoutButton").addEventListener("click", () => this.resetLayout());
        document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) {
            document.body.classList.remove("focus-mode");
            requestAnimationFrame(() => this.clampAllPanels());
        } });
        window.addEventListener("resize", () => { if (!document.body.classList.contains("focus-mode"))
            this.clampAllPanels(); });
    }
}
