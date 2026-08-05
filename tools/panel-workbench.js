/**
 * PanelWorkbench —— 四窗口工作台（自定义面板设计器）
 *
 * 把 4 个 MacWindow 串成一条完整工作流：
 *
 *   ①控件定义窗口(RichObjectEditor)  --➡️推送--> ③布局窗口(LayoutWindow)
 *              |                                        |
 *          schema.cell                              拖拽摆位置
 *              v                                        v
 *   ②表格窗口(ExcelTable) <==双向绑定==> ④成品窗口(PreviewWindow)
 *
 * 关键点：
 *   - 在①里给节点配置控件类型和「关联单元格(cell)」，点 ➡️ 推到③；
 *   - 在③里拖拽摆放，任何位置改动都会**实时**重绘④；
 *   - ④里的控件与②的单元格双向绑定，拖滑块即触发表格公式重算，
 *     结果又回推到绑定该结果单元格的控件上 —— 这就是「拖滑块跑复杂公式」。
 */
class PanelWorkbench {
    /**
     * @param {Object} opts
     * @param {number} [opts.rows=12] 表格行数
     * @param {number} [opts.cols=8]  表格列数
     * @param {Object} [opts.initialData]   编辑器初始数据
     * @param {Object} [opts.initialSchema] 编辑器初始 schema
     */
    constructor(opts = {}) {
        this.opts = opts;
        const p = this._layoutPositions();
        this._createExcelWindow(p.excel.x, p.excel.y, p.w, p.h);
        this._createPreviewWindow(p.preview.x, p.preview.y, p.w, p.h);
        this._createLayoutWindow(p.layout.x, p.layout.y, p.w, p.h);
        this._createEditorWindow(p.editor.x, p.editor.y, p.w, p.h);

        this._seedDemo();
        this._createDock();
    }

    /** 四宫格标准布局坐标：左上=定义 右上=布局 左下=表格 右下=成品 */
    _layoutPositions() {
        const W = window.innerWidth, H = window.innerHeight;
        const gap = 12;
        const w = Math.max(380, Math.floor((W - gap * 3) / 2));
        const h = Math.max(300, Math.floor((H - gap * 3) / 2));
        return {
            w, h,
            excel:   { x: gap,            y: gap * 2 + h, w, h },  // 左下=表格
            preview: { x: gap * 2 + w,    y: gap * 2 + h, w, h },  // 右下=成品
            layout:  { x: gap * 2 + w,    y: gap,        w, h },  // 右上=布局
            editor:  { x: gap,            y: gap,        w, h },  // 左上=定义
        };
    }

