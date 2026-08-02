/**
 * LayoutWindow —— 布局窗口（设计态画布）
 *
 * 职责：接收从 rich-obj-editor 推送过来的控件定义(ControlDef)，
 * 在画布上以「占位块」形式展示，支持：
 *   - 拖拽移动 / 右下角缩放
 *   - 栅格吸附 (grid snap)
 *   - 点击选中、Delete 删除
 *   - 布局变更实时回调 onLayoutChange -> 驱动成品预览窗口重绘
 *
 * 注意：布局窗口只管「摆位置」，不负责真实业务交互；
 * 真正可交互的成品由 PreviewWindow 渲染。
 */
class LayoutWindow {
    /**
     * @param {Object} opts
     * @param {Object} [opts.windowOpts] 透传给 MacWindow
     * @param {Function} [opts.onLayoutChange] (defs) => void 布局/控件变化回调
     * @param {Function} [opts.onSelect] (def) => void 选中控件回调
     * @param {number} [opts.grid=10] 栅格大小，0 表示不吸附
     */
    constructor(opts = {}) {
        this.defs = [];                  // ControlDef[]（带 x,y,w,h）
        this.items = new Map();          // id -> HTMLElement
        this.grid = opts.grid !== undefined ? opts.grid : 10;
        this.onLayoutChange = opts.onLayoutChange || null;
        this.onSelect = opts.onSelect || null;
        this.onDisplayOptionsChange = opts.onDisplayOptionsChange || null;
        // 新控件的默认呈现选项（每个控件独立，选中控件后这里会被改写为该控件的值）
        this.defaultDisplay = { name: true, border: true, value: true };
        this.selectedIds = new Set();   // 支持框选多选
        this.selectedId = null;         // 兼容旧的单选访问

        LayoutWindow.injectStyles();

        this.win = new MacWindow(Object.assign({
            title: '布局窗口 · 拖拽摆放控件',
            width: 460,
            height: 420,
            content: `
<div class="lw-shell">
    <div class="lw-toolbar">
        <label class="lw-chk"><input type="checkbox" class="lw-snap" checked> 栅格吸附</label>
        <input type="number" class="lw-grid" value="${this.grid}" min="1" max="80" title="栅格大小(px)">
        <button class="lw-btn lw-auto">自动排列</button>
        <button class="lw-btn lw-del">删除选中</button>
        <button class="lw-btn lw-clear">清空</button>
        <span class="lw-sep"></span>
        <span class="lw-disp-label">成品显示(选中)：</span>
        <label class="lw-chk"><input type="checkbox" class="lw-d-name" checked> 名称</label>
        <label class="lw-chk"><input type="checkbox" class="lw-d-border" checked> 外框</label>
        <label class="lw-chk"><input type="checkbox" class="lw-d-value" checked> 值</label>
        <span class="lw-count">0 个控件</span>
    </div>
    <div class="lw-canvas"></div>
</div>`,
            resizable: true,
            dark: true,
        }, opts.windowOpts || {}));

        const root = this.win.contentElement;
        root.style.padding = '0';
        this.canvas = root.querySelector('.lw-canvas');
        this.countEl = root.querySelector('.lw-count');
        this._bindToolbar(root);
        this._bindCanvas();
    }

