/**
 * RichMenu - 富菜单 / 属性面板组件
 * 
 * 支持多种显示模式：
 *   - context: 右键浮动菜单（原始模式）
 *   - inline: 内嵌普通div属性面板
 *   - sidebar: 侧边滑出面板
 *   - dialog: 居中对话框
 * 
 * 支持多种布局格式：
 *   - vertical: 垂直列表（默认）
 *   - grid: 网格布局
 *   - tabs: 标签页分组
 *   - accordion: 手风琴折叠
 *   - twocolumn: 两列布局
 *   - compact: 紧凑布局（可通过 section.compact: true 与其他布局组合使用）
 * 
 */
class RichMenu {
    constructor(config) {
        this.config = this._mergeDefaults(config);
        this.menuControls = {};
        this.menuValues = {};
        this.element = null;
        this.onSubmitCallback = null;
        this.onCancelCallback = null;
        this.onResetCallback = null;
        this.onChangeCallback = null;
        this._tabActiveMap = {}; // tabGroupId -> activeTabKey
        this._accordionState = {}; // sectionId -> expanded

        this.init();
    }

    _mergeDefaults(config) {
        const defaults = {
            mode: 'context',        // context | inline | sidebar | dialog
            layout: 'vertical',     // vertical | grid | tabs | accordion | twocolumn | compact
            title: '设置面板',
            width: 360,
            sidebarSide: 'right',  // left | right (for sidebar mode)
            animation: 'fade-in-scale',
            closeOnOutsideClick: true,
            showHeader: true,
            showFooter: true,
            sections: [],
            buttons: [],
            theme: 'light',         // light | dark
        };
        return { ...defaults, ...config };
    }

    // ==================== 初始化 ====================

    init() {
        this.createStyles();
        this.createElement();
        this.bindEvents();
        this.generateContent();
    }

    // ==================== 样式 ====================