    // ==================== ⑤ Dock 栏（面板管理） ====================
    // 「面板」图标已由 main.js 在构建全局 dock 时作为静态项直接加入，
    // 默认即显示，无需打开工作台。这里仅注入面板菜单所需样式。
    _createDock() {
        if (!document.getElementById('pw-dock-styles')) {
            const s = document.createElement('style');
            s.id = 'pw-dock-styles';
            s.textContent = `
.pw-panel-menu {
    position: fixed; z-index: 100000; width: 320px; max-height: 70vh; overflow: auto;
    background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0,0,0,.5); padding: 12px; font-family: system-ui, sans-serif; font-size: 13px;
}
.pw-panel-menu .ppm-head { font-weight: 700; font-size: 14px; margin-bottom: 10px; color: #7dd3fc; }
.pw-panel-menu .ppm-create { width: 100%; background: linear-gradient(180deg,#16a34a,#15803d); color: #fff;
    border: none; border-radius: 7px; padding: 9px; font-size: 13px; font-weight: 700; cursor: pointer; margin-bottom: 10px; }
.pw-panel-menu .ppm-create:hover { filter: brightness(1.1); }
.pw-panel-menu .ppm-row { display: flex; gap: 6px; margin-bottom: 10px; }
.pw-panel-menu .ppm-name { flex: 1; background: #1e293b; border: 1px solid #334155; color: #fff;
    border-radius: 5px; padding: 5px 8px; font-size: 12px; outline: none; }
.pw-panel-menu .ppm-name:focus { border-color: #0ea5e9; }
.pw-panel-menu .ppm-global { display: flex; align-items: center; gap: 3px; color: #94a3b8; font-size: 12px;
    white-space: nowrap; user-select: none; cursor: pointer; }
.pw-panel-menu .ppm-global input { margin: 0; cursor: pointer; }
.pw-panel-menu .ppm-tag { font-size: 10px; padding: 1px 5px; border-radius: 4px; line-height: 1.4; white-space: nowrap; }
.pw-panel-menu .ppm-tag-g { background: #064e3b; color: #6ee7b7; }
.pw-panel-menu .ppm-tag-s { background: #3b0764; color: #d8b4fe; }
.pw-panel-menu .ppm-btn { background: #2563eb; color: #fff; border: none; border-radius: 5px;
    padding: 5px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }
.pw-panel-menu .ppm-btn:hover { background: #1d4ed8; }
.pw-panel-menu .ppm-list { display: flex; flex-direction: column; gap: 4px; }
.pw-panel-menu .ppm-empty { color: #64748b; text-align: center; padding: 14px 0; }
.pw-panel-menu .ppm-item { display: flex; align-items: center; justify-content: space-between;
    background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; gap: 8px; }
.pw-panel-menu .ppm-item[data-global="1"] { background: #0b3a2e; border-color: #0f6b4f; }
.pw-panel-menu .ppm-item[data-global="0"] { background: #2a1840; border-color: #5b21b6; }
.pw-panel-menu .ppm-item-name { cursor: pointer; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pw-panel-menu .ppm-item-name:hover { color: #7dd3fc; }
.pw-panel-menu .ppm-item-actions { display: flex; gap: 4px; }
.pw-panel-menu .ppm-mini { background: #334155; color: #e2e8f0; border: none; border-radius: 4px;
    padding: 3px 7px; font-size: 11px; cursor: pointer; }
.pw-panel-menu .ppm-mini:hover { background: #475569; }
.pw-panel-menu .ppm-del:hover { background: #b91c1c; }
.pw-panel-menu .ppm-run { background: #15803d; color: #fff; }
.pw-panel-menu .ppm-copy { background: #1d4ed8; color: #fff; }
.pw-panel-menu .ppm-copy:hover { background: #2563eb; }
.pw-panel-menu .ppm-run:hover { background: #16a34a; }
.pw-panel-menu .ppm-run-cur { width: 100%; background: linear-gradient(180deg,#0ea5e9,#0284c7); color: #fff;
    border: none; border-radius: 7px; padding: 8px; font-size: 13px; font-weight: 700; cursor: pointer; }
.pw-panel-menu .ppm-run-cur:hover { filter: brightness(1.1); }
.pw-panel-menu .ppm-hint { color: #64748b; font-size: 11px; margin-top: 10px; line-height: 1.5; }
.pw-panel-menu .ppm-toast { margin-top: 8px; padding: 6px 8px; background: #064e3b; color: #6ee7b7;
    border-radius: 5px; font-size: 12px; opacity: 0; transition: opacity .2s; }
.pw-panel-menu .ppm-toast.show { opacity: 1; }
`;
            document.head.appendChild(s);
        }
    }

