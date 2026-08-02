/**
 * PreviewWindow —— 成品窗口（运行态）
 *
 * 接收布局窗口导出的 ControlDef[]（含 x/y/w/h），渲染出**真正可交互**的控件，
 * 并通过 excel.bindCell 与表格单元格双向联动：
 *   拖动滑块 -> 写入单元格 -> 表格公式重算 -> 依赖该结果的控件实时刷新
 *
 * 与 LayoutWindow 的区别：
 *   LayoutWindow 是设计态（只摆位置的占位块），PreviewWindow 是运行态（真控件）。
 * 布局一改，这里立刻重绘，所以「边调边看成品」是实时的。
 */
class PreviewWindow {
    /**
     * @param {Object} opts
     * @param {ExcelTable} opts.excel 数据总线
     * @param {Object} [opts.windowOpts] 透传 MacWindow
     * @param {Function} [opts.onValueChange] (def, value) => void
     */
    constructor(opts = {}) {
        this.excel = opts.excel || null;
        this.defs = [];
        this.instances = new Map(); // id -> { def, el, unbind, getVal, setVal }
        this.onValueChange = opts.onValueChange || null;
        // 显示选项（由布局窗口的勾选框控制，成品窗口只负责呈现）
        this.displayOptions = Object.assign(
            { name: true, border: true, value: true }, opts.displayOptions || {});

        PreviewWindow.injectStyles();

        this.win = new MacWindow(Object.assign({
            title: '成品窗口 · 实时预览',
            width: 460,
            height: 420,
            content: `
<div class="pw-shell">
    <div class="pw-stage"></div>
</div>`,
            resizable: true,
            dark: true,
        }, opts.windowOpts || {}));

        const root = this.win.contentElement;
        root.style.padding = '0';
        this.stage = root.querySelector('.pw-stage');
    }

    /**
     * 批量设置所有成品控件的呈现选项（全局入口，会覆盖各控件独立状态）
     * @param {Object} opts { name, border, value }
     */
    setDisplayOptions(opts) {
        Object.assign(this.displayOptions, opts || {});
        this.defs.forEach(d => { d.display = Object.assign({}, this.displayOptions); });
        this.render();
        return this;
    }

    static injectStyles() {
        if (document.getElementById('pw-styles')) return;
        const s = document.createElement('style');
        s.id = 'pw-styles';
        s.textContent = `
.pw-shell { display:flex; flex-direction:column; height:100%; background:#0f172a; color:#e2e8f0;
    font-family:system-ui,sans-serif; font-size:13px; }

/* 显示选项（由布局窗口勾选框控制，作用于成品控件块） */
/* 隐藏外框：去掉背景/边框/阴影/内边距，只留名称+控件 */
.pw-ctl.pw-no-border {
    background:transparent !important; border-color:transparent !important;
    box-shadow:none !important; padding:2px 4px; border-radius:4px;
}
.pw-ctl.pw-no-border.unbound { border-style:solid; }
/* 隐藏名称：连标题行一起隐藏 */
.pw-ctl.pw-no-name .pw-head { display:none !important; }
/* 隐藏值：不显示右侧当前数值 */
.pw-ctl.pw-no-value .pw-vl { display:none !important; }

.pw-stage { position:relative; flex:1; overflow:auto; padding:0; }
.pw-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    color:#475569; font-size:13px; text-align:center; padding:20px; }

.pw-ctl { position:absolute; box-sizing:border-box; background:#1e293b; border:1px solid #334155;
    border-radius:8px; padding:6px 9px; display:flex; flex-direction:column; justify-content:center;
    overflow:hidden; }
.pw-ctl .pw-head { display:flex; align-items:baseline; gap:6px; margin-bottom:4px; }
.pw-ctl .pw-lb { font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; flex:1; }
.pw-ctl .pw-vl { font-size:11px; font-family:monospace; color:#fbbf24; white-space:nowrap; }
.pw-ctl input[type=range] { width:100%; accent-color:#0ea5e9; margin:0; }
.pw-ctl input[type=text], .pw-ctl input[type=number], .pw-ctl select, .pw-ctl textarea {
    width:100%; box-sizing:border-box; background:#0f172a; border:1px solid #334155; color:#fff;
    border-radius:4px; padding:3px 6px; font-size:12px; outline:none; }
.pw-ctl input:focus, .pw-ctl select:focus, .pw-ctl textarea:focus { border-color:#0ea5e9; }
.pw-ctl input[type=checkbox] { accent-color:#0ea5e9; width:16px; height:16px; }
.pw-ctl input[type=color] { width:100%; height:24px; border:1px solid #334155; border-radius:4px;
    background:transparent; padding:0; cursor:pointer; }
.pw-ctl .pw-radio { display:flex; flex-wrap:wrap; gap:8px; }
.pw-ctl .pw-radio label { font-size:11px; display:flex; align-items:center; gap:3px; cursor:pointer; }
.pw-ctl.unbound { border-style:dashed; }
/* 按钮控件：成品窗口里占据整个控件块的巨大按钮，文字即名称 */
.pw-ctl .pw-action-btn {
    width:100%; height:100%; box-sizing:border-box;
    display:flex; align-items:center; justify-content:center;
    background:#2563eb; color:#fff; border:none; border-radius:6px;
    font-size:14px; font-weight:600; cursor:pointer; user-select:none;
    padding:6px 8px; transition:background .12s, transform .05s;
}
.pw-ctl .pw-action-btn:hover { background:#1d4ed8; }
.pw-ctl .pw-action-btn:active { transform:scale(.98); }
.pw-ctl .pw-action-btn.pw-flash { background:#16a34a; }
.pw-ctl.pw-no-border .pw-action-btn { border-radius:6px; }
/* 标签控件：成品里就是一行纯文字，垂直居中，不显示标题/边框 */
.pw-ctl.pw-type-label { background:transparent; border-color:transparent; box-shadow:none; padding:4px 8px;
    justify-content:center; }
.pw-ctl.pw-type-label .pw-label-text { font-size:15px; color:#e2e8f0; line-height:1.4; text-align:left;
    word-break:break-word; }
/* 多行文本：跟随布局窗口的缩放尺寸撑满控件块，而非固定大小居中 */
.pw-ctl.pw-type-textarea { justify-content:stretch; }
.pw-ctl.pw-type-textarea > div:not(.pw-head) { flex:1; display:flex; min-height:0; }
.pw-ctl.pw-type-textarea textarea { width:100%; height:100%; flex:1; box-sizing:border-box;
    resize:none; line-height:1.4; }
`;
        document.head.appendChild(s);
    }

