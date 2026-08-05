/**
 * PanelRuntime —— 面板「编译态」运行实例（单页应用式独立运行）
 *
 * 设计目标（见重大更新需求）：
 *   - 编辑态仍用老的四窗口工作台（PanelWorkbench 单例，负责设计/保存）。
 *   - 设计完成后，把面板「编译」成独立运行的单页应用：每个实例自带一套
 *     ExcelTable（数据总线）+ PreviewWindow（成品控件），**互不共享任何状态**，
 *     因此可以同时打开多个面板而无干扰地并行运行。
 *
 * 与 PanelWorkbench 的区别：
 *   - PanelWorkbench：设计态，4 窗口联动，单例（window.__workbench）。
 *   - PanelRuntime：运行态，每个面板 = 1 个独立 ExcelTable + 1 个 PreviewWindow，
 *     可多实例并存。控件操作只影响自己那套 Excel，不会污染其它实例。
 *
 * 数据来源：PanelWorkbench.exportProject() 导出的快照
 *   { _meta, data, schema, layout, cells }
 */
class PanelRuntime {
    /**
     * @param {Object} proj  exportProject() 风格的快照（data/schema/layout/cells）
     * @param {Object} [opts]
     * @param {string} [opts.name] 实例显示名（用于窗口标题 & 注册表键）
     * @param {number} [opts.rows=16]
     * @param {number} [opts.cols=12]
     * @param {boolean} [opts.center=true] 成品窗口是否居中
     * @param {boolean} [opts.headless=false] 无头模式：仅用 Excel 数据引擎，不创建任何 DOM/
     *        成品窗口，可作为菜单基础组件被无 UI 调用（如取 getDefines() 投射 C 宏）。
     *        需要显示成品时再调用 attachDOM() 关联前端。
     */
    constructor(proj, opts = {}) {
        if (!proj) throw new Error('PanelRuntime: 缺少面板工程快照(proj)');
        this.name = (opts.name || proj._name || '面板').trim() || '面板';
        // 唯一实例 id（区别于 name）：注册表按 id 存放，使同名面板也可多开并存。
        PanelRuntime._seq = (PanelRuntime._seq || 0) + 1;
        this.id = 'rt_' + PanelRuntime._seq;
        // 同名序号：类 Windows 文件重命名——扫描当前已运行的同名实例占用的序号，
        // 从 1 开始取最小未占用的正整数（关掉一个后该空缺会被复用，不会无限自增）。
        const used = new Set();
        PanelRuntime.registry.forEach(rt => { if (rt && rt.name === this.name && rt._index) used.add(rt._index); });
        let idx = 1;
        while (used.has(idx)) idx++;
        this._index = idx;
        this.proj = proj;
        this.rows = opts.rows || 16;
        this.cols = opts.cols || 12;
        this.headless = !!opts.headless;
        // 初始位置（如右键点坐标）：设置后窗口不居中，直接落在该位置（含视口边界保护）
        this._initX = (typeof opts.x === 'number') ? opts.x : null;
        this._initY = (typeof opts.y === 'number') ? opts.y : null;

        // 1) 独立数据总线（每个实例 new 一个，bindings/cellData 全部实例隔离）
        //    无头模式：用 headless:true 的 ExcelTable，不创建 DOM/样式/定时器，纯数据引擎。
        if (this.headless) {
            this.excel = new ExcelTable(null, this.rows, this.cols, { headless: true });
        } else {
            const host = document.createElement('div');
            host.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;';
            document.body.appendChild(host);
            this._excelHost = host;
            this.excel = new ExcelTable(host, this.rows, this.cols, { dark: true });
            // 运行态表格同样支持「右键填 SWD 变量」（编译出的面板若含 AXF 符号可用）
            if (typeof attachSwdVarMenu === 'function') attachSwdVarMenu(this.excel);
        }

        // 2) 成品窗口（运行态真控件）：无头模式暂不创建，后续 attachDOM() 时再建
        this.preview = null;
        // 控件定义（defs）：无论是否无头都从快照布局提取，供 getDefines() 投射 C 宏
        // （无头无 PreviewWindow，但 layout 里已含 define 控件的 macroName/cell/defValue）。
        this.defs = Array.isArray(proj.layout) ? proj.layout.slice() : [];
        if (!this.headless) {
            this._buildPreview();
        }

        // 3) 用快照「刷」出数据 + 布局（底层赋值不触发运算，最后整体 recalc 一次）
        if (proj.cells) this.excel.loadCellData(proj.cells, { recalc: false });
        if (!this.headless && proj.layout) this.preview.setLayout(proj.layout);
        // 让公式/绑定全部生效：依赖图在 setLayout -> bindCell 时建立，这里跑一次整体重算
        if (typeof this.excel.recalculateAll === 'function') this.excel.recalculateAll();
        // 再同步一次控件显示（以表格当前值为准）——无头无控件，跳过
        if (!this.headless && this.preview) this.preview.syncFromExcel();

        // 4) 注册到全局运行实例表（按唯一 id，支持同名多开）
        PanelRuntime.registry.set(this.id, this);
    }

