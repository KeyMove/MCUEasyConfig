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
    position: fixed; z-index: 2000; width: 320px; max-height: 70vh; overflow: auto;
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
.pw-panel-menu .ppm-btn { background: #2563eb; color: #fff; border: none; border-radius: 5px;
    padding: 5px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }
.pw-panel-menu .ppm-btn:hover { background: #1d4ed8; }
.pw-panel-menu .ppm-list { display: flex; flex-direction: column; gap: 4px; }
.pw-panel-menu .ppm-empty { color: #64748b; text-align: center; padding: 14px 0; }
.pw-panel-menu .ppm-item { display: flex; align-items: center; justify-content: space-between;
    background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 6px 8px; gap: 8px; }
.pw-panel-menu .ppm-item-name { cursor: pointer; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pw-panel-menu .ppm-item-name:hover { color: #7dd3fc; }
.pw-panel-menu .ppm-item-actions { display: flex; gap: 4px; }
.pw-panel-menu .ppm-mini { background: #334155; color: #e2e8f0; border: none; border-radius: 4px;
    padding: 3px 7px; font-size: 11px; cursor: pointer; }
.pw-panel-menu .ppm-mini:hover { background: #475569; }
.pw-panel-menu .ppm-del:hover { background: #b91c1c; }
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
                <button class="ppm-btn ppm-save">保存当前</button>
            </div>
            <div class="ppm-list"></div>
            <div class="ppm-hint">点面板名＝直接打开成品 · 点 ✎ ＝打开并编辑</div>
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
            listEl.innerHTML = names.map(n => `
                <div class="ppm-item" data-name="${this._escAttr(n)}">
                    <span class="ppm-item-name" title="点击直接打开成品面板">${this._escHtml(n)}</span>
                    <span class="ppm-item-actions">
                        <button class="ppm-mini ppm-edit" title="打开并编辑">✎</button>
                        <button class="ppm-mini ppm-del" title="删除">🗑</button>
                    </span>
                </div>`).join('');
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
            const r = this.savePanel(name);
            this._ppmToast(menu, r.msg);
            renderList();
        });

        // 列表内事件（打开成品 / 编辑 / 删除）
        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.ppm-item');
            if (!item) return;
            const name = item.dataset.name;
            if (e.target.classList.contains('ppm-del')) {
                const r = this.deletePanel(name);
                this._ppmToast(menu, r.msg);
                renderList();
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
        if (this.preview && this.preview.win) { this.preview.win.setSize(p.w, p.h); this.preview.win.setPosition(p.preview.x, p.preview.y); }
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

    // ==================== ② 表格窗口 ====================
    _createExcelWindow(x, y, w, h) {
        this.excelWin = new MacWindow({
            title: '表格窗口 · 公式引擎（数据总线）',
            width: w, height: h, x, y,
            content: '<div class="wb-excel-host"></div>',
            resizable: true, dark: true,
        });
        const host = this.excelWin.contentElement.querySelector('.wb-excel-host');
        this.excelWin.contentElement.style.padding = '0';
        // 滚动交给 ExcelTable 内部的 .excel-table-container，外层 host 不重复出现滚动条
        host.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        this.excel = new ExcelTable(host, this.opts.rows || 16, this.opts.cols || 12, { dark: true });
    }

    // ==================== ④ 成品窗口 ====================
    _createPreviewWindow(x, y, w, h) {
        this.preview = new PreviewWindow({
            excel: this.excel,
            windowOpts: { x, y, width: w, height: h },
        });
    }

    // ==================== ③ 布局窗口 ====================
    _createLayoutWindow(x, y, w, h) {
        this.layout = new LayoutWindow({
            windowOpts: { x, y, width: w, height: h },
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
        return {
            _meta: { type: 'panel-workbench', version: 1, exportedAt: new Date().toISOString() },
            data: this.editor.getObj(),
            schema: this.editor.getSchema(),
            layout: this.layout.exportLayout(),
            cells: this.excel ? this.excel.dumpCellData() : {},
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
        return true;
    }

    // ==================== 面板（命名存档）：保存/打开/编辑/加载 ====================
    // 面板 = 一套完整的「数据 + schema + 布局 + 表格单元格」，存于 localStorage。

    static PANEL_KEY = 'pw_panels_v1';

    /** 读取所有已保存面板名 -> 元信息 */
    listPanels() {
        try {
            return JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}');
        } catch (e) { return {}; }
    }

    /** 保存当前工作台为命名面板（覆盖同名） */
    savePanel(name) {
        name = (name || '').trim();
        if (!name) return { ok: false, msg: '面板名不能为空' };
        const all = this.listPanels();
        all[name] = Object.assign(this.exportProject(), {
            _name: name, savedAt: new Date().toISOString(),
        });
        localStorage.setItem(PanelWorkbench.PANEL_KEY, JSON.stringify(all));
        return { ok: true, msg: `已保存面板「${name}」` };
    }

    /** 打开/加载一个已保存面板（底层赋值，不触发运算，除非 recalc） */
    loadPanel(name, opts = {}) {
        const all = this.listPanels();
        const proj = all[name];
        if (!proj) return { ok: false, msg: `面板「${name}」不存在` };
        this.importProject(proj, opts);
        return { ok: true, msg: `已加载面板「${name}」` };
    }

    /** 删除一个面板 */
    deletePanel(name) {
        const all = this.listPanels();
        if (!all[name]) return { ok: false, msg: `面板「${name}」不存在` };
        delete all[name];
        localStorage.setItem(PanelWorkbench.PANEL_KEY, JSON.stringify(all));
        return { ok: true, msg: `已删除面板「${name}」` };
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
