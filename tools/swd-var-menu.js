/**
 * SWD 变量右键菜单（基于 RichMenu）
 *
 * 把「Excel 单元格右键 → 用变量名直接填地址/R/W」的能力友好融入本工程。
 * 数据源优先级：
 *   1) 编译器全局符号表 window.__ideGlobals（IDE 编译后即有，无需 AXF，
 *      地址 = __ideMem.ramBase + 字偏移*4，与「在 RAM 中运行」一致）；
 *   2) AXF/BIN 符号表 window.lastdownloadinfo.symbol（SWD 下载后写入，兜底）。
 * 两者皆无时，右键不弹菜单（走默认菜单）。
 *
 * 不修改 excel.js：由各 ExcelTable 的创建方（panel-workbench / panel-runtime）
 * 调用 attachSwdVarMenu(excel) 完成绑定。
 */

(function () {
    'use strict';

    let _styleInjected = false;
    function _injectStyle() {
        if (_styleInjected) return;
        _styleInjected = true;
        const css = `
        .svm-list { margin: 6px 4px 4px; max-height: 240px; overflow-y: auto; border-top: 1px solid #334155; padding-top: 6px; }
        .svm-empty { padding: 14px 8px; color: #94a3b8; font-size: 12px; text-align: center; }
        .svm-row { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 6px; }
        .svm-row:hover { background: #334155; }
        .svm-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #e2e8f0; }
        .svm-addr { font-size: 11px; color: #94a3b8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: 2px; }
        .svm-acts { display: flex; gap: 3px; }
        .svm-act { border: none; border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 600; cursor: pointer; color: #fff; }
        .svm-act.svm-r { background: #10b981; }
        .svm-act.svm-w { background: #f59e0b; }
        .svm-act.svm-a { background: #6366f1; }
        .svm-act:hover { filter: brightness(1.12); }
        `;
        const s = document.createElement('style');
        s.id = 'swd-var-menu-styles';
        s.textContent = css;
        document.head.appendChild(s);
    }

    /**
     * 取变量符号表，优先级：
     *   1) window.__ideGlobals —— IDE 编译器导出的全局变量（编译后即有，最及时）
     *   2) window.lastdownloadinfo.symbol —— AXF/BIN 经 SWD 下载后写入（兜底）
     * 返回 { name: { addr, size } }；两者皆无则返回 null。
     */
    function _getSymbols() {
        // 首选：编译器全局符号表（addr 已是绝对地址，无需再换算）
        if (window.__ideGlobals && Object.keys(window.__ideGlobals).length) {
            return window.__ideGlobals;
        }
        // 兜底：AXF 符号表（st_value 为十进制地址）
        const di = window.lastdownloadinfo;
        if (di && di.symbol) return di.symbol;
        return null;
    }

    // 统一取出某符号的绝对地址（兼容两种来源）
    function _symAddr(sym) {
        if (sym && typeof sym.addr === 'number') return sym.addr;      // __ideGlobals
        if (sym && typeof sym.st_value === 'number') return sym.st_value; // AXF
        return 0;
    }

    function _hex(addr) {
        return '0x' + Number(addr).toString(16).toUpperCase();
    }

    /** 根据动作类型生成要写入单元格的内容 */
    function _buildCellValue(name, addr, kind) {
        const a = _hex(addr);
        if (kind === 'r') {
            // 读：周期(TIMER)刷新该地址的 32 位值，并同步到 $.map.<name>
            return `=TIMER(1)(mcuR32(${a},(e=>($.map.${name}=e)))|0+$.map.${name})`;
        }
        if (kind === 'w') {
            // 写：点击/刷新时把 0 写入该地址（可被按钮 value 覆盖）
            return `=mcuW32(${a},0)`;
        }
        // addr：直接写入地址数值（十进制纯数字，与老工程一致）。
        // 注意：不能写 '0x...' 字符串——ExcelTable.setCellValue 内部会用
        // parseFloat 解析，parseFloat('0x20000100') 会被截断成 0，导致显示成 0。
        return Number(addr);
    }

    /**
     * 打开菜单并写入单元格。
     * @param {object} excel ExcelTable 实例
     * @param {string} cellKey 如 'A1'
     * @param {number} clientX 视口坐标
     * @param {number} clientY 视口坐标
     */
    function openSwdVarMenu(excel, cellKey, clientX, clientY) {
        _injectStyle();

        const symbols = _getSymbols();
        const hasSymbols = !!symbols;

        // 创建 RichMenu（context 模式，暗色）
        const menu = new RichMenu({
            mode: 'context',
            theme: 'dark',
            width: 300,
            showHeader: true,
            showFooter: false,
            title: `SWD 变量 · 单元格 ${cellKey}`,
            closeOnOutsideClick: true,
            sections: [
                {
                    controls: [
                        {
                            id: 'varName',
                            type: 'text',
                            label: hasSymbols ? '变量名（实时搜索全局符号）' : '变量名',
                            placeholder: hasSymbols ? '如: g_tick / uart_rx ...' : '请先编译（IDE）或加载 AXF/BIN',
                        },
                    ],
                },
            ],
        });

        // 显示后注入候选列表区
        menu.show(clientX, clientY);
        const body = menu.element.querySelector('.rm-body');
        if (!body) return;

        const listEl = document.createElement('div');
        listEl.className = 'svm-list';
        body.appendChild(listEl);

        if (!hasSymbols) {
            listEl.innerHTML = '<div class="svm-empty">未检测到符号表<br>请先在 IDE 编译（导出全局变量），或经 SWD 加载 AXF / BIN</div>';
            return;
        }

        const input = menu.menuControls['varName'];

        function applyVar(name, kind) {
            const sym = symbols[name];
            if (!sym) return;
            const val = _buildCellValue(name, _symAddr(sym), kind);
            excel.setCell(cellKey, val);
            menu.hide();
        }

        function renderList(filter) {
            const q = (filter || '').trim().toLowerCase();
            const names = Object.keys(symbols)
                .filter(n => n && (!q || n.toLowerCase().includes(q)))
                .slice(0, 200);
            if (names.length === 0) {
                listEl.innerHTML = '<div class="svm-empty">无匹配符号</div>';
                reposition();
                return;
            }
            listEl.innerHTML = '';
            names.forEach(name => {
                const sym = symbols[name];
                const row = document.createElement('div');
                row.className = 'svm-row';
                row.innerHTML =
                    `<span class="svm-name" title="${name}">${name}</span>` +
                    `<span class="svm-addr">${_hex(_symAddr(sym))}</span>` +
                    `<span class="svm-acts">` +
                    `<button class="svm-act svm-r" title="读 (周期刷新)">R</button>` +
                    `<button class="svm-act svm-w" title="写 (mcuW32)">W</button>` +
                    `<button class="svm-act svm-a" title="仅地址">Addr</button>` +
                    `</span>`;
                row.querySelector('.svm-r').addEventListener('click', (e) => { e.stopPropagation(); applyVar(name, 'r'); });
                row.querySelector('.svm-w').addEventListener('click', (e) => { e.stopPropagation(); applyVar(name, 'w'); });
                row.querySelector('.svm-a').addEventListener('click', (e) => { e.stopPropagation(); applyVar(name, 'a'); });
                // 点击行名默认插入「地址」
                row.querySelector('.svm-name').addEventListener('click', () => applyVar(name, 'a'));
                listEl.appendChild(row);
            });
            reposition();
        }

        // 列表是动态注入的，show() 定位时还没算上它的高度，会导致菜单底部溢出屏幕。
        // 每次列表变化后重新按视口约束定位，并限制菜单最高不超过视口（内部滚动）。
        function reposition() {
            const vh = window.innerHeight;
            const maxH = vh - 20;
            if (menu.element.offsetHeight > maxH) {
                menu.element.style.maxHeight = maxH + 'px';
                menu.element.style.overflowY = 'auto';
            }
            // RichMenu._setPosition 已处理「右/下溢出则反向贴边」
            if (typeof menu._setPosition === 'function') menu._setPosition(clientX, clientY);
        }

        renderList('');
        if (input) {
            input.addEventListener('input', () => renderList(input.value));
            // 自动聚焦搜索框，方便直接打字
            setTimeout(() => input.focus(), 0);
        }
    }

    /**
     * 给一个 ExcelTable 实例绑定单元格右键菜单。
     * 在 panel-workbench / panel-runtime 创建 excel 后调用即可，无需改动 excel.js。
     * @param {object} excel ExcelTable 实例
     */
    function attachSwdVarMenu(excel) {
        if (!excel || !excel.tableContainer) return;
        const root = excel.tableContainer;
        root.addEventListener('contextmenu', (e) => {
            const input = e.target.closest && e.target.closest('td input');
            if (!input) return; // 只在单元格输入框上生效

            // 仅当存在可用符号表（编译器全局变量 或 AXF）时才使能右键菜单
            if (!_getSymbols()) return;

            e.preventDefault();

            // 计算 cellKey（input.col 如 'A'，input.row 如 1）
            const col = input.col;
            const row = input.row;
            if (!col || !row) return;
            const cellKey = `${col}${row}`;

            // 同步 ExcelTable 的当前选中项，使写入位置明确
            excel.selectCellKey = cellKey;
            excel.selectCell = excel.cellData[cellKey] || null;
            if (typeof input.focus === 'function') input.focus();

            openSwdVarMenu(excel, cellKey, e.clientX, e.clientY);
        });
    }

    window.attachSwdVarMenu = attachSwdVarMenu;
    window.openSwdVarMenu = openSwdVarMenu;
})();