    /** 构建成品窗口（从快照布局渲染真控件） */
    _buildPreview() {
        // 沿用保存的成品窗口尺寸（用户拖拽调整后的），而非固定 460x420。
        const saved = (this.proj && this.proj.preview) || null;
        const w = (saved && saved.w) ? saved.w : 460;
        const h = (saved && saved.h) ? saved.h : 420;
        // 窗口标题：同名多开时显示「#n」序号，便于区分
        const title = (this._index > 1) ? `${this.name} #${this._index}` : this.name;
        // 未指定初始位置（非右键跟随）时，按同名序号错位偏移，避免多开窗口完全重叠
        const offset = (this._index - 1) * 28;
        const x = (this._initX != null) ? this._initX
            : Math.min(window.innerWidth - w, Math.max(0, window.innerWidth / 2 - w / 2 + offset));
        const y = (this._initY != null) ? this._initY
            : Math.min(window.innerHeight - h, Math.max(0, window.innerHeight / 2 - h / 2 + offset));
        this.preview = new PreviewWindow({
            excel: this.excel,
            onValueChange: (def, v) => {
                if (this.onValueChange) this.onValueChange(def, v, this);
            },
            windowOpts: {
                title,
                x, y,
                width: w, height: h,
                show: false,
            },
        });
        // 关闭运行实例窗口时真正释放本实例（从 registry 移除），使同名序号可被后续复用，
        // 避免窗口关掉后 registry 泄漏导致下次运行序号越开越大。
        if (this.preview.win) {
            const self = this;
            this.preview.win.onWindowClose = () => { self.destroy(); };
        }
        if (this.proj && this.proj.layout) this.preview.setLayout(this.proj.layout);
        this.preview.syncFromExcel();
        return this.preview;
    }

    /**
     * 无头实例关联前端：把 headless 的 Excel 数据引擎挂上真实 DOM，并创建成品窗口。
     * 无头期已写入的单元格数据/公式/依赖图会被保留（addRows 仅替换 input 镜像）。
     * @param {Object} [opts] { attachContainer } 仅用于 ExcelTable.attachDOM（通常离屏即可）
     */
    attachDOM(opts = {}) {
        if (!this.headless) return this; // 已非无头，无需再挂
        this.headless = false;
        // 先给 Excel 关联前端（建 DOM、启动 TIMER）
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;';
        document.body.appendChild(host);
        this._excelHost = host;
        this.excel.attachDOM(host, { dark: true });
        if (typeof attachSwdVarMenu === 'function') attachSwdVarMenu(this.excel);
        // 再建成品窗口（布局/重算已在构造期完成，这里直接渲染）
        this._buildPreview();
        return this;
    }

    /** 显示成品窗口（运行态入口） */
    show() {
        this.preview && this.preview.win && this.preview.win.show();
        if (this.preview && this.preview.win) {
            // 窗口位置已由 _buildPreview 按「右键坐标 / 多开错位」算好，
            // 直接落到该坐标并做视口边界保护（不再强制 center，避免覆盖前一个同名实例）。
            const win = this.preview.win;
            const ww = win.options.width, wh = win.options.height;
            const vw = window.innerWidth, vh = window.innerHeight;
            let x = win.options.x, y = win.options.y;
            if (x + ww > vw) x = Math.max(0, vw - ww);
            if (y + wh > vh) y = Math.max(0, vh - wh);
            if (x < 0) x = 0;
            if (y < 0) y = 0;
            win.setPosition(x, y);
        }
        return this;
    }

    hide() {
        this.preview && this.preview.win && this.preview.win.hide();
        return this;
    }

    setTitle(t) {
        this.name = t || this.name;
        if (this.preview && this.preview.win) this.preview.win.setTitle(this.name);
        return this;
    }

    /** 读取当前所有运行态控件值 */
    getValues() { return this.preview ? this.preview.getValues() : {}; }

    /** 向某单元格写入值（外部通知入口：其它面板/通讯模块可通过此驱动本实例） */
    setCell(key, value) {
        if (this.excel && this.excel.hasCell(key)) this.excel.setCell(key, value);
        return this;
    }

    getCell(key) { return this.excel ? this.excel.getCell(key) : undefined; }