    createStyles() {
        if (document.getElementById('rich-menu-styles')) return;

        const styles = `
/* ===== 基础容器 ===== */
.rm-panel {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: #1e293b;
    line-height: 1.5;
    box-sizing: border-box;
}
.rm-panel.rm-dark {
    color: #e2e8f0;
}
.rm-panel *, .rm-panel *::before, .rm-panel *::after {
    box-sizing: border-box;
}

/* ===== 模式：context（浮动定位） ===== */
.rm-panel.rm-mode-context {
    position: fixed;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    z-index: 1000;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275), visibility 0.3s;
    transform: translateY(10px) scale(0.95);
    /* 视口高度约束：内容超高时由 .rm-body 滚动，避免底部项无法选到 */
    max-height: calc(100vh - 16px);
    display: flex;
    flex-direction: column;
}
.rm-panel.rm-dark.rm-mode-context { background: #1e293b; box-shadow: 0 10px 40px rgba(0,0,0,0.4); }
.rm-panel.rm-mode-context.rm-show {
    opacity: 1; visibility: visible; pointer-events: auto;
    transform: translateY(0) scale(1);
}

/* ===== 模式：inline（内嵌面板） ===== */
.rm-panel.rm-mode-inline {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    border: 1px solid #e2e8f0;
    width: 100%;
}
.rm-panel.rm-dark.rm-mode-inline { background: #1e293b; border-color: #334155; }

/* ===== 模式：sidebar（侧边栏） ===== */
.rm-panel.rm-mode-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 380px;
    max-width: 90vw;
    background: #fff;
    box-shadow: -4px 0 24px rgba(0,0,0,0.12);
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
    overflow-y: auto;
}
.rm-panel.rm-mode-sidebar.rm-sidebar-left { transform: translateX(-100%); }
.rm-panel.rm-dark.rm-mode-sidebar { background: #1e293b; box-shadow: -4px 0 24px rgba(0,0,0,0.3); }
.rm-panel.rm-mode-sidebar.rm-show { transform: translateX(0); }

/* ===== 模式：dialog（对话框） ===== */
.rm-overlay {
    position: fixed; top:0; left:0; right:0; bottom:0;
    background: rgba(0,0,0,0.45);
    z-index: 999;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s;
    display: flex; align-items: center; justify-content: center;
}
.rm-overlay.rm-show { opacity: 1; pointer-events: auto; }

.rm-panel.rm-mode-dialog {
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    max-height: 85vh;
    display: flex; flex-direction: column;
    opacity: 0;
    transform: translateY(20px) scale(0.96);
    transition: opacity 0.25s, transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275);
    visibility: hidden;
    pointer-events: none;
}
.rm-panel.rm-dark.rm-mode-dialog { background: #1e293b; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
.rm-panel.rm-mode-dialog.rm-show {
    opacity: 1; transform: translateY(0) scale(1); visibility: visible; pointer-events: auto;
}

/* ===== Header ===== */
.rm-header {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    padding: 18px 20px;
    display: flex; justify-content: space-between; align-items: center;
    border-radius: 12px 12px 0 0;
    flex-shrink: 0;
}
.rm-panel.rm-mode-inline .rm-header { border-radius: 12px 12px 0 0; }
.rm-title { font-size: 16px; font-weight: 600; letter-spacing: 0.3px; }
.rm-close {
    background: rgba(255,255,255,0.15); border: none; color: #fff;
    width: 28px; height: 28px; padding: 0; flex-shrink: 0; border-radius: 50%; cursor: pointer;
    font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center;
    transition: background 0.2s;
}
.rm-close:hover { background: rgba(255,255,255,0.3); transform: none; }

/* ===== Body ===== */
.rm-body { padding: 20px; overflow-y: auto; flex: 1; min-height: 0; }

/* ===== Section ===== */
.rm-section { margin-bottom: 24px; }
.rm-section:last-child { margin-bottom: 0; }

.rm-section-title {
    font-size: 13px; font-weight: 600; color: #6366f1;
    margin-bottom: 14px; padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
    display: flex; align-items: center; gap: 8px;
    text-transform: uppercase; letter-spacing: 0.5px;
}
.rm-panel.rm-dark .rm-section-title { color: #818cf8; border-bottom-color: #334155; }

/* ===== 控件通用 ===== */
.rm-control { margin-bottom: 16px; }
.rm-control:last-child { margin-bottom: 0; }
.rm-label {
    display: block; margin-bottom: 6px; font-weight: 500;
    color: #475569; font-size: 13px;
}
.rm-panel.rm-dark .rm-label { color: #94a3b8; }

/* ===== 输入控件 ===== */
.rm-input, .rm-select, .rm-textarea {
    width: 100%; padding: 9px 12px;
    border: 1px solid #cbd5e1; border-radius: 8px;
    font-size: 14px; transition: all 0.2s;
    background: #fff; color: #1e293b;
    font-family: inherit;
}
.rm-input:focus, .rm-select:focus, .rm-textarea:focus {
    outline: none; border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}
.rm-panel.rm-dark .rm-input,
.rm-panel.rm-dark .rm-select,
.rm-panel.rm-dark .rm-textarea {
    background: #0f172a; border-color: #334155; color: #e2e8f0;
}
.rm-panel.rm-dark .rm-input:focus,
.rm-panel.rm-dark .rm-select:focus,
.rm-panel.rm-dark .rm-textarea:focus {
    border-color: #818cf8; box-shadow: 0 0 0 3px rgba(129,140,248,0.15);
}
.rm-textarea { resize: vertical; min-height: 80px; }
/* 紧凑单行文本域：用于「右键菜单 JSON」等需提高 UI 密度的场景（dense:true） */
.rm-textarea.rm-dense { min-height: 0; height: 26px; resize: none; padding: 4px 8px; overflow: hidden; line-height: 18px; white-space: nowrap; }
.rm-select { cursor: pointer; appearance: auto; }

/* ===== Range ===== */
.rm-range-wrap { display: flex; align-items: center; gap: 12px; }
.rm-range { flex: 1; accent-color: #6366f1; }
.rm-range-val {
    font-weight: 600; color: #6366f1; min-width: 44px;
    text-align: right; font-size: 13px; font-family: monospace;
}
.rm-panel.rm-dark .rm-range-val { color: #818cf8; }

/* ===== Checkbox ===== */
.rm-checkbox-wrap { display: flex; align-items: center; gap: 10px; }
.rm-checkbox-wrap input[type="checkbox"] { width: 18px; height: 18px; accent-color: #6366f1; cursor: pointer; }

/* ===== Radio ===== */
.rm-radio-group { display: flex; flex-direction: column; gap: 8px; }
.rm-radio-option { display: flex; align-items: center; gap: 8px; }
.rm-radio-option input { accent-color: #6366f1; cursor: pointer; }

/* ===== Color ===== */
.rm-color-wrap { display: flex; align-items: center; gap: 10px; }
.rm-color-picker {
    width: 42px; height: 42px; border: 2px solid #e2e8f0;
    border-radius: 8px; cursor: pointer; padding: 2px;
}
.rm-color-text {
    flex: 1; padding: 9px 12px; border: 1px solid #cbd5e1;
    border-radius: 8px; font-family: 'Courier New', monospace; font-size: 13px;
    background: #fff; color: #1e293b;
}
.rm-panel.rm-dark .rm-color-text { background: #0f172a; border-color: #334155; color: #e2e8f0; }

/* ===== Date ===== */
.rm-date { width: 100%; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }
.rm-date:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
.rm-panel.rm-dark .rm-date { background: #0f172a; border-color: #334155; color: #e2e8f0; }

/* ===== File ===== */
.rm-file-wrap { position: relative; overflow: hidden; }
.rm-file-input { position: absolute; left:0; top:0; opacity:0; width:100%; height:100%; cursor:pointer; }
.rm-file-label {
    display: block; padding: 12px; border: 2px dashed #cbd5e1;
    border-radius: 8px; text-align: center; cursor: pointer;
    transition: all 0.2s; color: #64748b; font-size: 13px;
}
.rm-file-label:hover { border-color: #6366f1; color: #6366f1; background: rgba(99,102,241,0.04); }
.rm-panel.rm-dark .rm-file-label { border-color: #475569; color: #94a3b8; }
.rm-panel.rm-dark .rm-file-label:hover { border-color: #818cf8; color: #818cf8; }

/* ===== Toggle Switch ===== */
.rm-toggle-wrap { display: flex; align-items: center; gap: 10px; }
.rm-toggle {
    position: relative; width: 44px; height: 24px;
    background: #cbd5e1; border-radius: 12px; cursor: pointer;
    transition: background 0.25s; flex-shrink: 0;
}
.rm-toggle.active { background: #6366f1; }
.rm-toggle::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 20px; height: 20px; background: #fff; border-radius: 50%;
    transition: transform 0.25s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.rm-toggle.active::after { transform: translateX(20px); }
.rm-toggle-label { font-size: 13px; color: #475569; }
.rm-panel.rm-dark .rm-toggle { background: #475569; }
.rm-panel.rm-dark .rm-toggle.active { background: #818cf8; }
.rm-panel.rm-dark .rm-toggle-label { color: #94a3b8; }

/* ===== Tags Input ===== */
.rm-tags-wrap {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 8px 10px; border: 1px solid #cbd5e1;
    border-radius: 8px; min-height: 42px; cursor: text;
    transition: border-color 0.2s;
}
.rm-tags-wrap:focus-within { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
.rm-panel.rm-dark .rm-tags-wrap { border-color: #334155; background: #0f172a; }
.rm-panel.rm-dark .rm-tags-wrap:focus-within { border-color: #818cf8; }
.rm-tag {
    display: inline-flex; align-items: center; gap: 4px;
    background: #eef2ff; color: #4338ca; padding: 3px 8px;
    border-radius: 6px; font-size: 12px; font-weight: 500;
}
.rm-panel.rm-dark .rm-tag { background: rgba(129,140,248,0.2); color: #a5b4fc; }
.rm-tag-remove {
    cursor: pointer; font-size: 14px; line-height: 1;
    opacity: 0.6; transition: opacity 0.15s; border: none;
    background: none; color: inherit; padding: 0;
}
.rm-tag-remove:hover { opacity: 1; }
.rm-tags-input {
    border: none; outline: none; flex: 1; min-width: 80px;
    font-size: 13px; background: transparent; color: inherit;
    font-family: inherit;
}

/* ===== Slider (with marks) ===== */
.rm-slider-wrap { padding: 4px 0; }
.rm-slider-marks {
    display: flex; justify-content: space-between;
    font-size: 11px; color: #94a3b8; margin-top: 4px;
}

/* ===== Divider ===== */
.rm-divider { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }
.rm-panel.rm-dark .rm-divider { border-top-color: #334155; }

/* ===== Heading ===== */
.rm-heading { font-size: 15px; font-weight: 600; color: #1e293b; margin: 12px 0 8px; }
.rm-panel.rm-dark .rm-heading { color: #e2e8f0; }

/* ===== Button control ===== */
.rm-control-btn {
    padding: 8px 18px; border: none; border-radius: 8px;
    font-weight: 600; cursor: pointer; transition: all 0.2s;
    font-size: 13px; font-family: inherit;
}
.rm-control-btn:hover { transform: translateY(-1px); }
.rm-control-btn.primary { background: #6366f1; color: #fff; }
.rm-control-btn.primary:hover { background: #4f46e5; }
.rm-control-btn.secondary { background: #e2e8f0; color: #475569; }
.rm-control-btn.secondary:hover { background: #cbd5e1; }
.rm-control-btn.danger { background: #ef4444; color: #fff; }
.rm-control-btn.danger:hover { background: #dc2626; }

/* ===== Footer ===== */
.rm-footer {
    padding: 14px 20px; background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex; justify-content: flex-end; gap: 10px;
    border-radius: 0 0 12px 12px;
    flex-shrink: 0;
}
.rm-panel.rm-dark .rm-footer { background: #0f172a; border-top-color: #334155; }
.rm-btn {
    padding: 10px 22px; border: none; border-radius: 8px;
    font-weight: 600; cursor: pointer; transition: all 0.2s;
    font-size: 13px; font-family: inherit;
    display: inline-flex; align-items: center; gap: 6px;
}
.rm-btn:hover { transform: translateY(-1px); }
.rm-btn-primary { background: #6366f1; color: #fff; }
.rm-btn-primary:hover { background: #4f46e5; }
.rm-btn-secondary { background: #94a3b8; color: #fff; }
.rm-btn-secondary:hover { background: #64748b; }
.rm-btn-success { background: #10b981; color: #fff; }
.rm-btn-success:hover { background: #059669; }
.rm-btn-danger { background: #ef4444; color: #fff; }
.rm-btn-danger:hover { background: #dc2626; }

/* ===== 布局：Grid =====
   .rm-layout-grid 既可能在面板根（整体 grid 布局），也可能直接加在
   .rm-section-controls 上（section 级 grid）。两种写法都要生效。 */
.rm-layout-grid .rm-section-controls,
.rm-section-controls.rm-layout-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px;
}
/* 只作用于网格直接子项，避免影响 .rm-row 里的嵌套控件 */
.rm-layout-grid .rm-section-controls > .rm-control,
.rm-section-controls.rm-layout-grid > .rm-control { margin-bottom: 0; }
.rm-layout-grid .rm-section-controls > .rm-span-full,
.rm-section-controls.rm-layout-grid > .rm-span-full { grid-column: 1 / -1; }
.rm-layout-grid .rm-section-controls > .rm-control.rm-span-half,
.rm-section-controls.rm-layout-grid > .rm-control.rm-span-half { grid-column: span 1; }
.rm-layout-grid .rm-control-btn,
.rm-section-controls.rm-layout-grid .rm-control-btn { width: 100%; }
/* heading / divider 不经 rm-control 包裹，需显式占满整行，否则会挤占半格打乱按钮配对 */
.rm-layout-grid .rm-section-controls > .rm-heading,
.rm-section-controls.rm-layout-grid > .rm-heading,
.rm-layout-grid .rm-section-controls > .rm-divider,
.rm-section-controls.rm-layout-grid > .rm-divider { grid-column: 1 / -1; }

/* ===== 混合布局：行容器 rm-row =====
   标了相同 row 的连续控件被收进这里横向并排，
   其余控件仍按 section 原布局（vertical/grid）排列 —— 即 grid + vertical 混合。 */
.rm-row { display: flex; gap: 8px; align-items: flex-end; margin-bottom: 14px; }
.rm-row > .rm-control { flex: 1; margin-bottom: 0; min-width: 0; }
.rm-row > .rm-control .rm-control-btn { width: 100%; }
/* 行容器在 grid 中占满整行，内部再自行等分 */
.rm-layout-grid .rm-section-controls > .rm-row,
.rm-section-controls.rm-layout-grid > .rm-row { grid-column: 1 / -1; margin-bottom: 0; }

/* span:'half' —— 在非 grid（如默认 vertical）的 section 里也能两两并排 */
.rm-section-controls:not(.rm-layout-grid) > .rm-control.rm-span-half {
    display: inline-block; width: calc(50% - 5px); vertical-align: top;
}
.rm-section-controls:not(.rm-layout-grid) > .rm-control.rm-span-half + .rm-control.rm-span-half {
    margin-left: 8px;
}
.rm-control.rm-span-half .rm-control-btn { width: 100%; }

/* ===== 布局：Tabs ===== */
.rm-tabs-nav {
    display: flex; border-bottom: 2px solid #e2e8f0;
    margin-bottom: 16px; gap: 0; overflow-x: auto; overflow-y: hidden;
}
.rm-panel.rm-dark .rm-tabs-nav { border-bottom-color: #334155; }
.rm-tab-btn {
    padding: 10px 18px 8px; border: none; background: transparent;
    color: #64748b; font-size: 13px; font-weight: 500; cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s; white-space: nowrap; font-family: inherit;
}
.rm-tab-btn:hover { color: #6366f1; }
.rm-tab-btn.active { color: #6366f1; border-bottom-color: #6366f1; font-weight: 600; }
.rm-panel.rm-dark .rm-tab-btn { color: #94a3b8; }
.rm-panel.rm-dark .rm-tab-btn:hover { color: #818cf8; }
.rm-panel.rm-dark .rm-tab-btn.active { color: #818cf8; border-bottom-color: #818cf8; }
.rm-tab-panel { display: none; }
.rm-tab-panel.active { display: block; }

/* ===== 布局：Accordion ===== */
.rm-accordion-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; background: #f1f5f9; border-radius: 8px;
    cursor: pointer; font-weight: 600; font-size: 13px;
    color: #475569; transition: all 0.2s; user-select: none;
}
.rm-accordion-header:hover { background: #e2e8f0; }
.rm-panel.rm-dark .rm-accordion-header { background: #1e293b; color: #94a3b8; }
.rm-panel.rm-dark .rm-accordion-header:hover { background: #334155; }
.rm-accordion-arrow {
    transition: transform 0.25s; font-size: 12px; color: #94a3b8;
}
.rm-accordion-header.expanded .rm-accordion-arrow { transform: rotate(180deg); }
.rm-accordion-body {
    max-height: 0; overflow: hidden;
    transition: max-height 0.3s ease, padding 0.3s ease;
    padding: 0 14px;
}
.rm-accordion-body.expanded {
    max-height: 2000px; padding: 14px;
}

/* ===== 布局：TwoColumn ===== */
.rm-layout-twocolumn .rm-section-controls {
    display: grid; grid-template-columns: auto 1fr;
    gap: 8px 16px; align-items: center;
}
.rm-layout-twocolumn .rm-label { margin-bottom: 0; text-align: right; white-space: nowrap; }
.rm-layout-twocolumn .rm-control { margin-bottom: 0; }
.rm-layout-twocolumn .rm-control.rm-span-full { grid-column: 1 / -1; }

/* ===== 布局：Compact（紧凑行内标签） ===== */
.rm-layout-compact .rm-section-controls {
    display: grid; grid-template-columns: auto 1fr;
    gap: 6px 12px; align-items: center;
}
.rm-layout-compact .rm-control { margin-bottom: 0; display: contents; }
.rm-layout-compact .rm-label {
    margin-bottom: 0; text-align: right; white-space: nowrap;
    font-size: 12px; padding: 4px 0;
}
.rm-layout-compact .rm-control.rm-span-full { grid-column: 1 / -1; }
.rm-layout-compact .rm-control.rm-span-full .rm-label { text-align: left; }
.rm-layout-compact .rm-heading { grid-column: 1 / -1; }
.rm-layout-compact .rm-divider { grid-column: 1 / -1; }
.rm-layout-compact .rm-control-btn { grid-column: 2; }

/* ===== Section级Compact ===== */
.rm-section.rm-compact .rm-section-controls {
    display: grid; grid-template-columns: auto 1fr;
    gap: 6px 12px; align-items: center;
}
.rm-section.rm-compact .rm-control { margin-bottom: 0; display: contents; }
.rm-section.rm-compact .rm-label {
    margin-bottom: 0; text-align: right; white-space: nowrap;
    font-size: 12px; padding: 4px 0;
}
.rm-section.rm-compact .rm-control.rm-span-full { grid-column: 1 / -1; }
.rm-section.rm-compact .rm-control.rm-span-full .rm-label { text-align: left; }
.rm-section.rm-compact .rm-heading { grid-column: 1 / -1; }
.rm-section.rm-compact .rm-divider { grid-column: 1 / -1; }
.rm-section.rm-compact .rm-control-btn { grid-column: 2; }

/* ===== Canvas控件 ===== */
.rm-canvas-wrap {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    background: #f8fafc;
}
.rm-canvas {
    display: block;
    width: 100%;
    height: auto;
}
.rm-panel.rm-dark .rm-canvas-wrap { border-color: #334155; background: #0f172a; }

/* ===== 浮动控件 ===== */
.rm-control.rm-floating {
    position: absolute;
    z-index: 100;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    padding: 8px 12px;
    margin-bottom: 0;
}
.rm-panel.rm-dark .rm-control.rm-floating { background: #1e293b; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.rm-control.rm-floating .rm-label { margin-bottom: 4px; }
.rm-control.rm-floating.rm-inline {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
}
.rm-control.rm-floating.rm-inline .rm-label { margin-bottom: 0; white-space: nowrap; }
.rm-section.rm-has-floating { position: relative; }

/* ===== 禁用（灰禁）控件 ===== */
.rm-control.rm-disabled { opacity: 0.45; pointer-events: none; filter: grayscale(0.6); }
.rm-control.rm-disabled .rm-label { color: #94a3b8 !important; }
.rm-control.rm-disabled .rm-range { cursor: not-allowed; }
.rm-control-btn:disabled,
.rm-control.rm-disabled .rm-control-btn {
    opacity: 0.5; cursor: not-allowed; filter: grayscale(0.6);
    background: #475569 !important; color: #cbd5e1 !important;
    border-color: #475569 !important;
}

/* ===== 动画类 ===== */
.rm-anim-fade-in-move-up { opacity: 0; transform: translateY(20px); transition: opacity 0.3s ease, transform 0.3s ease; }
.rm-anim-fade-in-move-up.rm-show { opacity: 1; transform: translateY(0); }
.rm-anim-fade-in-scale { opacity: 0; transform: scale(0.9); transition: opacity 0.2s ease, transform 0.2s ease; }
.rm-anim-fade-in-scale.rm-show { opacity: 1; transform: scale(1); }
.rm-anim-fade-in-slide-down { opacity: 0; transform: translateY(-20px); transition: opacity 0.3s ease, transform 0.3s ease; }
.rm-anim-fade-in-slide-down.rm-show { opacity: 1; transform: translateY(0); }
.rm-anim-fade-in-zoom { opacity: 0; transform: scale(0.5); transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275); }
.rm-anim-fade-in-zoom.rm-show { opacity: 1; transform: scale(1); }
`;
        const styleSheet = document.createElement('style');
        styleSheet.id = 'rich-menu-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    // ==================== 创建DOM ====================

    createElement() {
        const c = this.config;
        const themeClass = c.theme === 'dark' ? 'rm-dark' : '';
        const modeClass = `rm-mode-${c.mode}`;
        const layoutClass = `rm-layout-${c.layout}`;

        // overlay for dialog mode
        if (c.mode === 'dialog') {
            this.overlay = document.createElement('div');
            this.overlay.className = 'rm-overlay';
            document.body.appendChild(this.overlay);
        }

        this.element = document.createElement('div');
        this.element.className = `rm-panel ${modeClass} ${layoutClass} ${themeClass}`;

        // sidebar side
        if (c.mode === 'sidebar' && c.sidebarSide === 'left') {
            this.element.classList.add('rm-sidebar-left');
            this.element.style.left = '0';
        } else if (c.mode === 'sidebar') {
            this.element.style.right = '0';
        }

        // width
        if (c.mode !== 'inline') {
            this.element.style.width = c.width + 'px';
        }

        // animation class
        const animMap = {
            'fade-in-move-up': 'rm-anim-fade-in-move-up',
            'fade-in-scale': 'rm-anim-fade-in-scale',
            'fade-in-slide-down': 'rm-anim-fade-in-slide-down',
            'fade-in-zoom': 'rm-anim-fade-in-zoom',
        };
        const animCls = animMap[c.animation] || 'rm-anim-fade-in-scale';
        if (c.mode === 'context' || c.mode === 'dialog') {
            this.element.classList.add(animCls);
        }

        this.element.innerHTML = `
            ${c.showHeader ? `<div class="rm-header">
                <div class="rm-title">${this._esc(c.title)}</div>
                <button class="rm-close">&times;</button>
            </div>` : ''}
            <div class="rm-body"></div>
            ${c.showFooter ? '<div class="rm-footer"></div>' : ''}
        `;

        if (c.mode === 'dialog') {
            this.overlay.appendChild(this.element);
        } else if (c.mode === 'inline') {
            // inline: append to container if provided, otherwise body
            if (c.container) {
                c.container.appendChild(this.element);
            } else {
                document.body.appendChild(this.element);
            }
        } else {
            document.body.appendChild(this.element);
        }
    }

    // ==================== 事件绑定 ====================

    bindEvents() {
        const c = this.config;

        // close button
        const closeBtn = this.element.querySelector('.rm-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // outside click
        if (c.closeOnOutsideClick) {
            if (c.mode === 'dialog' && this.overlay) {
                this.overlay.addEventListener('click', (e) => {
                    if (e.target === this.overlay) this.hide();
                });
            } else if (c.mode === 'context') {
                document.addEventListener('mousedown', (e) => {
                    if (this.element.classList.contains('rm-show') && !this.element.contains(e.target)) {
                        this.hide();
                    }
                });
            }
        }

        // context menu prevent default
        this.element.addEventListener('contextmenu', (e) => e.preventDefault());

        // ESC to close
        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    // ==================== 内容生成 ====================

    generateContent() {
        const c = this.config;
        const menuBody = this.element.querySelector('.rm-body');
        const menuFooter = this.element.querySelector('.rm-footer');

        menuBody.innerHTML = '';
        if (menuFooter) menuFooter.innerHTML = '';
        this.menuControls = {};
        this.menuValues = {};
        // Apply layout class
        this.element.classList.remove(
            'rm-layout-vertical', 'rm-layout-grid', 'rm-layout-tabs',
            'rm-layout-accordion', 'rm-layout-twocolumn', 'rm-layout-compact'
        );
        this.element.classList.add(`rm-layout-${c.layout}`);

        if (c.layout === 'tabs') {
            this._generateTabsLayout(menuBody, c.sections);
        } else {
            this._generateSections(menuBody, c.sections);
        }

        // buttons
        if (menuFooter) {
            if (c.buttons && c.buttons.length > 0) {
                c.buttons.forEach(btn => menuFooter.appendChild(this._createButton(btn)));
            } else {
                const defaults = [
                    { type: 'reset', label: '重置' },
                    { type: 'cancel', label: '取消' },
                    { type: 'submit', label: '保存', style: 'primary' },
                ];
                defaults.forEach(btn => menuFooter.appendChild(this._createButton(btn)));
            }
        }
    }

    _generateSections(container, sections) {
        if (!sections || sections.length === 0) return;
        sections.forEach((section, i) => {
            const sectionEl = this._createSection(section, i);
            container.appendChild(sectionEl);
        });
    }

    _generateTabsLayout(container, sections) {
        if (!sections || sections.length === 0) return;
        const tabId = 'rm-tabs-' + Math.random().toString(36).slice(2, 8);

        // tabs nav
        const nav = document.createElement('div');
        nav.className = 'rm-tabs-nav';

        // panels container
        const panels = document.createElement('div');
        panels.className = 'rm-tabs-panels';

        const activeKey = this._tabActiveMap[tabId] || sections[0]?.key || 0;

        sections.forEach((section, i) => {
            const key = section.key ?? i;
            const btn = document.createElement('button');
            btn.className = 'rm-tab-btn';
            btn.textContent = section.title || `标签 ${i + 1}`;
            btn.dataset.tabKey = key;
            if (String(key) === String(activeKey)) btn.classList.add('active');
            btn.addEventListener('click', () => {
                nav.querySelectorAll('.rm-tab-btn').forEach(b => b.classList.remove('active'));
                panels.querySelectorAll('.rm-tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = panels.querySelector(`[data-tab-panel="${key}"]`);
                if (panel) panel.classList.add('active');
                this._tabActiveMap[tabId] = key;
            });
            nav.appendChild(btn);

            const panel = document.createElement('div');
            panel.className = 'rm-tab-panel';
            panel.dataset.tabPanel = key;
            if (String(key) === String(activeKey)) panel.classList.add('active');

            // section controls (no title needed in tab)
            // 注意：tabs 布局不走 _createSection，故 section 级 layout（如 'grid'）
            // 必须在此单独应用，否则 Tab 内的 grid/混合布局会完全失效。
            if (section.controls && section.controls.length > 0) {
                panel.appendChild(this._buildControlsWrap(section));
            }
            panels.appendChild(panel);
        });

        container.appendChild(nav);
        container.appendChild(panels);
    }

    _createSection(section, index) {
        const c = this.config;
        const sectionEl = document.createElement('div');
        sectionEl.className = 'rm-section';

        // Section级别compact支持（可与其他布局组合）
        const isSectionCompact = section.compact === true;
        if (isSectionCompact) {
            sectionEl.classList.add('rm-compact');
        }

        // 检查是否有浮动控件
        const hasFloating = section.controls && section.controls.some(ctrl => ctrl.floating);
        if (hasFloating) {
            sectionEl.classList.add('rm-has-floating');
        }

        // Section 级 layout（grid/twocolumn）现由 _buildControlsWrap 直接加在
        // .rm-section-controls 上（与 tabs 布局共用同一套逻辑），此处不再重复添加，
        // 避免祖先与容器双重命中 .rm-layout-grid 后代选择器导致嵌套行内控件被误当作网格项。

        if (c.layout === 'accordion') {
            // accordion mode
            const sectionId = section.key ?? index;
            const isExpanded = this._accordionState[sectionId] ?? (section.expanded !== false);

            const header = document.createElement('div');
            header.className = 'rm-accordion-header' + (isExpanded ? ' expanded' : '');
            header.innerHTML = `
                <span>${section.icon ? `<i class="${section.icon}"></i> ` : ''}${this._esc(section.title || `分组 ${index + 1}`)}</span>
                <span class="rm-accordion-arrow">▼</span>
            `;

            const body = document.createElement('div');
            body.className = 'rm-accordion-body' + (isExpanded ? ' expanded' : '');

            header.addEventListener('click', () => {
                const expanded = header.classList.toggle('expanded');
                body.classList.toggle('expanded');
                this._accordionState[sectionId] = expanded;
            });

            if (section.controls && section.controls.length > 0) {
                body.appendChild(this._buildControlsWrap(section));
            }

            sectionEl.appendChild(header);
            sectionEl.appendChild(body);
        } else {
            // vertical / grid / twocolumn mode
            if (section.title) {
                const title = document.createElement('div');
                title.className = 'rm-section-title';
                if (section.icon) {
                    const icon = document.createElement('i');
                    icon.className = section.icon;
                    title.appendChild(icon);
                }
                const span = document.createElement('span');
                span.textContent = section.title;
                title.appendChild(span);
                sectionEl.appendChild(title);
            }

            if (section.controls && section.controls.length > 0) {
                sectionEl.appendChild(this._buildControlsWrap(section));
            }
        }

        return sectionEl;
    }

    /**
     * 构建 section 的控件容器，统一支持「混合布局」。
     * 被 _createSection（vertical/grid/twocolumn/accordion）与 _generateTabsLayout 共用，
     * 保证任何布局模式下混合规则表现一致。
     *
     * 两种混合方式（可同时使用）：
     *  1) section.layout='grid' + 控件 span:'full' —— 整体两列，个别控件占满整行；
     *  2) 控件 row:'xxx' —— 无论 section 是什么布局，连续且 row 值相同的控件会被
     *     收进一个 .rm-row 行容器内并排显示，其余控件保持原布局（纵向）。
     *     这就是 grid + vertical 的混合：只有标了 row 的那一小段变横排。
     */
    _buildControlsWrap(section) {
        const wrap = document.createElement('div');
        wrap.className = 'rm-section-controls';
        if (section.layout === 'grid') wrap.classList.add('rm-layout-grid');
        if (section.layout === 'twocolumn') wrap.classList.add('rm-layout-twocolumn');

        const controls = section.controls || [];
        let i = 0;
        while (i < controls.length) {
            const cur = controls[i];
            const rowKey = cur && cur.row;
            if (!rowKey) {
                const el = this._createControl(cur);
                if (el) wrap.appendChild(el);
                i++;
                continue;
            }
            // 收集连续同 row 的控件，放进一个横向行容器
            const group = [];
            while (i < controls.length && controls[i] && controls[i].row === rowKey) {
                group.push(controls[i]);
                i++;
            }
            const rowEl = document.createElement('div');
            rowEl.className = 'rm-row';
            // 行内自身占满父 grid 整行，避免行容器只占半格
            rowEl.classList.add('rm-span-full');
            group.forEach(g => {
                const el = this._createControl(g);
                if (!el) return;
                // 行内各控件默认等分；可用 flex 数字指定占比
                if (g.flex !== undefined) el.style.flex = String(g.flex);
                rowEl.appendChild(el);
            });
            wrap.appendChild(rowEl);
        }
        return wrap;
    }

    // ==================== 控件创建 ====================

    _createControl(ctrl) {
        if (!ctrl.type || !ctrl.id) {
            // Allow divider and heading without id
            if (ctrl.type === 'divider') return this._createDivider();
            if (ctrl.type === 'heading') return this._createHeading(ctrl);
            console.warn('控件缺少必要属性:', ctrl);
            return null;
        }

        switch (ctrl.type) {
            case 'text': case 'email': case 'password': case 'number':
                return this._createInput(ctrl);
            case 'textarea':
                return this._createTextarea(ctrl);
            case 'select':
                return this._createSelect(ctrl);
            case 'checkbox':
                return this._createCheckbox(ctrl);
            case 'radio':
                return this._createRadio(ctrl);
            case 'range':
                return this._createRange(ctrl);
            case 'color':
                return this._createColor(ctrl);
            case 'date':
                return this._createDate(ctrl);
            case 'file':
                return this._createFile(ctrl);
            case 'toggle':
                return this._createToggle(ctrl);
            case 'tags':
                return this._createTags(ctrl);
            case 'slider':
                return this._createSlider(ctrl);
            case 'button':
                return this._createControlButton(ctrl);
            case 'canvas':
                return this._createCanvas(ctrl);
            case 'divider':
                return this._createDivider();
            case 'heading':
                return this._createHeading(ctrl);
            default:
                console.warn(`未知控件类型: ${ctrl.type}`);
                return null;
        }
    }

    _wrapControl(ctrl, innerEl) {
        const wrap = document.createElement('div');
        wrap.className = 'rm-control';
        if (ctrl.span === 'full') wrap.classList.add('rm-span-full');
        if (ctrl.floating) wrap.classList.add('rm-floating');

        // 浮动内联控件（checkbox, toggle）
        if (ctrl.floating && (ctrl.type === 'checkbox' || ctrl.type === 'toggle')) {
            wrap.classList.add('rm-inline');
        }

        // 浮动定位样式
        if (ctrl.floating) {
            if (ctrl.left !== undefined) wrap.style.left = (typeof ctrl.left === 'number' ? ctrl.left + 'px' : ctrl.left);
            if (ctrl.top !== undefined) wrap.style.top = (typeof ctrl.top === 'number' ? ctrl.top + 'px' : ctrl.top);
            if (ctrl.right !== undefined) wrap.style.right = (typeof ctrl.right === 'number' ? ctrl.right + 'px' : ctrl.right);
            if (ctrl.bottom !== undefined) wrap.style.bottom = (typeof ctrl.bottom === 'number' ? ctrl.bottom + 'px' : ctrl.bottom);
            if (ctrl.width) wrap.style.width = (typeof ctrl.width === 'number' ? ctrl.width + 'px' : ctrl.width);
            if (ctrl.height) wrap.style.height = (typeof ctrl.height === 'number' ? ctrl.height + 'px' : ctrl.height);
            if (ctrl.zIndex) wrap.style.zIndex = ctrl.zIndex;
        }

        const label = document.createElement('label');
        label.className = 'rm-label';
        label.textContent = ctrl.label || ctrl.id;
        label.htmlFor = ctrl.id;

        if (!ctrl.hideLabel) wrap.appendChild(label);
        if (innerEl) wrap.appendChild(innerEl);
        return wrap;
    }

    // 禁用态包装：加 rm-disabled 类（含灰禁样式），并阻断交互事件冒泡到菜单
    _wrapDisabled(ctrl, innerEl) {
        const wrap = this._wrapControl(ctrl, innerEl);
        wrap.classList.add('rm-disabled');
        wrap.addEventListener('click', (e) => e.stopPropagation());
        wrap.addEventListener('mousedown', (e) => e.stopPropagation());
        wrap.addEventListener('contextmenu', (e) => e.stopPropagation());
        return wrap;
    }

    _createInput(ctrl) {
        const input = document.createElement('input');
        input.type = ctrl.type;
        input.className = 'rm-input';
        input.id = ctrl.id;
        input.name = ctrl.id;
        input.value = ctrl.value ?? '';
        if (ctrl.placeholder) input.placeholder = ctrl.placeholder;
        if (ctrl.required) input.required = true;
        if (ctrl.readonly) input.readOnly = true;
        if (ctrl.type === 'number') {
            if (ctrl.min !== undefined) input.min = ctrl.min;
            if (ctrl.max !== undefined) input.max = ctrl.max;
            if (ctrl.step !== undefined) input.step = ctrl.step;
        }
        this.menuControls[ctrl.id] = input;
        this.menuValues[ctrl.id] = input.value;
        input.addEventListener('input', () => {
            this.menuValues[ctrl.id] = input.value;
            this._fireChange(ctrl.id, input.value);
        });
        input.addEventListener('change', () => {
            this.menuValues[ctrl.id] = input.value;
        });
        return this._wrapControl(ctrl, input);
    }

    _createTextarea(ctrl) {
        const ta = document.createElement('textarea');
        ta.className = 'rm-textarea' + (ctrl.dense ? ' rm-dense' : '');
        ta.id = ctrl.id;
        ta.name = ctrl.id;
        ta.value = ctrl.value ?? '';
        if (ctrl.placeholder) ta.placeholder = ctrl.placeholder;
        if (ctrl.rows) ta.rows = ctrl.rows;
        if (ctrl.readonly) ta.readOnly = true;
        if (ctrl.required) ta.required = true;
        this.menuControls[ctrl.id] = ta;
        this.menuValues[ctrl.id] = ta.value;
        ta.addEventListener('input', () => {
            this.menuValues[ctrl.id] = ta.value;
            this._fireChange(ctrl.id, ta.value);
        });
        return this._wrapControl(ctrl, ta);
    }

    _createSelect(ctrl) {
        const sel = document.createElement('select');
        sel.className = 'rm-select';
        sel.id = ctrl.id;
        sel.name = ctrl.id;
        if (ctrl.options && Array.isArray(ctrl.options)) {
            ctrl.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label || opt.value;
                if (ctrl.value === opt.value) o.selected = true;
                sel.appendChild(o);
            });
        }
        this.menuControls[ctrl.id] = sel;
        this.menuValues[ctrl.id] = sel.value;
        sel.addEventListener('change', () => {
            this.menuValues[ctrl.id] = sel.value;
            this._fireChange(ctrl.id, sel.value);
        });
        return this._wrapControl(ctrl, sel);
    }

    _createCheckbox(ctrl) {
        const wrap = document.createElement('div');
        wrap.className = 'rm-control';
        if (ctrl.span === 'full') wrap.classList.add('rm-span-full');
        if (ctrl.floating) {
            wrap.classList.add('rm-floating', 'rm-inline');
            if (ctrl.left !== undefined) wrap.style.left = (typeof ctrl.left === 'number' ? ctrl.left + 'px' : ctrl.left);
            if (ctrl.top !== undefined) wrap.style.top = (typeof ctrl.top === 'number' ? ctrl.top + 'px' : ctrl.top);
            if (ctrl.right !== undefined) wrap.style.right = (typeof ctrl.right === 'number' ? ctrl.right + 'px' : ctrl.right);
            if (ctrl.bottom !== undefined) wrap.style.bottom = (typeof ctrl.bottom === 'number' ? ctrl.bottom + 'px' : ctrl.bottom);
            if (ctrl.zIndex) wrap.style.zIndex = ctrl.zIndex;
        }

        const isCompact = this.config.layout === 'compact' || ctrl.compact;

        if (isCompact) {
            // compact: label on left, checkbox on right
            const label = document.createElement('label');
            label.className = 'rm-label';
            label.textContent = ctrl.label || ctrl.id;
            label.htmlFor = ctrl.id;

            const cbox = document.createElement('div');
            cbox.className = 'rm-checkbox-wrap';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = ctrl.id;
            input.name = ctrl.id;
            input.checked = !!ctrl.value;

            cbox.appendChild(input);
            wrap.appendChild(label);
            wrap.appendChild(cbox);

            this.menuControls[ctrl.id] = input;
            this.menuValues[ctrl.id] = input.checked;
            input.addEventListener('change', () => {
                this.menuValues[ctrl.id] = input.checked;
                this._fireChange(ctrl.id, input.checked);
            });
        } else {
            const cbox = document.createElement('div');
            cbox.className = 'rm-checkbox-wrap';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = ctrl.id;
            input.name = ctrl.id;
            input.checked = !!ctrl.value;

            const label = document.createElement('label');
            label.htmlFor = ctrl.id;
            label.textContent = ctrl.label || ctrl.id;
            label.style.cursor = 'pointer';

            cbox.appendChild(input);
            cbox.appendChild(label);
            wrap.appendChild(cbox);

            this.menuControls[ctrl.id] = input;
            this.menuValues[ctrl.id] = input.checked;
            input.addEventListener('change', () => {
                this.menuValues[ctrl.id] = input.checked;
                this._fireChange(ctrl.id, input.checked);
            });
        }
        return wrap;
    }

    _createRadio(ctrl) {
        const group = document.createElement('div');
        group.className = 'rm-radio-group';

        if (ctrl.options && Array.isArray(ctrl.options)) {
            ctrl.options.forEach(opt => {
                const optDiv = document.createElement('div');
                optDiv.className = 'rm-radio-option';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.id = `${ctrl.id}_${opt.value}`;
                radio.name = ctrl.id;
                radio.value = opt.value;
                if (ctrl.value === opt.value) radio.checked = true;
                const lbl = document.createElement('label');
                lbl.htmlFor = `${ctrl.id}_${opt.value}`;
                lbl.textContent = opt.label || opt.value;
                lbl.style.cursor = 'pointer';
                radio.addEventListener('change', () => {
                    if (radio.checked) {
                        this.menuValues[ctrl.id] = radio.value;
                        this._fireChange(ctrl.id, radio.value);
                    }
                });
                optDiv.appendChild(radio);
                optDiv.appendChild(lbl);
                group.appendChild(optDiv);
            });
        }
        this.menuValues[ctrl.id] = ctrl.value ?? '';
        return this._wrapControl(ctrl, group);
    }

    _createRange(ctrl) {
        const rangeWrap = document.createElement('div');
        rangeWrap.className = 'rm-range-wrap';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'rm-range';
        input.id = ctrl.id;
        input.name = ctrl.id;
        input.value = ctrl.value ?? 50;
        if (ctrl.min !== undefined) input.min = ctrl.min;
        if (ctrl.max !== undefined) input.max = ctrl.max;
        if (ctrl.step !== undefined) input.step = ctrl.step;

        const valSpan = document.createElement('span');
        valSpan.className = 'rm-range-val';
        valSpan.textContent = ctrl.disabled ? '已禁用' : `${input.value}${ctrl.unit || ''}`;

        rangeWrap.appendChild(input);
        rangeWrap.appendChild(valSpan);

        this.menuControls[ctrl.id] = input;
        this.menuControls[`${ctrl.id}_value`] = valSpan;
        this.menuValues[ctrl.id] = input.value;

        if (ctrl.disabled) {
            input.disabled = true;
            return this._wrapDisabled(ctrl, rangeWrap);
        }

        input.addEventListener('input', () => {
            this.menuValues[ctrl.id] = input.value;
            valSpan.textContent = `${input.value}${ctrl.unit || ''}`;
            this._fireChange(ctrl.id, parseFloat(input.value));
        });

        return this._wrapControl(ctrl, rangeWrap);
    }

    _createColor(ctrl) {
        const colorWrap = document.createElement('div');
        colorWrap.className = 'rm-color-wrap';

        // 判断是否为非标准颜色值（如表达式 =xxx）
        const isNonHex = typeof ctrl.value === 'string' && !/^#([0-9A-F]{3}){1,2}$/i.test(ctrl.value) && ctrl.value !== 'transparent' && ctrl.value !== '';

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'rm-color-picker';
        picker.id = ctrl.id;
        picker.name = ctrl.id;
        picker.value = isNonHex ? '#6366f1' : (ctrl.value || '#6366f1');

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'rm-color-text';
        textInput.value = ctrl.value || '';

        colorWrap.appendChild(picker);
        colorWrap.appendChild(textInput);

        this.menuControls[ctrl.id] = picker;
        this.menuControls[`${ctrl.id}_text`] = textInput;
        // 保持原始值，非 hex 值（表达式）不被 picker 覆盖
        this.menuValues[ctrl.id] = ctrl.value || '';

        picker.addEventListener('input', () => {
            this.menuValues[ctrl.id] = picker.value;
            textInput.value = picker.value;
            this._fireChange(ctrl.id, picker.value);
        });
        textInput.addEventListener('input', () => {
            if (textInput.value === '' || textInput.value.toLowerCase() === 'transparent') {
                this.menuValues[ctrl.id] = 'transparent';
                picker.value = '#000000';
                this._fireChange(ctrl.id, 'transparent');
            } else if (/^#([0-9A-F]{3}){1,2}$/i.test(textInput.value)) {
                this.menuValues[ctrl.id] = textInput.value;
                picker.value = textInput.value;
                this._fireChange(ctrl.id, textInput.value);
            }
            // 不符合格式的值（如表达式）不更新
        });
        // blur 时提交非标准值（如表达式），避免 input 阶段频繁触发
        textInput.addEventListener('change', () => {
            const val = textInput.value;
            if (val && !/^#([0-9A-F]{3}){1,2}$/i.test(val) && val.toLowerCase() !== 'transparent') {
                this.menuValues[ctrl.id] = val;
                this._fireChange(ctrl.id, val);
            }
        });

        return this._wrapControl(ctrl, colorWrap);
    }

    _createDate(ctrl) {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'rm-date';
        input.id = ctrl.id;
        input.name = ctrl.id;
        input.value = ctrl.value || '';
        this.menuControls[ctrl.id] = input;
        this.menuValues[ctrl.id] = input.value;
        input.addEventListener('change', () => {
            this.menuValues[ctrl.id] = input.value;
            this._fireChange(ctrl.id, input.value);
        });
        return this._wrapControl(ctrl, input);
    }

    _createFile(ctrl) {
        const fileWrap = document.createElement('div');
        fileWrap.className = 'rm-file-wrap';

        const input = document.createElement('input');
        input.type = 'file';
        input.className = 'rm-file-input';
        input.id = ctrl.id;
        input.name = ctrl.id;
        if (ctrl.accept) input.accept = ctrl.accept;
        if (ctrl.multiple) input.multiple = true;

        const label = document.createElement('div');
        label.className = 'rm-file-label';
        label.textContent = ctrl.placeholder || '点击选择文件';

        fileWrap.appendChild(input);
        fileWrap.appendChild(label);

        this.menuControls[ctrl.id] = input;
        this.menuValues[ctrl.id] = null;

        input.addEventListener('change', () => {
            if (input.files.length > 0) {
                if (ctrl.multiple) {
                    this.menuValues[ctrl.id] = input.files;
                    label.textContent = input.files.length + ' 个文件';
                } else {
                    this.menuValues[ctrl.id] = input.files[0];
                    label.textContent = input.files[0].name;
                }
            } else {
                this.menuValues[ctrl.id] = null;
                label.textContent = ctrl.placeholder || '点击选择文件';
            }
            this._fireChange(ctrl.id, this.menuValues[ctrl.id]);
        });

        return this._wrapControl(ctrl, fileWrap);
    }

    _createToggle(ctrl) {
        const wrap = document.createElement('div');
        wrap.className = 'rm-control';
        if (ctrl.span === 'full') wrap.classList.add('rm-span-full');
        if (ctrl.floating) {
            wrap.classList.add('rm-floating', 'rm-inline');
            if (ctrl.left !== undefined) wrap.style.left = (typeof ctrl.left === 'number' ? ctrl.left + 'px' : ctrl.left);
            if (ctrl.top !== undefined) wrap.style.top = (typeof ctrl.top === 'number' ? ctrl.top + 'px' : ctrl.top);
            if (ctrl.right !== undefined) wrap.style.right = (typeof ctrl.right === 'number' ? ctrl.right + 'px' : ctrl.right);
            if (ctrl.bottom !== undefined) wrap.style.bottom = (typeof ctrl.bottom === 'number' ? ctrl.bottom + 'px' : ctrl.bottom);
            if (ctrl.zIndex) wrap.style.zIndex = ctrl.zIndex;
        }

        const isCompact = this.config.layout === 'compact' || ctrl.compact;

        const toggleWrap = document.createElement('div');
        toggleWrap.className = 'rm-toggle-wrap';

        const toggle = document.createElement('div');
        toggle.className = 'rm-toggle' + (ctrl.value ? ' active' : '');
        toggle.tabIndex = 0;
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', !!ctrl.value);

        const toggleValue = !!ctrl.value;
        this.menuControls[ctrl.id] = toggle;
        this.menuValues[ctrl.id] = toggleValue;

        if (isCompact) {
            // compact: separate label on left, toggle on right
            const label = document.createElement('label');
            label.className = 'rm-label';
            label.textContent = ctrl.label || ctrl.id;
            toggleWrap.appendChild(toggle);
            wrap.appendChild(label);
            wrap.appendChild(toggleWrap);
        } else {
            const label = document.createElement('span');
            label.className = 'rm-toggle-label';
            label.textContent = ctrl.label || ctrl.id;
            toggleWrap.appendChild(toggle);
            toggleWrap.appendChild(label);
            wrap.appendChild(toggleWrap);
        }

        const doToggle = () => {
            const newVal = !this.menuValues[ctrl.id];
            this.menuValues[ctrl.id] = newVal;
            toggle.classList.toggle('active', newVal);
            toggle.setAttribute('aria-checked', newVal);
            this._fireChange(ctrl.id, newVal);
        };

        toggle.addEventListener('click', doToggle);
        toggle.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doToggle(); }
        });

