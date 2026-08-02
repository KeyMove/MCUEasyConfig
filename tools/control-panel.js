/**
 * ControlPanel —— 自定义操作面板中枢
 *
 * 打通 「定义控件 -> 关联表格 -> 控件布局」 这条主线：
 *   - 控件定义 (ControlDef) 描述一个控件的类型、标签、绑定单元格、范围等；
 *   - 每个控件通过 excel.bindCell(cellKey, ...) 与 Excel 单元格双向联动：
 *       用户拖动滑块  -> 写回单元格 -> 触发表格公式重算 -> 其他依赖单元格/控件自动刷新
 *       单元格被公式更新 -> 反向刷新控件显示
 *   - 控件放置在一个 MacWindow 浮窗里，可拖拽、可缩放；
 *   - layout='absolute' 时控件可在内容区自由拖动摆放，实现高度可定制布局。
 *
 * 这是为后续所有「自定义面板」打地基的通用组件。
 */
class ControlPanel {
    /**
     * @param {Object} opts
     * @param {ExcelTable} opts.excel 已实例化的 ExcelTable（数据总线）
     * @param {Object} [opts.windowOpts] 透传给 MacWindow 的选项
     * @param {string} [opts.title] 窗口标题
     */
    constructor(opts = {}) {
        this.excel = opts.excel || null;
        this.title = opts.title || '自定义操作面板';
        this.defs = [];                 // 控件定义数组
        this.instances = new Map();     // id -> { def, el, unbind } 已挂载实例
        this.layout = opts.layout || 'grid'; // 'grid' | 'absolute'
        this.onChange = opts.onChange || null;

        // 创建 MacWindow 容器
        this.win = new MacWindow(Object.assign({
            title: this.title,
            width: 360,
            height: 320,
            content: '<div class="cp-root"></div>',
            resizable: true,
            dark: true,
        }, opts.windowOpts || {}));

        this.root = this.win.contentElement.querySelector('.cp-root');
        this.root.classList.add(this.layout === 'absolute' ? 'cp-absolute' : 'cp-grid');
        ControlPanel.injectStyles();

        // 绝对布局下的拖拽状态
        this._drag = null;
    }

    /** 注入一次样式 */
    static injectStyles() {
        if (document.getElementById('cp-styles')) return;
        const s = document.createElement('style');
        s.id = 'cp-styles';
        s.textContent = `
.cp-root { padding:10px; }
.cp-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px 14px; align-items:start; }
.cp-grid .cp-item { min-width:0; }
.cp-absolute { position:relative; min-height:100%; }
.cp-absolute .cp-item { position:absolute; width:150px; cursor:move; }
.cp-item { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:8px 10px; box-sizing:border-box; }
.cp-item .cp-label { font-size:11px; color:#94a3b8; margin-bottom:4px; display:flex; justify-content:space-between; gap:6px; }
.cp-item .cp-cell { color:#38bdf8; font-family:monospace; }
.cp-item .cp-val { color:#fbbf24; font-family:monospace; min-width:36px; text-align:right; }
.cp-item input[type=range]{ width:100%; accent-color:#0ea5e9; }
.cp-item input[type=number], .cp-item select { width:100%; box-sizing:border-box; background:#0f172a; border:1px solid #334155; color:#fff; border-radius:4px; padding:3px 6px; font-size:13px; }
.cp-item input[type=checkbox]{ accent-color:#0ea5e9; width:16px; height:16px; }
.cp-abs-bar { display:none; }
.cp-absolute .cp-item .cp-handle { position:absolute; top:2px; right:4px; color:#64748b; font-size:10px; }
`;
        document.head.appendChild(s);
    }

    /** 设置/覆盖控件定义并重建面板 */
    setDefs(defs) {
        this.defs = defs || [];
        this.render();
        return this;
    }

    /**
     * 新增一个控件定义
     * @param {Object} def { id, type, label, cell, min, max, step, unit, options, x, y }
     *   type: 'range'|'number'|'text'|'select'|'checkbox'
     *   cell: 绑定的 Excel 单元格键，如 'A1'
     */
    addDef(def) {
        if (!def.id) def.id = 'ctl_' + Math.random().toString(36).slice(2, 8);
        this.defs.push(def);
        this._renderOne(def);
        return this;
    }

    /** 清空所有控件 */
    clear() {
        this.instances.forEach(i => i.unbind && i.unbind());
        this.instances.clear();
        if (this.root) this.root.innerHTML = '';
        return this;
    }

    /** 全量重建 */
    render() {
        this.clear();
        this.defs.forEach(d => this._renderOne(d));
    }