    /**
     * 收集本面板中所有「define 投射控件」为全局宏映射，供 C 编译器注入。
     * - 宏名：控件 macroName，回退到 label（节点名）。
     * - 宏体：优先取绑定单元格的实时值（可由其它控件的 JS 公式算出），
     *         回退到控件配置里的 defValue。
     * 返回 { 'MACRO': 'body', 'FUNC(x)': 'body' }，可直接赋给 comper.globalDefines。
     */
    getDefines() {
        const defines = {};
        const defs = this.defs || [];
        defs.forEach(d => {
            if (d.type !== 'define') return;
            let name = (d.macroName || d.label || '').trim();
            if (!name) return;
            // 校验宏名合法性：函数式签名「NAME(args)」校验 NAME 部分；普通宏名校验整体。
            // 仅允许 ASCII 字母/数字/下划线（首字符非数字），避免注入非法 C 标识符。
            const m = name.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)$/);
            if (m) {
                name = m[1].toUpperCase() + '(' + m[2] + ')';
            } else if (/^[A-Za-z_]\w*$/.test(name)) {
                name = name.toUpperCase();
            } else {
                console.warn(`[define] 忽略非法宏名「${name}」，请使用 ASCII 标识符（如 SCALE / CLAMP(x)）`);
                return;
            }
            let body = '';
            if (this.excel && d.cell && this.excel.hasCell(d.cell)) {
                const v = this.excel.getCell(d.cell);
                if (v !== undefined && v !== '') body = String(v);
            }
            if (body === '' && d.defValue !== undefined) body = String(d.defValue);
            defines[name] = body;
        });
        return defines;
    }

    /**
     * 把面板的 define 投射灌入一个 Comper/Preprocessor 实例的全局宏表。
     * @param {Object} comper 拥有 .globalDefines 字段的编译对象
     * @returns {Object} 本次注入的宏映射
     */
    applyDefinesTo(comper) {
        if (!comper) return {};
        const defs = this.getDefines();
        comper.globalDefines = Object.assign({}, comper.globalDefines || {}, defs);
        return defs;
    }

    /** 销毁本运行实例，释放 DOM 与绑定，并从注册表移除 */
    destroy() {
        if (this._destroyed) return this;
        this._destroyed = true;
        if (this.preview) this.preview.destroy();
        if (this.excel && typeof this.excel.destroy === 'function') this.excel.destroy();
        if (this._excelHost && this._excelHost.parentNode) this._excelHost.remove();
        PanelRuntime.registry.delete(this.id);
        return this;
    }

    // ==================== 静态：从已保存面板编译运行 ====================

    /** 列出当前所有运行中的实例名 */
    static listRunning() { return Array.from(PanelRuntime.registry.keys()); }

    /**
     * 从 localStorage 已存面板（pw_panels_v1）加载并编译运行。
     * @param {string} name 面板名
     * @param {Object} [opts]
     * @returns {PanelRuntime|null}
     */
    static openCompiledPanel(name, opts = {}) {
        name = (name || '').trim();
        if (!name) return null;
        // 支持同名多开：不再因同名销毁旧实例，直接新建一份独立实例。

        // 会话面板（global=false）只存在内存 PanelWorkbench._sessionPanels，不写 localStorage，
        // 所以先查 localStorage，查不到再回退会话内存（会话优先于全局，与 loadPanel 保持一致）。
        let proj = PanelRuntime._loadStore()[name];
        if (!proj && typeof PanelWorkbench !== 'undefined' && PanelWorkbench._sessionPanels) {
            proj = PanelWorkbench._sessionPanels[name] || null;
        }
        if (!proj) { console.warn(`PanelRuntime: 面板「${name}」不存在`); return null; }

        const rt = new PanelRuntime(proj, Object.assign({ name }, opts));
        if (!rt.headless) rt.show();
        return rt;
    }

    /**
     * 从工程快照直接编译运行（不依赖 localStorage，常用于「编辑完即运行」）。
     * @param {Object} proj exportProject() 风格快照
     * @param {Object} [opts] { name }
     */
    static run(proj, opts = {}) {
        const name = (opts.name || proj._name || '面板').trim() || '面板';
        // 支持同名多开：每次都新建独立实例，不再替换旧实例。
        const rt = new PanelRuntime(proj, Object.assign({ name }, opts));
        if (!rt.headless) rt.show();
        return rt;
    }

    static _loadStore() {
        try { return JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}'); }
        catch (e) { return {}; }
    }
}

// 多实例注册表：id -> PanelRuntime，用于「通知打开多个面板无干扰运行」
PanelRuntime.registry = new Map();
// 实例唯一序号（仅用于生成唯一 id，标题序号由运行时实时统计同名数得到）
PanelRuntime._seq = 0;

if (typeof window !== 'undefined') {
    window.PanelRuntime = PanelRuntime;
    /** 便捷入口：从已保存面板名编译运行 */
    window.openCompiledPanel = function (name, opts) {
        return PanelRuntime.openCompiledPanel(name, opts);
    };
    /** 便捷入口：从工程快照运行 */
    window.runPanelProject = function (proj, opts) {
        return PanelRuntime.run(proj, opts);
    };
}
if (typeof module !== 'undefined') module.exports = PanelRuntime;