        return wrap;
    }

    _createTags(ctrl) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'rm-tags-wrap';

        const tags = Array.isArray(ctrl.value) ? [...ctrl.value] : [];

        const renderTags = () => {
            // Remove existing tag elements (keep input)
            tagsWrap.querySelectorAll('.rm-tag').forEach(t => t.remove());
            const input = tagsWrap.querySelector('.rm-tags-input');
            tags.forEach((tag, i) => {
                const tagEl = document.createElement('span');
                tagEl.className = 'rm-tag';
                tagEl.innerHTML = `${this._esc(String(tag))}<button class="rm-tag-remove" data-idx="${i}">&times;</button>`;
                tagsWrap.insertBefore(tagEl, input);
            });
            this.menuValues[ctrl.id] = [...tags];
        };

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'rm-tags-input';
        input.placeholder = ctrl.placeholder || '输入后回车添加';
        if (ctrl.id) input.id = ctrl.id + '_input';

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.value.trim();
                if (val && !tags.includes(val)) {
                    tags.push(val);
                    input.value = '';
                    renderTags();
                    this._fireChange(ctrl.id, [...tags]);
                }
            } else if (e.key === 'Backspace' && !input.value && tags.length > 0) {
                tags.pop();
                renderTags();
                this._fireChange(ctrl.id, [...tags]);
            }
        });

        tagsWrap.addEventListener('click', (e) => {
            if (e.target.classList.contains('rm-tag-remove')) {
                const idx = parseInt(e.target.dataset.idx);
                tags.splice(idx, 1);
                renderTags();
                this._fireChange(ctrl.id, [...tags]);
            }
            input.focus();
        });

        tagsWrap.appendChild(input);
        this.menuControls[ctrl.id] = { wrap: tagsWrap, input, getTags: () => [...tags] };
        this.menuValues[ctrl.id] = [...tags];

        renderTags();
        return this._wrapControl(ctrl, tagsWrap);
    }

    _createSlider(ctrl) {
        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'rm-slider-wrap';

        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'rm-range';
        input.id = ctrl.id;
        input.name = ctrl.id;
        input.value = ctrl.value ?? 50;
        if (ctrl.min !== undefined) input.min = ctrl.min;
        if (ctrl.max !== undefined) input.max = ctrl.max;
        if (ctrl.step !== undefined) input.step = ctrl.step;

        const valSpan = document.createElement('span');
        valSpan.className = 'rm-range-val';
        valSpan.textContent = `${input.value}${ctrl.unit || ''}`;

        sliderWrap.appendChild(input);
        sliderWrap.appendChild(valSpan);

        // marks
        if (ctrl.marks && Array.isArray(ctrl.marks) && ctrl.marks.length > 0) {
            const marksDiv = document.createElement('div');
            marksDiv.className = 'rm-slider-marks';
            ctrl.marks.forEach(mark => {
                const span = document.createElement('span');
                span.textContent = mark;
                marksDiv.appendChild(span);
            });
            sliderWrap.appendChild(marksDiv);
        }

        this.menuControls[ctrl.id] = input;
        this.menuControls[`${ctrl.id}_value`] = valSpan;
        this.menuValues[ctrl.id] = input.value;

        if (ctrl.disabled) {
            input.disabled = true;
            return this._wrapDisabled(ctrl, sliderWrap);
        }

        input.addEventListener('input', () => {
            this.menuValues[ctrl.id] = input.value;
            valSpan.textContent = `${input.value}${ctrl.unit || ''}`;
            this._fireChange(ctrl.id, parseFloat(input.value));
        });

        return this._wrapControl(ctrl, sliderWrap);
    }

    _createControlButton(ctrl) {
        const wrap = document.createElement('div');
        wrap.className = 'rm-control';
        // 与其余控件一致地支持 span：'full' 占满整行，'half'（或不写）在 grid 布局下自然两两并排。
        // 缺了这句会导致 grid 布局里按钮无法与相邻按钮同行显示。
        if (ctrl.span === 'full') wrap.classList.add('rm-span-full');
        if (ctrl.span === 'half') wrap.classList.add('rm-span-half');
        if (ctrl.floating) wrap.classList.add('rm-floating');
        const btn = document.createElement('button');
        btn.className = `rm-control-btn ${ctrl.style || 'primary'}`;
        btn.textContent = ctrl.label || '按钮';
        if (ctrl.disabled) {
            btn.disabled = true;
            wrap.classList.add('rm-disabled');
            wrap.addEventListener('click', (e) => e.stopPropagation());
            return wrap;
        }
        if (ctrl.onClick) {
            btn.addEventListener('click', () => ctrl.onClick(this.getValues()));
        }
        wrap.appendChild(btn);
        // 保存按钮引用，便于外部（如 swdSetOpenState）通过 menuControls[id] 修改文字/状态
        this.menuControls[ctrl.id] = btn;
        return wrap;
    }

    _createCanvas(ctrl) {
        const wrap = document.createElement('div');
        wrap.className = 'rm-control';
        if (ctrl.span === 'full') wrap.classList.add('rm-span-full');

        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'rm-canvas-wrap';

        const canvas = document.createElement('canvas');
        canvas.id = ctrl.id;
        canvas.className = 'rm-canvas';
        canvas.width = ctrl.width || 300;
        canvas.height = ctrl.height || 150;

        canvasWrap.appendChild(canvas);
        wrap.appendChild(canvasWrap);

        // 保存 canvas 引用
        this.menuControls[ctrl.id] = canvas;
        this.menuValues[ctrl.id] = null;

        return wrap;
    }

    _createDivider() {
        const hr = document.createElement('hr');
        hr.className = 'rm-divider';
        return hr;
    }

    _createHeading(ctrl) {
        const h = document.createElement('div');
        h.className = 'rm-heading';
        h.textContent = ctrl.label || '';
        return h;
    }

    // ==================== 按钮 ====================

    _createButton(btnConfig) {
        const btn = document.createElement('button');
        const styleMap = {
            submit: 'rm-btn-primary',
            cancel: 'rm-btn-secondary',
            reset: 'rm-btn-secondary',
            success: 'rm-btn-success',
            danger: 'rm-btn-danger',
        };
        btn.className = `rm-btn ${styleMap[btnConfig.type] || styleMap[btnConfig.style] || 'rm-btn-secondary'}`;

        if (btnConfig.icon) {
            const icon = document.createElement('i');
            icon.className = btnConfig.icon;
            btn.appendChild(icon);
        }

        const text = document.createElement('span');
        text.textContent = btnConfig.label || '按钮';
        btn.appendChild(text);

        btn.addEventListener('click', () => {
            if (btnConfig.type === 'button' && typeof btnConfig.onClick === 'function') {
                btnConfig.onClick(this.getValues());
            } else {
                this._handleButtonClick(btnConfig.type);
            }
        });
        return btn;
    }

    _handleButtonClick(type) {
        switch (type) {
            case 'submit':
                this.collectValues();
                if (this.onSubmitCallback) this.onSubmitCallback(this.getValues());
                this.hide();
                break;
            case 'reset':
                this.resetValues();
                if (this.onResetCallback) this.onResetCallback();
                break;
            case 'cancel':
                if (this.onCancelCallback) this.onCancelCallback();
                this.hide();
                break;
            default:
                console.log(`按钮类型: ${type} 被点击`);
        }
    }

    // ==================== 值操作 ====================

    collectValues() {
        for (const id in this.menuControls) {
            const ctrl = this.menuControls[id];
            if (id.endsWith('_value') || id.endsWith('_text')) continue;

            if (ctrl && ctrl.tagName) {
                if (ctrl.type === 'checkbox') {
                    this.menuValues[id] = ctrl.checked;
                } else if (ctrl.type === 'file') {
                    this.menuValues[id] = ctrl.files.length > 0 ? ctrl.files[0] : null;
                } else if (ctrl.type === 'color') {
                    // 不符合 hex 格式的值不覆盖
                    const cur = this.menuValues[id];
                    if (typeof cur === 'string' && !/^#([0-9A-F]{3}){1,2}$/i.test(cur) && cur !== 'transparent') {
                        // keep non-hex value (e.g. expression)
                    } else {
                        this.menuValues[id] = ctrl.value;
                    }
                } else {
                    this.menuValues[id] = ctrl.value;
                }
            }
        }
    }

    getValues() {
        this.collectValues();
        return {
            timestamp: new Date().toISOString(),
            title: this.config.title,
            values: { ...this.menuValues },
        };
    }

    getValue(id) {
        return this.menuValues[id];
    }

    // 获取canvas元素以便外部绘制
    getCanvas(id) {
        const ctrl = this.menuControls[id];
        if (ctrl && ctrl.tagName === 'CANVAS') {
            return ctrl;
        }
        return null;
    }

    // 获取canvas的2D上下文
    getCanvasContext(id) {
        const canvas = this.getCanvas(id);
        return canvas ? canvas.getContext('2d') : null;
    }

    setValue(id, value) {
        this.menuValues[id] = value;
        const ctrl = this.menuControls[id];
        if (ctrl) {
            if (ctrl.tagName) {
                if (ctrl.type === 'checkbox') ctrl.checked = !!value;
                else if (ctrl.type === 'color') {
                    // 非标准 hex 值（如 =表达式）不设置 picker，只更新文本
                    if (typeof value === 'string' && !/^#([0-9A-F]{3}){1,2}$/i.test(value) && value !== 'transparent') {
                        const textEl = this.menuControls[`${id}_text`];
                        if (textEl) textEl.value = value;
                    } else {
                        ctrl.value = value || '#000000';
                        const textEl = this.menuControls[`${id}_text`];
                        if (textEl) textEl.value = value;
                    }
                } else if (ctrl.type === 'range') {
                    ctrl.value = value;
                    const valEl = this.menuControls[`${id}_value`];
                    const unit = this._findControlConfig(id)?.unit || '';
                    if (valEl) valEl.textContent = `${value}${unit}`;
                } else if (ctrl.type === 'file') {
                    // cannot programmatically set file
                } else if (ctrl.classList && ctrl.classList.contains('rm-toggle')) {
                    ctrl.classList.toggle('active', !!value);
                    ctrl.setAttribute('aria-checked', !!value);
                } else {
                    ctrl.value = value;
                }
            }
        }
        // tags
        if (this.menuControls[id] && this.menuControls[id].getTags) {
            // for tags, need full re-render — not supported via setValue easily
        }
    }

    resetValues() {
        const flatControls = this.config.sections.flatMap(s => s.controls || []);
        flatControls.forEach(ctrl => {
            if (!ctrl.id) return;
            const initialValue = ctrl.value;
            this.setValue(ctrl.id, initialValue);
        });
    }

    _findControlConfig(id) {
        return this.config.sections.flatMap(s => s.controls || []).find(c => c.id === id);
    }

    // ==================== 显示/隐藏 ====================

    /**
     * 计算当前文档里「置顶窗口」的最大 z-index。
     * MacWindow 的 z-index 从 10000 起随点击递增（MacWindow._topZ），
     * 为了让弹出菜单永远盖在窗口之上，浮层需要高于这个值。
     * @returns {number} 建议的浮层 z-index（至少为 100001）
     */
    _topZIndex() {
        let max = 100000;
        // 优先取 MacWindow 记录的当前置顶值
        try {
            if (typeof MacWindow !== 'undefined' && MacWindow._topZ) {
                max = Math.max(max, MacWindow._topZ);
            }
        } catch (e) { /* ignore */ }
        // 兜底：扫描所有 .mac-window 的实际 z-index
        document.querySelectorAll('.mac-window').forEach(el => {
            const z = parseInt(el.style.zIndex || '', 10);
            if (!isNaN(z) && z > max) max = z;
        });
        return max + 1;
    }

    show(x, y) {
        const c = this.config;

        if (c.mode === 'context') {
            this._setPosition(x ?? 0, y ?? 0);
            // 永远盖在置顶窗口之上，避免弹窗被 MacWindow 遮挡
            this.element.style.zIndex = this._topZIndex();
            // Delay to allow animation
            requestAnimationFrame(() => {
                this.element.classList.add('rm-show');
            });
        } else if (c.mode === 'sidebar') {
            requestAnimationFrame(() => {
                this.element.classList.add('rm-show');
            });
        } else if (c.mode === 'dialog') {
            const z = this._topZIndex();
            if (this.overlay) {
                this.overlay.style.zIndex = z;
                this.overlay.classList.add('rm-show');
            }
            this.element.style.zIndex = z + 1;
            requestAnimationFrame(() => {
                this.element.classList.add('rm-show');
            });
        } else if (c.mode === 'inline') {
            // inline is always visible
            this.element.classList.add('rm-show');
        }
    }

    hide() {
        this.element.classList.remove('rm-show');
        if (this.overlay) {
            this.overlay.classList.remove('rm-show');
        }
    }

    isVisible() {
        return this.element.classList.contains('rm-show');
    }

    _setPosition(x, y) {
        const w = this.element.offsetWidth;
        const h = this.element.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (x + w > vw) x = vw - w - 10;
        if (y + h > vh) y = vh - h - 10;
        if (x < 0) x = 10;
        if (y < 0) y = 10;

        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
    }

    // ==================== 回调 ====================

    onSubmit(callback) { this.onSubmitCallback = callback; return this; }
    onCancel(callback) { this.onCancelCallback = callback; return this; }
    onReset(callback) { this.onResetCallback = callback; return this; }
    onChange(callback) { this.onChangeCallback = callback; return this; }

    _fireChange(id, value) {
        if (this.onChangeCallback) {
            this.onChangeCallback(id, value, this.menuValues);
        }
    }

    // ==================== 更新/销毁 ====================

    updateConfig(newConfig) {
        this.config = this._mergeDefaults({ ...this.config, ...newConfig });
        // Re-apply theme
        if (this.config.theme === 'dark') {
            this.element.classList.add('rm-dark');
        } else {
            this.element.classList.remove('rm-dark');
        }
        // Update title
        const titleEl = this.element.querySelector('.rm-title');
        if (titleEl) titleEl.textContent = this.config.title;
        this.generateContent();
        return this;
    }

    destroy() {
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
        }
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

    // ==================== 工具 ====================

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

