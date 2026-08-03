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
     */
    constructor(proj, opts = {}) {
        if (!proj) throw new Error('PanelRuntime: 缺少面板工程快照(proj)');
        this.name = (opts.name || proj._name || '面板').trim() || '面板';
        this.proj = proj;
        this.rows = opts.rows || 16;
        this.cols = opts.cols || 12;

        // 1) 独立数据总线（每个实例 new 一个，bindings/cellData 全部实例隔离）
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;';
        document.body.appendChild(host);
        this._excelHost = host;
        this.excel = new ExcelTable(host, this.rows, this.cols, { dark: true });
        // 运行态表格同样支持「右键填 SWD 变量」（编译出的面板若含 AXF 符号可用）
        if (typeof attachSwdVarMenu === 'function') attachSwdVarMenu(this.excel);

        // 2) 独立成品窗口（运行态真控件）
        this.preview = new PreviewWindow({
            excel: this.excel,
            onValueChange: (def, v) => {
                if (this.onValueChange) this.onValueChange(def, v, this);
            },
            windowOpts: {
                title: this.name,
                x: window.innerWidth / 2 - 230,
                y: 80,
                width: 460, height: 420,
                show: false,
            },
        });

        // 3) 用快照「刷」出数据 + 布局（底层赋值不触发运算，最后整体 recalc 一次）
        if (proj.cells) this.excel.loadCellData(proj.cells, { recalc: false });
        if (proj.layout) this.preview.setLayout(proj.layout);
        // 让公式/绑定全部生效：依赖图在 setLayout -> bindCell 时建立，这里跑一次整体重算
        if (typeof this.excel.recalculateAll === 'function') this.excel.recalculateAll();
        // 再同步一次控件显示（以表格当前值为准）
        this.preview.syncFromExcel();

        // 4) 注册到全局运行实例表
        PanelRuntime.registry.set(this.name, this);
    }

    /** 显示成品窗口（运行态入口） */
    show() {
        this.preview && this.preview.win && this.preview.win.show();
        if (this.preview && this.preview.win) this.preview.win.center();
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
        const defs = (this.preview && this.preview.defs) || [];
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
        if (this.preview) this.preview.destroy();
        if (this.excel) {
            // ExcelTable 自身没有 destroy，但绑定的 input 随 host 移除即可回收
        }
        if (this._excelHost && this._excelHost.parentNode) this._excelHost.remove();
        PanelRuntime.registry.delete(this.name);
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
        // 已运行则先销毁旧实例（可能指向被覆盖前的旧快照），再按最新 localStorage 重建，
        // 保证「保存覆盖/删除重建」后打开的是最新版，而不是残留的旧实例。
        const existing = PanelRuntime.registry.get(name);
        if (existing) { existing.destroy(); }

        const all = PanelRuntime._loadStore();
        const proj = all[name];
        if (!proj) { console.warn(`PanelRuntime: 面板「${name}」不存在`); return null; }

        const rt = new PanelRuntime(proj, Object.assign({ name }, opts));
        rt.show();
        return rt;
    }

    /**
     * 从工程快照直接编译运行（不依赖 localStorage，常用于「编辑完即运行」）。
     * @param {Object} proj exportProject() 风格快照
     * @param {Object} [opts] { name }
     */
    static run(proj, opts = {}) {
        const name = (opts.name || proj._name || '面板').trim() || '面板';
        const existing = PanelRuntime.registry.get(name);
        if (existing) { existing.destroy(); }   // 同名先替换，保证运行的是最新版
        const rt = new PanelRuntime(proj, Object.assign({ name }, opts));
        rt.show();
        return rt;
    }

    static _loadStore() {
        try { return JSON.parse(localStorage.getItem(PanelWorkbench.PANEL_KEY) || '{}'); }
        catch (e) { return {}; }
    }
}

// 多实例注册表：name -> PanelRuntime，用于「通知打开多个面板无干扰运行」
PanelRuntime.registry = new Map();

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