    _renderOne(def) {
        if (this.instances.has(def.id)) {
            const old = this.instances.get(def.id);
            old.unbind && old.unbind();
            old.el.remove();
            this.instances.delete(def.id);
        }
        if (!this.excel) {
            console.warn('ControlPanel: 未绑定 excel，控件仅本地显示不联动表格');
        }
        const item = document.createElement('div');
        item.className = 'cp-item';
        item.dataset.id = def.id;
        if (this.layout === 'absolute') {
            item.style.left = (def.x || 10) + 'px';
            item.style.top = (def.y || 10) + 'px';
        }

        // 标签行：名称 + 绑定单元格 + 当前值
        const label = document.createElement('div');
        label.className = 'cp-label';
        label.innerHTML = `<span>${def.label || def.id}</span>` +
            (def.cell ? `<span class="cp-cell">${def.cell}</span>` : '') +
            `<span class="cp-val"></span>`;
        const valSpan = label.querySelector('.cp-val');
        item.appendChild(label);

        // 控件主体
        const body = document.createElement('div');
        item.appendChild(body);

        let getVal = () => 0, setVal = (v) => {}, inputEl = null;

        const t = def.type || 'number';
        if (t === 'range' || t === 'number') {
            inputEl = document.createElement('input');
            inputEl.type = t === 'range' ? 'range' : 'number';
            if (def.min !== undefined) inputEl.min = def.min;
            if (def.max !== undefined) inputEl.max = def.max;
            if (def.step !== undefined) inputEl.step = def.step;
            const init = this.excel && def.cell ? this.excel.getCell(def.cell) : (def.value !== undefined ? def.value : (def.min || 0));
            inputEl.value = init === undefined || init === '' ? (def.min || 0) : init;
            inputEl.addEventListener('input', () => {
                const v = parseFloat(inputEl.value);
                valSpan.textContent = inputEl.value + (def.unit || '');
                if (this.excel && def.cell) this.excel.setCell(def.cell, v);
                this._emit(def, v);
            });
            body.appendChild(inputEl);
            getVal = () => parseFloat(inputEl.value);
            setVal = (v) => {
                inputEl.value = v;
                valSpan.textContent = v + (def.unit || '');
            };
        } else if (t === 'select') {
            inputEl = document.createElement('select');
            (def.options || []).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.value; opt.textContent = o.label || o.value;
                inputEl.appendChild(opt);
            });
            const init = this.excel && def.cell ? this.excel.getCell(def.cell) : def.value;
            if (init !== undefined && init !== '') inputEl.value = init;
            inputEl.addEventListener('change', () => {
                if (this.excel && def.cell) this.excel.setCell(def.cell, inputEl.value);
                this._emit(def, inputEl.value);
            });
            body.appendChild(inputEl);
            getVal = () => inputEl.value;
            setVal = (v) => { inputEl.value = v; };
        } else if (t === 'checkbox') {
            inputEl = document.createElement('input');
            inputEl.type = 'checkbox';
            const init = this.excel && def.cell ? this.excel.getCell(def.cell) : def.value;
            inputEl.checked = !!init;
            inputEl.addEventListener('change', () => {
                if (this.excel && def.cell) this.excel.setCell(def.cell, inputEl.checked);
                this._emit(def, inputEl.checked);
            });
            body.appendChild(inputEl);
            getVal = () => inputEl.checked;
            setVal = (v) => { inputEl.checked = !!v; };
        } else { // text
            inputEl = document.createElement('input');
            inputEl.type = 'text';
            const init = this.excel && def.cell ? this.excel.getCell(def.cell) : (def.value || '');
            inputEl.value = init === undefined ? '' : init;
            inputEl.addEventListener('input', () => {
                if (this.excel && def.cell) this.excel.setCell(def.cell, inputEl.value);
                this._emit(def, inputEl.value);
            });
            body.appendChild(inputEl);
            getVal = () => inputEl.value;
            setVal = (v) => { inputEl.value = v; };
        }

        // 绑定到 Excel：表格 -> 控件 反向同步
        let unbind = () => {};
        if (this.excel && def.cell) {
            // 初始化单元格：若为空则写入控件初值，使公式能引用
            if (this.excel.getCell(def.cell) === undefined || this.excel.getCell(def.cell) === '') {
                this.excel.setCell(def.cell, getVal());
            }
            unbind = this.excel.bindCell(def.cell, { get: getVal, set: setVal }, item);
        }

        this.root.appendChild(item);
        this.instances.set(def.id, { def, el: item, unbind, getVal, setVal });
        valSpan.textContent = (inputEl.value !== undefined ? inputEl.value : '') + (def.unit || '');

        if (this.layout === 'absolute') this._enableDrag(item, def);
        return item;
    }

    /** 绝对布局：拖动控件改变位置（仅改变面板内摆位，不做栅格吸附） */
    _enableDrag(item, def) {
        item.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; // 不抢占控件操作
            e.preventDefault();
            const rect = item.getBoundingClientRect();
            this._drag = {
                item, def,
                offX: e.clientX - rect.left,
                offY: e.clientY - rect.top,
            };
            const move = (ev) => {
                if (!this._drag) return;
                const rootRect = this.root.getBoundingClientRect();
                let x = ev.clientX - rootRect.left - this._drag.offX;
                let y = ev.clientY - rootRect.top - this._drag.offY;
                x = Math.max(0, x); y = Math.max(0, y);
                item.style.left = x + 'px';
                item.style.top = y + 'px';
                this._drag.def.x = x; this._drag.def.y = y;
            };
            const up = () => {
                this._drag = null;
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    /** 控件值变化回调（用户操作或表格回推均可触发） */
    _emit(def, value) {
        if (this.onChange) this.onChange(def, value, this);
    }

    /** 导出当前布局/定义，便于持久化与移植 */
    exportDefs() {
        return this.defs.map(d => Object.assign({}, d));
    }

    /** 设置某个控件的值（编程方式） */
    setValue(id, v) {
        const inst = this.instances.get(id);
        if (inst && inst.setVal) inst.setVal(v);
        if (this.excel && inst && inst.def.cell) this.excel.setCell(inst.def.cell, v);
    }

    /** 销毁面板与所有绑定 */
    destroy() {
        this.clear();
        // MacWindow 提供的是 destroy()，兼容性写法
        if (this.win) {
            if (typeof this.win.destroy === 'function') this.win.destroy();
            else if (typeof this.win.close === 'function') this.win.close();
        }
    }
}

// 同时在全局挂上，方便其它脚本（index.html / main.js）直接 new
if (typeof window !== 'undefined') window.ControlPanel = ControlPanel;
if (typeof module !== 'undefined') module.exports = ControlPanel;