    // ==================== 对外 API ====================

    /** 用布局窗口导出的定义重绘整个成品面板 */
    setLayout(defs) {
        this.defs = (defs || []).map(d => Object.assign({}, d));
        this.render();
        return this;
    }

    render() {
        this.clear(true);
        this.defs.forEach(d => this._renderControl(d));
        this._updateCount();
    }

    clear(silent = false) {
        this.instances.forEach(i => i.unbind && i.unbind());
        this.instances.clear();
        if (this.stage) this.stage.innerHTML = '';
        if (!silent) this._updateCount();
        return this;
    }

    /** 从表格拉取一次最新值刷新所有控件 */
    syncFromExcel() {
        if (!this.excel) return;
        this.instances.forEach(inst => {
            if (inst.def.cell && this.excel.hasCell(inst.def.cell)) {
                const v = this.excel.getCell(inst.def.cell);
                if (v !== undefined && v !== '') inst.setVal(v);
            }
        });
    }

    /** 读取当前所有控件值 */
    getValues() {
        const out = {};
        this.instances.forEach((inst, id) => { out[id] = inst.getVal(); });
        return out;
    }

    // ==================== 控件渲染 ====================

    _renderControl(def) {
        const disp = def.display || { name: true, border: true, value: true };
        const box = document.createElement('div');
        box.className = 'pw-ctl' + (def.cell ? '' : ' unbound') + (def.type ? ' pw-type-' + def.type : '');
        if (!disp.border) box.classList.add('pw-no-border');
        if (!disp.name)   box.classList.add('pw-no-name');
        if (!disp.value)  box.classList.add('pw-no-value');
        box.dataset.id = def.id;
        box.style.left = (def.x || 0) + 'px';
        box.style.top = (def.y || 0) + 'px';
        box.style.width = (def.w || 150) + 'px';
        box.style.height = (def.h || 56) + 'px';

        const type = def.type || 'text';

        // 标签控件：成品窗口里就是一行纯文字（value 即内容），
        // 不显示标题行/输入框/值。可绑定单元格随其变化。
        if (type === 'label') {
            box.classList.remove('unbound');
            const txt = document.createElement('div');
            txt.className = 'pw-label-text';
            txt.textContent = (def.value !== undefined && def.value !== '') ? def.value
                : (def.label || '');
            box.appendChild(txt);
            const getVal = () => txt.textContent;
            const setVal = (v) => { txt.textContent = (v === undefined || v === '') ? (def.label || '') : v; };
            let unbind = () => {};
            if (this.excel && def.cell && this.excel.hasCell(def.cell)) {
                const cur = this.excel.getCell(def.cell);
                if (cur !== undefined && cur !== '') txt.textContent = cur;
                unbind = this.excel.bindCell(def.cell, { get: getVal, set: setVal }, txt);
            }
            this.stage.appendChild(box);
            this.instances.set(def.id, { def, el: box, unbind, getVal, setVal });
            return box;
        }

        // 按钮控件：成品窗口里是一个占据整个控件块的「巨大按钮 + 名称」，
        // 不显示输入框/值。点击触发绑定表格的链式刷新。
        if (type === 'button') {
            box.classList.remove('unbound');
            const btn = document.createElement('button');
            btn.className = 'pw-btn pw-action-btn';
            btn.textContent = def.label || '按钮';
            btn.addEventListener('click', () => {
                let written = def.value;
                if (this.excel && def.cell && this.excel.hasCell(def.cell)) {
                    if (def.value !== undefined && def.value !== '') {
                        // 填了值：把值赋给绑定单元格，赋值操作会沿依赖链链式更新
                        this.excel.setCell(def.cell, def.value);
                    } else {
                        // 没填值：仅触发该单元格依赖链的链式刷新（重跑下游公式里的 JS / 请求），
                        // 不改动/不污染单元格本身。
                        if (typeof this.excel.refreshCell === 'function') this.excel.refreshCell(def.cell);
                    }
                } else if (!def.cell) {
                    console.warn('[按钮] 未配置关联单元格(cell)，点击无效');
                }
                if (this.onValueChange) this.onValueChange(def, written, this);
                btn.classList.add('pw-flash');
                setTimeout(() => btn.classList.remove('pw-flash'), 200);
            });
            box.appendChild(btn);
            const getVal = () => (def.value !== undefined ? def.value : '');
            const setVal = (v) => { if (v !== undefined) def.value = v; };
            this.stage.appendChild(box);
            this.instances.set(def.id, { def, el: box, unbind: () => {}, getVal, setVal });
            return box;
        }

        const head = document.createElement('div');
        head.className = 'pw-head';
        head.innerHTML = `<span class="pw-lb">${this._esc(def.label || def.id)}</span>
                          <span class="pw-vl"></span>`;
        const valSpan = head.querySelector('.pw-vl');
        box.appendChild(head);

        const body = document.createElement('div');
        box.appendChild(body);

        const unit = def.unit || '';
        // 写回表格：控件 -> 单元格 -> 公式重算 -> 其他控件刷新
        const commit = (v) => {
            if (this.excel && def.cell && this.excel.hasCell(def.cell)) {
                this.excel.setCell(def.cell, v);
            }
            if (this.onValueChange) this.onValueChange(def, v, this);
        };

        let getVal, setVal;
        switch (type) {
            case 'range': {
                const el = document.createElement('input');
                el.type = 'range';
                el.min = def.min !== undefined ? def.min : 0;
                el.max = def.max !== undefined ? def.max : 100;
                if (def.step !== undefined) el.step = def.step;
                el.value = this._initVal(def, el.min);
                valSpan.textContent = el.value + unit;
                el.addEventListener('input', () => {
                    valSpan.textContent = el.value + unit;
                    commit(parseFloat(el.value));
                });
                body.appendChild(el);
                getVal = () => parseFloat(el.value);
                setVal = (v) => { el.value = v; valSpan.textContent = v + unit; };
                break;
            }
            case 'number': {
                const el = document.createElement('input');
                el.type = 'number';
                if (def.min !== undefined) el.min = def.min;
                if (def.max !== undefined) el.max = def.max;
                if (def.step !== undefined) el.step = def.step;
                el.value = this._initVal(def, 0);
                el.addEventListener('input', () => commit(parseFloat(el.value) || 0));
                body.appendChild(el);
                getVal = () => parseFloat(el.value) || 0;
                setVal = (v) => { el.value = v; valSpan.textContent = (v !== undefined ? v : '') + unit; };
                break;
            }
            case 'checkbox': {
                const el = document.createElement('input');
                el.type = 'checkbox';
                el.checked = !!this._initVal(def, false);
                el.addEventListener('change', () => commit(el.checked ? 1 : 0));
                body.appendChild(el);
                getVal = () => (el.checked ? 1 : 0);
                setVal = (v) => { el.checked = !!v; };
                break;
            }
            case 'select': {
                const el = document.createElement('select');
                (def.options || []).forEach(o => {
                    const op = document.createElement('option');
                    op.value = o.value; op.textContent = o.label || o.value;
                    el.appendChild(op);
                });
                const iv = this._initVal(def, '');
                if (iv !== '' && iv !== undefined) el.value = iv;
                el.addEventListener('change', () => commit(el.value));
                body.appendChild(el);
                getVal = () => el.value;
                setVal = (v) => { el.value = v; };
                break;
            }
            case 'radio': {
                const wrap = document.createElement('div');
                wrap.className = 'pw-radio';
                const name = 'pw_' + def.id;
                const iv = this._initVal(def, '');
                (def.options || []).forEach(o => {
                    const lb = document.createElement('label');
                    const rd = document.createElement('input');
                    rd.type = 'radio'; rd.name = name; rd.value = o.value;
                    if (String(iv) === String(o.value)) rd.checked = true;
                    rd.addEventListener('change', () => { if (rd.checked) commit(rd.value); });
                    lb.appendChild(rd);
                    lb.appendChild(document.createTextNode(o.label || o.value));
                    wrap.appendChild(lb);
                });
                body.appendChild(wrap);
                getVal = () => (wrap.querySelector('input:checked') || {}).value;
                setVal = (v) => {
                    const t = wrap.querySelector(`input[value="${v}"]`);
                    if (t) t.checked = true;
                };
                break;
            }
            case 'color': {
                const el = document.createElement('input');
                el.type = 'color';
                el.value = this._initVal(def, '#3498db') || '#3498db';
                el.addEventListener('input', () => commit(el.value));
                body.appendChild(el);
                getVal = () => el.value;
                setVal = (v) => { if (v) el.value = v; };
                break;
            }
            case 'textarea': {
                const el = document.createElement('textarea');
                el.rows = def.rows || 2;
                el.value = this._initVal(def, '');
                el.addEventListener('input', () => commit(el.value));
                body.appendChild(el);
                getVal = () => el.value;
                setVal = (v) => { el.value = v === undefined ? '' : v; };
                break;
            }
            default: { // text / email / password / date
                const el = document.createElement('input');
                el.type = (type === 'date' || type === 'email' || type === 'password') ? type : 'text';
                if (def.placeholder) el.placeholder = def.placeholder;
                el.value = this._initVal(def, '');
                el.addEventListener('input', () => commit(el.value));
                body.appendChild(el);
                getVal = () => el.value;
                setVal = (v) => { el.value = v === undefined ? '' : v; };
            }
        }

        // 除 range/number 外，其余控件的取值已由自身控件（输入框 / 勾选 / 下拉 / 颜色等）
        // 直接表达，标题行右侧的「值」位是多余占位，统一隐藏，避免通用结构强加空值
        // （含 password 明文泄露、textarea 长文本挤占等隐患）。
        if (type !== 'range' && type !== 'number') {
            if (valSpan) valSpan.style.display = 'none';
        }

        // 与 Excel 建立双向绑定
        let unbind = () => {};
        if (this.excel && def.cell && this.excel.hasCell(def.cell)) {
            const cur = this.excel.getCell(def.cell);
            if (cur === undefined || cur === '') {
                this.excel.setCell(def.cell, getVal());   // 用控件初值播种单元格
            } else {
                setVal(cur);                              // 单元格已有值则以表格为准
            }
            unbind = this.excel.bindCell(def.cell, { get: getVal, set: setVal }, box);
        }

        this.stage.appendChild(box);
        this.instances.set(def.id, { def, el: box, unbind, getVal, setVal });
        return box;
    }

    _initVal(def, fallback) {
        if (this.excel && def.cell && this.excel.hasCell(def.cell)) {
            const v = this.excel.getCell(def.cell);
            if (v !== undefined && v !== '') return v;
        }
        return def.value !== undefined && def.value !== null ? def.value : fallback;
    }

    _updateCount() {
        if (this.countEl) this.countEl.textContent = `${this.instances.size} 个控件`;
        let empty = this.stage.querySelector('.pw-empty');
        if (this.instances.size === 0) {
            if (!empty) {
                empty = document.createElement('div');
                empty.className = 'pw-empty';
                empty.textContent = '成品预览：在布局窗口摆好控件后，这里会实时显示可交互的最终面板';
                this.stage.appendChild(empty);
            }
        } else if (empty) {
            empty.remove();
        }
    }

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    destroy() {
        this.clear(true);
        if (this.win) this.win.destroy();
    }
}

if (typeof window !== 'undefined') window.PreviewWindow = PreviewWindow;
if (typeof module !== 'undefined') module.exports = PreviewWindow;