/**
 * SortableList - 独立可拖拽排序列表组件
 */
class SortableList {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            items: [],                  // 初始数据数组
            itemTemplate: null,         // function(data, index) => HTML string | HTMLElement
            itemActions: null,          // array of { icon, label, title, onClick(data, index, items), isActive(data, index) } [legacy]
            itemButtons: null,          // array of { label, name, switch: bool, title, onClick(data, index, items) }
            onItemButton: null,         // callback(name, data, index, items) for itemButtons without own onClick
            selectable: false,          // 是否可选中（单选）
            multiSelect: false,         // 是否可多选（selectable 隐含）
            showCheck: true,            // 是否显示左侧选中指示器（false 时仅靠行高亮判断选中）
            selectedKey: null,          // function(data, index) => unique key for selection tracking (default: index)
            onSelectionChange: null,    // callback(selectedItems, selectedIndices)
            addTemplate: null,          // function() => newItemData
            maxItems: Infinity,
            sortable: true,
            showHandle: true,           // show drag handle
            handleSelector: '.sl-handle',
            placeholderClass: 'sl-placeholder',
            onReorder: null,            // callback(items)
            onAdd: null,                // callback(item, index)
            onRemove: null,             // callback(item, index)
            onChange: null,             // callback(items)
            showAddButton: true,
            addButtonText: '+ 添加',
            removeButtonText: '✕',
            dark: false,
            ...options,
        };

        this._items = this.options.items.map((data, i) => ({
            id: Date.now() + i,
            data,
        }));

        this._dragSrcIdx = null;
        this._selectedKeys = new Set();   // Set of keys for selected items
        this._lastClickedIdx = null;       // for shift-click range selection

        this._injectStyles();
        this.render();
    }

    _injectStyles() {
        if (document.getElementById('sortable-list-styles')) return;
        const css = `
.sl-container { display: flex; flex-direction: column; gap: 6px; }
.sl-item {
    display: flex; align-items: center; gap: 8px;
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 8px; padding: 10px 12px;
    transition: box-shadow 0.2s, opacity 0.2s;
    min-height: 40px; user-select: none;
}
.sl-item.sl-dark { background: #1e293b; border-color: #334155; }
.sl-item.sl-dragging { opacity: 0.4; }
.sl-item.sl-drag-over { border-color: #6366f1; border-style: dashed; }
.sl-handle {
    cursor: grab; color: #94a3b8; font-size: 16px;
    padding: 2px 6px; user-select: none; flex-shrink: 0;
}
.sl-handle:active { cursor: grabbing; }
.sl-item-content { flex: 1; min-width: 0; font-size: 13px; user-select: none; }
.sl-item-actions { display: flex; gap: 4px; flex-shrink: 0; }
.sl-remove-btn {
    background: none; border: none; color: #94a3b8;
    cursor: pointer; font-size: 14px; padding: 2px 4px;
    transition: color 0.15s;
}
.sl-remove-btn:hover { color: #ef4444; }
.sl-action-btn {
    background: none; border: none; color: #94a3b8;
    cursor: pointer; font-size: 13px; padding: 2px 5px;
    transition: color 0.15s; border-radius: 4px; line-height: 1;
}
.sl-action-btn:hover { color: #6366f1; }
.sl-action-btn.sl-action-active { color: #6366f1; }
.sl-action-btn.sl-dark:hover { color: #818cf8; }
.sl-action-btn.sl-action-active.sl-dark { color: #818cf8; }
.sl-add-btn {
    display: flex; align-items: center; justify-content: center;
    gap: 6px; padding: 10px; border: 2px dashed #cbd5e1;
    border-radius: 8px; cursor: pointer; color: #64748b;
    font-size: 13px; transition: all 0.2s; background: transparent;
    width: 100%; font-family: inherit;
}
.sl-add-btn:hover { border-color: #6366f1; color: #6366f1; }
.sl-add-btn.sl-dark { border-color: #475569; color: #94a3b8; }
.sl-add-btn.sl-dark:hover { border-color: #818cf8; color: #818cf8; }
.sl-placeholder {
    border: 2px dashed #6366f1; border-radius: 8px;
    background: rgba(99,102,241,0.06); min-height: 40px;
}
/* ===== Selectable ===== */
.sl-item-check {
    width: 18px; height: 18px; border-radius: 4px; border: 2px solid #cbd5e1;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s;
    font-size: 11px; color: transparent; user-select: none;
    background: #fff;
}
.sl-item-check:hover { border-color: #6366f1; }
.sl-item-check.sl-checked {
    background: #6366f1; border-color: #6366f1; color: #fff;
}
.sl-item-check.sl-dark { background: #1e293b; border-color: #475569; }
.sl-item-check.sl-dark:hover { border-color: #818cf8; }
.sl-item-check.sl-checked.sl-dark { background: #6366f1; border-color: #6366f1; color: #fff; }
.sl-item-check.sl-radio { border-radius: 50%; }
.sl-item.sl-selected { border-color: #6366f1; background: #eef2ff; }
.sl-item.sl-selected.sl-dark { border-color: #818cf8; background: #1e1b4b; }
`;
        const style = document.createElement('style');
        style.id = 'sortable-list-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    getItems() {
        return this._items.map(it => it.data);
    }

    setItems(dataArray) {
        this._items = dataArray.map((data, i) => ({ id: Date.now() + i, data }));
        this.render();
    }

    addItem(data) {
        if (this._items.length >= this.options.maxItems) return;
        this._items.push({ id: Date.now(), data });
        this.render();
        if (this.options.onAdd) this.options.onAdd(data, this._items.length - 1);
        if (this.options.onChange) this.options.onChange(this.getItems());
    }

    removeItem(index) {
        const removed = this._items.splice(index, 1)[0];
        this.render();
        if (this.options.onRemove) this.options.onRemove(removed.data, index);
        if (this.options.onChange) this.options.onChange(this.getItems());
    }

    _getKey(data, idx) {
        if (this.options.selectedKey) return this.options.selectedKey(data, idx);
        return idx;
    }

    getSelected() {
        const result = [];
        this._items.forEach((item, idx) => {
            const key = this._getKey(item.data, idx);
            if (this._selectedKeys.has(key)) {
                result.push({ index: idx, data: item.data });
            }
        });
        return this.options.multiSelect
            ? result
            : (result.length > 0 ? result[0] : null);
    }

    getSelectedIndices() {
        const indices = [];
        this._items.forEach((item, idx) => {
            const key = this._getKey(item.data, idx);
            if (this._selectedKeys.has(key)) indices.push(idx);
        });
        return indices;
    }

    setSelected(indices, append = false) {
        if (!append) this._selectedKeys.clear();
        if (!this.options.multiSelect && indices.length > 1) {
            indices = [indices[indices.length - 1]];
        }
        indices.forEach(idx => {
            if (idx >= 0 && idx < this._items.length) {
                const key = this._getKey(this._items[idx].data, idx);
                this._selectedKeys.add(key);
            }
        });
        // single select: keep only last
        if (!this.options.multiSelect && this._selectedKeys.size > 1) {
            const arr = Array.from(this._selectedKeys);
            this._selectedKeys = new Set([arr[arr.length - 1]]);
        }
        this.render();
        this._fireSelectionChange();
    }

    clearSelection() {
        this._selectedKeys.clear();
        this.render();
        this._fireSelectionChange();
    }

    _fireSelectionChange() {
        if (!this.options.selectable) return;
        const selected = this.getSelected();
        const indices = this.getSelectedIndices();
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(selected, indices);
        }
    }

    render() {
        this.container.innerHTML = '';
        const listEl = document.createElement('div');
        listEl.className = 'sl-container';

        this._items.forEach((item, idx) => {
            const itemEl = document.createElement('div');
            const key = this._getKey(item.data, idx);
            const isSelected = this._selectedKeys.has(key);
            itemEl.className = 'sl-item'
                + (this.options.dark ? ' sl-dark' : '')
                + (isSelected ? ' sl-selected' : '');
            itemEl.dataset.idx = idx;
            itemEl.draggable = this.options.sortable;

            // selection checkbox
            if (this.options.selectable && this.options.showCheck !== false) {
                const check = document.createElement('div');
                const isRadio = !this.options.multiSelect;
                check.className = 'sl-item-check'
                    + (this.options.dark ? ' sl-dark' : '')
                    + (isRadio ? ' sl-radio' : '')
                    + (isSelected ? ' sl-checked' : '');
                check.textContent = isSelected ? (isRadio ? '●' : '✓') : '';
                check.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleSelect(idx, e);
                });
                itemEl.appendChild(check);
            }

            // handle
            if (this.options.sortable && this.options.showHandle) {
                const handle = document.createElement('span');
                handle.className = 'sl-handle';
                handle.textContent = '⠿';
                itemEl.appendChild(handle);
            }

            // content
            const content = document.createElement('div');
            content.className = 'sl-item-content';
            if (this.options.itemTemplate) {
                const result = this.options.itemTemplate(item.data, idx);
                if (typeof result === 'string') {
                    content.innerHTML = result;
                } else if (result instanceof HTMLElement) {
                    content.appendChild(result);
                }
            } else {
                content.textContent = typeof item.data === 'string' ? item.data : JSON.stringify(item.data);
            }
            itemEl.appendChild(content);

            // actions
            const actions = document.createElement('div');
            actions.className = 'sl-item-actions';

            // custom action buttons (itemButtons)
            if (this.options.itemButtons && Array.isArray(this.options.itemButtons)) {
                this.options.itemButtons.forEach(ib => {
                    const btn = document.createElement('button');
                    btn.className = 'sl-action-btn' + (this.options.dark ? ' sl-dark' : '');
                    if (ib.switch) {
                        const active = !!item.data[ib.name];
                        btn.classList.toggle('sl-action-active', active);
                        btn.style.opacity = active ? '1' : '0.35';
                    }
                    btn.textContent = ib.label || ib.icon || '';
                    btn.title = ib.title || ib.name || '';
                    btn.addEventListener('click', () => {
                        if (ib.switch) {
                            item.data[ib.name] = !item.data[ib.name];
                        }
                        if (ib.onClick) {
                            ib.onClick(item.data, idx, this._items.map(it => it.data));
                        } else if (this.options.onItemButton) {
                            this.options.onItemButton(ib.name, item.data, idx, this._items.map(it => it.data));
                        }
                        this.render();
                        if (this.options.onChange) this.options.onChange(this.getItems());
                    });
                    actions.appendChild(btn);
                });
            }
            // legacy itemActions support
            if (this.options.itemActions && Array.isArray(this.options.itemActions)) {
                this.options.itemActions.forEach(act => {
                    const btn = document.createElement('button');
                    btn.className = 'sl-action-btn' + (this.options.dark ? ' sl-dark' : '');
                    if (act.isActive && act.isActive(item.data, idx)) {
                        btn.classList.add('sl-action-active');
                    }
                    btn.textContent = act.icon || act.label || '';
                    btn.title = act.title || act.label || '';
                    if (act.onClick) {
                        btn.addEventListener('click', () => {
                            act.onClick(item.data, idx, this._items.map(it => it.data));
                            this.render();
                            if (this.options.onChange) this.options.onChange(this.getItems());
                        });
                    }
                    actions.appendChild(btn);
                });
            }

            const removeBtn = document.createElement('button');
            removeBtn.className = 'sl-remove-btn';
            removeBtn.textContent = this.options.removeButtonText;
            removeBtn.addEventListener('click', () => this.removeItem(idx));
            actions.appendChild(removeBtn);
            itemEl.appendChild(actions);

            // drag events
            if (this.options.sortable) {
                itemEl.addEventListener('dragstart', (e) => {
                    this._dragSrcIdx = idx;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(idx));
                    setTimeout(() => itemEl.classList.add('sl-dragging'), 0);
                });
                itemEl.addEventListener('dragend', () => {
                    itemEl.classList.remove('sl-dragging');
                    listEl.querySelectorAll('.sl-item').forEach(el => el.classList.remove('sl-drag-over'));
                    // remove placeholder if any
                    listEl.querySelectorAll('.sl-placeholder').forEach(p => p.remove());
                });
                itemEl.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    itemEl.classList.add('sl-drag-over');
                });
                itemEl.addEventListener('dragleave', () => {
                    itemEl.classList.remove('sl-drag-over');
                });
                itemEl.addEventListener('drop', (e) => {
                    e.preventDefault();
                    itemEl.classList.remove('sl-drag-over');
                    const fromIdx = this._dragSrcIdx;
                    const toIdx = idx;
                    if (fromIdx !== null && fromIdx !== toIdx) {
                        const [moved] = this._items.splice(fromIdx, 1);
                        this._items.splice(toIdx, 0, moved);
                        this.render();
                        if (this.options.onReorder) this.options.onReorder(this.getItems());
                        if (this.options.onChange) this.options.onChange(this.getItems());
                    }
                });
            }

            // click on item row to select (if selectable)
            if (this.options.selectable) {
                itemEl.addEventListener('click', (e) => {
                    // don't trigger on buttons, inputs, handles
                    if (e.target.closest('button, input, select, textarea, .sl-handle, .rm-control')) return;
                    this._handleSelect(idx, e);
                });
                itemEl.style.cursor = 'pointer';
            }

            listEl.appendChild(itemEl);
        });

        // add button
        if (this.options.showAddButton && this._items.length < this.options.maxItems) {
            const addBtn = document.createElement('button');
            addBtn.className = 'sl-add-btn' + (this.options.dark ? ' sl-dark' : '');
            addBtn.textContent = this.options.addButtonText;
            addBtn.addEventListener('click', () => {
                const newData = this.options.addTemplate ? this.options.addTemplate() : `项 ${this._items.length + 1}`;
                this.addItem(newData);
            });
            listEl.appendChild(addBtn);
        }

        this.container.appendChild(listEl);
    }

    _handleSelect(idx, event) {
        const key = this._getKey(this._items[idx].data, idx);
        const multiSelect = this.options.multiSelect;

        if (multiSelect) {
            // Ctrl/Cmd + click: toggle
            if (event && (event.ctrlKey || event.metaKey)) {
                if (this._selectedKeys.has(key)) {
                    this._selectedKeys.delete(key);
                } else {
                    this._selectedKeys.add(key);
                }
            }
            // Shift + click: range select
            else if (event && event.shiftKey && this._lastClickedIdx !== null) {
                const from = Math.min(this._lastClickedIdx, idx);
                const to = Math.max(this._lastClickedIdx, idx);
                for (let i = from; i <= to; i++) {
                    const k = this._getKey(this._items[i].data, i);
                    this._selectedKeys.add(k);
                }
            }
            // plain click: select only this one
            else {
                this._selectedKeys.clear();
                this._selectedKeys.add(key);
            }
        } else {
            // single select: toggle
            if (this._selectedKeys.has(key)) {
                this._selectedKeys.delete(key);
            } else {
                this._selectedKeys.clear();
                this._selectedKeys.add(key);
            }
        }

        this._lastClickedIdx = idx;
        this.render();
        this._fireSelectionChange();
    }

    destroy() {
        this.container.innerHTML = '';
    }
}