    static injectStyles() {
        if (document.getElementById('lw-styles')) return;
        const s = document.createElement('style');
        s.id = 'lw-styles';
        s.textContent = `
.lw-shell { display:flex; flex-direction:column; height:100%; background:#0f172a; color:#e2e8f0;
    font-family:system-ui,sans-serif; font-size:13px; }
.lw-toolbar { display:flex; align-items:center; gap:8px; padding:8px 10px; background:#1e293b;
    border-bottom:1px solid #334155; flex-wrap:wrap; flex-shrink:0; }
.lw-toolbar .lw-btn { background:#334155; border:none; color:#fff; padding:4px 10px; border-radius:4px;
    cursor:pointer; font-size:12px; }
.lw-toolbar .lw-btn:hover { background:#475569; }
.lw-toolbar .lw-grid { width:52px; background:#0f172a; border:1px solid #334155; color:#fff;
    padding:3px 6px; border-radius:4px; font-size:12px; }
.lw-chk { display:flex; align-items:center; gap:4px; font-size:12px; color:#94a3b8; cursor:pointer; }
.lw-chk input { accent-color:#0ea5e9; }
.lw-sep { width:1px; height:18px; background:#334155; margin:0 4px; }
.lw-disp-label { font-size:12px; color:#64748b; }
.lw-count { margin-left:auto; font-size:11px; color:#64748b; }

.lw-canvas { position:relative; flex:1; overflow:auto; background-color:#0b1220;
    background-image:linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px);
    background-size:20px 20px; }
.lw-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    color:#475569; font-size:13px; pointer-events:none; text-align:center; padding:20px; }
.lw-marquee { position:absolute; border:1px dashed #38bdf8; background:rgba(56,189,248,.12);
    pointer-events:none; z-index:50; border-radius:2px; }

.lw-item { position:absolute; box-sizing:border-box; background:#1e293b; border:1px solid #334155;
    border-radius:8px; padding:6px 8px; cursor:move; user-select:none; overflow:hidden; }
.lw-item:hover { border-color:#475569; }
.lw-item.selected { border-color:#0ea5e9; box-shadow:0 0 0 2px rgba(14,165,233,.25); }
.lw-item .lw-it-label { font-size:11px; color:#e2e8f0; white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; margin-bottom:4px; }
.lw-item .lw-it-meta { display:flex; gap:6px; font-size:10px; font-family:monospace; }
.lw-item .lw-it-type { color:#a78bfa; }
.lw-item .lw-it-cell { color:#38bdf8; }
.lw-item .lw-it-cell.none { color:#64748b; }
.lw-item .lw-it-ghost { margin-top:5px; height:6px; border-radius:3px; background:#334155; }
.lw-item .lw-rs { position:absolute; right:0; bottom:0; width:12px; height:12px; cursor:se-resize; }
.lw-item .lw-rs::after { content:''; position:absolute; right:2px; bottom:2px; width:6px; height:6px;
    border-right:2px solid #64748b; border-bottom:2px solid #64748b; }

/* 标签控件（label）：设计态只显示文字 */
.lw-item.lw-type-label { background:#0b1220; border-style:dashed; }
.lw-item.lw-type-label .lw-it-label { font-size:14px; color:#e2e8f0; white-space:normal; }
/* 按钮控件（button）：设计态显示为按钮样子 */
.lw-item.lw-type-button { background:transparent; border:none; padding:0; }
.lw-item.lw-type-button .lw-it-label { display:none; }
.lw-item.lw-type-button .lw-btn-preview {
    display:flex; align-items:center; justify-content:center; width:100%; height:100%;
    background:#2563eb; color:#fff; border-radius:6px; font-size:13px; cursor:pointer; user-select:none;
}
`;
        document.head.appendChild(s);
    }

    _bindToolbar(root) {
        const snap = root.querySelector('.lw-snap');
        const gridInput = root.querySelector('.lw-grid');
        snap.addEventListener('change', () => {
            this.grid = snap.checked ? (parseInt(gridInput.value) || 10) : 0;
        });
        gridInput.addEventListener('change', () => {
            if (snap.checked) this.grid = parseInt(gridInput.value) || 10;
        });
        root.querySelector('.lw-auto').addEventListener('click', () => this.autoArrange());
        root.querySelector('.lw-del').addEventListener('click', () => this.removeSelected());
        root.querySelector('.lw-clear').addEventListener('click', () => {
            if (this.defs.length && confirm('确定清空布局中的所有控件？')) this.clear();
        });
        // 成品显示选项：作用于「选中的控件」（每个控件独立）。无选中时作为新控件默认值。
        this.dispChks = {
            name: root.querySelector('.lw-d-name'),
            border: root.querySelector('.lw-d-border'),
            value: root.querySelector('.lw-d-value'),
        };
        Object.values(this.dispChks).forEach(chk =>
            chk.addEventListener('change', () => this._applyDisplayToSelection()));
    }

