        /**
 * Excel表格组件类
 * 创建一个类似Excel的交互式表格，支持公式计算、单元格选择、行列调整等功能
 */
        class ExcelTable {
            // 静态标记，确保样式只添加一次
            static stylesAdded = false;
        
            /**
             * 构造函数
             * @param {string|HTMLElement} container - 容器元素或ID
             * @param {number} [rows=20] - 初始行数
             * @param {number} [columns=26] - 初始列数
             */
            constructor(container, rows = 20, columns = 26, options = {}) {
                // 初始化容器
                this.container = typeof container === 'string' 
                    ? document.getElementById(container) 
                    : container;
                // dark: 暗色主题（与 MacWindow / 布局/成品窗口统一视觉）
                this.dark = !!options.dark;
                if (this.dark) this.container.classList.add('excel-dark');
                
                // 表格行列配置
                this.rows = rows;
                this.columns = columns;
                
                // 选择状态相关属性
                this.isSelecting = false;       // 是否正在选择
                this.startCell = null;           // 选择起始单元格
                this.endCell = null;             // 选择结束单元格
                this.selectCell = null;          // 当前选中单元格
                this.selectCellKey = null;
                this.updatetype=0;
                this.updatelevel=0;
                // 创建选择矩形元素
                this.selectionRect = document.createElement('div');
                this.selectionRect.className = 'selection-rect';
                
                // 空操作函数
                this.action_null = () => 0;
                
                this.PromiseMode = false;
                this.chain = null;
                this.lastchain = null;
                // 单元格数据缓存和依赖跟踪
                this.cellData = {}; 
                this.Data = {map:{},handle:this,update:(cell)=>this.callupdateCell(this.cellData[cell])};
                // 外部绑定桥接：cellKey -> { get, set, el } 外部控件（滑块/输入框等）与单元格双向同步
                this.bindings = {};
        
                // 配置系统函数
                this.systemIdentifier = {
                    SUM: (arr)=>{let v=0;arr.forEach(x=>v+=x);return v;},
                    AVG: function(...args) { return args.reduce((a,b) => a+b, 0)/args.length; }
                };
                this.actionCall={
                    TIMER:(cell,t)=>this.bindKey(cell,`TIMER${t}`),
                }
                
                // 确保样式只添加一次
                if (!ExcelTable.stylesAdded) {
                    this.addStyles();
                    ExcelTable.stylesAdded = true;
                }
                
                // 初始化表格
                this.init();
                // 选择框挂到可滚动容器里：该容器是 position:relative 且 overflow:auto 的定位上下文，
                // 这样框既相对容器定位，又会被容器裁切，不会溢出盖到窗口标题栏。
                (this.tableContainer || this.container).appendChild(this.selectionRect);
        
                this.TimerMS=[1,2,3,4,5,6,7,8,9,10];
                this.TimerDT=[0,0,0,0,0,0,0,0,0,0];
                setInterval(() => {
                    for (let i = 0; i < this.TimerDT.length; i++) {
                        this.TimerDT[i]--;
                        if(this.TimerDT[i]<=0){
                            this.TimerDT[i]=this.TimerMS[i];
                            const cell=this.cellData[`TIMER${this.TimerMS[i]}`];
                            if(cell.updatecell.size>0)
                                this.callupdateCell(cell);
                        }
                    }
                }, 100);
        
                for (let i = 0; i < this.TimerMS.length; i++) {
                    // 初始化单元格数据
                    this.cellData[`TIMER${this.TimerMS[i]}`] = {
                                key: `TIMER${this.TimerMS[i]}`,
                                value: '',          // 单元格值
                                formula: '',       // 公式
                                updateaction: this.action_null, // 更新函数
                                updatecell: new Set(), // 依赖此单元格的单元格
                                reqcell: new Set(),    // 此单元格依赖的单元格
                                input: {value:0},          // 输入框引用
                                handle:this,
                    };
                }
                
            }
            bindKey(cell,key){
                const e=this.cellData[key];
                cell.reqcell.add(e);
                e.updatecell.add(cell);
            }
            
            /**
             * 添加表格样式
             */
            addStyles() {
                const style = document.createElement('style');
                style.id = 'excel-table-styles';
                style.textContent = `
                    /* 表格容器样式 */
                    .excel-table-container {
                        display: inline-block;
                        border: 1px solid #ccc;
                        overflow: auto;
                        width: 100%;
                        height: 100%;
                        position: relative;   /* 作为 selection-rect 的定位上下文，避免框溢出到窗口标题 */
                    }
                    
                    /* 表格基础样式 */
                    .excel-table {
                        border-collapse: collapse;
                        table-layout: fixed;
                    }
                    
                    /* 表头和单元格基础样式 */
                    .excel-table th, .excel-table td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: center;
                        position: relative;
                        min-width: 50px;
                        height: 25px;
                        box-sizing: border-box;
                    }
                    
                    /* 列标题样式 */
                    .excel-table .column-header {
                        background-color: #f2f2f2;
                        font-weight: bold;
                        user-select: none;
                    }
                    
                    /* 行标题样式 */
                    .excel-table .row-header {
                        background-color: #f2f2f2;
                        font-weight: bold;
                        user-select: none;
                    }
                    
                    /* 列调整大小手柄 */
                    .excel-table .resizer {
                        position: absolute;
                        right: 0;
                        top: 0;
                        width: 5px;
                        height: 100%;
                        background: rgba(0, 0, 0, 0);
                        cursor: col-resize;
                        z-index: 1;
                    }
                    
                    /* 行调整大小手柄 */
                    .excel-table .row-resizer {
                        position: absolute;
                        left: 0;
                        bottom: 0;
                        width: 100%;
                        height: 5px;
                        background: rgba(0, 0, 0, 0);
                        cursor: row-resize;
                        z-index: 1;
                    }
                    
                    /* 调整大小手柄悬停效果 */
                    .excel-table .resizer:hover, .excel-table .row-resizer:hover {
                        background: rgba(0, 0, 0, 0.1);
                    }
                    
                    /* 调整大小手柄激活状态 */
                    .excel-table .resizer.active, .excel-table .row-resizer.active {
                        background: rgba(0, 0, 0, 0.3);
                    }
                    
                    /* 左上角单元格样式 */
                    .excel-table .corner-cell {
                        background-color: #f2f2f2;
                    }
                    
                    /* 单元格输入框样式 */
                    .excel-table td input {
                        width: 100%;
                        height: 100%;
                        border: none;
                        outline: none;
                        box-sizing: border-box;
                        background: transparent;
                    }
                    
                    /* 选中单元格样式 */
                    .selected {
                        background-color: #b5d5ff;
                    }
                    
                    /* 选择锚点样式 */
                    .selection-anchor {
                        background-color: #7fbbff;
                    }
                    
                    /* 选择矩形样式 */
                    .selection-rect {
                        position: absolute;
                        background-color: rgba(181, 213, 255, 0.3);
                        border: 2px solid #4d90fe;
                        pointer-events: none;
                        z-index: 5;
                    }

                    /* ============ 暗色主题（.excel-dark 挂在容器上，作为祖先作用域） ============
                       .excel-dark 是宿主容器（MacWindow 内的 host）的类，
                       真正的 .excel-table-container 是它的子元素，因此一律用后代选择器。 */
                    .excel-dark .excel-table-container {
                        border-color: #334155 !important;
                        background-color: #0b1220 !important;
                    }
                    .excel-dark .excel-table th,
                    .excel-dark .excel-table td {
                        border-color: #2a3a52 !important;
                        color: #e2e8f0 !important;
                        background-color: #0f1a2e;
                    }
                    .excel-dark .excel-table .column-header,
                    .excel-dark .excel-table .row-header,
                    .excel-dark .excel-table .corner-cell {
                        background-color: #16233a !important;
                        color: #94a3b8 !important;
                    }
                    .excel-dark .excel-table .resizer:hover,
                    .excel-dark .excel-table .row-resizer:hover {
                        background: rgba(255, 255, 255, 0.12) !important;
                    }
                    .excel-dark .excel-table .resizer.active,
                    .excel-dark .excel-table .row-resizer.active {
                        background: rgba(255, 255, 255, 0.25) !important;
                    }
                    .excel-dark .excel-table td input {
                        color: #e2e8f0 !important;
                        background: transparent !important;
                    }
                    .excel-dark .selected {
                        background-color: #1e3a5f !important;
                        outline: 1px solid #3b82f6;
                    }
                    .excel-dark .selection-anchor {
                        background-color: #2563eb !important;
                    }
                    .excel-dark .selection-rect {
                        background-color: rgba(37, 99, 235, 0.22) !important;
                        border-color: #3b82f6 !important;
                    }
                `;
                document.head.appendChild(style);
            }
            
            /**
             * 初始化表格
             */
            init() {
                this.createTableStructure();  // 创建表格结构
                this.addColumnHeaders();      // 添加列标题
                this.addRows();              // 添加行数据
                this.setupResizers();        // 设置行列调整功能
                this.setupMultSelect();      // 设置多选功能
            }
            
            /**
             * 创建表格基本结构
             */
            createTableStructure() {
                // 创建容器元素
                this.tableContainer = document.createElement('div');
                this.tableContainer.className = 'excel-table-container';
                
                this.tableWrapper = document.createElement('div');
                
                this.table = document.createElement('table');
                this.table.className = 'excel-table';
                this.table.id = 'excelTable';
                
                // 创建表头和表体
                this.thead = document.createElement('thead');
                this.headerRow = document.createElement('tr');
                this.tbody = document.createElement('tbody');
                
                // 组装表格结构
                this.thead.appendChild(this.headerRow);
                this.table.appendChild(this.thead);
                this.table.appendChild(this.tbody);
                this.tableWrapper.appendChild(this.table);
                this.tableContainer.appendChild(this.tableWrapper);
                
                // 添加到目标容器
                this.container.appendChild(this.tableContainer);
            }
            
            /**
             * 添加列标题
             */
            addColumnHeaders() {
                // 添加左上角空白单元格
                const cornerCell = document.createElement('th');
                cornerCell.className = 'corner-cell';
                this.headerRow.appendChild(cornerCell);
                
                // 添加A-Z列标题
                for (let i = 0; i < this.columns; i++) {
                    const th = document.createElement('th');
                    th.className = 'column-header';
                    th.textContent = String.fromCharCode(65 + i);
                    
                    // 添加列宽调整手柄
                    const resizer = document.createElement('div');
                    resizer.className = 'resizer';
                    th.appendChild(resizer);
                    
                    this.headerRow.appendChild(th);
                }
            }
            
            /**
             * 添加表格行
             */
            addRows() {
                for (let i = 1; i <= this.rows; i++) {
                    const tr = document.createElement('tr');
                    
                    // 添加行标题
                    const th = document.createElement('th');
                    th.className = 'row-header';
                    th.textContent = i;
                    tr.appendChild(th);
                    
                    // 添加行高调整手柄
                    const rowResizer = document.createElement('div');
                    rowResizer.className = 'row-resizer';
                    th.appendChild(rowResizer);
                    
                    // 添加单元格
                    for (let j = 0; j < this.columns; j++) {
                        const td = document.createElement('td');
                        const input = document.createElement('input');
                        input.type = 'text';
        
                        // 设置行列信息
                        input.row = td.row = i;
                        input.col = td.col = String.fromCharCode(65 + j);
                        const cellKey = `${td.col}${td.row}`;
                        
                        // 初始化单元格数据
                        this.cellData[cellKey] = {
                            key: cellKey,
                            value: '',          // 单元格值
                            formula: '',       // 公式
                            updateaction: this.action_null, // 更新函数
                            updatecell: new Set(), // 依赖此单元格的单元格
                            reqcell: new Set(),    // 此单元格依赖的单元格
                            input: input,          // 输入框引用
                            handle:this,
                        };
        
                        // 为Data对象定义属性，方便公式计算
                        Object.defineProperty(this.Data, cellKey, {
                            get: () => this.cellData[cellKey].value,
                            set: (v) => {
                                this.updatetype=1;
                                v=v.toString();
                                if (v.startsWith('=')) {
                                    // 处理公式
                                    const formula = v.substring(1);
                                    this.setCellFormula(this.cellData[cellKey], formula);
                                } else {
                                    // 处理普通值
                                    this.setCellValue(this.cellData[cellKey], v);
                                }
                            }
                        });
        
                        // 输入框获取焦点事件
                        input.addEventListener('focus', () => {
                            let cell=this.cellData[cellKey];
                            this.selectCell = cell;
                            this.selectCellKey = cellKey;
                            cell.reqcell.forEach(e => e.updatecell.delete(cell));
                            cell.reqcell.clear();
                            if (this.cellData[cellKey].formula) {
                                input.value = '=' + this.cellData[cellKey].formula;
                            } else {
                                input.value = this.cellData[cellKey].value;
                            }
                        });
                        
                        // 输入框失去焦点事件
                        input.addEventListener('blur', (e) => {
                            const inputValue = e.target.value.trim();
                            this.updatetype=0;
                            if (inputValue.startsWith('=')) {
                                // 处理公式
                                const formula = inputValue.substring(1);
                                this.setCellFormula(this.cellData[cellKey], formula);
                            } else {
                                // 处理普通值
                                this.setCellValue(this.cellData[cellKey], inputValue);
                            }
                        });
                        
                        td.appendChild(input);
                        tr.appendChild(td);
                    }
                    
                    this.tbody.appendChild(tr);
                }
            }
            
            /**
             * 递归更新依赖此单元格的所有单元格
             * @param {Object} cell - 单元格数据对象
             */
            callupdateCell(cell) {
                // 用于跟踪已访问的单元格，避免重复处理
                const visited = new Set();
                // 用于存储拓扑排序结果
                const sortedCells = [];
                
                // 递归进行深度优先搜索，构建拓扑排序
                function visit(cell) {
                    if (visited.has(cell)) return;
                    visited.add(cell);
                    
                    // 先访问所有依赖项
                    cell.updatecell.forEach(e => visit(e));
                    
                    // 所有依赖项处理完后，将当前单元格加入排序列表
                    sortedCells.push(cell);
                }
                
                // 从初始单元格开始构建拓扑排序
                visit(cell);
                if(!this.PromiseMode){
                    for (let i = sortedCells.length - 1; i >= 0; i--) {
                        const currentCell = sortedCells[i];
                        currentCell.updatecell.forEach(e => {
                            if (e.action != this.action_null) {
                                e.input.value = e.value = e.action(this.Data);
                                this.updatetype |= 2;
                            }
                            // 若该单元格也被外部控件绑定，把重算后的值推回控件
                            if (this.bindings[e.key]) this.bindings[e.key].set(e.value);
                        });
                    }
                }
                else{
                    let actions=[];
                    // 按照拓扑顺序更新单元格
                    for (let i = sortedCells.length - 1; i >= 0; i--) {
                        const currentCell = sortedCells[i];
                        currentCell.updatecell.forEach(e => {
                            if (e.action != this.action_null) {
                                //e.input.value = e.value = e.action(this.Data);
                                actions.push(()=>(e.input.value = e.value = e.action(this.Data)));
                                this.updatetype |= 2;
                            }
                            if (this.bindings[e.key]) {
                                const b = this.bindings[e.key];
                                actions.push(()=>b.set(e.value));
                            }
                        });
                    }
                    if(!this.lastchain){
                        this.lastchain=this.chain=Promise.resolve();
                        for (let i = 0; i < actions.length; i++) 
                            this.lastchain=this.lastchain.then(actions[i]);
                        this.chain.then(()=>{this.lastchain=this.chain=null;console.log('ok');});
                    }
                    else{
                        for (let i = 0; i < actions.length; i++) 
                            this.lastchain=this.lastchain.then(actions[i]);
                    }
                }
            }
        
            /**
             * 递归查找依赖此单元格的所有单元格是否循环
             * @param {Object} cell - 单元格数据对象
             * @param {Object} targetcell - 目标单元格数据对象
             */
            hasCircularDependency(cell,targetcell){
                let find=false;
                cell.updatecell.forEach(e => {
                    if(find)return;
                    if(e==targetcell){find=true;return;}
                    if(this.hasCircularDependency(e,targetcell))find=true;
                });
                return find;
            }
            
            /**
             * 设置单元格值
             * @param {Object} cell - 单元格数据对象
             * @param {string} value - 要设置的值
             */
            setCellValue(cell, value) {
                value=(!isNaN(parseFloat(value)) && !isNaN(value))?parseFloat(value):value;
                // 清除现有的公式依赖
                //cell.reqcell.forEach(e => e.updatecell.delete(cell));
                //cell.reqcell.clear();
                
                // 更新单元格数据
                cell.formula = '';
                cell.value = value;
                
                // 更新显示
                cell.input.value = value;
                
                // 更新依赖此单元格的所有单元格
                this.callupdateCell(cell);
            }
        
            /**
             * 设置单元格公式
             * @param {Object} cell - 单元格数据对象
             * @param {string} formula - 要设置的公式
             */
            setCellFormula(cell, formula) {
                // 清除现有的公式依赖
                //cell.reqcell.forEach(e => e.updatecell.delete(cell));
                //cell.reqcell.clear();
                
                try {
                    // 解析公式并获取计算结果和依赖项
                    const { computedValue, computedAction, dependencies } = this.evaluateFormula(formula,cell);
                    
                    // 更新依赖关系
                    dependencies.forEach(e => {
                        cell.reqcell.add(e);
                        e.updatecell.add(cell);
                    });
        
                    // 更新单元格数据
                    cell.action = computedAction;
                    cell.formula = formula;
                    // 更新显示
                    cell.input.value = cell.value = computedValue;
                    if(this.hasCircularDependency(cell,cell)){
                        cell.input.value = cell.value = '#CIRCULAR!';
                        cell.reqcell.forEach(e => e.updatecell.delete(cell));
                        cell.reqcell.clear();
                        return;
                    }
                    
                    
        
                    // 更新依赖此单元格的所有单元格
                    this.callupdateCell(cell);
                } catch (error) {
                    // 公式错误处理
                    //cell.input.value = cell.value = '#ERROR!';
                    console.error('Formula error:', error);
                }
            }
        
            // ==================== 对外访问 API（供自定义面板使用） ====================

            /** 读取单元格当前值（无论普通值还是公式结果） */
            getCell(cellKey) {
                const c = this.cellData[cellKey];
                return c ? c.value : undefined;
            }

            /** 写入单元格：普通值或公式（以 = 开头）。会触发依赖重算。 */
            setCell(cellKey, value) {
                const c = this.cellData[cellKey];
                if (!c) return;
                if (typeof value === 'string' && value.startsWith('=')) {
                    this.setCellFormula(c, value.substring(1));
                } else {
                    this.setCellValue(c, value);
                }
            }

            /** 单元格是否存在 */
            hasCell(cellKey) { return !!this.cellData[cellKey]; }

            /**
             * 重新执行整张表格：遍历所有带公式的单元格，重新计算公式（会重新触发
             * 公式里的 JS / 请求命令等动作函数），并沿依赖链级联刷新。
             * 用途：配合「刷新按钮」控件，主动让表格跑一次复杂表达式 / 重新发请求。
             */
            /**
             * 只刷新单个单元格的依赖链（不改动其值，也不重算整张表）：
             * 重新执行所有「依赖此单元格」的单元格（公式里的 JS / 请求会重新跑），实现链式联动。
             * 用途：按钮控件未配置写入值时，仅触发一次绑定单元格的级联更新。
             */
            refreshCell(cellKey) {
                const cell = this.cellData[cellKey];
                if (!cell) return this;
                this.callupdateCell(cell);
                return this;
            }

            /**
             * 最底层赋值：直接写入单元格值（与公式字符串），**不触发任何重算/依赖更新**。
             * 用于「加载数据」场景——避免加载过程中因依赖未就绪而误触发运算导致一堆错误。
             * 注意：仅保存快照，依赖图不会建立；如需让公式生效，加载完成后调用 recalculateAll()。
             * @param {string} cellKey 如 'A1'
             * @param {*} value 单元格值
             * @param {string} [formula] 若提供，记为公式单元格（但暂不计算）
             */
            setCellRaw(cellKey, value, formula) {
                const cell = this.cellData[cellKey];
                if (!cell) return this;
                if (formula !== undefined && formula !== null && formula !== '') {
                    cell.formula = formula;
                    cell.value = (value === undefined || value === '') ? '' : value;
                } else {
                    cell.formula = '';
                    cell.value = (value === undefined) ? '' : value;
                }
                // 仅更新输入框显示，绝不 callupdateCell / setCellFormula
                if (cell.input) cell.input.value = cell.value;
                return this;
            }

            /**
             * 批量底层加载单元格数据（不触发运算）。
             * @param {Object} map { A1:{value,formula}, ... } 仅填存在的单元格
             * @param {Object} [opts] { recalc:false } 是否加载后立即整体重算一次
             */
            loadCellData(map, opts = {}) {
                if (!map) return this;
                Object.entries(map).forEach(([k, v]) => {
                    if (this.cellData[k]) {
                        this.setCellRaw(k, v && v.value, v && v.formula);
                    }
                });
                if (opts.recalc && typeof this.recalculateAll === 'function') this.recalculateAll();
                return this;
            }

            /** 导出当前所有单元格的 {value, formula} 快照，用于持久化 */
            dumpCellData() {
                const out = {};
                Object.values(this.cellData).forEach(c => {
                    if (!c.key || c.key.startsWith('TIMER')) return; // 跳过内部 TIMER 单元格
                    out[c.key] = { value: c.value, formula: c.formula || '' };
                });
                return out;
            }

            /** @deprecated 重算整张表，按钮已改为只刷新绑定单元格，保留仅供兼容 */
            recalculateAll() {
                Object.values(this.cellData).forEach(c => {
                    if (c && c.formula) {
                        try { this.setCellFormula(c, c.formula); }
                        catch (e) { console.error('recalculateAll 重算失败:', c.cellKey, e); }
                    }
                });
                return this;
            }

            /**
             * 将外部控件（如滑块/输入框/下拉）绑定到某单元格，实现双向同步：
             *   - 用户操作控件 → 写回单元格 → 触发公式重算（其它依赖单元格/控件自动更新）
             *   - 单元格被公式更新 → 反向刷新外部控件显示
             * @param {string} cellKey 单元格键，如 'A1'
             * @param {Object} handlers { get:()=>value, set:(v)=>void } 外部控件的取值/赋值回调
             * @param {HTMLElement} [el] 外部控件根元素，用于标记脏状态
             * @returns {Function} 解绑函数
             */
            bindCell(cellKey, handlers, el) {
                const c = this.cellData[cellKey];
                if (!c) {
                    console.warn(`bindCell 失败：单元格 ${cellKey} 不存在`);
                    return () => {};
                }
                const binding = { get: handlers.get, set: handlers.set, el: el || null };
                this.bindings[cellKey] = binding;

                // 让该单元格在重算后通知外部控件：重写其 updateaction
                const prevAction = c.action || this.action_null;
                c.action = (data) => {
                    const v = prevAction(data);          // 先按原公式/值计算
                    binding.set(v);                       // 再推给外部控件
                    return v;
                };
                // 若当前是公式，重挂依赖以让 update 触发上面的 set
                if (c.formula) {
                    try {
                        const { computedValue, computedAction, dependencies } = this.evaluateFormula(c.formula, c);
                        c.action = (data) => { const v = computedAction(data); binding.set(v); return v; };
                        c.value = computedValue;
                    } catch (e) { /* ignore */ }
                }
                return () => {
                    if (this.bindings[cellKey] === binding) delete this.bindings[cellKey];
                };
            }

            /**
             * 计算公式（支持单元格引用、范围运算符和系统函数）
             * @param {string} formula - 要计算的公式字符串
             * @returns {Object} 返回包含计算结果、计算函数和依赖项的对象
             */
            evaluateFormula(formula,cell) {
                const dependencies = new Set();
                let computedValue = '';
                let computedAction = null;
                
                try {
                    // 词法分析并处理范围运算符
                    const tokens = this.tokenizeFormula(formula);
                    let processedFormula = '';
                    let i = 0;
                    
                    while (i < tokens.length) {
                        const token = tokens[i];
                        
                        // 处理范围运算符（如 A1:A3）
                        if (i + 2 < tokens.length && tokens[i + 1] === ':' && this.isCellReference(token) && this.isCellReference(tokens[i + 2])) {
                            const rangeArray = this.processRange(token, tokens[i + 2]);
                            processedFormula += rangeArray.code;
                            rangeArray.deps.forEach(dep => dependencies.add(dep));
                            i += 3; // 跳过已处理的3个token（A1 : A3）
                        } 
                        // 处理普通单元格引用
                        else if (this.isCellReference(token)) {
                            const { code, dep } = this.processCellRef(token);
                            processedFormula += code;
                            if (dep) dependencies.add(dep);
                            i++;
                        }
                        // 处理系统函数
                        else if (this.isSystemFunction(token)) {
                            processedFormula += this.processSystemFunction(token);
                            i++;
                        }
                        // 处理主动函数
                        else if (this.isActionFunction(token)) {
                            while(tokens[i+1]!='('){i++;if(i+1==tokens.length)return null;}
                            let num=[];                    
                            i+=2;
                            while(tokens[i]!=')'){
                                if(tokens[i]!=',')num.push(tokens[i]);
                                i++;
                                if(i+1==tokens.length)return null;
                            }
                            this.actionCall[token](cell,...num);
                            i+=1;
                        }
                        // 其他字符
                        else {
                            processedFormula += token;
                            i++;
                        }
                    }
                    
                    // 创建计算函数
                    computedValue = processedFormula;
                    computedAction = new Function('$', `return (${computedValue})`);
                    
                    // 执行计算
                    computedValue = computedAction(this.Data);
                } catch (error) {
                    throw new Error(`公式计算错误: ${formula}\n错误详情: ${error.message}`);
                }
                
                return { computedValue, computedAction, dependencies };
            }
        
            /**
             * 处理范围运算符（如 A1:A3）
             * @param {string} startCell - 起始单元格（如"A1"） 
             * @param {string} endCell - 结束单元格（如"A3"）
             * @returns {Object} 包含生成的代码和依赖项
             */
            processRange(startCell, endCell) {
                const deps = new Set();
                const cells = this.getCellsInRange(startCell, endCell);
                let code = '[';
                
                cells.forEach((cell, index) => {
                    const targetCell = this.cellData[cell];
                    if (targetCell) {
                        deps.add(targetCell);
                        code += `$.${cell}`;
                    } else {
                        code += 'null';
                    }
                    if (index < cells.length - 1) code += ',';
                });
                
                code += ']';
                return { code, deps };
            }
        
            /**
             * 获取范围内的所有单元格（如 A1:A3 → ["A1","A2","A3"]）
             * @param {string} start - 起始单元格
             * @param {string} end - 结束单元格
             * @returns {Array} 单元格数组
             */
            getCellsInRange(start, end) {
                // 解析列字母和行号（如"A1" → {col: 'A', row: 1}）
                const parseCell = (cell) => ({
                    col: cell.match(/[A-Z]+/)[0],
                    row: parseInt(cell.match(/\d+/)[0])
                });
                
                const startCell = parseCell(start);
                const endCell = parseCell(end);
                const cells = [];
                
                //// 仅支持同列范围（如A1:A3）
                //if (startCell.col !== endCell.col) {
                //    throw new Error(`目前仅支持单列范围（如A1:A3），实际收到：${start}:${end}`);
                //}
                const starcol=startCell.col.charCodeAt();
                const endcol=endCell.col.charCodeAt();
                for (let col = starcol; col <= endcol; col++) {   
                    // 生成范围内所有单元格
                    for (let row = startCell.row; row <= endCell.row; row++) {
                        cells.push(`${String.fromCharCode(col)}${row}`);
                    }
                }
                
                return cells;
            }
        
            /**
             * 处理普通单元格引用
             * @param {string} cellKey - 单元格键（如"A1"）
             * @returns {Object} 包含生成的代码和依赖项
             */
            processCellRef(cellKey) {
                const targetCell = this.cellData[cellKey];
                if (targetCell) {
                    return { code: `$.${cellKey}`, dep: targetCell };
                }
                return { code: 'null', dep: null };
            }
        
            /**
             * 公式词法分析器
             * @param {string} formula - 待分析的公式字符串
             * @returns {Array} 返回词法单元数组
             */
            tokenizeFormula(formula) {
                const tokens = [];     // 存储词法单元
                let currentToken = ''; // 当前正在分析的词法单元
                let inString = false;  // 是否在字符串中
                
                for (let i = 0; i < formula.length; i++) {
                    const char = formula[i];
                    
                    if (char === '"') {
                        // 处理字符串字面量
                        inString = !inString;
                        currentToken += char;
                        if (!inString) {
                            tokens.push(currentToken);
                            currentToken = '';
                        }
                    } else if (inString) {
                        // 字符串内容直接保留
                        currentToken += char;
                    } else if (char.match(/[A-Za-z]/)) {
                        // 处理字母（可能是单元格引用或函数名）
                        currentToken += char;
                    } else if (char.match(/[0-9]/) && currentToken.match(/[A-Za-z]$/)) {
                        // 处理字母后的数字（形成单元格引用）
                        currentToken += char;
                    } else if (char.match(/[+\-*/%^&=<>!,():]/)) {
                        // 处理运算符和分隔符
                        if (currentToken) {
                            tokens.push(currentToken);
                            currentToken = '';
                        }
                        tokens.push(char);
                    } else if (char.trim() === '') {
                        // 忽略空白字符（字符串内除外）
                        if (currentToken) {
                            tokens.push(currentToken);
                            currentToken = '';
                        }
                    } else {
                        // 其他字符
                        currentToken += char;
                    }
                }
                
                // 处理最后一个词法单元
                if (currentToken) {
                    tokens.push(currentToken);
                }
                
                return tokens;
            }
        
            /**
             * 判断是否为单元格引用
             * @param {string} token - 待检查的词法单元
             * @returns {boolean} 如果是A1、B2这类格式返回true
             */
            isCellReference(token) {
                return /^[A-Z]\d+$/.test(token);
            }
        
            /**
             * 判断是否为系统函数
             * @param {string} token - 待检查的词法单元
             * @returns {boolean} 如果是系统函数返回true
             */
            isSystemFunction(token) {
                return this.systemIdentifier && 
                    typeof this.systemIdentifier === 'object' && 
                    token in this.systemIdentifier;
            }
        
            /**
             * 判断是否为系统函数
             * @param {string} token - 待检查的词法单元
             * @returns {boolean} 如果是系统函数返回true
             */
             isActionFunction(token) {
                return this.actionCall && 
                    typeof this.actionCall === 'object' && 
                    token in this.actionCall;
            }
        
            /**
             * 处理系统函数
             * @param {string} token - 系统函数名称
             * @returns {string} 返回可执行的函数字符串
             */
            processSystemFunction(token) {
                if (!this.systemIdentifier || !this.systemIdentifier[token]) {
                    return 'null';  // 未定义的函数返回null
                }
                
                // 获取系统函数实现
                const func = this.systemIdentifier[token];
                
                // 返回函数调用字符串
                return `(${func.toString()})`;
            }
            
            /**
             * 设置行列调整功能
             */
            setupResizers() {
                // 列宽调整
                const columnResizers = this.table.querySelectorAll('.resizer');
                columnResizers.forEach(resizer => {
                    resizer.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        const th = resizer.parentElement;
                        let startX = e.clientX;
                        let startWidth = th.offsetWidth;
                        resizer.classList.add('active');
                        
                        const resizeColumn = (e) => {
                            const th = resizer.parentElement;
                            const newWidth = startWidth + (e.clientX - startX);
                            th.style.width = `${newWidth}px`;
                            th.style.minWidth = `${newWidth}px`;
                            this.updateSelectionRect();
                        };
                        
                        const stopResize = () => {
                            resizer.classList.remove('active');
                            document.removeEventListener('mousemove', resizeColumn);
                            document.removeEventListener('mouseup', stopResize);
                        };
        
                        document.addEventListener('mousemove', resizeColumn);
                        document.addEventListener('mouseup', stopResize);
                    });
                });
                
                // 行高调整
                const rowResizers = this.table.querySelectorAll('.row-resizer');
                rowResizers.forEach(resizer => {
                    resizer.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        const tr = resizer.closest('tr');
                        let startY = e.clientY;
                        let startHeight = tr.offsetHeight;
                        resizer.classList.add('active');
                        
                        const resizeRow = (e) => {
                            const tr = resizer.closest('tr');
                            const newHeight = startHeight + (e.clientY - startY);
                            tr.style.height = `${newHeight}px`;
                            tr.querySelectorAll('td').forEach(td => {
                                td.style.height = `${newHeight}px`;
                            });
                            this.updateSelectionRect();
                        };
                        
                        const stopResize = () => {
                            resizer.classList.remove('active');
                            document.removeEventListener('mousemove', resizeRow);
                            document.removeEventListener('mouseup', stopResize);
                        };
                        
                        document.addEventListener('mousemove', resizeRow);
                        document.addEventListener('mouseup', stopResize);
                    });
                });
            }
        
            /**
             * 更新选择矩形的位置和大小
             * @param {HTMLElement} [cell1] - 起始单元格
             * @param {HTMLElement} [cell2] - 结束单元格
             */
            updateSelectionRect(cell1, cell2) {
                this.startCell = cell1 ? cell1 : this.startCell;
                this.endCell = cell2 ? cell2 : this.endCell;
                
                if (!this.startCell || !this.endCell) return;
        
                // 计算两个单元格的边界矩形
                const rect1 = this.startCell.getBoundingClientRect();
                const rect2 = this.endCell.getBoundingClientRect();
                // 选择框的 offsetParent 是 .excel-table-container（position:relative + overflow:auto）。
                // cell 的 getBoundingClientRect 是「视口坐标（已含滚动）」，而绝对定位的 rect 的
                // left/top 是相对容器内容原点（滚动 0）的内容坐标。两者差只得到「相对可视区」的偏移，
                // 没算上滚动量，所以滚动后框会偏移 scrollTop/scrollLeft。这里把滚动量加回去即可对齐。
                const sc = (this.tableContainer || this.container);
                const rect3 = sc.getBoundingClientRect();
                const sx = sc.scrollLeft || 0;
                const sy = sc.scrollTop || 0;

                // 计算包含两个单元格的矩形区域
                const left = Math.min(rect1.left, rect2.left);
                const top = Math.min(rect1.top, rect2.top);
                const width = Math.max(rect1.right, rect2.right) - left;
                const height = Math.max(rect1.bottom, rect2.bottom) - top;

                // 更新选择矩形样式：视口差 + 滚动量 = 内容坐标
                this.selectionRect.style.left = `${left - rect3.left + sx}px`;
                this.selectionRect.style.top = `${top - rect3.top + sy}px`;
                this.selectionRect.style.width = `${width}px`;
                this.selectionRect.style.height = `${height}px`;
            }
        
            /**
             * 设置多选功能
             */
            setupMultSelect() {
                // 鼠标按下事件 - 开始选择
                this.container.addEventListener('mousedown', (e) => {
                    if(e.button==1){
                        e.preventDefault(); // 防止文本选择
                        return;
                    }
                    this.selectionRect.style.display = 'none';
        
                    // 获取鼠标下的元素
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;
                    const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);
                    const currentCell = elementUnderMouse.closest('td');
                    
                    if (currentCell == null) return;
                    
                    this.isSelecting = true;
                    this.endCell = this.startCell = currentCell;
                    this.updateSelectionRect();
                    
                });
                
                // 鼠标移动事件 - 更新选择区域
                document.addEventListener('mousemove', (e) => {
                    if (!this.isSelecting) return;
                    
                    // 获取鼠标下的元素
                    const mouseX = e.clientX;
                    const mouseY = e.clientY;
                    const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);
                    const currentCell = elementUnderMouse.closest('td');
                    
                    if (currentCell && currentCell !== this.startCell) {
                        this.endCell = currentCell;
                        this.updateSelectionRect();
                    }
                    
                    // 根据选择区域大小决定是否显示选择矩形
                    if (this.startCell != this.endCell) {
                        if (this.selectionRect.style.display != 'block')
                            this.selectionRect.style.display = 'block';
                    } else {
                        this.selectionRect.style.display = 'none';
                    }
                });
                
                // 鼠标释放事件 - 结束选择
                document.addEventListener('mouseup', () => {
                    if (!this.isSelecting) return;
                    
                    this.isSelecting = false;
                    
                    // 如果只选择了一个单元格，则聚焦到该单元格
                    if (this.startCell == this.endCell) {
                        this.startCell.children[0].focus();
                        this.selectionRect.style.display = 'none';
                    }
                });

                // 滚动时同步选择框：selection-rect 是相对容器定位的浮动层，
                // 不随单元格滚动重算位置，会导致框「漂」在固定位置。
                // 这里监听可滚动容器（.excel-table-container）的 scroll，重算即可跟随。
                const scroller = this.tableContainer;
                if (scroller) {
                    scroller.addEventListener('scroll', () => {
                        if (this.startCell && this.endCell &&
                            this.selectionRect.style.display === 'block') {
                            this.updateSelectionRect();
                        }
                    });
                }
            }
        }
        