    /** 弹出面板管理菜单：创建新面板 / 打开成品 / 编辑 / 保存 / 删除 */
    _openPanelMenu() {
        if (this._panelMenu && this._panelMenu.parentNode) {
            this._panelMenu.remove();
            this._panelMenu = null;
        }
        const menu = document.createElement('div');
        menu.className = 'pw-panel-menu';
        menu.innerHTML = `
            <div class="ppm-head">面板管理</div>
            <button class="ppm-create">✚ 创建新面板</button>
            <div class="ppm-row">
                <input type="text" class="ppm-name" placeholder="面板名称，如：温控面板">
                <label class="ppm-global" title="勾选=存为全局（刷新不消失）；不勾=存为会话（刷新消失，但随画布 JSON 导出/加载）">
                    <input type="checkbox" class="ppm-global-chk" checked> 全局
                </label>
                <button class="ppm-btn ppm-save">保存当前</button>
            </div>
            <div class="ppm-row">
                <button class="ppm-btn ppm-run-cur" title="把当前工作台作为独立实例运行（不依赖编辑窗口）">▶ 运行当前设计</button>
            </div>
            <div class="ppm-list"></div>
            <div class="ppm-hint">点面板名＝直接打开成品 · 点 ▶ ＝编译为独立实例(可多开) · 点 ✎ ＝打开并编辑</div>
        `;
        document.body.appendChild(menu);
        this._panelMenu = menu;

        const place = () => {
            menu.style.left = '50%';
            menu.style.top = '70px';
            menu.style.transform = 'translateX(-50%)';
        };
        place();

        const listEl = menu.querySelector('.ppm-list');
        const renderList = () => {
            const panels = this.listPanels();
            const names = Object.keys(panels);
            if (names.length === 0) {
                listEl.innerHTML = `<div class="ppm-empty">暂无已保存面板，点上方「创建新面板」开始</div>`;
                return;
            }
            listEl.innerHTML = names.map(n => {
                const p = panels[n] || {};
                const isGlobal = p.global !== false;   // 默认全局
                const tag = isGlobal
                    ? '<span class="ppm-tag ppm-tag-g" title="全局：刷新不消失">全</span>'
                    : '<span class="ppm-tag ppm-tag-s" title="会话：刷新消失，随画布 JSON 导出/加载">会话</span>';
                return `
                <div class="ppm-item" data-name="${this._escAttr(n)}" data-global="${isGlobal ? '1' : '0'}">
                    <span class="ppm-item-name" title="点击直接打开成品面板">${this._escHtml(n)}</span>
                    ${tag}
                    <span class="ppm-item-actions">
                        <button class="ppm-mini ppm-copy" title="复制此面板 JSON 到剪贴板">⧉</button>
                        <button class="ppm-mini ppm-run" title="运行独立实例（可多开）">▶</button>
                        <button class="ppm-mini ppm-edit" title="打开并编辑">✎</button>
                        <button class="ppm-mini ppm-del" title="删除">🗑</button>
                    </span>
                </div>`;
            }).join('');
        };
        renderList();

        // 创建新面板：建好 4 个窗口并全部显示（首次会创建工作台实例）
        menu.querySelector('.ppm-create').addEventListener('click', () => {
            this._createWindowsIfNeeded();
            this._showAllWindows();
            this._ppmToast(menu, '已创建新面板（4 个窗口已打开）');
            this._panelMenu && this._panelMenu.remove();
            this._panelMenu = null;
        });

        // 保存当前
        menu.querySelector('.ppm-save').addEventListener('click', () => {
            const name = menu.querySelector('.ppm-name').value;
            const global = menu.querySelector('.ppm-global-chk').checked;
            const r = this.savePanel(name, { global });
            this._ppmToast(menu, r.msg);
            renderList();
        });

        // 运行当前设计：把当前工作台整套（数据+布局+单元格）编译成独立运行实例。
        // 这样即使关掉编辑窗口，运行实例依然独立存在、可被其它实例/通讯模块通知驱动。
        menu.querySelector('.ppm-run-cur').addEventListener('click', () => {
            const name = (menu.querySelector('.ppm-name').value || '').trim()
                || ('未命名面板-' + (PanelRuntime.listRunning().length + 1));
            const proj = this.exportProject();
            proj._name = name;
            const rt = PanelRuntime.run(proj, { name });
            this._ppmToast(menu, `已运行「${name}」为独立实例（可多开）`);
            this._panelMenu && this._panelMenu.remove();
            this._panelMenu = null;
        });

        // 列表内事件（打开成品 / 编辑 / 删除）
        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.ppm-item');
            if (!item) return;
            const name = item.dataset.name;
            if (e.target.classList.contains('ppm-copy')) {
                // 复制单个面板的完整 JSON 到剪贴板
                const panels = this.listPanels();
                const proj = panels[name];
                if (!proj) { this._ppmToast(menu, `复制失败：面板「${name}」不存在`); return; }
                const json = JSON.stringify(proj, null, 2);
                const done = () => this._ppmToast(menu, `已复制「${name}」的 JSON 到剪贴板`);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(json).then(done).catch(() => this._copyText(json).then(done).catch(() => this._ppmToast(menu, '复制失败，请手动复制')));
                } else {
                    this._copyText(json).then(done).catch(() => this._ppmToast(menu, '复制失败，请手动复制'));
                }
                return;
            }
            if (e.target.classList.contains('ppm-del')) {
                const r = this.deletePanel(name);
                this._ppmToast(menu, r.msg);
                renderList();
            } else if (e.target.classList.contains('ppm-run')) {
                // 编译为独立运行实例：从 localStorage 加载快照，构造一套隔离的
                // ExcelTable + PreviewWindow，与编辑工作台及其它实例互不干扰。
                const rt = PanelRuntime.openCompiledPanel(name);
                if (rt) this._ppmToast(menu, `已运行「${name}」（独立实例，可多开）`);
                else this._ppmToast(menu, `运行失败：面板「${name}」不存在`);
                this._panelMenu && this._panelMenu.remove();
                this._panelMenu = null;
            } else if (e.target.classList.contains('ppm-edit')) {
                // 打开现有面板并编辑：加载数据 + 显示全部 4 窗口（重排回四宫格）
                this._createWindowsIfNeeded();
                const r = this.loadPanel(name, { recalc: true });
                this._showAllWindows();   // 内部已恢复成品默认标题
                this._ppmToast(menu, r.msg);
                this._panelMenu && this._panelMenu.remove();
                this._panelMenu = null;
            } else if (e.target.classList.contains('ppm-item-name')) {
                // 直接打开成品面板：加载数据 + 只显示预览窗口并居中
                this._createWindowsIfNeeded();
                const r = this.loadPanel(name, { recalc: true });
                this._showOnlyPreview();
                if (this.preview && this.preview.win) {
                    this.preview.win.setTitle(name);   // 窗口名改为面板名称
                    this.preview.win.center();          // 居中显示
                }
                this._ppmToast(menu, r.msg + '（仅成品）');
                this._panelMenu && this._panelMenu.remove();
                this._panelMenu = null;
            }
        });

        // 点击菜单外部关闭
        setTimeout(() => {
            const onDoc = (ev) => {
                if (this._panelMenu && !this._panelMenu.contains(ev.target) &&
                    !(ev.target.closest && ev.target.closest('.dock-item'))) {
                    this._panelMenu.remove();
                    this._panelMenu = null;
                    document.removeEventListener('mousedown', onDoc, true);
                }
            };
            document.addEventListener('mousedown', onDoc, true);
        }, 0);
    }

    /** 确保 4 个窗口已创建（首次创建工作台实例 / 复用已有） */
    _createWindowsIfNeeded() {
        if (!this.preview) {
            // 工作台尚未初始化：通过全局入口创建
            window.openPanelWorkbench();
        }
    }

    _showAllWindows() {
        const p = this._layoutPositions();
        // 强制重排到四宫格标准位置（像第一次打开一样）
        if (this.excelWin)   { this.excelWin.setSize(p.w, p.h);   this.excelWin.setPosition(p.excel.x, p.excel.y); }
        // 成品窗口：若加载的面板保存过尺寸则沿用（用户拖拽调整后的），否则用四宫格标准尺寸。
        if (this.preview && this.preview.win) {
            const ps = this._loadedPreviewSize || { w: p.w, h: p.h };
            this.preview.win.setSize(ps.w, ps.h);
            this.preview.win.setPosition(p.preview.x, p.preview.y);
        }
        if (this.layout && this.layout.win)   { this.layout.win.setSize(p.w, p.h);  this.layout.win.setPosition(p.layout.x, p.layout.y); }
        if (this.editorWin)  { this.editorWin.setSize(p.w, p.h);  this.editorWin.setPosition(p.editor.x, p.editor.y); }
        this.excelWin && this.excelWin.show();
        this.preview && this.preview.win && this.preview.win.show();
        this.layout && this.layout.win && this.layout.win.show();
        this.editorWin && this.editorWin.show();
        // 4 窗口态（新建/编辑）下，成品窗口恢复默认标题（不用面板名）
        if (this.preview && this.preview.win) this.preview.win.setTitle('成品窗口 · 实时预览');
    }

    _showOnlyPreview() {
        this.excelWin && this.excelWin.hide();
        this.preview && this.preview.win && this.preview.win.show();
        this.layout && this.layout.win && this.layout.win.hide();
        this.editorWin && this.editorWin.hide();
    }

    _hideAllWindows() {
        this.excelWin && this.excelWin.hide();
        this.preview && this.preview.win && this.preview.win.hide();
        this.layout && this.layout.win && this.layout.win.hide();
        this.editorWin && this.editorWin.hide();
    }

    _ppmToast(menu, msg) {
        let t = menu.querySelector('.ppm-toast');
        if (!t) { t = document.createElement('div'); t.className = 'ppm-toast'; menu.appendChild(t); }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._ppmToastT);
        this._ppmToastT = setTimeout(() => t.classList.remove('show'), 1800);
    }

    _escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    _escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
    // 复制文本到剪贴板的兜底方案（无 navigator.clipboard 或 http 环境可用）
    _copyText(text) {
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
                document.body.appendChild(ta);
                ta.focus(); ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('execCommand copy failed'));
            } catch (e) { reject(e); }
        });
    }

    // ==================== ② 表格窗口 ====================
    _createExcelWindow(x, y, w, h) {
        this.excelWin = new MacWindow({
            title: '表格窗口 · 公式引擎（数据总线）',
            width: w, height: h, x, y,
            content: '<div class="wb-excel-host"></div>',
            resizable: true, dark: true,
            show: false,   // 延迟显示：仅当用户「创建新面板 / 选择面板」时才 show
        });
        const host = this.excelWin.contentElement.querySelector('.wb-excel-host');
        this.excelWin.contentElement.style.padding = '0';
        // 滚动交给 ExcelTable 内部的 .excel-table-container，外层 host 不重复出现滚动条
        host.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        this.excel = new ExcelTable(host, this.opts.rows || 16, this.opts.cols || 12, { dark: true });
        // 单元格右键 → 用已加载的 AXF 符号名直接填变量地址 / 读写公式
        if (typeof attachSwdVarMenu === 'function') attachSwdVarMenu(this.excel);
    }

    // ==================== ④ 成品窗口 ====================
    _createPreviewWindow(x, y, w, h) {
        this.preview = new PreviewWindow({
            excel: this.excel,
            windowOpts: { x, y, width: w, height: h, show: false },
        });
    }

    // ==================== ③ 布局窗口 ====================
    _createLayoutWindow(x, y, w, h) {
        this.layout = new LayoutWindow({
            windowOpts: { x, y, width: w, height: h, show: false },
            // 布局一变，成品窗口立刻重绘 —— 实时看到成品长什么样
            // 布局一变（含每个控件的独立显示选项）都会实时重绘成品窗口
            onLayoutChange: (defs) => {
                this.preview.setLayout(defs);
            },
            onSelect: (def) => {
                // 选中布局中的控件时，在编辑器里跳到对应节点，方便继续调参。
                // 注意：jumpToPath 会重建树（DOM 全换），所以只在「选中项真正变化」时才跳，
                // 否则拖拽过程中反复重建树会打断交互。
                const id = def ? def.id : null;
                if (id === this._lastJumpId) return;
                this._lastJumpId = id;
                if (def && def.srcPath && this.editor) {
                    try { this.editor.revealPath(JSON.parse(def.srcPath)); } catch (e) { /* ignore */ }
                }
            },
        });
    }

    // ==================== ① 控件定义窗口 ====================
    _createEditorWindow(x, y, w, h) {
        this.editorWin = new MacWindow({
            title: '控件定义窗口 · 点 ➡️ 推送到布局',
            width: w, height: h, x, y,
            content: '<div class="wb-editor-host" style="height:100%;"></div>',
            resizable: true, dark: true,
            show: false,   // 延迟显示：仅当用户「创建新面板 / 选择面板」时才 show
        });
        this.editorWin.contentElement.style.padding = '0';
        const host = this.editorWin.contentElement.querySelector('.wb-editor-host');

        this.editor = new RichObjectEditor(host, {
            highlightOnClick: true,
            // 核心：节点右侧的 ➡️ 按钮把控件定义推到布局窗口
            onPushControl: (def) => {
                this.layout.addControl(def);
            },
            // 编辑器里改值/改 schema 时，同步到表格与成品
            onChange: (data, schema, changedPath) => {
                this._syncEditorToExcel(changedPath);
                this._refreshPushedDefs();
            },
            // 控件改名：同步更新布局里已推送控件的 srcPath（及派生 id），避免改名后布局错乱
            onRenameKey: (oldPathStr, newPathStr) => {
                this._onEditorRenameKey(oldPathStr, newPathStr);
            },
        });

        this.editor.setObj(
            this.opts.initialData || this._defaultData(),
            this.opts.initialSchema || this._defaultSchema()
        );
        this.editor.expandedPaths.add(JSON.stringify([]));
        this.editor.renderTree();
        this.editor.updateStats();
    }

    /** 编辑器改动 -> 写入对应单元格 */
    _syncEditorToExcel(changedPath) {
        if (!changedPath || !this.excel) return;
        const pathStr = JSON.stringify(changedPath);
        const s = this.editor.getSchema()[pathStr];
        if (s && s.cell && this.excel.hasCell(s.cell)) {
            this.excel.setCell(s.cell, this.editor.getByPath(changedPath));
        }
    }

    /** 控件改名：把布局里已推送控件的 srcPath（及派生 id）同步到新路径，并刷新定义与选中态 */
    _onEditorRenameKey(oldPathStr, newPathStr) {
        if (!this.layout) return;
        const newId = 'ctl_' + newPathStr.replace(/[^A-Za-z0-9]/g, c => '_' + c.charCodeAt(0).toString(16) + '_');
        let path = null;
        try { path = JSON.parse(newPathStr); } catch (e) { path = null; }
        if (this._refreshing) return;   // 防重入
        this._refreshing = true;
        try {
            this.layout.defs.forEach(d => {
                if (d.srcPath !== oldPathStr) return;
                // 迁移 items map 中的 DOM 到新 id（避免残留旧 DOM 导致布局错乱）
                if (d.id !== newId) {
                    const oldEl = this.layout.items.get(d.id);
                    if (oldEl) {
                        this.layout.items.delete(d.id);
                        oldEl.dataset.id = newId;
                        this.layout.items.set(newId, oldEl);
                    }
                    // 同步选中态
                    if (this.layout.selectedIds && this.layout.selectedIds.has(d.id)) {
                        this.layout.selectedIds.delete(d.id);
                        this.layout.selectedIds.add(newId);
                    }
                    if (this.layout.selectedId === d.id) this.layout.selectedId = newId;
                }
                // 更新 srcPath 与 id
                d.srcPath = newPathStr;
                d.id = newId;
                // 用新路径重新生成控件定义（label 等），保留位置
                if (path) {
                    const fresh = this.editor.buildControlDef(path);
                    if (fresh) {
                        const { x, y, w, h } = d;
                        Object.assign(d, fresh, { x, y, w, h });
                    }
                }
                this.layout._renderItem(d);
            });
            this.layout._emit();
        } finally {
            this._refreshing = false;
        }
    }

    /** schema 改了之后，刷新已经推到布局里的同源控件（保留其位置） */
    _refreshPushedDefs() {
        if (!this.layout) return;
        if (this._refreshing) return;   // 防重入：避免 编辑器->布局->成品->编辑器 回环
        this._refreshing = true;
        try { this._doRefreshPushedDefs(); } finally { this._refreshing = false; }
    }

    _doRefreshPushedDefs() {
        let dirty = false;
        this.layout.defs.forEach(d => {
            if (!d.srcPath) return;
            let path;
            try { path = JSON.parse(d.srcPath); } catch (e) { return; }
            const fresh = this.editor.buildControlDef(path);
            if (!fresh) return;
            const { x, y, w, h } = d;
            Object.assign(d, fresh, { x, y, w, h });
            this.layout._renderItem(d);
            dirty = true;
        });
        if (dirty) this.layout._emit();
    }

    // ==================== 默认示例 ====================

    _defaultData() {
        return { 增益: 10, 偏置: 5, 使能: true, 模式: 'x', 输出: 0 };
    }

    _defaultSchema() {
        return {
            '["增益"]':  { type: 'range', label: '增益 A', cell: 'A1', min: 0, max: 100, step: 1 },
            '["偏置"]':  { type: 'range', label: '偏置 B', cell: 'B1', min: 0, max: 50,  step: 1 },
            '["使能"]':  { type: 'checkbox', label: '使能', cell: 'C1' },
            '["模式"]':  { type: 'select', label: '模式', cell: 'D1',
                          options: [{ value: 'x', label: '模式X' }, { value: 'y', label: '模式Y' }] },
            '["输出"]':  { type: 'number', label: '输出 = A1*2+B1', cell: 'E1' },
        };
    }

    _defaultData() {
        return {
            文本: '输入文字',
            数字: 42,
            滑块: 30,
            开关: true,
            下拉: '中',
            颜色: '#3498db',
            日期: '2026-08-02',
            单选: 'A',
            多行: '多行\n文本',
            标签: '这是一个标签',
            按钮值: 1,
            输出: 0,
        };
    }

    _defaultSchema() {
        return {
            '["文本"]':   { type: 'text',     label: '文本输入',   cell: 'A1' },
            '["数字"]':   { type: 'number',   label: '数字',       cell: 'B1', min: 0, max: 999, step: 1 },
            '["滑块"]':   { type: 'range',    label: '滑块',       cell: 'C1', min: 0, max: 100, step: 1 },
            '["开关"]':   { type: 'checkbox', label: '开关',       cell: 'D1' },
            '["下拉"]':   { type: 'select',   label: '下拉选择',   cell: 'F1',
                            options: [{ value: '高', label: '高' }, { value: '中', label: '中' }, { value: '低', label: '低' }] },
            '["颜色"]':   { type: 'color',    label: '颜色',       cell: 'G1' },
            '["日期"]':   { type: 'date',     label: '日期',       cell: 'H1' },
            '["单选"]':   { type: 'radio',    label: '单选',       cell: 'I1',
                            options: [{ value: 'A', label: '选项A' }, { value: 'B', label: '选项B' }, { value: 'C', label: '选项C' }] },
            '["多行"]':   { type: 'textarea', label: '多行文本',   cell: 'J1' },
            '["标签"]':   { type: 'label',    label: '标签',       cell: 'K1' },
            '["按钮值"]': { type: 'button',   label: '点击写入',   cell: 'L1', value: 1 },
            '["输出"]':   { type: 'number',   label: '输出 = A1*2+B1', cell: 'E1' },
        };
    }

    /** 预置一条公式，直观展示「拖滑块 -> 公式计算 -> 结果控件刷新」 */
    _seedDemo() {
        if (!this.excel) return;
        this.excel.setCell('A1', '输入文字');
        this.excel.setCell('B1', 42);
        this.excel.setCell('C1', 30);
        this.excel.setCell('D1', true);
        this.excel.setCell('F1', '中');
        this.excel.setCell('G1', '#3498db');
        this.excel.setCell('H1', '2026-08-02');
        this.excel.setCell('I1', 'A');
        this.excel.setCell('J1', '多行\n文本');
        this.excel.setCell('K1', '这是一个标签');
        this.excel.setCell('E1', '=A1*2+B1');
    }

    // ==================== 工程化：保存/加载 ====================

    /** 导出整套设计（数据 + schema + 布局 + 表格单元格），可持久化 */
    exportProject() {
        // 成品窗口的当前实际尺寸（用户拖拽调整后的），保存下来以便还原时沿用，
        // 而不是每次都用固定的初始四宫格尺寸。
        let pvW = null, pvH = null;
        if (this.preview && this.preview.win) {
            pvW = this.preview.win.options.width;
            pvH = this.preview.win.options.height;
        }
        return {
            _meta: { type: 'panel-workbench', version: 1, exportedAt: new Date().toISOString() },
            data: this.editor.getObj(),
            schema: this.editor.getSchema(),
            layout: this.layout.exportLayout(),
            cells: this.excel ? this.excel.dumpCellData() : {},
            preview: (pvW != null && pvH != null) ? { w: pvW, h: pvH } : null,
        };
    }

    /** 从导出的工程还原（表格用底层赋值，避免加载时触发运算） */
    importProject(proj, opts = {}) {
        if (!proj) return false;
        // 顺序很关键：必须先把「数据总线(Excel)」和「编辑器数据」准备好，
        // 最后再 setDefs 触发成品窗口渲染 —— 否则预览首次渲染时 Excel 还是旧/初始值，
        // 控件就会显示成初始默认值（关掉再开因 Excel 残留上次值而“碰巧”正常）。
        if (proj.data) this.editor.setObj(proj.data, proj.schema || {});
        if (proj.cells && this.excel) {
            // 底层赋值：只恢复单元格快照，不立即计算，避免依赖未就绪报错
            this.excel.loadCellData(proj.cells, { recalc: !!opts.recalc });
        }
        if (proj.layout) this.layout.setDefs(proj.layout);
        // 还原时沿用保存的成品窗口尺寸（用户拖拽调整后的），而非固定初始尺寸。
        if (proj.preview && proj.preview.w && proj.preview.h && this.preview && this.preview.win) {
            this.preview.win.setSize(proj.preview.w, proj.preview.h);
            this._loadedPreviewSize = { w: proj.preview.w, h: proj.preview.h };
        } else {
            this._loadedPreviewSize = null;
        }
        return true;
    }

    // ==================== 面板（命名存档）：保存/打开/编辑/加载 ====================
    // 面板 = 一套完整的「数据 + schema + 布局 + 表格单元格」。
    // 两种持久化方式：
    //   ① 全局（global=true）：存入 localStorage（PanelWorkbench.PANEL_KEY），刷新页面不消失。
    //   ② 会话（global=false）：仅存内存（PanelWorkbench._sessionPanels），刷新页面即消失，
    //      但会随「画布 JSON」一起导出/加载（见 exportCanvasPanels / importCanvasPanels）。

    static PANEL_KEY = 'pw_panels_v1';
    /** 非全局面板的会话内存存储（刷新即清空）。结构与 localStorage 一致：{ name: proj } */
    static _sessionPanels = {};

    /** 把面板工程里的 cells 精简：删除「值空且公式空」的单元格，减小导出体积 */
    static compactProject(proj) {
        if (!proj || !proj.cells || typeof proj.cells !== 'object') return proj;
        const compacted = {};
        for (const [k, v] of Object.entries(proj.cells)) {
            if (!v) continue;
            const val = v.value;
            const hasVal = val !== '' && val !== null && val !== undefined;
            const hasFormula = !!(v.formula && String(v.formula).trim());
            if (hasVal || hasFormula) compacted[k] = { value: val, formula: v.formula || '' };
        }
        proj.cells = compacted;
        return proj;
    }

    /** 读取所有面板（localStorage 全局 + 会话内存），同名校验会话优先 */
    listPanels() {
        let ls = {};
        try { ls = JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}'); } catch (e) { ls = {}; }
        return Object.assign({}, ls, PanelWorkbench._sessionPanels);
    }

    /** 判断某面板名是否存在于指定存储（'global' | 'session' | 'any'） */
    static _hasPanel(name, where) {
        if (where === 'global' || where === 'any') {
            try {
                const ls = JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}');
                if (ls[name]) return true;
            } catch (e) {}
        }
        if (where === 'session' || where === 'any') {
            if (PanelWorkbench._sessionPanels[name]) return true;
        }
        return false;
    }

    /** 保存当前工作台为命名面板（覆盖同名）。
     * @param {string} name 面板名
     * @param {Object} [opts] { global:true } true=存 localStorage（刷新不消失），false=存会话内存（刷新消失，随画布 JSON 走）
     */
    savePanel(name, opts = {}) {
        name = (name || '').trim();
        if (!name) return { ok: false, msg: '面板名不能为空' };
        const global = opts.global !== false;   // 默认全局
        const proj = Object.assign(this.exportProject(), {
            _name: name, savedAt: new Date().toISOString(), global,
        });
        if (global) {
            let ls = {};
            try { ls = JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}'); } catch (e) { ls = {}; }
            ls[name] = proj;
            localStorage.setItem(PanelWorkbench.PANEL_KEY, JSON.stringify(ls));
            // 存为全局后，从会话内存移除同名（避免重复/歧义）
            delete PanelWorkbench._sessionPanels[name];
        } else {
            PanelWorkbench._sessionPanels[name] = proj;
        }
        return { ok: true, msg: `已保存面板「${name}」（${global ? '全局·刷新不消失' : '会话·随画布导出'}）` };
    }

    /** 打开/加载一个已保存面板（底层赋值，不触发运算，除非 recalc）。会话优先于全局。 */
    loadPanel(name, opts = {}) {
        const proj = PanelWorkbench._sessionPanels[name]
            || (() => { try { return JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}')[name]; } catch (e) { return null; } })();
        if (!proj) return { ok: false, msg: `面板「${name}」不存在` };
        this.importProject(proj, opts);
        return { ok: true, msg: `已加载面板「${name}」` };
    }

    /** 删除一个面板（会话 + 全局都尝试删） */
    deletePanel(name) {
        let existed = false;
        if (PanelWorkbench._sessionPanels[name]) { delete PanelWorkbench._sessionPanels[name]; existed = true; }
        try {
            const ls = JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}');
            if (ls[name]) { delete ls[name]; localStorage.setItem(PanelWorkbench.PANEL_KEY, JSON.stringify(ls)); existed = true; }
        } catch (e) {}
        return existed ? { ok: true, msg: `已删除面板「${name}」` } : { ok: false, msg: `面板「${name}」不存在` };
    }

    /** 导出面板给「画布 JSON」：只导出【会话】面板（global=false），不导出全局面板。
     * 全局面板存于 localStorage、刷新不消失，不应随画布 JSON 一起导出。 */
    static exportCanvasPanels() {
        return Object.values(PanelWorkbench._sessionPanels).map(p => {
            const c = JSON.parse(JSON.stringify(p));   // 深拷贝，避免外部改动污染
            c.global = false;                          // 会话面板标记
            return c;
        });
    }

    /** 从「画布 JSON」导入面板：按 global 标志写回对应存储（true→localStorage，false→会话内存） */
    static importCanvasPanels(arr) {
        if (!Array.isArray(arr)) return;
        // 画布 JSON 代表「完整面板集」：导入前清空会话内存（全局面板仍由 localStorage 合并保留）
        PanelWorkbench._sessionPanels = {};
        let ls = {};
        try { ls = JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}'); } catch (e) { ls = {}; }
        arr.forEach(p => {
            if (!p || !p._name) return;
            const proj = JSON.parse(JSON.stringify(p));
            const global = proj.global !== false;   // 默认全局
            if (global) {
                ls[proj._name] = proj;
                delete PanelWorkbench._sessionPanels[proj._name];
            } else {
                PanelWorkbench._sessionPanels[proj._name] = proj;
            }
        });
        localStorage.setItem(PanelWorkbench.PANEL_KEY, JSON.stringify(ls));
    }

    /** 重命名面板（先删旧再存新，保留内容） */
    renamePanel(oldName, newName) {
        oldName = (oldName || '').trim(); newName = (newName || '').trim();
        if (!oldName || !newName) return { ok: false, msg: '新旧名称都不能为空' };
        const all = this.listPanels();
        const proj = all[oldName];
        if (!proj) return { ok: false, msg: `面板「${oldName}」不存在` };
        delete all[oldName];
        proj._name = newName;
        all[newName] = proj;
        localStorage.setItem(PanelWorkbench.PANEL_KEY, JSON.stringify(all));
        return { ok: true, msg: `已重命名为「${newName}」` };
    }

    destroy() {
        this.preview && this.preview.destroy();
        this.layout && this.layout.destroy();
        this.editor && this.editor.destroy && this.editor.destroy();
        this.editorWin && this.editorWin.destroy();
        this.excelWin && this.excelWin.destroy();
        if (window.__workbench === this) window.__workbench = null;
    }
}

