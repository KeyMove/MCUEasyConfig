/**
 * 富对象编辑器 (RichObjectEditor)
 * 融合 SimpleObjectEditor 的树形结构 + ContextMenu 的丰富控件类型
 * 核心特性：每个字段可自定义控件类型，展开后用户清楚知道该输入什么
 */
class RichObjectEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.data = {};
        this.schema = new Map();       // pathStr -> { type, label, ... }
        this.expandedPaths = new Set();
        this.selectedPath = null;
        this.onChangeCallback = options.onChange || null;
        this._lastChangedPath = null;
        this.hideTypeBadge = !!options.hideTypeBadge;
        this.hideKeyOriginal = !!options.hideKeyOriginal;
        this.hideNodeActions = !!options.hideNodeActions;
        this.hideImportExport = !!options.hideImportExport;
        this.rootLabel = options.rootLabel || null;
        this.highlightOnClick = !!options.highlightOnClick;
        this.hideAddRoot = !!options.hideAddRoot;
        this.editableKey = options.editableKey !== false; // 默认可双击改名

        // 搜索
        this.searchCache = new Map();
        this.debounceTimer = null;
        this.lastSearchQuery = '';
        this.lastSearchResults = [];
        this.isDropdownOpen = false;
        this.pinyinCache = new Map();

        RichObjectEditor.injectStyles();
        this.renderShell();
        this.bindEvents();
    }

    // ==================== 拼音首字母 ====================
    getPinyinInitial(char) {
        if (!char) return '#';
        if (this.pinyinCache.has(char)) return this.pinyinCache.get(char);
        const c = char.charAt(0);
        if (!/[\u4e00-\u9fa5]/.test(c)) {
            const r = /[a-zA-Z]/.test(c) ? c.toUpperCase() : '#';
            this.pinyinCache.set(char, r);
            return r;
        }
        const PINYIN_STARTS = [
            ['A','阿'],['B','八'],['C','擦'],['D','搭'],['E','蛾'],['F','发'],
            ['G','噶'],['H','哈'],['J','击'],['K','卡'],['L','拉'],['M','妈'],
            ['N','拿'],['O','哦'],['P','啪'],['Q','七'],['R','然'],['S','撒'],
            ['T','他'],['W','挖'],['X','西'],['Y','压'],['Z','匝']
        ];
        const collator = new Intl.Collator('zh-CN');
        for (let i = PINYIN_STARTS.length - 1; i >= 0; i--) {
            const [letter, startChar] = PINYIN_STARTS[i];
            if (collator.compare(c, startChar) >= 0) {
                this.pinyinCache.set(char, letter);
                return letter;
            }
        }
        this.pinyinCache.set(char, 'A');
        return 'A';
    }
    getPinyinInitials(str) {
        if (!str) return '';
        return str.split('').map(c => this.getPinyinInitial(c)).join('');
    }

    // ==================== 公共接口 ====================

    setObj(obj, schemaObj) {
        this.data = obj;
        this.schema.clear();
        if (schemaObj) this.loadSchemaFromObj(schemaObj);
        this.selectedPath = null;
        this.searchCache.clear();
        this.pinyinCache.clear();
        this.lastSearchResults = [];
        this.isDropdownOpen = false;
        this.renderTree();
        this.updateStats();
    }

    getObj() { return this.data; }

    getSchema() {
        const out = {};
        this.schema.forEach((v, k) => { out[k] = v; });
        return out;
    }

    /** 从平面对象加载 schema: { "pathStr": { type, label, ... } } */
    loadSchemaFromObj(obj) {
        this.schema.clear();
        Object.entries(obj).forEach(([k, v]) => this.schema.set(k, v));
    }

    setSchemaForPath(pathStr, def) {
        if (!def || !def.type) {
            this.schema.delete(pathStr);
        } else {
            this.schema.set(pathStr, def);
        }
        this.renderTree();
        this._notifyChange();
    }

    _notifyChange() {
        if (this.onChangeCallback) this.onChangeCallback(this.data, this.getSchema(), this._lastChangedPath);
        this._lastChangedPath = null;
    }

    // ==================== 样式注入 ====================

    static injectStyles() {
        if (document.getElementById('roe-styles')) return;
        const css = `
/* ========== 布局 ========== */
.roe-container { display:flex; flex-direction:column; height:100%; background:#1e293b; color:#e2e8f0; font-family:system-ui,sans-serif; font-size:14px; user-select:none; }
.roe-toolbar { display:flex; gap:8px; padding:10px; background:#0f172a; border-bottom:1px solid #334155; align-items:center; flex-wrap:wrap; }
.roe-toolbar input { background:#0f172a; border:1px solid #334155; color:#fff; padding:4px 8px; border-radius:4px; outline:none; }
.roe-toolbar input:focus { border-color:#38bdf8; }
.roe-btn { background:#334155; border:none; color:#fff; padding:4px 10px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:4px; font-size:12px; }
.roe-btn:hover { background:#475569; }
.roe-btn.primary { background:#0ea5e9; }
.roe-btn.danger { background:#ef4444; }
.roe-btn.success { background:#10b981; }

.roe-main { flex:1; overflow:auto; padding:12px; position:relative; }

/* ========== 树节点 ========== */
.roe-node { margin:2px 0; border-radius:4px; }
.roe-node-header { display:flex; align-items:center; padding:4px 6px; cursor:pointer; border-radius:4px; gap:6px; min-height:28px; }
.roe-node-header:hover { background:rgba(255,255,255,0.05); }
.roe-node.selected > .roe-node-header { background:rgba(14,165,233,0.2); border-left:2px solid #0ea5e9; }
.roe-node.matched { background:rgba(234,179,8,0.1); }
.roe-node.pinyin-start { background:rgba(34,197,94,0.15); }
.roe-node.pinyin-contains { background:rgba(249,115,22,0.15); }

.roe-toggle { width:16px; height:16px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:10px; transition:transform 0.2s; flex-shrink:0; }
.roe-toggle.collapsed { transform:rotate(-90deg); }
.roe-toggle.leaf { visibility:hidden; }

.roe-key { color:#7dd3fc; font-weight:600; font-family:monospace; font-size:13px; white-space:nowrap; cursor:default; }
.roe-key.editable:hover { text-decoration:underline dotted; text-underline-offset:3px; }
.roe-key-alias { color:#fbbf24; font-weight:400; font-family:system-ui,sans-serif; font-size:12px; margin-left:2px; }
.roe-key-original { font-size:10px; color:#64748b; font-family:monospace; }
.roe-key-edit-input { /* inline edit */ }
.roe-colon { color:#64748b; margin-right:2px; }

/* 类型徽章 - 可点击 */
.roe-type-badge { font-size:10px; padding:1px 5px; border-radius:3px; background:#334155; color:#94a3b8; cursor:pointer; text-transform:uppercase; transition:all 0.15s; white-space:nowrap; }
.roe-type-badge:hover { background:#475569; color:#fff; transform:scale(1.1); }
.roe-type-badge.schema { background:rgba(14,165,233,0.3); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); }
.roe-type-badge.obj { background:rgba(56,189,248,0.2); color:#7dd3fc; }
.roe-type-badge.arr { background:rgba(168,85,247,0.2); color:#d8b4fe; }

/* ========== 值控件 - 暗色主题 ========== */
.roe-val-wrap { flex:1; max-width:400px; min-width:80px; display:flex; align-items:center; gap:6px; }

.roe-val-input { background:transparent; border:1px solid transparent; color:#fff; font-family:monospace; font-size:13px; padding:2px 6px; border-radius:3px; flex:1; width:100%; box-sizing:border-box; }
.roe-val-input:focus { border-color:#0ea5e9; background:#0f172a; outline:none; }
.roe-val-input.type-string { color:#86efac; }
.roe-val-input.type-number { color:#fca5a5; }
.roe-val-input.type-boolean { color:#f0abfc; }
.roe-val-input.type-null { color:#94a3b8; font-style:italic; }

.roe-val-unit { color:#94a3b8; font-size:12px; white-space:nowrap; flex-shrink:0; font-family:system-ui,sans-serif; }

.roe-val-select { background:#0f172a; border:1px solid #334155; color:#fff; padding:2px 6px; border-radius:3px; font-size:13px; flex:1; width:100%; box-sizing:border-box; }
.roe-val-select:focus { border-color:#0ea5e9; outline:none; }

.roe-val-textarea { background:#0f172a; border:1px solid #334155; color:#86efac; font-family:monospace; font-size:13px; padding:4px 6px; border-radius:3px; resize:vertical; min-height:60px; width:100%; box-sizing:border-box; }
.roe-val-textarea:focus { border-color:#0ea5e9; outline:none; }

/* Range */
.roe-range-wrap { display:flex; align-items:center; gap:8px; flex:1; }
.roe-range-input { flex:1; accent-color:#0ea5e9; }
.roe-range-val { font-weight:600; color:#38bdf8; min-width:36px; text-align:right; font-size:12px; font-family:monospace; }

/* Checkbox */
.roe-checkbox-wrap { display:flex; align-items:center; gap:6px; }
.roe-checkbox-wrap input[type="checkbox"] { width:16px; height:16px; accent-color:#0ea5e9; cursor:pointer; }
.roe-checkbox-label { font-size:12px; color:#94a3b8; }

/* Radio */
.roe-radio-wrap { display:flex; flex-wrap:wrap; gap:8px; }
.roe-radio-item { display:flex; align-items:center; gap:4px; }
.roe-radio-item input { accent-color:#0ea5e9; cursor:pointer; }
.roe-radio-item label { font-size:12px; color:#e2e8f0; cursor:pointer; }

/* Color */
.roe-color-wrap { display:flex; align-items:center; gap:6px; }
.roe-color-picker { width:32px; height:24px; border:1px solid #475569; border-radius:4px; cursor:pointer; padding:0; background:transparent; }
.roe-color-text { background:#0f172a; border:1px solid #334155; color:#fff; font-family:monospace; font-size:12px; padding:2px 6px; border-radius:3px; width:80px; }
.roe-color-text:focus { border-color:#0ea5e9; outline:none; }

/* Date */
.roe-val-date { background:#0f172a; border:1px solid #334155; color:#fff; padding:2px 6px; border-radius:3px; font-size:13px; }
.roe-val-date:focus { border-color:#0ea5e9; outline:none; }
.roe-val-date::-webkit-calendar-picker-indicator { filter:invert(1); }

/* ========== 操作按钮 ========== */
.roe-actions { margin-left:auto; display:flex; gap:2px; visibility:hidden; flex-shrink:0; }
.roe-node-header:hover .roe-actions { visibility:visible; }
.roe-action-btn { background:transparent; border:none; color:#94a3b8; cursor:pointer; padding:2px 4px; font-size:12px; }
.roe-action-btn:hover { color:#fff; }

.roe-children { margin-left:20px; border-left:1px dashed #334155; padding-left:8px; }
.roe-footer { padding:8px 12px; background:#0f172a; border-top:1px solid #334155; font-size:12px; color:#64748b; display:flex; gap:15px; }
.roe-search-hint { font-size:11px; color:#94a3b8; margin-left:4px; white-space:nowrap; }

/* ========== 搜索下拉 ========== */
.roe-search-wrapper { position:relative; flex:1; max-width:400px; display:flex; align-items:center; }
.roe-dropdown { position:absolute; top:100%; left:0; right:0; background:#1e293b; border:1px solid #475569; max-height:300px; overflow-y:auto; z-index:100; display:none; box-shadow:0 5px 15px rgba(0,0,0,0.3); margin-top:4px; }
.roe-dropdown.show { display:block; }
.roe-dropdown-item { padding:8px; border-bottom:1px solid #334155; cursor:pointer; font-size:12px; }
.roe-dropdown-item:hover { background:#334155; }
.roe-dropdown-path { color:#64748b; font-size:11px; margin-bottom:2px; }
.roe-dropdown-preview { color:#fff; font-family:monospace; }
.roe-dropdown-match-type { font-size:10px; padding:2px 6px; border-radius:3px; margin-left:8px; }
.roe-dropdown-match-type.text { background:rgba(234,179,8,0.2); color:#eab308; }
.roe-dropdown-match-type.pinyin-start { background:rgba(34,197,94,0.2); color:#22c55e; }
.roe-dropdown-match-type.pinyin-contains { background:rgba(249,115,22,0.2); color:#f97316; }

/* ========== 模态框 ========== */
.roe-modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; opacity:0; pointer-events:none; transition:opacity 0.2s; }
.roe-modal-overlay.active { opacity:1; pointer-events:all; }
.roe-modal { background:#1e293b; border:1px solid #475569; padding:20px; border-radius:8px; min-width:340px; max-width:600px; max-height:80vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.5); }
.roe-modal h3 { margin:0 0 15px 0; color:#38bdf8; }
.roe-modal-row { margin-bottom:12px; }
.roe-modal-row label { display:block; margin-bottom:4px; font-size:12px; color:#94a3b8; }
.roe-modal-row input, .roe-modal-row select, .roe-modal-row textarea { width:100%; box-sizing:border-box; background:#0f172a; border:1px solid #334155; color:#fff; padding:6px; border-radius:4px; font-family:monospace; font-size:13px; }
.roe-modal-row textarea { min-height:200px; resize:vertical; }
.roe-modal-row input:focus, .roe-modal-row select:focus { border-color:#38bdf8; outline:none; }
.roe-modal-btns { margin-top:16px; display:flex; gap:10px; justify-content:flex-end; }

/* ========== 控件类型选择器（全屏模态框） ========== */
.roe-type-modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:2000; opacity:0; pointer-events:none; transition:opacity 0.2s; }
.roe-type-modal-overlay.active { opacity:1; pointer-events:all; }
.roe-type-modal { background:#1e293b; border:1px solid #475569; border-radius:12px; padding:24px; width:90vw; max-width:560px; max-height:85vh; overflow-y:auto; box-shadow:0 10px 40px rgba(0,0,0,0.5); }
.roe-type-modal h3 { margin:0 0 16px 0; color:#38bdf8; font-size:16px; }
.roe-type-modal .roe-modal-btns { margin-top:16px; }
.roe-type-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:12px; }
.roe-type-option { background:#334155; border:2px solid transparent; color:#e2e8f0; padding:10px 8px; border-radius:8px; cursor:pointer; font-size:12px; text-align:center; transition:all 0.15s; }
.roe-type-option:hover { background:#475569; border-color:#38bdf8; }
.roe-type-option.active { background:rgba(14,165,233,0.3); border-color:#38bdf8; color:#38bdf8; }
.roe-type-option .roe-type-icon { font-size:20px; display:block; margin-bottom:4px; }
.roe-type-option .roe-type-name { font-size:12px; display:block; }

/* ========== Schema 配置面板（在模态框内） ========== */
.roe-schema-config { margin-top:10px; padding:10px; background:#0f172a; border-radius:6px; border:1px solid #334155; }
.roe-schema-config h5 { margin:0 0 8px 0; color:#38bdf8; font-size:12px; }
.roe-schema-row { margin-bottom:8px; }
.roe-schema-row label { display:block; font-size:11px; color:#94a3b8; margin-bottom:2px; }
.roe-schema-row input, .roe-schema-row select { width:100%; background:#1e293b; border:1px solid #334155; color:#fff; padding:4px 6px; border-radius:3px; font-size:12px; }
.roe-schema-row input:focus, .roe-schema-row select:focus { border-color:#38bdf8; outline:none; }

/* 选项列表编辑器 */
.roe-options-editor { margin-top:8px; }
.roe-option-row { display:flex; gap:4px; margin-bottom:4px; align-items:center; }
.roe-option-row input { flex:1; background:#1e293b; border:1px solid #334155; color:#fff; padding:3px 6px; border-radius:3px; font-size:12px; }
.roe-option-row .roe-btn { padding:2px 6px; font-size:10px; }
`;
        const style = document.createElement('style');
        style.id = 'roe-styles';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    // ==================== 渲染骨架 ====================

    renderShell() {
        this.container.innerHTML = `
<div class="roe-container">
    <div class="roe-toolbar">
        <div class="roe-search-wrapper" id="roe-search-wrapper">
            <input type="text" id="roe-search" placeholder="搜索键、值或拼音首字母..." style="width:100%">
            <span class="roe-search-hint">支持: 文本 / 拼音首字母</span>
            <div id="roe-dropdown" class="roe-dropdown"></div>
        </div>
        <button class="roe-btn" id="roe-expand-all">展开</button>
        <button class="roe-btn" id="roe-collapse-all">折叠</button>
        <button class="roe-btn primary" id="roe-add-root">添加节点</button>
        <button class="roe-btn success" id="roe-import-json">导入</button>
        <button class="roe-btn" id="roe-export-json">导出</button>
        <button class="roe-btn" id="roe-import-schema">导入Schema</button>
        <button class="roe-btn" id="roe-export-full">导出全部</button>
    </div>
    <div class="roe-main" id="roe-tree-root"></div>
    <div class="roe-footer" id="roe-stats"></div>

    <!-- 添加/编辑模态框 -->
    <div class="roe-modal-overlay" id="roe-modal-overlay">
        <div class="roe-modal">
            <h3 id="roe-modal-title">添加节点</h3>
            <div class="roe-modal-row">
                <label>键名</label>
                <input type="text" id="roe-modal-key">
            </div>
            <div class="roe-modal-row">
                <label>值类型</label>
                <select id="roe-modal-type">
                    <option value="string">字符串 (string)</option>
                    <option value="number">数字 (number)</option>
                    <option value="boolean">布尔 (boolean)</option>
                    <option value="null">Null</option>
                    <option value="object">对象 (object)</option>
                    <option value="array">数组 (array)</option>
                </select>
            </div>
            <div class="roe-modal-row" id="roe-modal-val-row">
                <label>值</label>
                <input type="text" id="roe-modal-value">
            </div>
            <div class="roe-modal-btns">
                <button class="roe-btn" id="roe-modal-cancel">取消</button>
                <button class="roe-btn primary" id="roe-modal-confirm">确认</button>
            </div>
        </div>
    </div>

    <!-- JSON 导入模态框 -->
    <div class="roe-modal-overlay" id="roe-json-modal-overlay">
        <div class="roe-modal" style="min-width:500px;">
            <h3>导入 JSON</h3>
            <div class="roe-modal-row">
                <label>粘贴 JSON 数据（支持纯数据或"导出全部"格式）</label>
                <textarea id="roe-json-input" placeholder='{"key": "value"}'></textarea>
            </div>
            <div class="roe-modal-btns">
                <button class="roe-btn" id="roe-json-modal-cancel">取消</button>
                <button class="roe-btn primary" id="roe-json-modal-confirm">确认导入</button>
            </div>
        </div>
    </div>

    <!-- Schema 导入模态框 -->
    <div class="roe-modal-overlay" id="roe-schema-modal-overlay">
        <div class="roe-modal" style="min-width:500px;">
            <h3>导入 Schema</h3>
            <div class="roe-modal-row">
                <label>粘贴 Schema JSON（路径 -> 控件定义）</label>
                <textarea id="roe-schema-input" placeholder='{"name":{"type":"text","label":"名称"},"age":{"type":"number","label":"年龄","min":0}}'></textarea>
            </div>
            <div class="roe-modal-btns">
                <button class="roe-btn" id="roe-schema-modal-cancel">取消</button>
                <button class="roe-btn primary" id="roe-schema-modal-confirm">确认导入</button>
            </div>
        </div>
    </div>

    <!-- 控件类型选择器（全屏模态框） -->
    <div class="roe-type-modal-overlay" id="roe-type-modal-overlay">
        <div class="roe-type-modal">
            <h3 id="roe-type-modal-title">选择控件类型</h3>
            <div id="roe-type-grid-area"></div>
            <div id="roe-type-config-area"></div>
            <div class="roe-modal-btns">
                <button class="roe-btn" id="roe-type-modal-cancel">取消</button>
                <button class="roe-btn primary" id="roe-type-modal-confirm">确认</button>
            </div>
        </div>
    </div>

    <!-- 导出全部模态框 -->
    <div class="roe-modal-overlay" id="roe-export-modal-overlay">
        <div class="roe-modal" style="min-width:560px;">
            <h3>导出数据 + 配置</h3>
            <div class="roe-modal-row">
                <label>完整导出（数据 + Schema 配置）— 可用于分享给他人，导入后可还原全部配置</label>
                <textarea id="roe-export-output" style="height:320px; font-size:12px;" readonly></textarea>
            </div>
            <div class="roe-modal-btns">
                <button class="roe-btn" id="roe-export-modal-copy">复制到剪贴板</button>
                <button class="roe-btn success" id="roe-export-modal-download">下载文件</button>
                <button class="roe-btn" id="roe-export-modal-close">关闭</button>
            </div>
        </div>
    </div>
</div>`;

        this.dom = {
            treeRoot: document.getElementById('roe-tree-root'),
            stats: document.getElementById('roe-stats'),
            searchWrapper: document.getElementById('roe-search-wrapper'),
            searchInput: document.getElementById('roe-search'),
            dropdown: document.getElementById('roe-dropdown'),
            modalOverlay: document.getElementById('roe-modal-overlay'),
            modalTitle: document.getElementById('roe-modal-title'),
            modalKey: document.getElementById('roe-modal-key'),
            modalType: document.getElementById('roe-modal-type'),
            modalValue: document.getElementById('roe-modal-value'),
            modalValRow: document.getElementById('roe-modal-val-row'),
            jsonModalOverlay: document.getElementById('roe-json-modal-overlay'),
            jsonInput: document.getElementById('roe-json-input'),
            schemaModalOverlay: document.getElementById('roe-schema-modal-overlay'),
            schemaInput: document.getElementById('roe-schema-input'),
            typeModalOverlay: document.getElementById('roe-type-modal-overlay'),
            typeModalTitle: document.getElementById('roe-type-modal-title'),
            typeGridArea: document.getElementById('roe-type-grid-area'),
            typeConfigArea: document.getElementById('roe-type-config-area'),
            exportModalOverlay: document.getElementById('roe-export-modal-overlay'),
            exportOutput: document.getElementById('roe-export-output')
        };
    }

    // ==================== 渲染树 ====================

    renderTree() {
        this.dom.treeRoot.innerHTML = '';
        if (!this.data) return;
        const rootKey = this.rootLabel
            ? this.rootLabel
            : (Array.isArray(this.data)
                ? `Array[${this.data.length}]`
                : `Object{${Object.keys(this.data).length}}`);
        const rootNode = this.createNodeElement(rootKey, this.data, [], 0, true);
        this.dom.treeRoot.appendChild(rootNode);
    }

    // 收起所有展开的选项（重置/清空后回到折叠态）
    collapseAll() {
        this.expandedPaths.clear();
        this.renderTree();
    }

    createNodeElement(key, value, path, depth, isRoot = false) {
        const dtype = this.getType(value);           // 数据类型: string/number/object...
        const isObj = dtype === 'object' || dtype === 'array';
        const pathStr = JSON.stringify(path);
        const schemaDef = this.schema.get(pathStr);  // 查找 schema 定义
        const controlType = (schemaDef && schemaDef.type !== 'auto') ? schemaDef.type : dtype; // 实际控件类型

        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'soe-node roe-node'; // keep soe-node for search highlight compat
        nodeDiv.dataset.path = pathStr;

        const header = document.createElement('div');
        header.className = 'roe-node-header';

        // 折叠箭头
        const toggle = document.createElement('span');
        toggle.className = 'roe-toggle';
        if (isObj) {
            toggle.innerHTML = '▼';
            if (!this.expandedPaths.has(pathStr)) toggle.classList.add('collapsed');
        } else {
            toggle.classList.add('leaf');
        }

        // Key（支持 keyAlias 遮盖和双击编辑）
        const keySpan = document.createElement('span');
        keySpan.className = 'roe-key editable';
        const keyAlias = schemaDef && schemaDef.keyAlias ? schemaDef.keyAlias : null;
        if (keyAlias) {
            const originalPart = this.hideKeyOriginal ? '' : `<span class="roe-key-original">(${this._escapeHtml(String(key))})</span>`;
            keySpan.innerHTML = `<span class="roe-key-alias">${this._escapeHtml(keyAlias)}</span>${originalPart}`;
        } else {
            keySpan.textContent = key;
        }
        // 双击编辑 key
        keySpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!this.editableKey) return;
            if (isRoot || typeof key === 'number') return;
            this._startEditKey(keySpan, path, key, keyAlias, pathStr, schemaDef);
        });

        // 冒号
        const colon = document.createElement('span');
        colon.className = 'roe-colon';
        colon.textContent = ':';

        // 类型徽章（可点击切换控件类型）
        const badge = document.createElement('span');
        badge.className = 'roe-type-badge';
        if (schemaDef) badge.classList.add('schema');
        if (dtype === 'object') badge.classList.add('obj');
        if (dtype === 'array') badge.classList.add('arr');
        const badgeText = schemaDef ? schemaDef.type : dtype;
        badge.textContent = badgeText;
        badge.title = schemaDef ? `控件: ${badgeText}（点击修改）` : `数据类型: ${dtype}（点击设置控件）`;
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTypeSelector(badge, pathStr, schemaDef, dtype);
        });
        if (this.hideTypeBadge) badge.style.display = 'none';

        // 值控件区域
        let valWrap = null;
        if (!isObj) {
            valWrap = this.createValueControl(value, dtype, pathStr, schemaDef);
        }

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'roe-actions';
        if (!this.hideNodeActions) {
            if (isObj) {
                actions.innerHTML = `<button class="roe-action-btn" title="添加子项">➕</button><button class="roe-action-btn" title="删除">🗑️</button>`;
            } else {
                actions.innerHTML = `<button class="roe-action-btn" title="复制">📄</button><button class="roe-action-btn" title="删除">🗑️</button>`;
            }
        } else {
            actions.style.display = 'none';
        }

        // 组装 header
        header.appendChild(toggle);
        if (!isRoot || isObj) header.appendChild(keySpan);
        if (!isObj && keySpan.parentNode !== header) header.appendChild(keySpan);
        if (typeof key === 'number') {
            keySpan.style.color = '#94a3b8';
            keySpan.textContent = `${key}`;
        }
        if (!isRoot) header.appendChild(colon);
        header.appendChild(badge);
        if (valWrap) header.appendChild(valWrap);
        header.appendChild(actions);

        nodeDiv.appendChild(header);

        // 点击 header 事件
        header.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' ||
                e.target.tagName === 'TEXTAREA' || e.target.closest('.roe-type-badge') ||
                e.target.closest('.roe-actions') || e.target.closest('.roe-val-wrap')) return;
            this.selectNode(nodeDiv, path);
            if (isObj) this.toggleExpand(pathStr, toggle);
        });

        // 操作按钮事件
        actions.querySelector('[title="删除"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteNode(path);
        });
        if (isObj) {
            actions.querySelector('[title="添加子项"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openModal('add', path);
            });
        } else {
            actions.querySelector('[title="复制"]')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.duplicateNode(path);
            });
        }

        // 子节点
        if (isObj && this.expandedPaths.has(pathStr)) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'roe-children';
            const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
            entries.forEach(([k, v]) => {
                childrenDiv.appendChild(this.createNodeElement(k, v, [...path, k], depth + 1));
            });
            nodeDiv.appendChild(childrenDiv);
        }

        return nodeDiv;
    }

    // ==================== 值控件渲染 ====================

    createValueControl(value, dtype, pathStr, schemaDef) {
        const wrap = document.createElement('div');
        wrap.className = 'roe-val-wrap';

        // 没有 schema 定义时，使用简单文本输入
        if (!schemaDef) {
            return this._createSimpleInput(wrap, value, dtype, pathStr);
        }

        const ct = schemaDef.type;
        const path = JSON.parse(pathStr);

        switch (ct) {
            case 'text':
            case 'email':
            case 'password':
                return this._createTextInput(wrap, value, pathStr, schemaDef);
            case 'number':
                return this._createNumberInput(wrap, value, pathStr, schemaDef);
            case 'textarea':
                return this._createTextarea(wrap, value, pathStr, schemaDef);
            case 'select':
                return this._createSelect(wrap, value, pathStr, schemaDef);
            case 'checkbox':
                return this._createCheckbox(wrap, value, pathStr, schemaDef);
            case 'radio':
                return this._createRadio(wrap, value, pathStr, schemaDef);
            case 'range':
                return this._createRange(wrap, value, pathStr, schemaDef);
            case 'color':
                return this._createColor(wrap, value, pathStr, schemaDef);
            case 'date':
                return this._createDate(wrap, value, pathStr, schemaDef);
            default:
                return this._createSimpleInput(wrap, value, dtype, pathStr);
        }
    }

    /** 无 schema 时的简单输入框 */
    _createSimpleInput(wrap, value, dtype, pathStr) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = `roe-val-input type-${dtype}`;
        input.value = value === null ? 'null' : String(value);
        input.dataset.path = pathStr;
        input.dataset.type = dtype;
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('change', e => this.handleValueChange(e.target));
        wrap.appendChild(input);
        return wrap;
    }

    /** 文本输入 */
    _createTextInput(wrap, value, pathStr, schema) {
        const input = document.createElement('input');
        input.type = schema.type === 'password' ? 'password' : (schema.type === 'email' ? 'email' : 'text');
        input.className = 'roe-val-input type-string';
        if (schema.unit) {
            input.style.width = 'auto';
            input.style.minWidth = '60px';
            input.style.flex = '0 1 auto';
        }
        input.value = value === null ? '' : String(value);
        if (schema.placeholder) input.placeholder = schema.placeholder;
        input.dataset.path = pathStr;
        input.dataset.controlType = schema.type;
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('change', e => {
            this._setByPath(JSON.parse(pathStr), e.target.value);
            this._notifyChange();
        });
        wrap.appendChild(input);
        if (schema.unit) {
            const unitSpan = document.createElement('span');
            unitSpan.className = 'roe-val-unit';
            unitSpan.textContent = schema.unit;
            wrap.appendChild(unitSpan);
        }
        return wrap;
    }

    /** 数字输入 */
    _createNumberInput(wrap, value, pathStr, schema) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'roe-val-input type-number';
        if (schema.unit) {
            input.style.width = 'auto';
            input.style.minWidth = '60px';
            input.style.maxWidth = '120px';
            input.style.flex = '0 1 auto';
        }
        input.value = value === null ? '' : Number(value);
        if (schema.min !== undefined) input.min = schema.min;
        if (schema.max !== undefined) input.max = schema.max;
        if (schema.step !== undefined) input.step = schema.step;
        if (schema.placeholder) input.placeholder = schema.placeholder;
        input.dataset.path = pathStr;
        input.dataset.controlType = 'number';
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('change', e => {
            this._setByPath(JSON.parse(pathStr), parseFloat(e.target.value) || 0);
            this._notifyChange();
        });
        wrap.appendChild(input);
        if (schema.unit) {
            const unitSpan = document.createElement('span');
            unitSpan.className = 'roe-val-unit';
            unitSpan.textContent = schema.unit;
            wrap.appendChild(unitSpan);
        }
        return wrap;
    }

    /** 多行文本 */
    _createTextarea(wrap, value, pathStr, schema) {
        const ta = document.createElement('textarea');
        ta.className = 'roe-val-textarea';
        ta.value = value === null ? '' : String(value);
        if (schema.placeholder) ta.placeholder = schema.placeholder;
        if (schema.rows) ta.rows = schema.rows;
        ta.dataset.path = pathStr;
        ta.dataset.controlType = 'textarea';
        ta.addEventListener('click', e => e.stopPropagation());
        ta.addEventListener('change', e => {
            this._setByPath(JSON.parse(pathStr), e.target.value);
            this._notifyChange();
        });
        wrap.style.flexDirection = 'column';
        wrap.style.maxWidth = '100%';
        wrap.appendChild(ta);
        return wrap;
    }

    /** 下拉选择 */
    _createSelect(wrap, value, pathStr, schema) {
        const sel = document.createElement('select');
        sel.className = 'roe-val-select';
        sel.dataset.path = pathStr;
        sel.dataset.controlType = 'select';
        if (schema.options && Array.isArray(schema.options)) {
            schema.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label || opt.value;
                if (String(value) === String(opt.value)) o.selected = true;
                sel.appendChild(o);
            });
        }
        sel.addEventListener('click', e => e.stopPropagation());
        sel.addEventListener('change', e => {
            // 尝试转换回原始类型
            let val = e.target.value;
            const origVal = this._getByPath(JSON.parse(pathStr));
            if (typeof origVal === 'number') val = parseFloat(val) || 0;
            else if (typeof origVal === 'boolean') val = val === 'true';
            this._setByPath(JSON.parse(pathStr), val);
            this._notifyChange();
        });
        wrap.appendChild(sel);
        return wrap;
    }

    /** 复选框 */
    _createCheckbox(wrap, value, pathStr, schema) {
        const box = document.createElement('div');
        box.className = 'roe-checkbox-wrap';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!value;
        input.dataset.path = pathStr;
        input.dataset.controlType = 'checkbox';
        if (schema.label) {
            const lbl = document.createElement('span');
            lbl.className = 'roe-checkbox-label';
            lbl.textContent = schema.label;
            box.appendChild(input);
            box.appendChild(lbl);
        } else {
            box.appendChild(input);
        }
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('change', e => {
            this._setByPath(JSON.parse(pathStr), e.target.checked);
            this._notifyChange();
        });
        wrap.appendChild(box);
        return wrap;
    }

    /** 单选按钮组 */
    _createRadio(wrap, value, pathStr, schema) {
        const group = document.createElement('div');
        group.className = 'roe-radio-wrap';
        group.dataset.path = pathStr;
        if (schema.options && Array.isArray(schema.options)) {
            schema.options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'roe-radio-item';
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = `roe-radio-${pathStr}`;
                input.value = opt.value;
                if (String(value) === String(opt.value)) input.checked = true;
                const lbl = document.createElement('label');
                lbl.textContent = opt.label || opt.value;
                input.addEventListener('click', e => e.stopPropagation());
                input.addEventListener('change', e => {
                    if (e.target.checked) {
                        let val = e.target.value;
                        const origVal = this._getByPath(JSON.parse(pathStr));
                        if (typeof origVal === 'number') val = parseFloat(val) || 0;
                        this._setByPath(JSON.parse(pathStr), val);
                        this._notifyChange();
                    }
                });
                item.appendChild(input);
                item.appendChild(lbl);
                group.appendChild(item);
            });
        }
        wrap.appendChild(group);
        return wrap;
    }

    /** 滑块 */
    _createRange(wrap, value, pathStr, schema) {
        const rw = document.createElement('div');
        rw.className = 'roe-range-wrap';
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'roe-range-input';
        input.value = value === null ? (schema.min || 0) : Number(value);
        if (schema.min !== undefined) input.min = schema.min;
        if (schema.max !== undefined) input.max = schema.max;
        if (schema.step !== undefined) input.step = schema.step;
        input.dataset.path = pathStr;
        input.dataset.controlType = 'range';
        const valSpan = document.createElement('span');
        valSpan.className = 'roe-range-val';
        valSpan.textContent = `${input.value}${schema.unit || ''}`;
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('input', e => {
            valSpan.textContent = `${e.target.value}${schema.unit || ''}`;
            this._setByPath(JSON.parse(pathStr), parseFloat(e.target.value));
            this._notifyChange();
        });
        rw.appendChild(input);
        rw.appendChild(valSpan);
        wrap.appendChild(rw);
        return wrap;
    }

    /** 颜色选择器 */
    _createColor(wrap, value, pathStr, schema) {
        const cw = document.createElement('div');
        cw.className = 'roe-color-wrap';
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'roe-color-picker';
        picker.value = value || schema.default || '#3498db';
        picker.dataset.path = pathStr;
        picker.dataset.controlType = 'color';
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'roe-color-text';
        textInput.value = picker.value;
        picker.addEventListener('click', e => e.stopPropagation());
        picker.addEventListener('input', e => {
            textInput.value = e.target.value;
            this._setByPath(JSON.parse(pathStr), e.target.value);
            this._notifyChange();
        });
        textInput.addEventListener('click', e => e.stopPropagation());
        textInput.addEventListener('change', e => {
            if (/^#([0-9A-F]{3}){1,2}$/i.test(e.target.value)) {
                picker.value = e.target.value;
                this._setByPath(JSON.parse(pathStr), e.target.value);
                this._notifyChange();
            }
        });
        cw.appendChild(picker);
        cw.appendChild(textInput);
        wrap.appendChild(cw);
        return wrap;
    }

    /** 日期选择器 */
    _createDate(wrap, value, pathStr, schema) {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'roe-val-date';
        input.value = value || '';
        input.dataset.path = pathStr;
        input.dataset.controlType = 'date';
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('change', e => {
            this._setByPath(JSON.parse(pathStr), e.target.value);
            this._notifyChange();
        });
        wrap.appendChild(input);
        return wrap;
    }

    // ==================== 控件类型选择器 ====================

    showTypeSelector(badgeEl, pathStr, currentSchema, dtype) {
        const currentType = currentSchema ? currentSchema.type : dtype;

        const CONTROL_TYPES = [
            { type: 'auto', icon: '🔄', name: '自动检测' },
            { type: 'text', icon: '📝', name: '文本' },
            { type: 'number', icon: '🔢', name: '数字' },
            { type: 'textarea', icon: '📄', name: '多行文本' },
            { type: 'select', icon: '📋', name: '下拉选择' },
            { type: 'checkbox', icon: '☑️', name: '复选框' },
            { type: 'radio', icon: '🔘', name: '单选按钮' },
            { type: 'range', icon: '📊', name: '滑块' },
            { type: 'color', icon: '🎨', name: '颜色' },
            { type: 'date', icon: '📅', name: '日期' },
            { type: 'password', icon: '🔒', name: '密码' },
            { type: 'email', icon: '📧', name: '邮箱' },
        ];

        // 显示路径和原始key信息
        const path = JSON.parse(pathStr);
        const keyName = path.length > 0 ? String(path[path.length - 1]) : '(root)';
        this.dom.typeModalTitle.textContent = `选择控件类型 — ${keyName}`;

        let gridHtml = '<div class="roe-type-grid">';
        CONTROL_TYPES.forEach(ct => {
            const active = ct.type === currentType ? ' active' : '';
            gridHtml += `<div class="roe-type-option${active}" data-type="${ct.type}">
                <span class="roe-type-icon">${ct.icon}</span>
                <span class="roe-type-name">${ct.name}</span>
            </div>`;
        });
        gridHtml += '</div>';
        this.dom.typeGridArea.innerHTML = gridHtml;

        // 清空配置区
        this.dom.typeConfigArea.innerHTML = '';

        // 显示模态框
        this.dom.typeModalOverlay.classList.add('active');

        // 选中的类型
        let selectedType = currentType;

        // 点击类型选项
        this.dom.typeGridArea.querySelectorAll('.roe-type-option').forEach(opt => {
            opt.addEventListener('click', () => {
                this.dom.typeGridArea.querySelectorAll('.roe-type-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                selectedType = opt.dataset.type;
                this._renderTypeConfig(selectedType, currentSchema, pathStr);
            });
        });

        // 显示初始配置
        this._renderTypeConfig(selectedType, currentSchema, pathStr);

        // 取消
        const cancelBtn = document.getElementById('roe-type-modal-cancel');
        const confirmBtn = document.getElementById('roe-type-modal-confirm');
        const closeTypeModal = () => {
            this.dom.typeModalOverlay.classList.remove('active');
            cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
        };

        cancelBtn.onclick = closeTypeModal;
        this.dom.typeModalOverlay.onclick = (e) => {
            if (e.target === this.dom.typeModalOverlay) closeTypeModal();
        };

        // 确认
        confirmBtn.onclick = () => {
            const config = this._collectTypeConfig(selectedType);
            if (selectedType === 'auto') {
                // auto 类型也支持 keyAlias，不直接删除
                if (config.keyAlias) {
                    this.schema.set(pathStr, { type: 'auto', keyAlias: config.keyAlias });
                } else {
                    this.schema.delete(pathStr);
                }
            } else {
                this.schema.set(pathStr, config);
            }
            closeTypeModal();
            this.renderTree();
            this._notifyChange();
        };
    }

    _renderTypeConfig(type, currentSchema, pathStr) {
        const area = this.dom.typeConfigArea;
        if (!area) return;

        const s = currentSchema || {};
        const path = pathStr ? JSON.parse(pathStr) : [];
        const keyName = path.length > 0 ? String(path[path.length - 1]) : '';

        // auto 类型也支持 keyAlias，让对象/数组的含义更清晰
        if (type === 'auto') {
            let html = '<div class="roe-schema-config"><h5>自动检测配置</h5>';
            html += `<div class="roe-schema-row">
                <label>Key 别名 / 遮盖 (keyAlias) — 显示在 key 位置，替代原始 key 名，让对象/数组更易理解</label>
                <input type="text" id="roe-cfg-keyAlias" value="${this._escapeHtml(s.keyAlias || '')}" placeholder="如: 用户列表 → 遮盖 userList">
            </div>`;
            if (s.keyAlias) {
                const aliasEscaped = this._escapeHtml(s.keyAlias);
                const keyEscaped = this._escapeHtml(keyName);
                html += `<div style="font-size:11px; color:#64748b; margin-bottom:8px;">预览: <span style="color:#fbbf24">${aliasEscaped}</span> <span class="roe-key-original">(${keyEscaped})</span></div>`;
            }
            html += '</div>';
            area.innerHTML = html;
            return;
        }

        let html = '<div class="roe-schema-config"><h5>控件配置</h5>';

        // Key 遮盖（别名）- 放在第一位
        html += `<div class="roe-schema-row">
            <label>Key 别名 / 遮盖 (keyAlias) — 显示在 key 位置，替代原始 key 名</label>
            <input type="text" id="roe-cfg-keyAlias" value="${this._escapeHtml(s.keyAlias || '')}" placeholder="如: 城市名 → 遮盖 city">
        </div>`;

        if (s.keyAlias) {
            const aliasEscaped = this._escapeHtml(s.keyAlias);
            const keyEscaped = this._escapeHtml(keyName);
            html += `<div style="font-size:11px; color:#64748b; margin-bottom:8px;">预览: <span style="color:#fbbf24">${aliasEscaped}</span> <span class="roe-key-original">(${keyEscaped})</span></div>`;
        }

        // 通用字段
        html += `<div class="roe-schema-row"><label>标签 (label)</label><input type="text" id="roe-cfg-label" value="${s.label || ''}"></div>`;
        html += `<div class="roe-schema-row"><label>占位提示 (placeholder)</label><input type="text" id="roe-cfg-placeholder" value="${s.placeholder || ''}"></div>`;

        if (type === 'number' || type === 'range') {
            html += `<div class="roe-schema-row"><label>最小值 (min)</label><input type="number" id="roe-cfg-min" value="${s.min !== undefined ? s.min : ''}"></div>`;
            html += `<div class="roe-schema-row"><label>最大值 (max)</label><input type="number" id="roe-cfg-max" value="${s.max !== undefined ? s.max : ''}"></div>`;
            html += `<div class="roe-schema-row"><label>步长 (step)</label><input type="number" id="roe-cfg-step" value="${s.step !== undefined ? s.step : ''}"></div>`;
        }
        if (type === 'text' || type === 'number' || type === 'range') {
            html += `<div class="roe-schema-row"><label>单位 (unit) — 显示在输入框后，如: px、kg、% 等</label><input type="text" id="roe-cfg-unit" value="${this._escapeHtml(s.unit || '')}" placeholder="px / kg / % / 个 / 米 ..."></div>`;
        }
        if (type === 'textarea') {
            html += `<div class="roe-schema-row"><label>行数 (rows)</label><input type="number" id="roe-cfg-rows" value="${s.rows || 4}"></div>`;
        }
        if (type === 'select' || type === 'radio') {
            html += `<div class="roe-schema-row"><label>选项列表 (options)</label></div>`;
            html += `<div class="roe-options-editor" id="roe-cfg-options">`;
            const opts = s.options || [{ value: '', label: '' }];
            opts.forEach((opt, i) => {
                html += `<div class="roe-option-row">
                    <input type="text" placeholder="value" value="${opt.value}" class="roe-opt-value">
                    <input type="text" placeholder="label" value="${opt.label || ''}" class="roe-opt-label">
                    <button class="roe-btn danger roe-opt-remove" data-idx="${i}">✕</button>
                </div>`;
            });
            html += `</div>`;
            html += `<button class="roe-btn" id="roe-cfg-add-option" style="margin-top:4px;">+ 添加选项</button>`;
        }

        html += '</div>';
        area.innerHTML = html;

        // 选项列表操作
        if (type === 'select' || type === 'radio') {
            document.getElementById('roe-cfg-add-option')?.addEventListener('click', () => {
                const container = document.getElementById('roe-cfg-options');
                const row = document.createElement('div');
                row.className = 'roe-option-row';
                row.innerHTML = `<input type="text" placeholder="value" value="" class="roe-opt-value">
                    <input type="text" placeholder="label" value="" class="roe-opt-label">
                    <button class="roe-btn danger roe-opt-remove">✕</button>`;
                container.appendChild(row);
                row.querySelector('.roe-opt-remove').addEventListener('click', () => row.remove());
            });
            area.querySelectorAll('.roe-opt-remove').forEach(btn => {
                btn.addEventListener('click', () => btn.closest('.roe-option-row').remove());
            });
        }
    }

    _collectTypeConfig(type) {
        const config = { type };

        const keyAlias = document.getElementById('roe-cfg-keyAlias');
        if (keyAlias && keyAlias.value) config.keyAlias = keyAlias.value;

        const label = document.getElementById('roe-cfg-label');
        if (label && label.value) config.label = label.value;

        const placeholder = document.getElementById('roe-cfg-placeholder');
        if (placeholder && placeholder.value) config.placeholder = placeholder.value;

        if (type === 'number' || type === 'range') {
            const min = document.getElementById('roe-cfg-min');
            if (min && min.value !== '') config.min = parseFloat(min.value);
            const max = document.getElementById('roe-cfg-max');
            if (max && max.value !== '') config.max = parseFloat(max.value);
            const step = document.getElementById('roe-cfg-step');
            if (step && step.value !== '') config.step = parseFloat(step.value);
        }
        if (type === 'text' || type === 'number' || type === 'range') {
            const unit = document.getElementById('roe-cfg-unit');
            if (unit && unit.value) config.unit = unit.value;
        }
        if (type === 'textarea') {
            const rows = document.getElementById('roe-cfg-rows');
            if (rows && rows.value) config.rows = parseInt(rows.value);
        }
        if (type === 'select' || type === 'radio') {
            const options = [];
            document.querySelectorAll('.roe-option-row').forEach(row => {
                const val = row.querySelector('.roe-opt-value')?.value;
                const lbl = row.querySelector('.roe-opt-label')?.value;
                if (val !== undefined && val !== '') {
                    options.push({ value: val, label: lbl || val });
                }
            });
            config.options = options;
        }

        return config;
    }

    // ==================== 数据操作 ====================

    getType(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        return typeof val;
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /** 双击编辑 key */
    _startEditKey(keySpan, path, oldKey, currentAlias, pathStr, schemaDef) {
        // 已经在编辑中
        if (keySpan.querySelector('.roe-key-edit-input')) return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'roe-key-edit-input';
        input.value = oldKey;
        input.style.cssText = 'background:#0f172a; border:1px solid #38bdf8; color:#7dd3fc; font-family:monospace; font-size:13px; font-weight:600; padding:1px 4px; border-radius:3px; width:auto; min-width:60px; outline:none;';

        keySpan.innerHTML = '';
        keySpan.appendChild(input);
        input.focus();
        input.select();

        const finishEdit = () => {
            const newKey = input.value.trim();
            if (newKey && newKey !== oldKey) {
                this._renameKey(path, oldKey, newKey);
            } else {
                // 恢复显示
                this.renderTree();
            }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = oldKey; input.blur(); }
        });
        input.addEventListener('click', e => e.stopPropagation());
    }

    /** 重命名 key */
    _renameKey(path, oldKey, newKey) {
        if (path.length === 0) return;
        const parentPath = path.slice(0, -1);
        const parent = parentPath.length === 0 ? this.data : this._getByPath(parentPath);
        if (!parent || typeof parent !== 'object') return;
        if (Array.isArray(parent)) return; // 数组不支持重命名

        if (parent.hasOwnProperty(newKey)) {
            alert(`键名 "${newKey}" 已存在`);
            this.renderTree();
            return;
        }

        // 保留顺序：重建对象
        const newParent = {};
        for (const [k, v] of Object.entries(parent)) {
            if (k === oldKey) {
                newParent[newKey] = v;
            } else {
                newParent[k] = v;
            }
        }
        // 清空并重新赋值
        Object.keys(parent).forEach(k => delete parent[k]);
        Object.assign(parent, newParent);

        // 更新 schema：旧路径 -> 新路径
        const oldPathStr = JSON.stringify(path);
        const newPath = [...parentPath, newKey];
        const newPathStr = JSON.stringify(newPath);
        if (this.schema.has(oldPathStr)) {
            const def = this.schema.get(oldPathStr);
            this.schema.delete(oldPathStr);
            this.schema.set(newPathStr, def);
        }
        // 也更新子路径的 schema
        const prefix = oldPathStr.slice(0, -1); // e.g. '["a","b"'
        const keysToUpdate = [];
        this.schema.forEach((_, k) => {
            if (k !== oldPathStr && k.startsWith(prefix)) {
                keysToUpdate.push(k);
            }
        });
        keysToUpdate.forEach(k => {
            const def = this.schema.get(k);
            this.schema.delete(k);
            const newK = newPathStr.slice(0, -1) + k.slice(prefix.length);
            this.schema.set(newK, def);
        });

        // 更新展开状态
        if (this.expandedPaths.has(oldPathStr)) {
            this.expandedPaths.delete(oldPathStr);
            this.expandedPaths.add(newPathStr);
        }

        this.renderTree();
        this._notifyChange();
    }

    _getByPath(path) {
        let cur = this.data;
        for (let key of path) {
            if (cur === undefined || cur === null) return undefined;
            cur = cur[key];
        }
        return cur;
    }

    _setByPath(path, value) {
        this._lastChangedPath = path;
        if (path.length === 0) { this.data = value; return; }
        const parentPath = path.slice(0, -1);
        const key = path[path.length - 1];
        const parent = parentPath.length === 0 ? this.data : this._getByPath(parentPath);
        if (parent !== undefined && parent !== null) {
            parent[key] = value;
        }
    }

    getByPath(path) { return this._getByPath(path); }

    setByPath(path, value, isNew = false) {
        let cur = this.data;
        if (path.length === 0) { this.data = value; return; }
        const parentPath = path.slice(0, -1);
        const key = path[path.length - 1];
        cur = parentPath.length === 0 ? this.data : this._getByPath(parentPath);
        if (cur !== undefined && cur !== null) {
            if (Array.isArray(cur) && isNew) cur.push(value);
            else cur[key] = value;
        }
    }

    selectNode(nodeEl, path) {
        // 点击高亮（点击选项高亮 设置）：关闭时不去选任何节点，避免 .roe-node.selected 效果
        if (this.highlightOnClick) {
            this.container.querySelectorAll('.roe-node.selected, .soe-node.selected').forEach(n => n.classList.remove('selected'));
            nodeEl.classList.add('selected');
        }
        this.selectedPath = path;
    }

    toggleExpand(pathStr, toggleEl) {
        if (this.expandedPaths.has(pathStr)) {
            this.expandedPaths.delete(pathStr);
            toggleEl.classList.add('collapsed');
        } else {
            this.expandedPaths.add(pathStr);
            toggleEl.classList.remove('collapsed');
        }
        this.renderTree();
    }

    handleValueChange(inputEl) {
        const path = JSON.parse(inputEl.dataset.path);
        const type = inputEl.dataset.type;
        let rawVal = inputEl.value;
        let newVal = rawVal;
        try {
            if (type === 'number') newVal = parseFloat(rawVal);
            else if (type === 'boolean') newVal = rawVal === 'true';
            else if (type === 'null') newVal = null;
        } catch (e) { /* ignore */ }
        this._setByPath(path, newVal);
        this.updateStats();
        this.search(this.dom.searchInput.value);
        this._notifyChange();
    }

    deleteNode(path) {
        if (path.length === 0) {
            if (confirm("确定清空根节点？")) this.data = {};
        } else {
            const parent = this._getByPath(path.slice(0, -1));
            const key = path[path.length - 1];
            if (Array.isArray(parent)) parent.splice(key, 1);
            else delete parent[key];
            // 同时删除相关 schema
            const prefix = JSON.stringify(path);
            const keysToDelete = [];
            this.schema.forEach((_, k) => {
                if (k === prefix || k.startsWith(prefix.slice(0, -1))) keysToDelete.push(k);
            });
            keysToDelete.forEach(k => this.schema.delete(k));
        }
        this.renderTree();
        this.updateStats();
        this._notifyChange();
    }

    duplicateNode(path) {
        const val = this._getByPath(path);
        const parent = this._getByPath(path.slice(0, -1));
        if (Array.isArray(parent)) {
            parent.splice(path[path.length - 1] + 1, 0, JSON.parse(JSON.stringify(val)));
        } else if (parent) {
            const key = path[path.length - 1];
            let newKey = key + '_copy';
            let i = 1;
            while (parent.hasOwnProperty(newKey)) newKey = `${key}_copy${i++}`;
            parent[newKey] = JSON.parse(JSON.stringify(val));
        }
        this.renderTree();
        this.updateStats();
        this._notifyChange();
    }

    // ==================== 模态框 ====================

    openModal(mode = 'add', targetPath = []) {
        this.dom.modalOverlay.classList.add('active');
        this.modalTargetPath = targetPath;
        const isArrParent = Array.isArray(this._getByPath(targetPath));
        this.dom.modalKey.value = '';
        this.dom.modalKey.disabled = isArrParent;
        this.dom.modalType.value = 'string';
        this.dom.modalValue.value = '';
        this.dom.modalValRow.style.display = 'block';
        if (isArrParent) this.dom.modalKey.placeholder = '自动索引';
        else this.dom.modalKey.placeholder = '键名';

        this.dom.modalType.onchange = () => {
            const t = this.dom.modalType.value;
            if (t === 'object' || t === 'array') {
                this.dom.modalValRow.style.display = 'none';
            } else {
                this.dom.modalValRow.style.display = 'block';
                if (t === 'boolean') this.dom.modalValue.placeholder = 'true/false';
                else if (t === 'null') { this.dom.modalValue.value = 'null'; this.dom.modalValue.placeholder = ''; }
                else this.dom.modalValue.placeholder = '请输入值';
            }
        };
    }

    closeModal() { this.dom.modalOverlay.classList.remove('active'); }

    confirmModal() {
        const type = this.dom.modalType.value;
        let key = this.dom.modalKey.value;
        let value = this.dom.modalValue.value;
        if (type === 'object') value = {};
        else if (type === 'array') value = [];
        else if (type === 'number') value = parseFloat(value) || 0;
        else if (type === 'boolean') value = value === 'true';
        else if (type === 'null') value = null;

        const parent = this._getByPath(this.modalTargetPath);
        if (Array.isArray(parent)) {
            parent.push(value);
        } else if (parent && typeof parent === 'object') {
            if (!key) { alert("请输入键名"); return; }
            parent[key] = value;
        } else {
            if (!key) { alert("请输入键名"); return; }
            if (!this.data || typeof this.data !== 'object') this.data = {};
            this.data[key] = value;
        }
        this.closeModal();
        this.expandedPaths.add(JSON.stringify(this.modalTargetPath));
        this.renderTree();
        this.updateStats();
        this._notifyChange();
    }

    // ==================== JSON 导入/导出 ====================

    openJsonModal() {
        this.dom.jsonModalOverlay.classList.add('active');
        this.dom.jsonInput.value = '';
        this.dom.jsonInput.focus();
    }
    closeJsonModal() { this.dom.jsonModalOverlay.classList.remove('active'); }

    confirmJsonImport() {
        const jsonStr = this.dom.jsonInput.value.trim();
        if (!jsonStr) { alert("请输入 JSON 数据"); return; }
        try {
            const parsed = JSON.parse(jsonStr);
            // 如果是完整导出格式（包含 _meta + data + schema）
            if (parsed._meta && parsed._meta.type === 'rich-obj-editor-export') {
                this.setObj(parsed.data, parsed.schema);
            } else {
                this.setObj(parsed);
            }
            this.closeJsonModal();
        } catch (e) {
            alert("JSON 格式错误: " + e.message);
        }
    }

    exportJson() {
        const json = JSON.stringify(this.data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    /** 导出数据+配置的完整JSON */
    exportFull() {
        const full = {
            _meta: {
                type: 'rich-obj-editor-export',
                version: 1,
                exportedAt: new Date().toISOString()
            },
            data: this.data,
            schema: this.getSchema()
        };
        const json = JSON.stringify(full, null, 2);
        this.dom.exportOutput.value = json;
        this.dom.exportModalOverlay.classList.add('active');
    }

    closeExportModal() {
        this.dom.exportModalOverlay.classList.remove('active');
    }

    /** 从完整导出文件导入 */
    importFull(jsonStr) {
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed._meta && parsed._meta.type === 'rich-obj-editor-export') {
                this.setObj(parsed.data, parsed.schema);
                return true;
            }
            // 如果不是完整导出格式，当作普通数据导入
            this.setObj(parsed);
            return true;
        } catch (e) {
            alert("JSON 格式错误: " + e.message);
            return false;
        }
    }

    openSchemaModal() {
        this.dom.schemaModalOverlay.classList.add('active');
        this.dom.schemaInput.value = JSON.stringify(this.getSchema(), null, 2);
        this.dom.schemaInput.focus();
    }
    closeSchemaModal() { this.dom.schemaModalOverlay.classList.remove('active'); }

    confirmSchemaImport() {
        const str = this.dom.schemaInput.value.trim();
        if (!str) { alert("请输入 Schema JSON"); return; }
        try {
            const parsed = JSON.parse(str);
            this.loadSchemaFromObj(parsed);
            this.closeSchemaModal();
            this.renderTree();
            this._notifyChange();
        } catch (e) {
            alert("Schema JSON 格式错误: " + e.message);
        }
    }

    // ==================== 搜索 ====================

    debouncedSearch(query) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.performSearch(query), 300);
    }

    performSearch(query) {
        if (!query) {
            this.lastSearchResults = [];
            this.isDropdownOpen = false;
            this.dom.dropdown.classList.remove('show');
            this.container.querySelectorAll('.matched, .pinyin-start, .pinyin-contains').forEach(n => {
                n.classList.remove('matched', 'pinyin-start', 'pinyin-contains');
            });
            return;
        }
        if (this.searchCache.has(query)) {
            this.lastSearchResults = this.searchCache.get(query);
            this.isDropdownOpen = true;
            this.renderSearchResults(this.lastSearchResults, query);
            return;
        }
        const results = this.searchInData(query);
        if (this.searchCache.size >= 50) {
            this.searchCache.delete(this.searchCache.keys().next().value);
        }
        this.searchCache.set(query, results);
        this.lastSearchResults = results;
        this.isDropdownOpen = results.length > 0;
        this.renderSearchResults(results, query);
    }

    searchInData(query) {
        if (!query) return [];
        const results = [];
        const lowerQuery = query.toLowerCase();
        const isPinyinQuery = /^[a-zA-Z]+$/.test(query);
        const dfs = (obj, path) => {
            if (!obj) return;
            const entries = Array.isArray(obj) ? obj.map((v, i) => [i, v]) : Object.entries(obj);
            entries.forEach(([k, v]) => {
                const currentPath = [...path, k];
                const keyStr = String(k);
                const valStr = typeof v !== 'object' ? String(v) : '';
                let matched = false, matchType = '';
                if (keyStr.toLowerCase().includes(lowerQuery) || valStr.toLowerCase().includes(lowerQuery)) {
                    matched = true; matchType = 'text';
                }
                if (!matched && isPinyinQuery) {
                    const keyPy = this.getPinyinInitials(keyStr).toLowerCase();
                    const valPy = valStr ? this.getPinyinInitials(valStr).toLowerCase() : '';
                    if (keyPy.includes(lowerQuery)) {
                        matched = true;
                        matchType = keyPy.startsWith(lowerQuery) ? 'pinyin-start' : 'pinyin-contains';
                    } else if (valPy.includes(lowerQuery)) {
                        matched = true;
                        matchType = valPy.startsWith(lowerQuery) ? 'pinyin-start' : 'pinyin-contains';
                    }
                }
                if (matched) {
                    results.push({ path: currentPath, key: k, val: v, type: this.getType(v), matchType });
                }
                if (typeof v === 'object') dfs(v, currentPath);
            });
        };
        dfs(this.data, []);
        return results;
    }

    renderSearchResults(results, query) {
        this.dom.dropdown.innerHTML = '';
        if (results.length === 0) { this.dom.dropdown.classList.remove('show'); return; }
        results.forEach(r => {
            const item = document.createElement('div');
            item.className = 'roe-dropdown-item';
            let mtClass = '', mtText = '';
            if (r.matchType === 'text') { mtClass = 'text'; mtText = '文本'; }
            else if (r.matchType === 'pinyin-start') { mtClass = 'pinyin-start'; mtText = '拼音·首字'; }
            else if (r.matchType === 'pinyin-contains') { mtClass = 'pinyin-contains'; mtText = '拼音·中间'; }
            item.innerHTML = `
                <div class="roe-dropdown-path">${r.path.join(' > ')}</div>
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div class="roe-dropdown-preview">${r.key}: ${r.type === 'object' ? '{...}' : r.type === 'array' ? '[...]' : String(r.val)}</div>
                    <span class="roe-dropdown-match-type ${mtClass}">${mtText}</span>
                </div>`;
            item.onclick = () => this.jumpToPath(r.path, r.matchType);
            this.dom.dropdown.appendChild(item);
        });
        this.dom.dropdown.classList.add('show');
    }

    search(query) {
        this.lastSearchQuery = query;
        this.debouncedSearch(query);
    }

    jumpToPath(path, matchType = 'text') {
        this.dom.dropdown.classList.remove('show');
        this.isDropdownOpen = false;
        let curPath = [];
        path.forEach(p => { curPath.push(p); this.expandedPaths.add(JSON.stringify(curPath)); });
        this.renderTree();
        setTimeout(() => {
            const targetNode = this.container.querySelector(`[data-path='${JSON.stringify(path)}']`);
            if (targetNode) {
                targetNode.classList.remove('matched', 'pinyin-start', 'pinyin-contains');
                if (matchType === 'text') targetNode.classList.add('matched');
                else if (matchType === 'pinyin-start') targetNode.classList.add('pinyin-start');
                else if (matchType === 'pinyin-contains') targetNode.classList.add('pinyin-contains');
                targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.selectNode(targetNode, path);
            }
        }, 50);
    }

    // ==================== 统计 ====================

    updateStats() {
        let stats = { obj: 0, arr: 0, str: 0, num: 0, bool: 0, null: 0, total: 0, schema: this.schema.size };
        const count = (o) => {
            if (!o) return;
            stats.total++;
            const t = this.getType(o);
            if (t === 'object') { stats.obj++; Object.values(o).forEach(v => count(v)); }
            else if (t === 'array') { stats.arr++; o.forEach(v => count(v)); }
            else if (t === 'string') stats.str++;
            else if (t === 'number') stats.num++;
            else if (t === 'boolean') stats.bool++;
            else if (t === 'null') stats.null++;
        };
        count(this.data);
        this.dom.stats.innerHTML = `
            <span>Object: <b>${stats.obj}</b></span>
            <span>Array: <b>${stats.arr}</b></span>
            <span>String: <b>${stats.str}</b></span>
            <span>Number: <b>${stats.num}</b></span>
            <span>Total: <b>${stats.total}</b></span>
            <span>Schema: <b style="color:#38bdf8">${stats.schema}</b></span>`;
    }

    // ==================== 事件绑定 ====================

    bindEvents() {
        document.getElementById('roe-expand-all').onclick = () => {
            const rec = (o, p) => {
                if (typeof o !== 'object' || o === null) return;
                this.expandedPaths.add(JSON.stringify(p));
                Object.keys(o).forEach(k => rec(o[k], [...p, k]));
            };
            rec(this.data, []);
            this.renderTree();
        };
        document.getElementById('roe-collapse-all').onclick = () => {
            this.expandedPaths.clear();
            this.renderTree();
        };
        document.getElementById('roe-add-root').onclick = () => this.openModal('add', []);
        if (this.hideAddRoot) {
            const addRootBtn = document.getElementById('roe-add-root');
            if (addRootBtn) addRootBtn.style.display = 'none';
        }
        document.getElementById('roe-import-json').onclick = () => this.openJsonModal();
        document.getElementById('roe-export-json').onclick = () => this.exportJson();
        document.getElementById('roe-import-schema').onclick = () => this.openSchemaModal();
        document.getElementById('roe-export-full').onclick = () => this.exportFull();
        if (this.hideImportExport) {
            ['roe-import-json', 'roe-export-json', 'roe-import-schema', 'roe-export-full'].forEach(id => {
                const b = document.getElementById(id);
                if (b) b.style.display = 'none';
            });
        }

        document.getElementById('roe-json-modal-cancel').onclick = () => this.closeJsonModal();
        document.getElementById('roe-json-modal-confirm').onclick = () => this.confirmJsonImport();
        this.dom.jsonModalOverlay.onclick = (e) => { if (e.target === this.dom.jsonModalOverlay) this.closeJsonModal(); };

        document.getElementById('roe-schema-modal-cancel').onclick = () => this.closeSchemaModal();
        document.getElementById('roe-schema-modal-confirm').onclick = () => this.confirmSchemaImport();
        this.dom.schemaModalOverlay.onclick = (e) => { if (e.target === this.dom.schemaModalOverlay) this.closeSchemaModal(); };

        // 导出全部模态框
        document.getElementById('roe-export-modal-close').onclick = () => this.closeExportModal();
        this.dom.exportModalOverlay.onclick = (e) => { if (e.target === this.dom.exportModalOverlay) this.closeExportModal(); };
        document.getElementById('roe-export-modal-copy').onclick = () => {
            this.dom.exportOutput.select();
            navigator.clipboard.writeText(this.dom.exportOutput.value).then(() => {
                document.getElementById('roe-export-modal-copy').textContent = '已复制!';
                setTimeout(() => { document.getElementById('roe-export-modal-copy').textContent = '复制到剪贴板'; }, 1500);
            }).catch(() => { document.execCommand('copy'); });
        };
        document.getElementById('roe-export-modal-download').onclick = () => {
            const blob = new Blob([this.dom.exportOutput.value], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rich-obj-export.json';
            a.click();
            URL.revokeObjectURL(url);
        };

        document.getElementById('roe-modal-cancel').onclick = () => this.closeModal();
        document.getElementById('roe-modal-confirm').onclick = () => this.confirmModal();
        this.dom.modalOverlay.onclick = (e) => { if (e.target === this.dom.modalOverlay) this.closeModal(); };

        this.dom.searchInput.oninput = (e) => this.search(e.target.value);
        this.dom.searchInput.onfocus = () => {
            if (this.lastSearchResults.length > 0 && this.lastSearchQuery) {
                this.renderSearchResults(this.lastSearchResults, this.lastSearchQuery);
            }
        };
        this.dom.searchWrapper.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.roe-search-wrapper')) {
                this.dom.dropdown.classList.remove('show');
                this.isDropdownOpen = false;
            }
        });
    }
}