    /** 把工具栏的显示勾选框应用到当前选中控件（或全部控件若无选中） */
    _applyDisplayToSelection() {
        const next = {
            name: this.dispChks.name.checked,
            border: this.dispChks.border.checked,
            value: this.dispChks.value.checked,
        };
        this.defaultDisplay = Object.assign({}, next);
        const targets = this.selectedIds.size
            ? this.defs.filter(d => this.selectedIds.has(d.id))
            : this.defs;
        targets.forEach(d => { d.display = Object.assign({}, next); });
        this._emit();   // 触发成品窗口按各控件 display 重绘
    }

    /** 让工具栏勾选框反映当前选中控件（或多个选中的共性）状态 */
    _syncDisplayChks() {
        let src;
        if (this.selectedIds.size === 1) {
            const d = this.defs.find(x => this.selectedIds.has(x.id));
            src = d && d.display;
        }
        if (!src) src = this.defaultDisplay;
        if (!src) return;
        this.dispChks.name.checked = !!src.name;
        this.dispChks.border.checked = !!src.border;
        this.dispChks.value.checked = !!src.value;
    }

    _bindCanvas() {
        // 点击空白处：开始框选（拖拽出矩形选区）；单击空白则取消选中
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.target !== this.canvas) return;  // 只在空白画布上触发框选
            e.preventDefault();
            this.canvas.focus();
            const rect = this.canvas.getBoundingClientRect();
            const ox = e.clientX - rect.left + this.canvas.scrollLeft;
            const oy = e.clientY - rect.top + this.canvas.scrollTop;
            const marquee = document.createElement('div');
            marquee.className = 'lw-marquee';
            marquee.style.left = ox + 'px';
            marquee.style.top = oy + 'px';
            this.canvas.appendChild(marquee);
            let moved = false;
            const move = (ev) => {
                const cx = ev.clientX - rect.left + this.canvas.scrollLeft;
                const cy = ev.clientY - rect.top + this.canvas.scrollTop;
                const x = Math.min(cx, ox), y = Math.min(cy, oy);
                const w = Math.abs(cx - ox), h = Math.abs(cy - oy);
                marquee.style.left = x + 'px';
                marquee.style.top = y + 'px';
                marquee.style.width = w + 'px';
                marquee.style.height = h + 'px';
                if (w > 3 || h > 3) moved = true;
            };
            const up = (ev) => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                marquee.remove();
                if (!moved) { this.select(null); return; }
                // 选出与选区矩形相交的控件
                const cx = ev.clientX - rect.left + this.canvas.scrollLeft;
                const cy = ev.clientY - rect.top + this.canvas.scrollTop;
                const x = Math.min(cx, ox), y = Math.min(cy, oy);
                const w = Math.abs(cx - ox), h = Math.abs(cy - oy);
                const hit = this.defs.filter(d =>
                    d.x < x + w && d.x + d.w > x && d.y < y + h && d.y + d.h > y);
                this.selectMany(hit.map(d => d.id));
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
        // Delete 删除选中
        this.canvas.setAttribute('tabindex', '0');
        this.canvas.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.removeSelected();
            }
        });
    }

    // ==================== 对外 API ====================

    /**
     * 接收一个控件定义（来自 rich-obj-editor 的推送）。
     * 若同 id 已存在则更新其属性并保留原位置。
     */
    addControl(def) {
        if (!def || !def.id) return null;
        const exist = this.defs.find(d => d.id === def.id);
        if (exist) {
            // 保留位置，更新其余属性
            const { x, y, w, h } = exist;
            Object.assign(exist, def, { x, y, w, h });
            this._renderItem(exist);
            this._emit();
            return exist;
        }
        const placed = Object.assign({
            x: 0, y: 0, w: 150, h: 56
        }, def);
        placed.display = Object.assign({}, this.defaultDisplay);
        // 自动寻找一个不重叠的落点
        const pos = this._findFreeSlot(placed.w, placed.h);
        placed.x = pos.x; placed.y = pos.y;
        this.defs.push(placed);
        this._renderItem(placed);
        this.select(placed.id);
        this._emit();
        return placed;
    }

    /** 批量设置控件定义（用于导入已保存的布局） */
    setDefs(defs) {
        this.clear(true);
        (defs || []).forEach(d => {
            const item = Object.assign({ x: 0, y: 0, w: 150, h: 56 }, d);
            if (!item.display) item.display = Object.assign({}, this.defaultDisplay);
            this.defs.push(item);
            this._renderItem(item);
        });
        this._emit();
        return this;
    }

    /** 导出布局（含位置尺寸），可直接交给 PreviewWindow 或持久化 */
    exportLayout() {
        return this.defs.map(d => Object.assign({}, d));
    }

    removeControl(id) {
        const i = this.defs.findIndex(d => d.id === id);
        if (i < 0) return;
        this.defs.splice(i, 1);
        const el = this.items.get(id);
        if (el) el.remove();
        this.items.delete(id);
        this.selectedIds.delete(id);
        if (this.selectedId === id) this.selectedId = null;
        this._emit();
    }

    removeSelected() {
        if (this.selectedIds.size === 0) return;
        const ids = Array.from(this.selectedIds);
        this.selectedIds.clear();
        ids.forEach(id => this.removeControl(id));
    }

    clear(silent = false) {
        this.defs = [];
        this.items.forEach(el => el.remove());
        this.items.clear();
        this.selectedIds.clear();
        this.selectedId = null;
        if (!silent) this._emit();
        return this;
    }

    /** 单选（点击单个控件时） */
    select(id) {
        this.selectedIds.clear();
        if (id) this.selectedIds.add(id);
        this._applySelection();
        if (this.onSelect) {
            this.onSelect(id ? this.defs.find(d => d.id === id) : null);
        }
    }

    /** 多选（框选 / 整体拖动时） */
    selectMany(ids) {
        this.selectedIds = new Set(ids);
        this._applySelection();
        if (this.onSelect) {
            this.onSelect(this.selectedIds.size === 1
                ? this.defs.find(d => d.id === Array.from(this.selectedIds)[0]) : null);
        }
    }

    _applySelection() {
        this.selectedId = this.selectedIds.size === 1 ? Array.from(this.selectedIds)[0] : null;
        this.items.forEach((el, key) => el.classList.toggle('selected', this.selectedIds.has(key)));
        this._syncDisplayChks();
    }

    /** 自动流式排列（两列瀑布） */
    autoArrange() {
        const pad = 10, colW = 160;
        const cols = Math.max(1, Math.floor((this.canvas.clientWidth - pad) / (colW + pad)));
        const heights = new Array(cols).fill(pad);
        this.defs.forEach(d => {
            // 放到当前最矮的一列
            let c = 0;
            for (let i = 1; i < cols; i++) if (heights[i] < heights[c]) c = i;
            d.x = pad + c * (colW + pad);
            d.y = heights[c];
            d.w = colW;
            heights[c] += (d.h || 56) + pad;
            this._applyBox(this.items.get(d.id), d);
        });
        this._emit();
    }

    // ==================== 内部渲染 ====================

    _snap(v) {
        return this.grid > 0 ? Math.round(v / this.grid) * this.grid : Math.round(v);
    }

    /** 简单寻找不与已有控件重叠的落点 */
    _findFreeSlot(w, h) {
        const pad = 10;
        const maxW = Math.max(this.canvas.clientWidth, 200);
        for (let y = pad; y < 4000; y += 10) {
            for (let x = pad; x + w <= maxW; x += 10) {
                const hit = this.defs.some(d =>
                    x < d.x + d.w && x + w > d.x && y < d.y + d.h && y + h > d.y);
                if (!hit) return { x: this._snap(x), y: this._snap(y) };
            }
        }
        return { x: pad, y: pad };
    }

    _applyBox(el, def) {
        if (!el) return;
        el.style.left = def.x + 'px';
        el.style.top = def.y + 'px';
        el.style.width = def.w + 'px';
        el.style.height = def.h + 'px';
    }

    _renderItem(def) {
        let el = this.items.get(def.id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'lw-item';
            el.dataset.id = def.id;
            this.canvas.appendChild(el);
            this.items.set(def.id, el);
            this._enableDrag(el, def);
        }
        // 按类型切换外观 class，便于隐藏外框模式与特定控件差异化呈现
        el.className = 'lw-item' + (def.type ? ' lw-type-' + def.type : '');
        if (def.type === 'button') {
            // 按钮控件：设计态直接画成一个按钮，文字就是显示的标签
            el.innerHTML = `<div class="lw-btn-preview">${this._esc(def.label || def.id)}</div>
                <div class="lw-rs"></div>`;
        } else {
            // 其它控件（含 label）：设计态统一显示为占位外观（名称 + 类型 + 单元格），
            // label 的真实文字只在成品区（PreviewWindow）渲染，布局区不显示成成品样子
            el.innerHTML = `
                <div class="lw-it-label">${this._esc(def.label || def.id)}</div>
                <div class="lw-it-meta">
                    <span class="lw-it-type">${this._esc(def.type || 'text')}</span>
                    <span class="lw-it-cell ${def.cell ? '' : 'none'}">${def.cell ? this._esc(def.cell) : '未绑定'}</span>
                </div>
                <div class="lw-it-ghost"></div>
                <div class="lw-rs"></div>`;
        }
        this._applyBox(el, def);
        this._bindResize(el, def);
        this._updateCount();
        return el;
    }

    _enableDrag(el, def) {
        el.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('lw-rs')) return; // 交给缩放
            e.preventDefault();
            e.stopPropagation();

            // 若点在已选中的控件上，则整体拖动所有选中项；否则单选后拖动
            if (!this.selectedIds.has(def.id)) this.select(def.id);
            this.canvas.focus();

            // 记录所有选中控件的初始位置
            const group = Array.from(this.selectedIds)
                .map(id => this.defs.find(d => d.id === id))
                .filter(Boolean);
            const startX = e.clientX, startY = e.clientY;
            const orig = group.map(d => ({ d, x: d.x, y: d.y }));

            const move = (ev) => {
                const dx = this._snap(ev.clientX - startX);
                const dy = this._snap(ev.clientY - startY);
                orig.forEach(({ d, x, y }) => {
                    d.x = Math.max(0, x + dx);
                    d.y = Math.max(0, y + dy);
                    this._applyBox(this.items.get(d.id), d);
                });
            };
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                if (group.length > 1) this._emit();   // 整体拖动后实时同步成品
                else this._emit();
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    _bindResize(el, def) {
        const handle = el.querySelector('.lw-rs');
        if (!handle) return;
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.select(def.id);
            const startX = e.clientX, startY = e.clientY;
            const origW = def.w, origH = def.h;
            const move = (ev) => {
                def.w = Math.max(80, this._snap(origW + ev.clientX - startX));
                def.h = Math.max(40, this._snap(origH + ev.clientY - startY));
                this._applyBox(el, def);
            };
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                this._emit();
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    _updateCount() {
        if (this.countEl) this.countEl.textContent = `${this.defs.length} 个控件`;
        // 空状态提示
        let empty = this.canvas.querySelector('.lw-empty');
        if (this.defs.length === 0) {
            if (!empty) {
                empty = document.createElement('div');
                empty.className = 'lw-empty';
                empty.textContent = '在「控件定义」窗口点击节点右侧的 ➡️ 推送控件到这里，然后拖拽摆放';
                this.canvas.appendChild(empty);
            }
        } else if (empty) {
            empty.remove();
        }
    }

    _emit() {
        this._updateCount();
        if (this.onLayoutChange) this.onLayoutChange(this.exportLayout(), this);
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

if (typeof window !== 'undefined') window.LayoutWindow = LayoutWindow;
if (typeof module !== 'undefined') module.exports = LayoutWindow;