if (typeof window !== 'undefined') {
    window.PanelWorkbench = PanelWorkbench;
    /** 一键启动工作台（创建并显示全部 4 个窗口） */
    window.openPanelWorkbench = function (opts) {
        if (window.__workbench) {
            console.log('工作台已打开，可用 window.__workbench 访问');
            return window.__workbench;
        }
        window.__workbench = new PanelWorkbench(opts || {});
        console.log('四窗口工作台已启动：');
        console.log('  ① 控件定义窗口 — 点类型徽章配置控件与「关联单元格」，点 ➡️ 推送到布局');
        console.log('  ② 表格窗口 — 公式引擎，E1 已预置 =A1*2+B1');
        console.log('  ③ 布局窗口 — 拖拽/缩放摆放控件，支持栅格吸附');
        console.log('  ④ 成品窗口 — 实时渲染最终面板，拖滑块即触发公式重算');
        console.log('导出工程：window.__workbench.exportProject()');
        return window.__workbench;
    };
    /** 仅弹出面板菜单（不预先显示窗口，符合 dock 图标点击预期） */
    window.openPanelMenu = function () {
        const wb = window.openPanelWorkbench();   // 首次会创建 4 窗口，但下面立刻全部隐藏
        if (wb) wb._hideAllWindows();
        if (wb) wb._openPanelMenu();
        return wb;
    };
}
if (typeof module !== 'undefined') module.exports = PanelWorkbench;
