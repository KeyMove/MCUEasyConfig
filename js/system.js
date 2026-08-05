/**
 * NodeSystem - 画布系统：节点管理、连接绘制、缩放平移、封装与 AF 菜单入口
 *
 * 说明：本文件原本是 index.html 内联 <script> 中的 nodeSystem 对象，
 * 现拆分为独立模块。Node 类见 js/node.js，封装生成见 js/packages.js，
 * AF 右键菜单见 js/af-menu.js。三者通过经典 <script> 共享全局作用域。
 */
// 不参与“实例锁定”的总线集合。
// 语义：SPI / I2C / UART 等总线存在多个片上实例（SPI1/SPI2…），一个外设接入后应当锁定到
// 同一实例，避免混用；而 PWM/TIM 的 CHx 只是“给我一个可用通道”，不同通道可来自不同定时器，
// 连接时若锁定到某个 TIMx 会导致后续拖拽只高亮该定时器、漏掉其他 TIMx 的对应通道。
// 因此 TIM 不纳入实例锁定；MCO / IR_OUT 虽单实例，锁定也无害，故仅排除 TIM。

// 接口引脚“角色”归一化同义词表：器件 pad 的 label / signal / function 经此映射到规范角色，
// 供多实例接口代码生成时把真实 GPIO 填入对应占位符
// （{{CS}}/{{SCK}}/{{MOSI}}/{{MISO}}/{{SCL}}/{{SDA}}）。def 作者用规范占位符即可跨不同 pad 命名的器件复用。
const INTERFACE_ROLE_SYNONYMS = {
    CS: 'CS', NCS: 'CS', CE: 'CS', NCE: 'CS', CSB: 'CS', CHIPSELECT: 'CS',
    SCK: 'SCK', CLK: 'SCK', SCLK: 'SCK',
    MOSI: 'MOSI', SIMO: 'MOSI',
    MISO: 'MISO', SOMI: 'MISO',
    SCL: 'SCL', SDA: 'SDA'
};

const NON_LOCKABLE_BUSES = new Set(['TIM']);

// 信号名同义词表已收编进 config（window.APP_SIGNAL_CONFIG.synonyms），
// 运行时由 expandSignalName 动态读取，不再内联常量。

let nodeSystem = {
    container: null,
    canvas: null,
    ctx: null,
    nodes: new Map(),
    connections: [],
    nodeIdCounter: 1,
    isDraggingNode: false,
    isDraggingConnection: false,
    isSelecting: false,
    isPanning: false,
    draggedNode: null,
    connectionSource: null,
    connectionTarget: null,
    currentMousePos: { x: 0, y: 0 },
    selectionStart: { x: 0, y: 0 },
    selectionRectangle: null,
    selectedNodes: new Set(),
    highlightedNode: null,
    highlightedPads: new Set(),
    highlightedConnections: new Set(), // 新增：高亮的连接

    // 总线实例锁定：bus 类型（如 "SPI"）-> 已实例化的外设（如 "SPI1"）。
    // 一旦某个 SPI 实例被连接，后续外设连线只高亮该实例的 IO，不再高亮其他实例（如 SPI2）。
    busLocks: {},
    // SVD 寄存器编辑器保存的“改动寄存器”集合：id -> { id, address(hex串), name, reset(数值), value(数值) }
    // 仅保存与复位值不同（已改动）的寄存器；reset 用于 dump 时判断是否需要输出。
    svdRegValues: {},

    // 自定义接口初始化参数：[{ name, raw, entries:[{addr,value}] }]
    // name 用于匹配连接中外设引脚的 signal（如 "TIM1_CH1" / "CHX"）；entries 为该接口要写入的寄存器（地址,值）。
    interfaceInits: [],
    // 自定义接口“函数”定义：[{ name, raw, code }]
    // 与接口初始化同策略：name 用于匹配连接中接口名（含空格分隔的多别名）；code 为整段程序代码，导出到「程序段」栏。
    // 软件模拟与硬件共用此单一池：硬件路由经 names 命中；转换器/普通器件以 @ 接口名声明则经 forcedSimNames 强制命中（忽略 & 条件）。
    interfaceFunctions: [],
    // 上一轮由接口函数匹配收集到的已使用函数定义（按命中顺序、去重；供 computeFunctionDump 输出）
    usedFuncDefs: [],
    // 强制(@)接口的多实例展开：每个触发连接的器件节点 = 一个实例
    // [{ nodeId, deviceName, idx, pins:{ROLE:gpio}, defNames:[去@后的接口名], defs:[def对象] }]
    usedInstances: [],
    // 强制(@)命中的接口函数定义（与 usedFuncDefs 互斥：被强制的 def 只经实例展开输出，不在硬件路径重复单列）
    forcedDefs: [],
    // 寄存器地址 → SVD 寄存器信息索引（懒构建缓存）
    _regAddrIndex: null,
    // 上一轮由接口初始化写入的 svdRegValues 的 id 列表（用于增量清除）
    _ifaceRegIds: [],
    // 上一轮由接口初始化写入的「逐行」记录（按输入顺序，同地址可多行）——供变动值 dump 输出完整多行，
    // 而 svdRegValues 对同地址按“最后一行”取值（SVD 一个寄存器只存一个值）。每项：
    // { _src:'iface', name, key, addr, value, regId, regName, reset, address }
    _ifaceRegLines: [],
    // 上一轮应用后的签名（用于判断是否有变化，避免无谓刷新 SVD 视图）
    _ifaceSig: '',
    // 当前连接实际使用到的外设实例列表（如 ["ADC","SPI1","TIM1"]）——
    // 由 recomputeInterfaceInitRegisters 依据连接推导；供后续“初始化时钟(RCC 使能)”收集外设使能位使用。
    usedPeripherals: [],
    // 当前总线高亮的 Pad 元素（拖拽中），用于清除
    busHighlightedPads: [],

    panStart: { x: 0, y: 0 },
    panOffset: { x: 0, y: 0 },
    zoomLevel: 1,
    minZoom: 0.3,
    maxZoom: 3,
    origin: { x: 0, y: 0 }, // 缩放原点

    // AF（Alternate Function）右键菜单管理器，由 main.js 注入
    afManager: null,

    // 线条样式配置
    lineConfig: {
        color: '#00dbde',
        width: 3
    },

    // 回调函数集合
    callbacks: {
        onConnectionChange: null,
        onNodeChange: null,
        onStatusChange: null,
        onRegistersChanged: null
    },

    // 注册回调函数
    registerCallback(type, callback) {
        if (Object.prototype.hasOwnProperty.call(this.callbacks, type)) {
            this.callbacks[type] = callback;
        }
    },

    // 触发回调函数
    triggerCallback(type, data) {
        if (this.callbacks[type]) {
            this.callbacks[type](data);
        }
    },

    init(container) {
        this.container = container;

        // 动态创建canvas
        this.createCanvas();

        // 创建初始节点
        this.createNode({ name: '输入节点', top: [], left: ['输入1', '输入2'], right: ['输出'], bottom: [] }, 150, 150);
        this.createNode({ name: '处理节点', top: ['输入'], left: [], right: ['输出1', '输出2'], bottom: [] }, 650, 200);
        this.createNode({ name: '输出节点', top: [], left: ['输入'], right: [], bottom: ['输出1', '输出2', '输出3'] }, 350, 450);
        this.createNode({ name: '存储节点', top: ['输入1', '输入2'], left: [], right: ['输出'], bottom: [] }, 800, 450);

        this.setupEventListeners();
        this.loadInterfaceInits();
        this.loadInterfaceFunctions();
        this._regAddrIndex = this.buildRegAddressIndex();
        this.drawAll();
        this.updateZoomLevelDisplay();
    },

    createCanvas() {
        // 创建canvas容器
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'canvas-container';

        // 创建canvas元素
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'connectionCanvas';
        canvasContainer.appendChild(this.canvas);

        // 将canvas容器插入到container的最前面
        this.container.insertBefore(canvasContainer, this.container.firstChild);

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    },

    resizeCanvas() {
        const containerRect = this.container.getBoundingClientRect();
        this.canvas.width = containerRect.width;
        this.canvas.height = containerRect.height;
    },

    createNode(config, x, y) {
        const nodeId = `node${this.nodeIdCounter++}`;
        const node = new Node(config, x, y, nodeId, this);
        this.nodes.set(nodeId, node);
        // 寄存器 → 右键菜单配置：用端口复位值初始化各引脚 GPIO 配置（仅带 reset 表的 MCU 设备生效）
        if (typeof node.initRegistersFromReset === 'function') node.initRegistersFromReset();
        this.container.appendChild(node.element);

        // 应用当前的缩放和位置变换
        this.applyNodeTransform(node);

        // 绑定节点全部事件（拖动 / 删除 / Pad / 自定义器件右键菜单 / MCU 寄存器编辑）
        this.bindNodeEvents(node, nodeId);

        // 触发节点变化回调
        this.triggerCallback('onNodeChange', { type: 'create', nodeId });

        return nodeId;
    },

    /**
     * 绑定一个节点的全部交互事件。
     * createNode 与新节点创建、loadFromJSON 反序列化都调用本方法，
     * 避免「加载 JSON 后丢失右键菜单（自定义器件操作 / MCU 寄存器编辑）」的问题。
     */
    bindNodeEvents(node, nodeId) {
        // 添加节点拖动事件监听器
        node.element.addEventListener('mousedown', (e) => this.startNodeDrag(e));
        const deleteButton = node.element.querySelector('.delete-node');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteNode(nodeId);
            });
        }

        // 添加pad事件监听器
        const pads = node.element.querySelectorAll('.node-port');
        pads.forEach(pad => {
            pad.addEventListener('mousedown', (e) => this.startConnection(e, pad));
            // 右键点击 Pad -> 打开 AF 功能菜单（由 afManager 处理；若无则断开连接）
            pad.addEventListener('contextmenu', (e) => this.openAF(e, pad));
            pad.addEventListener('mouseenter', (e) => this.highlightConnectedPads(e, pad));
            pad.addEventListener('mouseleave', (e) => this.removePadHighlight());
        });

        // 自定义器件右键菜单：芯片本体（非 Pad）右键 → 弹出 JSON 定义的操作（滑块/按钮）。
        // Pad 的 contextmenu 已 stopPropagation，不会冒泡到此。自定义器件始终屏蔽原生右键菜单，
        // 仅当该器件带 deviceMenu 时才弹出器件操作菜单（否则干净地不弹，避免“没反应”错觉）。
        node.element.addEventListener('contextmenu', (e) => {
            if (node.config && node.config.peripheral && node.config.peripheral.key === '__custom__') {
                e.preventDefault();
                if (node.config.deviceMenu && typeof openCustomDeviceMenu === 'function') {
                    openCustomDeviceMenu(e, node);
                }
            } else if (node.config && node.config.device) {
                // MCU 设备：右键打开「该 MCU 对应的 SVD 寄存器」编辑器。
                // 优先用 device 显式绑定的 SVD key（在设备编辑器下拉框里指定），
                // 其次按 MCU 大类名称自动匹配（resolveSvdKeyForDevice，封装继承同一 SVD）。
                e.preventDefault();
                const dev = node.config.device;
                let key = (dev && dev.svdKey && dev.svdKey !== '__auto__') ? dev.svdKey : '';
                if (!key && window.SvdLib && typeof window.SvdLib.resolveSvdKeyForDevice === 'function') {
                    key = window.SvdLib.resolveSvdKeyForDevice(dev);
                }
                if (typeof window.openSvdWindow === 'function') {
                    if (key) window.openSvdWindow(key);
                    else window.openSvdWindow();  // 未匹配到 → 退化为全局激活 SVD
                }
            }
        });
    },

    /**
     * 生成一个「自定义 MCU 设备」的多个封装节点（参考 config 的 mcu.packages 结构）。
     * def.packages 为封装数组，每个含 { name, packageType, pins:[{label,port}] }，
     * 共享顶层 af / special / gpio。每个封装生成一个独立设备节点（错开摆放）。
     * @param {Object} def  { name, packages:[...], af, special, gpio }
     * @returns {string[]} 生成的节点 id 列表
     */
    addCustomDeviceSet(def) {
        const pkgs = (def && def.packages) || [];
        if (!pkgs.length) return [];
        const mcuName = def.name || '自定义设备';
        const shared = {
            af: def.af || null,
            special: def.special || null,
            gpio: def.gpio || null
        };
        const containerRect = this.container.getBoundingClientRect();
        const ids = [];
        const cols = Math.ceil(Math.sqrt(pkgs.length));
        pkgs.forEach((pkg, i) => {
            const single = {
                name: pkg.name || (pkgs.length === 1 ? mcuName : `${mcuName} (${pkg.packageType || 'PKG'})`),
                packageType: pkg.packageType || 'SOP',
                pins: pkg.pins || [],
                af: shared.af,
                special: shared.special,
                gpio: shared.gpio
            };
            const config = buildCustomDevice(single);
            const col = i % cols, row = Math.floor(i / cols);
            const x = Math.max(40, (containerRect.width - config.width) / 2 + col * 180 - (cols - 1) * 90 + (Math.random() * 40 - 20));
            const y = Math.max(40, (containerRect.height - config.height) / 2 + row * 220 - (Math.ceil(pkgs.length / cols) - 1) * 110 + (Math.random() * 40 - 20));
            const nodeId = this.createNode(config, x, y);
            const node = this.nodes.get(nodeId);
            if (node) {
                ['left', 'right', 'top', 'bottom'].forEach(side => {
                    const len = (node.config && node.config[side] ? node.config[side].length : 0);
                    for (let idx = 0; idx < len; idx++) {
                        const fns = (typeof node.getPadFunctions === 'function') ? node.getPadFunctions(side, idx) : [];
                        const inFn = fns.find(f => (typeof isGpioInput === 'function') ? isGpioInput(f) : false);
                        if (inFn) {
                            const pull = (typeof gpioInputPull === 'function') ? gpioInputPull(inFn) : 0;
                            node.setIoRegs(side, idx, { mode: 0, otype: 0, pupd: pull });
                        }
                    }
                });
            }
            ids.push(nodeId);
        });
        return ids;
    },

    startConnection(e, padElement) {
        // 非左键（右键等）不在此启动连接，且阻止冒泡到 container 触发平移
        if (e.button !== 0) {
            e.stopPropagation();
            return;
        }

        // 检查Pad是否被禁用
        const nodeId = padElement.dataset.node;
        const port = padElement.dataset.port;
        const index = padElement.dataset.index;
        const node = this.nodes.get(nodeId);

        if (node && node.isPadDisabled(port, index)) {
            e.stopPropagation();
            return;
        }

        e.stopPropagation();

        this.connectionSource = { nodeId, port, index };
        this.isDraggingConnection = true;

        // 总线类 Pad 拖拽：高亮对端所有可用的候选 IO（外设 SPI pad -> MCU IO；或反向）
        const srcNode = this.nodes.get(nodeId);
        if (srcNode) {
            if (srcNode.config && srcNode.config.peripheral && srcNode.getPadBus(port, index)) {
                this.highlightBusForPeripheral(srcNode, port, index);
            } else if (srcNode.config && srcNode.config.device) {
                const info = this.getMcuBusFunction(srcNode, port, index, null);
                if (info) this.highlightBusForDevice(srcNode, port, index);
            } else if (typeof srcNode.getPadFunctions === 'function' && srcNode.getPadFunctions(port, index).length) {
                // 自定义器件 IO 附加功能脚：高亮匹配的外设引脚
                this.highlightForCustomDevice(srcNode, port, index);
            }
        }

        // 更新状态
        this.updateConnectionStatus("正在连接...", "#ffaa00", "拖动到目标Pad完成连接");
        this.updateStatus();
        this.drawAll();
    },

    // 右键点击 Pad 的统一入口：优先交给 AF 菜单管理器，否则断开连接
    openAF(e, padElement) {
        e.preventDefault();
        e.stopPropagation();
        if (this.afManager && typeof this.afManager.open === 'function') {
            this.afManager.open(e, padElement);
        } else {
            this.disconnectPad(e, padElement);
        }
    },

    disconnectPad(e, padElement) {
        e.preventDefault();
        e.stopPropagation();

        const nodeId = padElement.dataset.node;
        const port = padElement.dataset.port;
        const index = padElement.dataset.index;

        // 删除与该Pad相关的所有连接
        const originalLength = this.connections.length;
        this.connections = this.connections.filter(conn =>
            !(conn.source.nodeId === nodeId && conn.source.port === port && conn.source.index == index) &&
            !(conn.target.nodeId === nodeId && conn.target.port === port && conn.target.index == index)
        );

        // 如果连接数发生变化，触发回调
        if (originalLength !== this.connections.length) {
            this.triggerCallback('onConnectionChange', { type: 'disconnect', nodeId, port, index });
        }

        // 断开连接时，一并清除该引脚的复用功能与 GPIO 寄存器配置（仅 MCU 类芯片）
        // 清除使用芯片复位值而非直接清零，使引脚回到上电默认态
        const node = this.nodes.get(nodeId);
        if (node && node.isChip && typeof node.resetIoRegs === 'function') {
            node.resetIoRegs(port, index);
        }

        // 更新状态
        this.updateConnectionStatus("已断开连接", "#ffaa00", `已断开 ${nodeId} 的 ${port}[${index}] 连接`);
        this.recomputeInterfaceInitRegisters();
        this.drawAll();
    },

    highlightConnectedPads(e, padElement) {
        e.stopPropagation();

        // 连线拖拽中：保持总线高亮，不触发相连高亮
        if (this.isDraggingConnection) return;

        const nodeId = padElement.dataset.node;
        const port = padElement.dataset.port;
        const index = padElement.dataset.index;

        // 检查Pad是否被禁用
        const node = this.nodes.get(nodeId);
        if (node && node.isPadDisabled(port, index)) {
            return;
        }

        // 清除之前的高亮
        this.removePadHighlight();

        // 高亮当前Pad
        padElement.style.boxShadow = '0 0 15px rgba(0, 255, 100, 1)';
        padElement.style.backgroundColor = 'rgba(0, 255, 100, 1)';
        padElement.style.color = 'white';
        this.highlightedPads.add(padElement);

        // 构建邻接关系：显式连接（带连接线索引）+ 直通节点内部连接（无连接线）
        const keyOf = (n, p, i) => `${n}:${p}:${i}`;
        const adj = new Map();
        const pushEdge = (aKey, nb, connIndex) => {
            if (!adj.has(aKey)) adj.set(aKey, []);
            adj.get(aKey).push({ nodeId: nb.nodeId, port: nb.port, index: nb.index, connIndex });
        };
        // 1) 显式连接（双向）
        this.connections.forEach((conn, ci) => {
            const a = { nodeId: conn.source.nodeId, port: conn.source.port, index: conn.source.index };
            const b = { nodeId: conn.target.nodeId, port: conn.target.port, index: conn.target.index };
            pushEdge(keyOf(a.nodeId, a.port, a.index), b, ci);
            pushEdge(keyOf(b.nodeId, b.port, b.index), a, ci);
        });
        // 2) 直通节点：其内部引脚相连，hover 任一脚会把对应脚一并高亮；与显式连接一起参与广度优先透传。
        this.nodes.forEach(n => {
            if (!n.config || (!n.config.passThrough && !n.config.converter)) return;
            const keys = Array.from(n.pads.keys());
            if (n.config.converter) {
                // 模拟接口转换器：左右成对直通（left[i]↔right[i]），不全部连通。
                // 使 hover 左端 GPIO_SCK 仅高亮右端对应的 SPI_SCK（视觉对齐、避免一处点全亮造成混乱）。
                const byIdx = (k) => parseInt(k.split('-')[1], 10) || 0;
                const leftKeys = keys.filter(k => k.indexOf('left-') === 0).sort((a, b) => byIdx(a) - byIdx(b));
                const rightKeys = keys.filter(k => k.indexOf('right-') === 0).sort((a, b) => byIdx(a) - byIdx(b));
                const pairs = Math.min(leftKeys.length, rightKeys.length);
                for (let i = 0; i < pairs; i++) {
                    const [sa, ia] = leftKeys[i].split('-');
                    const [sb, ib] = rightKeys[i].split('-');
                    const a = { nodeId: n.nodeId, port: sa, index: ia };
                    const b = { nodeId: n.nodeId, port: sb, index: ib };
                    pushEdge(keyOf(a.nodeId, a.port, a.index), b, null);
                    pushEdge(keyOf(b.nodeId, b.port, b.index), a, null);
                }
            } else {
                // 普通直通（如 2pin MCO↔IO）：内部引脚全连通。
                for (let i = 0; i < keys.length; i++) {
                    for (let j = i + 1; j < keys.length; j++) {
                        const [sa, ia] = keys[i].split('-');
                        const [sb, ib] = keys[j].split('-');
                        const a = { nodeId: n.nodeId, port: sa, index: ia };
                        const b = { nodeId: n.nodeId, port: sb, index: ib };
                        pushEdge(keyOf(a.nodeId, a.port, a.index), b, null);
                        pushEdge(keyOf(b.nodeId, b.port, b.index), a, null);
                    }
                }
            }
        });

        // 从当前 Pad 出发做广度优先遍历，收集所有可达 Pad（含经直通节点透传）
        const startKey = keyOf(nodeId, port, index);
        const visited = new Set([startKey]);
        const queue = [startKey];
        const connSet = new Set();
        while (queue.length) {
            const ck = queue.shift();
            const [cn, cp, ci] = ck.split(':');
            const neighbors = adj.get(ck) || [];
            for (const nb of neighbors) {
                if (nb.connIndex != null) connSet.add(nb.connIndex);
                const nk = keyOf(nb.nodeId, nb.port, nb.index);
                if (visited.has(nk)) continue;
                visited.add(nk);
                const nn = this.nodes.get(nb.nodeId);
                if (nn) {
                    const pad = nn.pads.get(`${nb.port}-${nb.index}`);
                    if (pad && !nn.isPadDisabled(nb.port, nb.index)) {
                        pad.style.boxShadow = '0 0 15px rgba(0, 255, 100, 1)';
                        pad.style.backgroundColor = 'rgba(0, 255, 100, 1)';
                        pad.style.color = 'white';
                        this.highlightedPads.add(pad);
                    }
                }
                queue.push(nk);
            }
        }

        // 记录需要高亮的连接索引
        connSet.forEach(ci => this.highlightedConnections.add(ci));

        // 重新绘制以高亮连接线
        this.drawAll();
    },

    removePadHighlight() {
        // 连线拖拽中：保持总线高亮（清理由 clearBusHighlight 在 mouseUp 时统一处理）
        if (this.isDraggingConnection) return;

        this.highlightedPads.forEach(pad => {
            // 关键：清除内联高亮样式，把外观交还给 CSS / 类控制，
            // 否则内联样式会永久覆盖芯片引脚原本的语义配色（灰/橙/蓝/棕），
            // 残留的白色 boxShadow 也会让 Pad 一直“发光”无法复原。
            pad.style.boxShadow = '';
            pad.style.backgroundColor = '';
            pad.style.color = '';
            // 重新同步该 Pad 的真实语义外观（已分配 AF → 橙色、电源/总线样式等）
            const nodeId = pad.dataset.node;
            const port = pad.dataset.port;
            const index = parseInt(pad.dataset.index, 10);
            const node = this.nodes.get(nodeId);
            if (node && typeof node.refreshPad === 'function') {
                node.refreshPad(port, index);
            }
        });
        this.highlightedPads.clear();
        this.highlightedConnections.clear();
        this.drawAll(); // 重新绘制以取消高亮连接线
    },

    // ==================== 总线（Bus）连线高亮与实例锁定 ====================

    /**
     * MCP/AF 等总线 pad 拖拽时，高亮对端所有“具备该功能”的 IO。
     * 当该总线已锁定到某实例（如 SPI1），则仅高亮该实例的 IO。
     */
    /**
     * 取得某总线当前生效的实例锁定。
     * 对于 NON_LOCKABLE_BUSES（如 TIM）始终返回 null，即不做实例限制。
     */
    resolveBusLock(bus) {
        if (!bus || NON_LOCKABLE_BUSES.has(bus)) return null;
        return this.busLocks[bus] || null;
    },

    _applyBusHighlight(pads, statusText) {
        this.clearBusHighlight();
        pads.forEach(p => {
            if (!p) return;
            p.classList.add('pin-bus-target');
            this.busHighlightedPads.push(p);
        });
        if (statusText) {
            this.updateConnectionStatus('总线高亮', '#38bdf8',
                `高亮 ${pads.length} 个候选 IO · ${statusText}`);
        }
        this.drawAll();
    },

    /** 清除总线高亮 */
    clearBusHighlight() {
        if (this.busHighlightedPads && this.busHighlightedPads.length) {
            this.busHighlightedPads.forEach(p => { if (p) p.classList.remove('pin-bus-target'); });
        }
        this.busHighlightedPads = [];
    },

    /**
     * 从“外设总线脚”出发：高亮所有 MCU IO，其 AF 表含匹配信号的总线功能。
     * 已锁定实例时（如 SPI1）只高亮该实例。
     */
    highlightBusForPeripheral(srcNode, side, index) {
        const sig = srcNode.getPadSignal(side, index);
        const bus = srcNode.getPadBus(side, index);
        if (!bus) return;
        const locked = this.resolveBusLock(bus); // 例："SPI1" 或 undefined（TIM 等始终为 null）
        const targets = [];

        this.nodes.forEach((node) => {
            if (!node.config || !node.config.device) return; // 仅 MCU 设备
            for (const s of ['top', 'right', 'bottom', 'left']) {
                const list = node.config[s] || [];
                list.forEach((entry, i) => {
                    if (!entry || typeof entry !== 'object' || !entry.port) return;
                    const afArr = node.config.device.af && node.config.device.af[entry.port];
                    const specialArr = node.getSpecialFunctions(s, i);
                    let hit = false;
                    if (afArr) {
                        hit = afArr.some(fn => {
                            if (!fn || fn === '-') return false;
                            const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(fn) : null;
                            if (!info || info.bus !== bus) return false;
                            if (locked && info.instance !== locked) return false;
                            return (typeof signalMatches === 'function') ? signalMatches(sig, info.signal) : false;
                        });
                    }
                    if (!hit && specialArr.length) {
                        // 特殊功能（ADC_INx / GPIO_OUT / NRST / EXTCLK）：与 AF 同逻辑，
                        // 但用 funcMatchesPeripheral（含 AINX 通配：源为 AINX 匹配任意 ADC_INx；
                        // GPIO_OUT 直接同名匹配 GPIO 输出外设）
                        hit = specialArr.some(fn => (typeof funcMatchesPeripheral === 'function')
                            ? funcMatchesPeripheral(fn, bus, sig) : false);
                    }
                    if (hit) targets.push(node.pads.get(`${s}-${i}`));
                });
            }
        });

        // 自定义器件（外设风格）引脚的“IO 附加功能”也可作为候选高亮目标：
        // 例如外设 ADC/AIN3 拖拽时，高亮自定义器件中声明了 “PA6 ADC_IN3” 的引脚。
        this.nodes.forEach((node) => {
            if (!node.config || !node.config.peripheral) return;
            if (typeof node.getPadFunctions !== 'function') return;
            for (const s of ['top', 'right', 'bottom', 'left']) {
                const list = node.config[s] || [];
                list.forEach((entry, i) => {
                    const fns = node.getPadFunctions(s, i);
                    if (fns.some(fn => (typeof funcMatchesPeripheral === 'function')
                        ? funcMatchesPeripheral(fn, bus, sig) : false)) {
                        targets.push(node.pads.get(`${s}-${i}`));
                    }
                });
            }
        });

        const label = `${bus}${locked ? ' ' + locked : ''} · ${sig}`;
        this._applyBusHighlight(targets, label);
    },

    /**
     * 从“MCU 总线脚”出发（反向）：高亮所有外设的总线脚，其信号与该 MCU 脚的总线功能匹配。
     * 已锁定实例时，仅高亮对应总线（MCU 脚侧的实例由 AF 决定，无需再锁）。
     */
    highlightBusForDevice(srcNode, side, index) {
        // 收集该 MCU 脚的所有总线功能（已分配的 AF 优先，其次全部能力）
        const fns = [];
        const assigned = srcNode.getAF(side, index);
        if (assigned && assigned.id) {
            const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(assigned.id) : null;
            if (info) fns.push(info);
        }
        const port = srcNode.getPortName(side, index);
        if (port && srcNode.config.device && srcNode.config.device.af && srcNode.config.device.af[port]) {
            for (const fn of srcNode.config.device.af[port]) {
                if (!fn || fn === '-') continue;
                const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(fn) : null;
                if (info && !fns.find(f => f.instance === info.instance && f.signal === info.signal)) {
                    fns.push(info);
                }
            }
        }
        // 特殊功能（ADC_INx / GPIO_OUT / NRST / EXTCLK）：非 AF 表，按字面能力参与反向高亮
        if (port) {
            const sp = srcNode.getSpecialFunctions(side, index);
            for (const fn of sp) {
                const info = (typeof resolveSpecialFunctionId === 'function') ? resolveSpecialFunctionId(fn) : null;
                if (info && !fns.find(f => f.bus === info.bus && f.signal === info.signal)) {
                    fns.push(info);
                }
            }
        }
        if (!fns.length) return;

        const busSet = new Set(fns.map(f => f.bus));
        const targets = [];

        this.nodes.forEach((node) => {
            if (!node.config || !node.config.peripheral) return; // 仅外设
            for (const s of ['top', 'right', 'bottom', 'left']) {
                const list = node.config[s] || [];
                list.forEach((entry, i) => {
                    if (!entry || typeof entry !== 'object' || !entry.bus) return;
                    if (!busSet.has(entry.bus)) return;
                    const want = fns.filter(f => f.bus === entry.bus);
                    const hit = want.some(f => (typeof signalMatches === 'function')
                        ? signalMatches(entry.signal, f.signal) : false);
                    if (hit) targets.push(node.pads.get(`${s}-${i}`));
                });
            }
        });

        // 自定义器件（外设风格）引脚的“IO 附加功能”也可作为候选目标：
        // 例：MCU GPIO_OUT 特殊脚拖拽时，高亮自定义器件中声明了 “PB5 GPIO_OUT” 的引脚；
        // ADC_INx 特殊脚拖拽时，高亮器件定义中声明了对应 ADC_INx 的引脚。
        this.nodes.forEach((node) => {
            if (node === srcNode || !node.config || node.config.device) return;
            if (typeof node.getPadFunctions !== 'function') return;
            for (const s of ['top', 'right', 'bottom', 'left']) {
                const list = node.config[s] || [];
                list.forEach((entry, i) => {
                    const tfns = node.getPadFunctions(s, i);
                    if (tfns.some(tf => fns.some(f =>
                        (typeof funcMatchesPeripheral === 'function') ? funcMatchesPeripheral(tf, f.bus, f.signal) : false)))
                        targets.push(node.pads.get(`${s}-${i}`));
                });
            }
        });

        this._applyBusHighlight(targets, `${srcNode.getPortName(side, index) || ''} 可连总线`);
    },

    /**
     * 从“自定义器件 IO 附加功能脚”出发：高亮所有匹配目标——外设引脚、MCU IO、其它自定义器件脚。
     * 与 peripheral → MCU 的高亮逻辑完全对称：把源脚的每个附加功能归一化为 (bus, signal) 查询，
     * 再分别用“外设/自定义器件的 bus/signal 或 IO 附加功能”“MCU 的 AF 复用表 + 特殊功能表”三种方式匹配。
     */
    highlightForCustomDevice(srcNode, side, index) {
        const fns = (typeof srcNode.getPadFunctions === 'function') ? srcNode.getPadFunctions(side, index) : [];
        if (!fns.length) return;
        // 源附加功能 → 归一化 (bus, signal) 查询集合（特殊功能 / 裸功能均支持）
        const queries = [];
        for (const fn of fns) {
            const info = (typeof resolveSpecialFunctionId === 'function') ? resolveSpecialFunctionId(fn)
                       : (typeof resolveFunctionId === 'function') ? resolveFunctionId(fn) : null;
            queries.push(info ? { bus: info.bus, signal: info.signal } : { bus: fn, signal: fn });
        }
        const matchBusSignal = (b, sg) => b && sg && queries.some(q =>
            q.bus === b && (typeof signalMatches === 'function' ? signalMatches(q.signal, sg) : q.signal === sg));
        const targets = [];
        this.nodes.forEach((node) => {
            if (node === srcNode || !node.config) return;
            if (node.config.device) {
                // MCU IO：按 AF 复用表 + 特殊功能表匹配（与 highlightBusForPeripheral 同逻辑，反向）
                for (const s of ['top', 'right', 'bottom', 'left']) {
                    const list = node.config[s] || [];
                    list.forEach((entry, i) => {
                        if (!entry || typeof entry !== 'object' || !entry.port) return;
                        const afArr = node.config.device.af && node.config.device.af[entry.port];
                        let hit = false;
                        if (afArr) {
                            hit = afArr.some(afn => {
                                if (!afn || afn === '-') return false;
                                const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(afn) : null;
                                return info && queries.some(q => q.bus === info.bus &&
                                    (typeof signalMatches === 'function' ? signalMatches(q.signal, info.signal) : q.signal === info.signal));
                            });
                        }
                        if (!hit) {
                            const spArr = (typeof node.getSpecialFunctions === 'function') ? node.getSpecialFunctions(s, i) : [];
                            hit = spArr.some(sp => queries.some(q =>
                                (typeof funcMatchesPeripheral === 'function') ? funcMatchesPeripheral(sp, q.bus, q.signal) : false));
                        }
                        if (hit) targets.push(node.pads.get(`${s}-${i}`));
                    });
                }
            } else {
                // 外设 / 自定义器件：每个 Pad 按其 bus/signal 或 IO 附加功能匹配
                for (const s of ['top', 'right', 'bottom', 'left']) {
                    const list = node.config[s] || [];
                    list.forEach((entry, i) => {
                        const b = node.getPadBus(s, i), sg = node.getPadSignal(s, i);
                        if (matchBusSignal(b, sg)) { targets.push(node.pads.get(`${s}-${i}`)); return; }
                        const tfns = (typeof node.getPadFunctions === 'function') ? node.getPadFunctions(s, i) : [];
                        if (tfns.some(tf => queries.some(q =>
                            (typeof funcMatchesPeripheral === 'function') ? funcMatchesPeripheral(tf, q.bus, q.signal) : false))) {
                            targets.push(node.pads.get(`${s}-${i}`));
                        }
                    });
                }
            }
        });
        this._applyBusHighlight(targets, `附加功能 ${fns.join('/')}`);
    },

    /**
     * 取得 MCU 设备脚的总线功能信息（已分配 AF 优先，否则按外设信号匹配能力）。
     * 返回 { bus, instance, signal } 或 null。
     */
    getMcuBusFunction(node, side, index, peripheralSignal) {
        if (!node || !node.config || !node.config.device) return null;
        const assigned = node.getAF(side, index);
        if (assigned && assigned.id) {
            const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(assigned.id) : null;
            if (info) return info;
        }
        const port = node.getPortName(side, index);
        if (!port || !node.config.device) return null;
        // 1) AF 复用表（已分配 AF 优先；此处遍历 AF 表匹配外设信号）
        if (node.config.device.af && node.config.device.af[port]) {
            for (const fn of node.config.device.af[port]) {
                if (!fn || fn === '-') continue;
                const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(fn) : null;
                if (!info) continue;
                if (peripheralSignal && (typeof signalMatches === 'function') && !signalMatches(peripheralSignal, info.signal)) {
                    continue;
                }
                // 尊重已有实例锁定（TIM 等不参与锁定的总线恒为 null）
                const lk = this.resolveBusLock(info.bus);
                if (lk && lk !== info.instance) continue;
                return info;
            }
        }
        // 2) 特殊功能（ADC_INx / GPIO_OUT / NRST / EXTCLK）：非 AF 表，按字面能力匹配
        const sp = node.getSpecialFunctions(side, index);
        for (const fn of sp) {
            const info = (typeof resolveSpecialFunctionId === 'function') ? resolveSpecialFunctionId(fn) : null;
            if (!info) continue;
            if (peripheralSignal) {
                const ps = String(peripheralSignal).toUpperCase();
                const fs = info.signal.toUpperCase();
                const ok = (ps === fs) ||
                    (ps === 'AINX' && /^ADC_(IN|AIN)\d+$/.test(fs)) ||
                    ((typeof signalMatches === 'function') && signalMatches(ps, fs));
                if (!ok) continue;
            }
            const lk = this.resolveBusLock(info.bus);
            if (lk && lk !== info.instance) continue;
            return info;
        }
        return null;
    },

    /**
     * 依据一次完成的连接，锁定总线实例。
     * 例：外设 SPI MOSI 连到 MCU PA0(SPI1_MOSI) 后，总线 "SPI" 锁定到 "SPI1"，
     * 后续外设 SPI 连线只高亮 SPI1 的 IO。
     */
    applyBusLock(src, tgt) {
        const srcNode = this.nodes.get(src.nodeId);
        const tgtNode = this.nodes.get(tgt.nodeId);
        if (!srcNode || !tgtNode) return;

        let devNode = null, devSide = null, devIndex = null;
        let perNode = null, perSide = null, perIndex = null;
        if (srcNode.config && srcNode.config.device) {
            devNode = srcNode; devSide = src.port; devIndex = src.index;
            perNode = tgtNode; perSide = tgt.port; perIndex = tgt.index;
        } else if (tgtNode.config && tgtNode.config.device) {
            devNode = tgtNode; devSide = tgt.port; devIndex = tgt.index;
            perNode = srcNode; perSide = src.port; perIndex = src.index;
        }
        if (!devNode || !perNode || !perNode.config.peripheral) return;

        const sig = perNode.getPadSignal(perSide, perIndex);
        const bus = perNode.getPadBus(perSide, perIndex);
        if (bus && NON_LOCKABLE_BUSES.has(bus)) return; // TIM 等不参与实例锁定
        const info = this.getMcuBusFunction(devNode, devSide, devIndex, sig);
        if (info) {
            // 若尚未锁定，或锁定的实例与新连接的实例一致，则写入；
            // 不允许中途切换到另一实例（避免混用 SPI1/SPI2）。
            if (!this.busLocks[info.bus]) {
                this.busLocks[info.bus] = info.instance;
                this.updateConnectionStatus('总线已锁定', '#38bdf8',
                    `${info.bus} 已锁定到 ${info.instance}（后续连线仅高亮该实例）`);
            }
        }
    },

    /**
     * 在 MCU 引脚的 AF 表中，找到匹配“指定总线 + 外设信号”的复用功能。
     * 尊重实例锁定：若 lockedInstance 已设定（如 SPI1），只返回该实例的功能。
     * @returns {{k:number, fn:string, info:object}|null}
     */
    findMatchingAF(node, side, index, bus, sig, lockedInstance) {
        const portName = node.getPortName(side, index);
        if (!portName || !node.config.device || !node.config.device.af) return null;
        const afArr = node.config.device.af[portName];
        if (!afArr) return null;
        for (let k = 0; k < afArr.length; k++) {
            const fn = afArr[k];
            if (!fn || fn === '-') continue;
            const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(fn) : null;
            if (!info || info.bus !== bus) continue;
            if (lockedInstance && info.instance !== lockedInstance) continue;
            if (typeof signalMatches === 'function' && !signalMatches(sig, info.signal)) continue;
            return { k, fn, info };
        }
        return null;
    },

    /**
     * 外设（如 Serial Flash SPI）连到 MCU IO 时，自动配置该 IO：
     *   - 选取匹配的 AF（总线+信号，尊重实例锁定）→ 写入引脚 AF
     *   - 写入 GPIO 寄存器：MODE=复用功能(2)；OTYPE（I2C SDA/SCL 开漏，其余推挽）；
     *     PUPD（I2C SDA/SCL 上拉，其余无）
     * 仅当一端是 MCU 设备、另一端是外设时生效。
     */
    autoConfigureDevicePin(src, tgt) {
        const srcNode = this.nodes.get(src.nodeId);
        const tgtNode = this.nodes.get(tgt.nodeId);
        if (!srcNode || !tgtNode) return;

        // 统一取某节点某脚的 (bus, signal)：
        //   - 外设：直接读 bus/signal；
        //   - 自定义器件 / MCU 特殊脚：从 IO 附加功能 / 特殊功能解析
        //     （如 GPIO_OUT → GPIO/GPIO_OUT，ADC_IN3 / ADC_INX → ADC/对应信号）。
        // 这是修复“自定义器件 OUT 连到 GPIO 不改 MCU 模式”的关键：自定义器件只有 functions、没有 bus/signal。
        const busSigOf = (n, s, i) => {
            const bus = (typeof n.getPadBus === 'function') ? n.getPadBus(s, i) : null;
            const sig = (typeof n.getPadSignal === 'function') ? n.getPadSignal(s, i) : null;
            if (bus && sig) return { bus, sig };
            const fns = (typeof n.getPadFunctions === 'function') ? n.getPadFunctions(s, i)
                      : ((typeof n.getSpecialFunctions === 'function') ? n.getSpecialFunctions(s, i) : []);
            for (const fn of fns) {
                const info = (typeof resolveSpecialFunctionId === 'function') ? resolveSpecialFunctionId(fn)
                           : ((typeof resolveFunctionId === 'function') ? resolveFunctionId(fn) : null);
                if (info && info.bus && info.signal) return { bus: info.bus, sig: info.signal };
            }
            return { bus: null, sig: null };
        };

        // —— 自定义器件（带 IO 附加功能）↔ 外设：按外设 bus 设置“自定义器件引脚”模式 ——
        // 例：ADC 外设 AIN3 连到自定义器件声明 “PA6 ADC_IN3” 的脚 → 该脚置为模拟模式(3)；
        //     GPIO 输出外设连到声明 “PBx GPIO_OUT” 的脚 → 置为输出模式(1)。
        let custNode = null, custSide = null, custIndex = null, periNode = null, periSide = null, periIndex = null;
        const hasFuncs = (n, p, i) => n.config && n.config.peripheral && typeof n.getPadFunctions === 'function' && n.getPadFunctions(p, i).length;
        const hasBus = (n, p, i) => n.config && n.config.peripheral && n.getPadBus(p, i);
        if (hasFuncs(srcNode, src.port, src.index) && hasBus(tgtNode, tgt.port, tgt.index)) {
            custNode = srcNode; custSide = src.port; custIndex = src.index;
            periNode = tgtNode; periSide = tgt.port; periIndex = tgt.index;
        } else if (hasFuncs(tgtNode, tgt.port, tgt.index) && hasBus(srcNode, src.port, src.index)) {
            custNode = tgtNode; custSide = tgt.port; custIndex = tgt.index;
            periNode = srcNode; periSide = src.port; periIndex = src.index;
        }
        if (custNode) {
            const { bus, sig } = busSigOf(periNode, periSide, periIndex);
            const fns = custNode.getPadFunctions(custSide, custIndex);
            if (!bus || !sig || !fns.some(fn => (typeof funcMatchesPeripheral === 'function') ? funcMatchesPeripheral(fn, bus, sig) : false)) {
                this.updateConnectionStatus('已连接（无匹配功能）', '#f59e0b', `${custNode.config.name} 该脚无 ${bus || ''}/${sig || ''} 功能`);
                return;
            }
            const mode = (bus === 'ADC') ? 3 : (bus === 'GPIO') ? 1 : 2; // ADC→模拟；GPIO→输出；其余→复用
            custNode.setIoRegs(custSide, custIndex, { mode });
            this.updateConnectionStatus('已连接并自动配置', '#00ff88', `${custNode.config.name} 引脚 ← ${bus}/${sig}（模式=${mode}）`);
            this.drawAll();
            return;
        }

        // —— MCU ↔ 外设 / 自定义器件：自动配置“MCU 引脚”模式（并对称配置自定义器件脚）——
        const mcu = (srcNode.config && srcNode.config.device) ? srcNode
                  : (tgtNode.config && tgtNode.config.device ? tgtNode : null);
        const other = mcu === srcNode ? tgtNode : (mcu === tgtNode ? srcNode : null);
        if (mcu && other) {
            const mcuSide = (mcu === srcNode) ? src.port : tgt.port;
            const mcuIndex = (mcu === srcNode) ? src.index : tgt.index;
            const oSide = (other === srcNode) ? src.port : tgt.port;
            const oIndex = (other === srcNode) ? src.index : tgt.index;
            const portName = mcu.getPortName(mcuSide, mcuIndex);

            // —— 自定义器件引脚声明为 GPIO 输入（GPIO_IN / GPIO_INPU 上拉 / GPIO_INPD 下拉）——
            // 连接 MCU 通用 GPIO 时，把 MCU 与该自定义器件引脚均置为「输入模式」并带上/下拉，
            // 解决“自定义器件 GPIO_IN 无法指定输入+上下拉”的问题。此路径优先于 AF / 特殊功能路径。
            const oFns = (typeof other.getPadFunctions === 'function') ? other.getPadFunctions(oSide, oIndex) : [];
            const inFn = oFns.find(f => (typeof isGpioInput === 'function') ? isGpioInput(f) : false);
            if (inFn) {
                const pull = (typeof gpioInputPull === 'function') ? gpioInputPull(inFn) : 0;
                mcu.setIoRegs(mcuSide, mcuIndex, { mode: 0, otype: 0, pupd: pull });
                if (typeof other.setIoRegs === 'function') other.setIoRegs(oSide, oIndex, { mode: 0, otype: 0, pupd: pull });
                this.updateConnectionStatus('已连接并自动配置', '#00ff88',
                    `${portName} ← ${inFn}（输入模式·pupd=${pull}）`);
                this.drawAll();
                return;
            }

            const { bus, sig } = busSigOf(other, oSide, oIndex);
            if (!bus || !sig) {
                this.updateConnectionStatus('已连接（无总线功能）', '#f59e0b', '对端无可用总线/功能定义');
                return;
            }

            // AF 复用路径
            const match = this.findMatchingAF(mcu, mcuSide, mcuIndex, bus, sig, this.resolveBusLock(bus));
            if (match) {
                mcu.setAF(mcuSide, mcuIndex, {
                    id: match.fn, label: match.fn, group: `AF${match.k}`, afIndex: match.k
                });
                const isI2C = bus === 'I2C' && (sig === 'SDA' || sig === 'SCL');
                const otype = isI2C ? 1 : 0; // I2C 开漏；其余推挽
                const pupd = isI2C ? 1 : 0;  // I2C 上拉；其余无上拉/下拉
                mcu.setIoRegs(mcuSide, mcuIndex, { mode: 2, otype, pupd, afl: match.k }); // 复用功能模式 + AFL
                this.updateConnectionStatus('已连接并自动配置', '#00ff88',
                    `${portName} ← ${match.fn}（AF${match.k} · 复用模式）`);
                this.drawAll();
                return;
            }

            // 特殊功能路径（ADC / GPIO 等，不在 AF 表中）：按对端功能直接置 GPIO 模式
            const spArr = mcu.getSpecialFunctions(mcuSide, mcuIndex);
            const spHit = spArr.some(fn => (typeof funcMatchesPeripheral === 'function')
                ? funcMatchesPeripheral(fn, bus, sig) : false);
            if (spHit) {
                const mode = (bus === 'ADC') ? 3 : (bus === 'GPIO') ? 1 : 2; // ADC→模拟；GPIO→输出；其余→复用
                mcu.setIoRegs(mcuSide, mcuIndex, { mode });
                // 对称：对端为自定义器件时，也置其引脚模式（自定义器件是 MCU 风格，支持模式着色）
                const oFns = (typeof other.getPadFunctions === 'function') ? other.getPadFunctions(oSide, oIndex) : [];
                if (oFns.length && (typeof other.setIoRegs === 'function')) {
                    other.setIoRegs(oSide, oIndex, { mode });
                }
                this.updateConnectionStatus('已连接并自动配置', '#00ff88',
                    `${portName} ← ${bus}/${sig}（特殊功能，模式=${mode}）`);
                this.drawAll();
                return;
            }

            this.updateConnectionStatus('已连接（无匹配复用）', '#f59e0b',
                `${portName} 无可用 ${bus}/${sig} 复用功能`);
            return;
        }
    },

    /**
     * 计算所有 MCU 设备的 GPIO 寄存器“变动值”列表。
     * 规则：对每个端口（A~C）的每个寄存器（MODE/OTYPE/PUPD/AFL），
     *       仅当“当前值 ≠ 复位值”才输出一行，格式：
     *       0x{基地址+偏移},0x{当前值8位},//GPIO{端口}_{寄存器名}
     * 当前值由各引脚 ioRegs 聚合得到；复位值取自 config.device.gpio.reset（未给出默认 0）。
     * @returns {string} 多行文本（可直接贴进固件初始化代码）
     */
    computeRegisterDump() {
        const order = [
            { reg: 'MODE',  name: 'MODER',  off: '0x00' },
            { reg: 'OTYPE', name: 'OTYPER', off: '0x04' },
            { reg: 'PUPD',  name: 'PUPDR',  off: '0x0C' },
            { reg: 'AFL',   name: 'AFRL',   off: '0x20' }
        ];
        const hx = (v) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
        const entries = []; // { addr, text }
        // —— GPIO 端口变动（仅当前值 ≠ 复位值）——
        this.nodes.forEach((node) => {
            if (!node.config || !node.config.device) return;
            const gpio = node.config.device.gpio;
            if (!gpio || !gpio.base || !gpio.regs || !gpio.reset) return;
            for (const letter of ['A', 'B', 'C']) {
                const base = gpio.base[letter];
                if (base == null) continue;
                const regs = node.getPortRegisterValues(letter);
                for (const o of order) {
                    const addr = (parseInt(base, 16) + parseInt(gpio.regs[o.reg], 16)) >>> 0;
                    const cur = regs[o.reg] >>> 0;
                    // 复位基准：仅按本封装实际引出的脚聚合（未引出脚两边均为 0），
                    // 这样放置瞬间 current==复位（无假差异，符合“一样不输出”）。
                    const rst = node.getPortResetValues(letter)[o.reg] >>> 0;
                    if (cur !== rst) {
                        entries.push({ addr, text: `${hx(addr)},${hx(cur)},//GPIO${letter}_${o.name}` });
                    }
                }
            }
        });
        // —— SVD 寄存器变动（从 svdRegValues 收集，编辑器保存的改动）——
        // 仅输出值 ≠ 复位值的寄存器；地址/名称由编辑器保存时记录。
        // 手动编辑（非 iface 源）与 GPIO 一起按地址排序；接口初始化（iface 源）
        // 单独保留“输入顺序”输出，不按地址重排。
        const svd = this.svdRegValues || {};
        const ifaceIds = this._ifaceRegIds || [];
        const ifaceIdSet = new Set(ifaceIds);
        // 遍历所有 svdKey 命名空间（多 MCU 各自隔离），收集非 iface 源（手动编辑 / GPIO）的寄存器变动
        for (const sk in svd) {
            const m = svd[sk] || {};
            for (const id in m) {
                if (ifaceIdSet.has(id)) continue; // iface 源单独按输入顺序处理
                const e = m[id];
                if (!e || e.address == null) continue;
                const addr = parseInt(e.address, 16) >>> 0;
                const resetNum = (e.reset != null) ? (e.reset >>> 0) : 0;
                if (e.value !== resetNum) {
                    entries.push({ addr, text: `${hx(addr)},${hx(e.value)},//${e.name}` });
                }
            }
        }
        // GPIO + 手动 SVD 改动：按地址升序排序，便于对照固件初始化代码
        entries.sort((a, b) => a.addr - b.addr);
        const sortedLines = entries.map(e => e.text);
        // 接口初始化：作为显式固件初始化序列输出。合并规则：
        //  - 同一接口(name)内部同地址出现多行 → 全部保留（如“先赋值再使能”的写入序列，顺序有意义）；
        //  - 不同接口(name)写入同一地址 → 按 “|” 合并为单行（避免不同通道/外设的初始化互相覆盖）。
        // 不复用 svdRegValues（后者对同地址只存一个值，用于 SVD 视图，不反映初始化顺序）。非 iface 源已排除。
        const ifaceByReg = {};
        for (const ln of (this._ifaceRegLines || [])) {
            if (ln._src !== 'iface' || ln.address == null) continue;
            if (!ifaceByReg[ln.regId]) ifaceByReg[ln.regId] = [];
            ifaceByReg[ln.regId].push(ln);
        }
        const ifaceLines = [];
        for (const regId in ifaceByReg) {
            const grp = ifaceByReg[regId];
            const names = new Set(grp.map(l => l.name));
            if (names.size <= 1) {
                // 同一接口：原样保留全部行（含同地址多行）
                for (const ln of grp) {
                    ifaceLines.push(`${hx(parseInt(ln.address, 16) >>> 0)},${hx(ln.value)},//${ln.regName}`);
                }
            } else {
                // 不同接口命中同一地址：OR 合并为单行
                let v = 0; let ref = grp[0];
                for (const ln of grp) { v = (v | ln.value) >>> 0; ref = ln; }
                ifaceLines.push(`${hx(parseInt(ref.address, 16) >>> 0)},${hx(v)},//${ref.regName}`);
            }
        }
        // 首行：注释汇总当前所有已使用的外设（用于直观看到一共初始化了多少个外设）
        const used = this.getUsedPeripherals();
        const header = used.length ? ('// ' + used.join(' ')) : '// (无外设被使用)';
        return [header].concat(sortedLines, ifaceLines).join('\n');
    },

    // ============ 自定义接口初始化参数 ============
    // 作用：外设连到 MCU 某接口（如 PWM→TIM1_CH1）时，自动把该接口的寄存器初始化段
    // （地址,值 列表）写入 MCU 的寄存器状态（svdRegValues）。多个接口命中同一地址时按 “|” 合并，
    // 从而 TIM1_CH1 + TIM1_CH2 同时连接也不会互相覆盖。写入后 SVD 寄存器视图 / 变动值 dump 同步更新。

    loadInterfaceInits() {
        try {
            const s = localStorage.getItem('interfaceInits');
            this.interfaceInits = s ? JSON.parse(s) : [];
            if (!Array.isArray(this.interfaceInits)) this.interfaceInits = [];
        } catch (e) { this.interfaceInits = []; }
    },

    persistInterfaceInits() {
        try { localStorage.setItem('interfaceInits', JSON.stringify(this.interfaceInits || [])); } catch (e) {}
    },

    // ============ 自定义接口「函数」定义 ============
    // 与接口初始化段逻辑一致——外设连到 MCU 某接口（如 SPI1_MOSI）时，按接口名命中并收集其“程序段”（代码），
    // 最终通过「程序段输出」栏把所有已使用接口的函数代码整段导出（可贴进固件）。
    // 文本格式：首行=接口名（可空格分隔多个别名），后续整段为函数代码（原样保留，不做地址解析）。

    loadInterfaceFunctions() {
        try {
            const s = localStorage.getItem('interfaceFunctions');
            this.interfaceFunctions = s ? JSON.parse(s) : [];
            if (!Array.isArray(this.interfaceFunctions)) this.interfaceFunctions = [];
        } catch (e) { this.interfaceFunctions = []; }
    },

    persistInterfaceFunctions() {
        try { localStorage.setItem('interfaceFunctions', JSON.stringify(this.interfaceFunctions || [])); } catch (e) {}
    },

    /**
     * 解析接口函数文本（新格式）：
     *   第 1 行 = 名称（便于管理，如 “通用SPI读写”）；
     *   第 2 行 = 接口别名（空格分隔，可带 & 条件前缀，如 “&SPI1_CLK &SPI1_MOSI &SPI1_MISO”）；
     *            不带 & 的别名“任一命中即采用该段代码”，带 & 的别名“必须全部被连接才采用”（条件筛选）；
     *   第 3 行起 = 函数代码（原样保留，允许空行/注释/大括号，不做任何解析）。
     * 兼容旧格式：若第 2 行不像别名行（如以 0x/数字/括号开头），则按“第1行=别名、第2行起=代码”解析。
     * @returns {{name:string, names:string[], required:string[], defaults:string[], code:string}}
     */
    parseInterfaceFunction(raw) {
        const lines = (raw || '').split(/\r?\n/);
        let mgmt, aliasLine, codeStart;
        if (lines.length >= 2 && !this.looksLikeAliasLine(lines[1])) {
            // 旧格式：第 1 行即别名行，第 2 行起为代码
            mgmt = (lines[0] || '').trim();
            aliasLine = (lines[0] || '').trim();
            codeStart = 1;
        } else {
            // 新格式：第 1 行=名称，第 2 行=别名
            mgmt = (lines[0] || '').trim();
            aliasLine = (lines[1] || '').trim();
            codeStart = 2;
        }
        const names = [], required = [], defaults = [];
        for (const t of aliasLine.split(/\s+/).filter(Boolean)) {
            const isReq = t[0] === '&';
            const clean = (isReq ? t.slice(1) : t).trim();
            if (!clean) continue;
            names.push(clean);
            (isReq ? required : defaults).push(clean);
        }
        // 解析 //replace 全局替换指令：可出现在代码块任意行，该行不参与最终代码输出。
        // 语法（空格分隔，冒号表“替换前:替换后”）：
        //   //replace SPI_CLK:SPI{{IDX}}_CLK SPI_MISO:SPI{{IDX}}_MISO
        // after 侧支持 {{IDX}}/{{DEV}} 与角色占位符 {{CS}}/{{SCK}}/{{MOSI}}/{{MISO}}/{{SCL}}/{{SDA}}。
        const replaceMap = [];
        const codeLines = [];
        const repRe = /^\s*(?:\/\/)?\s*replace\b/i;
        for (const ln of lines.slice(codeStart)) {
            const m = ln.match(repRe);
            if (m) {
                const body = ln.slice(m.index + m[0].length).trim();
                const pairs = [];
                for (const pair of body.split(/\s+/).filter(Boolean)) {
                    const ci = pair.indexOf(':');
                    if (ci > 0) pairs.push({ before: pair.slice(0, ci), after: pair.slice(ci + 1) });
                }
                if (pairs.length) { // 仅当确实存在 替换前:替换后 时才视为指令，避免误删普通注释
                    for (const p of pairs) if (p.before) replaceMap.push(p);
                    continue;
                }
            }
            codeLines.push(ln);
        }
        const code = codeLines.join('\n');
        return { name: mgmt, names, required, defaults, code, replaceMap };
    },

    getInterfaceFunctions() { return this.interfaceFunctions || []; },

    /** 按 SVD 型号过滤接口函数定义（规则同 getInterfaceInitsForSvd：空=全部，指定=通用+该型号）。 */
    getInterfaceFunctionsForSvd(svdKey) {
        const list = this.interfaceFunctions || [];
        const k = (svdKey || '').trim();
        if (!k) return list;
        return list.filter(d => !d.svdKey || d.svdKey === k);
    },

    getInterfaceFunctionByName(name) {
        if (!name) return null;
        const nm = String(name).trim();
        return (this.interfaceFunctions || []).find(d => d.name === nm || (d.names && d.names.indexOf(nm) >= 0)) || null;
    },

    /** 新建或覆盖某个接口函数定义（按第 1 行管理名去重；不同管理名可共存，便于 & 条件筛选下多定义并存） */
    upsertInterfaceFunction(name, raw, svdKey) {
        const parsed = this.parseInterfaceFunction(raw);
        const nm = (parsed.name || name || '').trim();
        if (!nm) return null;
        // svdKey 为空 → 记为“通用定义”，在任何型号下都可见（便于相似 MCU 间移植）
        const rec = { name: nm, names: parsed.names, required: parsed.required, defaults: parsed.defaults, raw: raw.replace(/\r\n/g, '\n'), code: parsed.code, replaceMap: parsed.replaceMap || [], svdKey: (svdKey || '').trim() };
        const idx = this.interfaceFunctions.findIndex(d => d.name === nm);
        if (idx >= 0) this.interfaceFunctions[idx] = rec;
        else this.interfaceFunctions.push(rec);
        this.persistInterfaceFunctions();
        return rec;
    },

    /** 删除指定接口函数定义（按 name 或任一别名匹配） */
    deleteInterfaceFunction(name) {
        const nm = String(name).trim();
        const before = this.interfaceFunctions.length;
        this.interfaceFunctions = (this.interfaceFunctions || []).filter(d => {
            const dn = (d.names && d.names.length) ? d.names : [d.name];
            // 同 deleteInterfaceInit：管理名不在别名列表内，须同时按 d.name 命中，否则删除无效。
            return d.name !== nm && dn.indexOf(nm) < 0;
        });
        if (this.interfaceFunctions.length !== before) this.persistInterfaceFunctions();
    },

    /** 返回当前连接实际命中的接口函数代码块（供「程序段输出」栏整段导出）。
     *  硬件/信号命中路径：每个 def 输出一段（不含引脚）；
     *  强制(@)路径：每个器件实例输出一段，引脚经 {{CS}}/{{SCK}}/{{MOSI}}/{{MISO}}/{{SCL}}/{{SDA}}/{{DEV}}/{{IDX}} 替换。 */
    getUsedInterfaceFunctionCodes() {
        return this._getFuncCodes(this.usedFuncDefs, this.usedInstances);
    },

    /**
     * 生成“程序段”导出文本：首行注释汇总已使用外设，随后按命中顺序整段输出各接口函数代码。
     * @returns {string}
     */
    /** 为指定 SVD 型号（MCU）收集其连接上出现的接口信号名集合（含同义词展开）。
     *  用于「程序段导出 / 接口函数」按 MCU 型号过滤：仅输出该型号 MCU 连接触发的函数段。
     *  @param {string} svdKey 目标 MCU 的 SVD key（与 getNodeSvdKey 一致）
     *  @returns {Set<string>} 信号名集合 */
    _collectSvdNames(svdKey) {
        const names = new Set();
        const gpioNames = new Set();
        const addNameTo = (set, nm) => {
            if (!nm) return;
            for (const e of this.expandSignalName(nm)) set.add(e);
        };
        const resolveSvd = (node) => {
            if (node && node.config && node.config.device) {
                const k = window.SvdLib && window.SvdLib.resolveSvdKeyForDevice
                    ? window.SvdLib.resolveSvdKeyForDevice(node.config.device) : null;
                return k || null;
            }
            return null;
        };
        this.connections.forEach(conn => {
            const ends = [conn.source, conn.target];
            const mcuEnd = ends.find(e => { const n = this.nodes.get(e.nodeId); return n && n.config && n.config.device; });
            if (!mcuEnd) return;
            const mcuNode = this.nodes.get(mcuEnd.nodeId);
            if (resolveSvd(mcuNode) !== svdKey) return; // 仅收集归属目标型号的 MCU 连接
            const isSim = (() => {
                const n = mcuNode;
                const afFn = (n.af && typeof n.af.get === 'function') ? n.af.get(`${mcuEnd.port}-${mcuEnd.index}`) : null;
                const hasGpio = (typeof n.getSpecialFunctions === 'function')
                    ? n.getSpecialFunctions(mcuEnd.port, mcuEnd.index).some(f => f === 'GPIO_OUT' || (typeof isGpioInput === 'function' && isGpioInput(f)))
                    : false;
                return (!afFn || !afFn.id) && hasGpio;
            })();
            const targetSet = isSim ? gpioNames : names;
            for (const end of ends) {
                const n = this.nodes.get(end.nodeId);
                if (!n || !n.config) continue;
                if (n.config.device) {
                    if (isSim) {
                        if (typeof n.getSpecialFunctions === 'function') {
                            n.getSpecialFunctions(end.port, end.index).forEach(f => {
                                const u = String(f).toUpperCase();
                                if (u === 'GPIO_OUT' || u === 'GPIO_IN' || u === 'GPIO_INPU' || u === 'GPIO_INPD') {
                                    addNameTo(targetSet, u);
                                    if (u === 'GPIO_INPU' || u === 'GPIO_INPD') addNameTo(targetSet, 'GPIO_IN');
                                }
                            });
                        }
                    } else {
                        if (n.af && typeof n.af.get === 'function') {
                            const fn = n.af.get(`${end.port}-${end.index}`);
                            if (fn && fn.id) addNameTo(targetSet, String(fn.id));
                        }
                        if (typeof n.getSpecialFunctions === 'function') {
                            n.getSpecialFunctions(end.port, end.index).forEach(f => addNameTo(targetSet, String(f)));
                        }
                    }
                } else {
                    const sig = (typeof n.getPadSignal === 'function') ? n.getPadSignal(end.port, end.index) : null;
                    if (sig) addNameTo(targetSet, String(sig));
                    if (typeof n.getSpecialFunctions === 'function') {
                        n.getSpecialFunctions(end.port, end.index).forEach(f => addNameTo(targetSet, String(f)));
                    }
                    const idef = n.config && n.config.iface;
                    if (idef) {
                        const list = Array.isArray(idef) ? idef : [idef];
                        list.forEach(x => { const s = String(x); if (s.charAt(0) === '@') addNameTo(targetSet, s.slice(1)); else addNameTo(targetSet, s); });
                    }
                }
            }
        });
        return names;
    },

    /**
     * 生成“程序段”导出文本：首行注释汇总已使用外设，随后按命中顺序整段输出各接口函数代码。
     * @param {string} [svdKey] 可选，指定 MCU 型号 → 仅输出该型号连接触发的函数段（与接口初始化绑定型号一致）。
     * @returns {string}
     */
    computeFunctionDump(svdKey) {
        // 按型号过滤：仅保留被目标 MCU 连接命中的函数定义 / 实例
        let usedFuncDefs = this.usedFuncDefs || [];
        let usedInstances = this.usedInstances || [];
        let forcedNames = null;
        if (svdKey) {
            const keyNames = this._collectSvdNames(svdKey);
            forcedNames = keyNames;
            usedFuncDefs = usedFuncDefs.filter(d => this.defMatches(d, keyNames));
            const matchedNames = new Set(usedFuncDefs.map(d => d.name).concat(
                usedFuncDefs.flatMap(d => d.names || [])));
            usedInstances = usedInstances
                .filter(inst => (inst.defs || []).some(d => this.defMatches(d, keyNames)))
                .map(inst => Object.assign({}, inst, {
                    defs: inst.defs.filter(d => this.defMatches(d, keyNames)
                        || (inst.defNames || []).some(n => (d.name === n) || (d.names || []).includes(n)))
                }));
            void matchedNames;
        }
        // 首行注释：汇总“已命中函数段（硬件 / 软件模拟共用同一池）”对应的外设实例
        const periSet = new Set();
        for (const d of usedFuncDefs) {
            for (const a of (d.names || [])) {
                const p = this.extractPeripheralName(a);
                if (p) periSet.add(p);
            }
        }
        for (const inst of usedInstances) {
            for (const d of (inst.defs || [])) {
                for (const a of (d.names || [])) {
                    const p = this.extractPeripheralName(a);
                    if (p) periSet.add(p);
                }
            }
        }
        const peris = Array.from(periSet).sort();
        const head = '// ' + (peris.length ? peris.join(' ') : '(无已命中外设)');

        const codes = this._getFuncCodes(usedFuncDefs, usedInstances);
        if (!codes.length) {
            return head + '\n\n（无已命中的接口函数' + (svdKey ? '（型号 ' + svdKey + '）' : '') + '：请先在「接口函数定义」中定义，并连上对应接口（或用具 @接口名 声明强制选择）后点「应用到当前连接」）';
        }

        // 软件模拟与硬件共用同一池，统一整段输出（无需分小节）；@ 强制选择的段也在此列出。
        return [head].concat(codes).join('\n\n') + '\n';
    },

    /** 按给定的 usedFuncDefs / usedInstances 生成代码块数组（computeFunctionDump 与按型号过滤共用）。 */
    _getFuncCodes(usedFuncDefs, usedInstances) {
        const blocks = [];
        for (const d of (usedFuncDefs || [])) {
            const c = (d.code || '').trim();
            if (c) blocks.push(c);
        }
        for (const inst of (usedInstances || [])) {
            for (const d of (inst.defs || [])) {
                const c = (d.code || '').trim();
                if (!c) continue;
                const sub = this.substituteInstanceCode(c, inst, d.replaceMap);
                blocks.push('// === ' + inst.deviceName + '_' + inst.idx + ' (' + (d.name || '?') + ') ===\n' + sub);
            }
        }
        return blocks;
    },

    persistSvdRegValues() {
        try { localStorage.setItem('svdRegValues', JSON.stringify(this.svdRegValues || {})); } catch (e) {}
    },

    /**
     * 解析接口初始化文本（新格式）：
     *   第 1 行 = 名称（便于管理，如 “通用SPI”）；
     *   第 2 行 = 接口别名（空格分隔，可带 & 条件前缀，如 “&SPI1_CLK &SPI1_MOSI &SPI1_MISO”）；
     *            不带 & 的别名“任一命中即应用整组初始化”，带 & 的“必须全部被连接才应用”（条件筛选）；
     *   第 3 行起 = “地址,值”（逗号/空格/分号分隔；地址与值支持 0x 前缀、十进制、裸十六进制；行尾 // 注释可保留）。
     * 兼容旧格式：若第 2 行不像别名行（如以 0x/数字/括号开头），则按“第1行=别名、第2行起=寄存器”解析。
     * @returns {{name:string, names:string[], required:string[], defaults:string[], entries:Array<{addr:number,value:number}>}}
     */
    parseInterfaceInit(raw) {
        const parseHex = (v) => {
            if (v == null) return null;
            const s = String(v).trim();
            if (s === '') return null;
            if (/^0x/i.test(s)) { const n = parseInt(s.slice(2), 16); return isNaN(n) ? null : n; }
            if (/^[0-9]+$/.test(s)) { const n = parseInt(s, 10); return isNaN(n) ? null : n; }
            const h = parseInt(s, 16); return isNaN(h) ? null : h;
        };
        const rawLines = (raw || '').split(/\r?\n/);
        let mgmt, aliasLine, bodyStart;
        if (rawLines.length >= 2 && !this.looksLikeAliasLine(rawLines[1])) {
            // 旧格式：第 1 行即别名行，第 2 行起为寄存器
            mgmt = (rawLines[0] || '').trim();
            aliasLine = (rawLines[0] || '').trim();
            bodyStart = 1;
        } else {
            // 新格式：第 1 行=名称，第 2 行=别名
            mgmt = (rawLines[0] || '').trim();
            aliasLine = (rawLines[1] || '').trim();
            bodyStart = 2;
        }
        const names = [], required = [], defaults = [];
        for (const t of aliasLine.split(/\s+/).filter(Boolean)) {
            const isReq = t[0] === '&';
            const clean = (isReq ? t.slice(1) : t).trim();
            if (!clean) continue;
            names.push(clean);
            (isReq ? required : defaults).push(clean);
        }
        const entries = [];
        for (let i = bodyStart; i < rawLines.length; i++) {
            const l = rawLines[i].trim();
            if (!l || l.startsWith('//') || l.startsWith('#')) continue;
            const parts = l.split(/[,;\s]+/).filter(Boolean);
            if (parts.length < 2) continue;
            const a = parseHex(parts[0]);
            const v = parseHex(parts[1]);
            if (a == null || v == null) continue;
            entries.push({ addr: a >>> 0, value: v >>> 0 });
        }
        return { name: mgmt, names, required, defaults, entries };
    },

    /** 判断一行是否“别名行”：所有 token 均为 &?interface-name（仅含字母/数字/下划线/&/空格），无逗号/括号/分号等。用于区分新旧格式。 */
    looksLikeAliasLine(s) {
        s = (s || '').trim();
        if (!s) return false;
        const tokens = s.split(/\s+/).filter(Boolean);
        if (!tokens.length) return false;
        return tokens.every(t => /^[&]?[A-Za-z_][A-Za-z0-9_]*$/.test(t));
    },

    /**
     * 展开信号名的同义词集合（含自身）：用于连接名 ↔ 接口定义别名的等价匹配。
     * 例：SPI1_CLK → [SPI1_CLK, SPI1_SCK, CLK, SCK]，使定义里写 SPI1_CLK 也能命中实际 AF=SPI1_SCK。
     * @param {string} name
     * @returns {string[]}
     */
    expandSignalName(name) {
        const n = String(name || '').trim();
        if (!n) return [];
        const sc = (typeof window !== 'undefined' && window.APP_SIGNAL_CONFIG) || {};
        const extra = (sc.synonyms && sc.synonyms[n]) || [];
        return [n].concat(extra);
    },

    /**
     * 判断某接口定义是否“命中”（用于生成初始化段 / 收集函数段）：
     *   不带 & 的默认别名 —— 任一被使用即满足；带 & 的必需别名 —— 必须全部被使用。
     *   names 为空的定义永不命中（避免无别名定义被无条件触发）。
     *   命中比较对信号名同义词透明（如 SPI1_CLK ≡ SPI1_SCK ≡ CLK ≡ SCK）。
     * @param {object} def 接口定义（含 names/required/defaults）
     * @param {Set<string>} usedSet 当前连接中出现的接口名集合（已含同义词展开）
     */
    defMatches(def, usedSet) {
        if (!def || !def.names || !def.names.length) return false;
        const hit = (n) => this.expandSignalName(n).some(x => usedSet.has(x));
        const defaults = def.defaults || [];
        const required = def.required || [];
        const anyDefault = defaults.length === 0 ? true : defaults.some(hit);
        const allRequired = required.length === 0 ? true : required.every(hit);
        const bySignal = anyDefault && allRequired;
        // 器件显式声明的“接口名”优先匹配：若该接口管理名出现在连接集合中，直接命中
        // （用于同一物理接口适配多种配置——器件声明接口后即绕过引脚信号猜测）。
        const byInterface = !!def.name && usedSet.has(def.name);
        return bySignal || byInterface;
    },

    /**
     * 把器件某 pad 归一到规范“角色”（CS / SCK / MOSI / MISO / SCL / SDA），用于多实例代码生成。
     * 依次考察 pad 的 label / signal / functions，命中 INTERFACE_ROLE_SYNONYMS 即返回规范角色；
     * 否则返回 null（该脚不参与引脚占位符映射，如电源 / WP / HOLD）。
     * @param {object} node 器件节点
     * @param {string} side 'left'|'right'|...
     * @param {number} index pad 下标
     * @returns {string|null}
     */
    canonicalPadRole(node, side, index) {
        const entry = node && node.config && node.config[side] && node.config[side][index];
        if (!entry || typeof entry !== 'object') return null;
        const cands = [];
        if (entry.label) cands.push(String(entry.label).toUpperCase());
        if (entry.signal) cands.push(String(entry.signal).toUpperCase());
        if (Array.isArray(entry.functions)) entry.functions.forEach(f => cands.push(String(f).toUpperCase()));
        for (const c of cands) {
            const r = INTERFACE_ROLE_SYNONYMS[c];
            if (r) return r;
        }
        return null;
    },

    /**
     * 多实例代码占位符替换 + 全局替换表应用：
     *  1) 应用 def 的 replaceMap（//replace 指令）：before→after 逐条文本替换，
     *     after 内的 {{IDX}}/{{DEV}} 与角色占位符 {{CS}}/{{SCK}}/{{MOSI}}/{{MISO}}/{{SCL}}/{{SDA}}
     *     先按当前实例解析（支持“天然信号名 → 带实例序号 / 真实 GPIO”的映射，省去满篇写 {{CS}}）。
     *  2) 再解析代码中剩余的占位符（向后兼容、及 after 内嵌角色占位符的情况）。
     * 未提供对应引脚的角色原样保留（便于用户察觉漏接）。
     * @param {string} code 接口定义代码（可能含占位符）
     * @param {object} inst usedInstances 中的实例记录（含 pins / deviceName / idx）
     * @param {Array<{before:string,after:string}>} [replaceMap] 可选全局替换表
     * @returns {string}
     */
    substituteInstanceCode(code, inst, replaceMap) {
        const map = Object.assign({}, inst.pins || {});
        map['DEV'] = inst.deviceName;
        map['IDX'] = inst.idx;
        const resolve = (s) => String(s || '').replace(/\{\{(\w+)\}\}/g, (m, key) => {
            const k = String(key).toUpperCase();
            return (k in map) ? String(map[k]) : m;
        });
        let out = String(code || '');
        if (Array.isArray(replaceMap) && replaceMap.length) {
            for (const rep of replaceMap) {
                if (!rep || !rep.before) continue;
                const after = resolve(rep.after); // after 内 {{IDX}}/{{DEV}}/角色占位符先解析
                out = out.split(rep.before).join(after);
            }
        }
        // 再解析代码中剩余占位符（向后兼容直接写 {{CS}} 等，以及 after 内嵌角色占位符）
        out = resolve(out);
        return out;
    },

    /** 将（可能）旧格式定义文本规范化为新格式：旧格式在第 1 行前补一行生成的管理名。 */
    toNewFormatRaw(raw) {
        const lines = (raw || '').split(/\r?\n/);
        if (lines.length >= 2 && !this.looksLikeAliasLine(lines[1])) {
            const aliasTokens = (lines[0] || '').trim().split(/\s+/).filter(Boolean);
            const genName = aliasTokens.length ? aliasTokens[0] : '接口定义';
            return [genName].concat(lines).join('\n');
        }
        return raw;
    },

    getInterfaceInits() { return this.interfaceInits || []; },

    /** 按 SVD 型号过滤接口初始化定义：
     *  svdKey 为空（全局）→ 返回全部（便于查看/移植）；
     *  指定型号 → 仅返回“未标注归属（通用，可移植）”与“归属该型号”的定义。 */
    getInterfaceInitsForSvd(svdKey) {
        const list = this.interfaceInits || [];
        const k = (svdKey || '').trim();
        if (!k) return list;
        return list.filter(d => !d.svdKey || d.svdKey === k);
    },

    getInterfaceInitByName(name) {
        if (!name) return null;
        const nm = String(name).trim();
        return (this.interfaceInits || []).find(d => d.name === nm || (d.names && d.names.indexOf(nm) >= 0)) || null;
    },

    /** 新建或覆盖某个接口初始化定义（按第 1 行管理名去重；不同管理名可共存，便于 & 条件筛选下多定义并存） */
    upsertInterfaceInit(name, raw, svdKey) {
        const parsed = this.parseInterfaceInit(raw);
        const nm = (parsed.name || name || '').trim();
        if (!nm) return null;
        // svdKey 为空 → 记为“通用定义”，在任何型号下都可见（便于相似 MCU 间移植）
        const rec = { name: nm, names: parsed.names, required: parsed.required, defaults: parsed.defaults, raw: raw.replace(/\r\n/g, '\n'), entries: parsed.entries, svdKey: (svdKey || '').trim() };
        const idx = this.interfaceInits.findIndex(d => d.name === nm);
        if (idx >= 0) this.interfaceInits[idx] = rec;
        else this.interfaceInits.push(rec);
        this.persistInterfaceInits();
        return rec;
    },

    /** 删除指定接口初始化定义（按管理名 name 或任一别名匹配 —— 管理名不在别名列表内，故两者都要比） */
    deleteInterfaceInit(name) {
        const nm = String(name).trim();
        const before = this.interfaceInits.length;
        this.interfaceInits = (this.interfaceInits || []).filter(d => {
            const dn = (d.names && d.names.length) ? d.names : [d.name];
            // 下拉选中的是管理名 d.name，而 d.names 仅为别名列表（通常不含管理名），
            // 因此必须同时按 d.name 命中，否则“删除选中”会因管理名不在别名里而失效。
            return d.name !== nm && dn.indexOf(nm) < 0;
        });
        if (this.interfaceInits.length !== before) this.persistInterfaceInits();
    },

    /** 构建 “地址(0x+8位大写) → SVD 寄存器信息” 索引（懒缓存） */
    buildRegAddressIndex() {
        if (this._regAddrIndex) return this._regAddrIndex;
        const idx = new Map();
        const db = (typeof window.getActiveSvdDb === 'function' ? window.getActiveSvdDb() : null);
        if (db && db.menu) {
            for (const peri of db.menu) {
                if (!peri.registers) continue;
                for (const r of peri.registers) {
                    const num = parseInt((r.address || '').trim(), 16);
                    if (isNaN(num)) continue;
                    const key = '0x' + (num >>> 0).toString(16).toUpperCase().padStart(8, '0');
                    const resetNum = parseInt((r.reset || '0x0'), 16) >>> 0;
                    idx.set(key, { regId: peri.label + '.' + r.name, name: peri.label + '.' + r.name, reset: resetNum, address: r.address });
                }
            }
        }
        this._regAddrIndex = idx;
        return idx;
    },

    /** 当前激活 SVD 的 key（与 SVD 编辑器一致：window.__svdActiveKey 优先，否则全局激活）。 */
    _svdActiveKey() {
        if (typeof window !== 'undefined') {
            if (window.__svdActiveKey) return window.__svdActiveKey;
            if (window.SvdLib && typeof window.SvdLib.getActiveSvdKey === 'function') {
                const k = window.SvdLib.getActiveSvdKey();
                if (k) return k;
            }
        }
        return '';
    },
    /** 当前激活 SVD 的寄存器值子表（嵌套结构 svdRegValues[svdKey]），保证存在并返回。
     *  2026-07-22 起 svdRegValues 由扁平 {regId:{...}} 改为嵌套 {[svdKey]:{[regId]:{...}}}（多 MCU 隔离），
     *  此处统一收口，避免各函数各自写扁平导致写不到 SVD 编辑器实际读取的命名空间。 */
    _svdActiveMap() {
        this.svdRegValues = this.svdRegValues || {};
        const k = this._svdActiveKey();
        if (!this.svdRegValues[k]) this.svdRegValues[k] = {};
        return this.svdRegValues[k];
    },
    /** 指定 svdKey 的寄存器值子表（多 MCU 隔离），保证存在并返回。 */
    _svdMap(key) {
        this.svdRegValues = this.svdRegValues || {};
        const k = key || this._svdActiveKey();
        if (!this.svdRegValues[k]) this.svdRegValues[k] = {};
        return this.svdRegValues[k];
    },

    /**
     * 从接口信号名 / AF id 中提取外设实例名，用于收集“所使用外设”。
     *   TIM1_CH1 → TIM1 ; SPI1_MOSI → SPI1 ; I2C1_SCL → I2C1 ; USART1_TX → USART1
     *   ADC_IN3 / ADC_INX / AINX → ADC ; GPIO_OUT → GPIO
     * 无实例信息的裸引脚名（如 CHX / MOSI / SCK）返回 null（需靠 MCU 端 AF id 补足）。
     */
    extractPeripheralName(sig) {
        if (!sig) return null;
        const s = String(sig).trim().toUpperCase();
        if (s === 'AINX' || /^ADC_(IN|AIN)(\d+|X)$/.test(s)) return 'ADC';
        if (s === 'GPIO_OUT' || s === 'GPIO') return 'GPIO';
        // 取第一个下划线之前的部分作为外设实例（兼容含内嵌数字，如 I2C1_SCL → I2C1）
        const i = s.indexOf('_');
        if (i > 0) return s.slice(0, i);
        return null;
    },

    /** 返回当前连接实际使用到的外设实例列表（去重、字母序）。供后续时钟使能收集用。 */
    getUsedPeripherals() { return (this.usedPeripherals || []).slice(); },

    /**
     * 把接口初始化的 entries（地址-值列表）转成「逐行」记录，供写入 svdRegValues 与变动值 dump 复用。
     * 关键点：不做地址去重 / OR 合并——同一地址若出现多次，保留多行（如部分寄存器需“先赋值再使能”，
     * 顺序有意义）；写 SVD 时由调用方对同地址取“最后一行”的值（SVD 一个寄存器只存一个值）。
     * @param {Array<{addr:number,value:number}>} entries
     * @param {string} name 该接口的管理名（用于保存到SVD后的按名清除）
     * @returns {Array<{_src:string,name:string,key:string,addr:number,value:number,regId:string,regName:string,reset:number,address:string}>}
     */
    _makeIfaceLines(entries, name) {
        const idx = this.buildRegAddressIndex();
        const hx = (v) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
        const lines = [];
        for (const ent of (entries || [])) {
            const key = hx(ent.addr);
            const info = idx.get(key);
            let regId, regName, reset, address;
            if (info) { regId = info.regId; regName = info.name; reset = info.reset; address = info.address; }
            else { regId = 'RAW.' + key; regName = key; reset = 0; address = key; }
            lines.push({
                _src: 'iface', name, key,
                addr: ent.addr >>> 0, value: ent.value >>> 0,
                regId, regName, reset, address
            });
        }
        return lines;
    },

    /**
     * 依据当前所有连接，重新计算并写入由接口初始化产生的寄存器值。
     * - 收集每个连接中非 MCU 端的 signal（外设引脚名）与 MCU 端已分配的 AF id，作为匹配的接口名；
     * - 命中某个接口初始化定义时，按输入顺序保留其全部 (addr,value) 行（同地址可多行，不合并、不排序）；
     * - 写入 svdRegValues：同一地址只保留“最后一行”的值（last-wins），符合“先赋值再使能，SVD 取最终值”；
     * - 变动值 dump 则输出完整多行（含同地址两行），体现初始化顺序；
     * - 仅在结果变化时才触发 onRegistersChanged，避免无谓刷新 SVD 视图。
     */
    recomputeInterfaceInitRegisters() {
        // 1. 先清除上一轮由本功能写入的寄存器条目（跨所有 svdKey 命名空间）
        const svd0 = this.svdRegValues || {};
        for (const sk in svd0) {
            const m = svd0[sk];
            for (const id of (this._ifaceRegIds || [])) {
                const e = m[id];
                if (e && e._src === 'iface') delete m[id];
            }
        }
        this._ifaceRegIds = [];
        // 清除上一轮的逐行记录（仅 iface 源），由本轮回重算重建
        this._ifaceRegLines = (this._ifaceRegLines || []).filter(l => l._src !== 'iface');

        // 2. 收集当前连接中出现的接口信号名，按 MCU 端路由分流到两个集合：
        //    - names（硬件集）：引脚走 AF 复用（n.af.get 有 id）的连接 → 命中接口函数段（接口定义）；
        //    - gpioNames（GPIO 集）：引脚走 GPIO_OUT / GPIO_IN（无 AF）的连接 → 仅用于外设实例统计。
        //    两者都展开同义词（如 SPI1_SCK ≡ SPI1_CLK ≡ CLK ≡ SCK）。
        //    软件模拟与硬件共用同一「接口定义」池：硬件经 names 命中；转换器/普通器件以 @接口名 声明则经
        //    forcedSimNames 强制命中（忽略 & 条件）—— 即“通过 @ 选择接口定义”，无需单独的模拟定义分类。
        const names = new Set();
        const gpioNames = new Set();
        // 强制选择接口名集合：凡接口名带 '@'（普通器件或 conv 转换器均可）剥 '@' 后收于此，忽略 & 条件按名命中
        const forcedSimNames = new Set();
        const addNameTo = (set, nm) => {
            if (!nm) return;
            for (const e of this.expandSignalName(nm)) set.add(e);
        };
        // 处理一个接口名列表：① 加入匹配集（按路由）；② 若以 '@' 开头，剥去 '@' 后收进强制软件模拟集
        // （@ 可在普通器件或 conv 转换器上使用，忽略 & 条件、必定命中对应软件模拟段）。
        const collectIface = (iv, set) => {
            const list = Array.isArray(iv) ? iv : (iv ? [iv] : []);
            list.forEach(x => {
                if (set) addNameTo(set, String(x));
                const s = String(x);
                if (s.charAt(0) === '@') forcedSimNames.add(s.slice(1));
            });
        };
        // 多实例展开：收集“带 @ 强制接口的器件节点”。每出现一个这样的器件节点 = 一个接口实例，
        // 后续按节点抽出其连接 MCU 的真实引脚，生成各自引脚化的代码段。
        const forcedDeviceNodes = new Map(); // nodeId -> { node, ifaceNames:Set(去@后) }
        const registerForcedDevice = (node) => {
            if (!node || !node.config) return;
            const iv = node.config.iface;
            if (!iv) return;
            const list = Array.isArray(iv) ? iv : [iv];
            const at = list.filter(s => String(s).charAt(0) === '@').map(s => String(s).slice(1));
            if (!at.length) return;
            if (!forcedDeviceNodes.has(node.nodeId)) forcedDeviceNodes.set(node.nodeId, { node, ifaceNames: new Set() });
            const rec = forcedDeviceNodes.get(node.nodeId);
            at.forEach(n => rec.ifaceNames.add(n));
        };
        this.connections.forEach(conn => {
            const ends = [conn.source, conn.target];
            // 注册带 @ 强制接口的器件节点（两端都可能，幂等），供多实例展开收集引脚
            ends.forEach(e => { const n = this.nodes.get(e.nodeId); if (n) registerForcedDevice(n); });
            // 转换器隔离：本连接任一端是“模拟接口转换器”（config.converter，首行接口名带 @）时，
            // 该连接不参与硬件/模拟信号匹配（避免其右侧 SPI 信号误触发硬件接口初始化），
            // 仅记录其强制软件模拟接口名（忽略 & 条件，必定使用对应软件模拟程序段）。
            const convEnd = ends.find(e => { const n = this.nodes.get(e.nodeId); return n && n.config && n.config.converter; });
            if (convEnd) {
                const cn = this.nodes.get(convEnd.nodeId);
                // 转换器：整条连接隔离（右侧接口信号不污染 hw 匹配），仅把 @ 接口名收进强制选择集
                collectIface(cn.config.iface, null);
                return;
            }
            // 先判定本连接 MCU 端引脚的路由：有 AF id → 硬件('hw')；无 AF 且有 GPIO_OUT/GPIO_IN → 模拟('sim')。
            const mcuEnd = ends.find(e => { const n = this.nodes.get(e.nodeId); return n && n.config && n.config.device; });
            let route = 'hw';
            if (mcuEnd) {
                const n = this.nodes.get(mcuEnd.nodeId);
                const afFn = (n.af && typeof n.af.get === 'function') ? n.af.get(`${mcuEnd.port}-${mcuEnd.index}`) : null;
                const hasGpio = (typeof n.getSpecialFunctions === 'function')
                    ? n.getSpecialFunctions(mcuEnd.port, mcuEnd.index).some(f => f === 'GPIO_OUT' || (typeof isGpioInput === 'function' && isGpioInput(f)))
                    : false;
                if ((!afFn || !afFn.id) && hasGpio) route = 'sim';
            }
            const targetSet = (route === 'sim') ? gpioNames : names;

            // 若该连接归属某个“显式声明接口名”的自定义器件（config.iface，可为数组=多接口），
            // 则整个连接被「锁定」到这些接口：按路由加入对应集合，**不再登记引脚信号 / MCU AF id**。
            // 器件声明 [通用SPI 通用SPI2] 即同时匹配这些接口（可命中多个程序段），且不会再因同引脚信号
            // （SPI1_SCK/MOSI/MISO 等同义词）命中其它同物理接口的通用定义（如 通用SPI）。
            const lockedIfaces = [];
            for (const end of ends) {
                const n = this.nodes.get(end.nodeId);
                if (n && n.config && n.config.iface) {
                    const iv = n.config.iface;
                    if (Array.isArray(iv)) lockedIfaces.push(...iv);
                    else if (iv) lockedIfaces.push(iv);
                }
            }
            if (lockedIfaces.length) {
                collectIface(lockedIfaces, targetSet);
                return;
            }

            for (const end of ends) {
                const n = this.nodes.get(end.nodeId);
                if (!n || !n.config) continue;
                if (n.config.device) {
                    // MCU 端
                    if (route === 'sim') {
                        // 模拟路由：仅把 GPIO_OUT / GPIO_IN（含 GPIO_INPU 上拉 / GPIO_INPD 下拉）加入模拟集
                        // （该脚未分配 AF，走通用 GPIO）。输入变体额外归一为 GPIO_IN 便于接口函数匹配。
                        if (typeof n.getSpecialFunctions === 'function') {
                            n.getSpecialFunctions(end.port, end.index).forEach(f => {
                                const u = String(f).toUpperCase();
                                if (u === 'GPIO_OUT' || u === 'GPIO_IN' || u === 'GPIO_INPU' || u === 'GPIO_INPD') {
                                    addNameTo(targetSet, u);
                                    if (u === 'GPIO_INPU' || u === 'GPIO_INPD') addNameTo(targetSet, 'GPIO_IN');
                                }
                            });
                        }
                    } else {
                        // 硬件路由：取已分配的 AF id，并补充 MCU 引脚特殊功能
                        if (n.af && typeof n.af.get === 'function') {
                            const fn = n.af.get(`${end.port}-${end.index}`);
                            if (fn && fn.id) addNameTo(targetSet, String(fn.id));
                        }
                        if (typeof n.getSpecialFunctions === 'function') {
                            n.getSpecialFunctions(end.port, end.index).forEach(f => addNameTo(targetSet, String(f)));
                        }
                    }
                } else {
                    // 外设 / 自定义器件端：取引脚 signal（如 CHX / MOSI / CLK）+ 通用功能信号 + 声明接口名，
                    // 跟随本连接路由进入对应集合。
                    const sig = (typeof n.getPadSignal === 'function') ? n.getPadSignal(end.port, end.index) : null;
                    if (sig) addNameTo(targetSet, String(sig));
                    if (typeof n.getSpecialFunctions === 'function') {
                        n.getSpecialFunctions(end.port, end.index).forEach(f => addNameTo(targetSet, String(f)));
                    }
                    const idef = n.config && n.config.iface;
                    if (idef) collectIface(idef, targetSet);
                }
            }
        });

        // 2b. 内部维护“所使用外设实例”列表（如 ADC / SPI1 / TIM1 / GPIO）——
        //     从两个集合的信号名 / AF id 提取外设实例；供后续初始化时钟(RCC 使能)收集外设使能位。
        const periSet = new Set();
        for (const name of names) {
            const p = this.extractPeripheralName(name);
            if (p) periSet.add(p);
        }
        for (const name of gpioNames) {
            const p = this.extractPeripheralName(name);
            if (p) periSet.add(p);
        }
        for (const name of forcedSimNames) {
            const p = this.extractPeripheralName(name);
            if (p) periSet.add(p);
        }
        this.usedPeripherals = Array.from(periSet).sort();

        // 2c. 收集接口函数定义（单一池，硬件与软件模拟共用）：
        //     - 常规路由：defMatches(def, names) 命中硬件/接口函数段（AF 路由的连接）；
        //     - 强制选择：def 的任一别名在 forcedSimNames 中（来自连接上 @接口名 声明）则忽略 & 条件直接命中
        //       —— 这正是“通过 @ 选择软件模拟（或任意）接口定义”的入口，无需单独的模拟定义分类。
        //     均按定义级条件去重、保留顺序；供「程序段输出」栏整段导出。
        const usedFunc = new Set();
        const forcedDefSet = new Set();
        for (const def of this.getInterfaceFunctions()) {
            // 强制选择：连接的 @接口名 与定义的“管理名”或任一别名相符即忽略 & 条件直接命中
            // （@ 声明的是管理名，如 @通用SPI_模拟，而该定义的别名通常是 SPI1_*，故需同时比对 def.name）。
            const forced = (def.name && forcedSimNames.has(def.name))
                || (def.names || []).some(n => forcedSimNames.has(n));
            if (forced) { forcedDefSet.add(def); continue; } // 强制 def 仅经实例展开输出，不在硬件路径单列
            if (this.defMatches(def, names)) usedFunc.add(def);
        }
        this.usedFuncDefs = Array.from(usedFunc);
        this.forcedDefs = Array.from(forcedDefSet);

        // 2c-2. 多实例展开：每个带 @ 的器件节点 = 一个实例，抽出其连接 MCU 的真实引脚，
        //       关联被强制命中的接口函数定义（defNames → def 对象），供程序段逐实例引脚化输出。
        const instances = [];
        const nameIdx = {};
        const nodeIds = Array.from(forcedDeviceNodes.keys()).sort(); // 按 nodeId 稳定排序，保证输出顺序稳定
        for (const nid of nodeIds) {
            const rec = forcedDeviceNodes.get(nid);
            const devNode = rec.node;
            const devName = (devNode.config && devNode.config.name) || 'DEV';
            const idx = nameIdx[devName] = (nameIdx[devName] || 0);
            nameIdx[devName] = idx + 1;
            const pins = {};
            for (const conn of this.connections) {
                let devEnd = null, otherEnd = null;
                if (conn.source.nodeId === nid) { devEnd = conn.source; otherEnd = conn.target; }
                else if (conn.target.nodeId === nid) { devEnd = conn.target; otherEnd = conn.source; }
                else continue;
                const otherNode = this.nodes.get(otherEnd.nodeId);
                if (!(otherNode && otherNode.config && otherNode.config.device)) continue; // 仅 MCU 端贡献引脚
                const gpio = (typeof otherNode.getPortName === 'function')
                    ? otherNode.getPortName(otherEnd.port, otherEnd.index) : null;
                if (!gpio) continue;
                const role = this.canonicalPadRole(devNode, devEnd.port, devEnd.index);
                if (role) pins[role] = gpio;
            }
            instances.push({ nodeId: nid, deviceName: devName, idx, pins, defNames: Array.from(rec.ifaceNames) });
        }
        this.usedInstances = instances.map(inst => {
            const defs = (this.forcedDefs || []).filter(d =>
                inst.defNames.includes(d.name) || (d.names || []).some(n => inst.defNames.includes(n)));
            return Object.assign({}, inst, { defs });
        });

        // 3. 逐接口收集：先保留每个接口内部的全部行（含同地址多行，如“先赋值再使能”），
        //    同时算出该接口对每地址的“最后一行”值（接口内部 last-wins）；跨接口同地址稍后统一按 “|” 合并。
        //    —— 不同接口（不同 def）命中同一地址：按 “|” 合并（如 TIM1_CH1 + TIM1_CH2 同时连，避免互相覆盖）；
        //    —— 仅同一接口内部出现两个相同地址：保留两行（dump 呈现完整“先赋值再使能”序列，SVD 取最后值）。
        //    命中判断为定义级条件（支持 & 筛选）；多别名定义的同一定义只处理一次（按对象引用去重）。
        const seenDefs = new Set();
        const defContribs = [];
        for (const def of this.getInterfaceInits()) {
            // 多别名定义：同一定义可能对多个连接名命中，只处理一次（按对象引用去重）
            if (!def || !def.entries || seenDefs.has(def)) continue;
            // 强制选择：连接上以 '@' 声明的接口名（管理名或任一别名）命中时忽略 & 条件直接采用其寄存器初始化段
            // —— 与「程序段」(2c) 的强制选择保持一致，确保 @ 接口名=强制使用接口（含寄存器与代码）。
            const forced = (def.name && forcedSimNames.has(def.name))
                || (def.names || []).some(n => forcedSimNames.has(n));
            if (!forced && !this.defMatches(def, names)) continue;
            seenDefs.add(def);
            const dLines = this._makeIfaceLines(def.entries, def.name);
            const lastByReg = {};
            for (const ln of dLines) lastByReg[ln.regId] = ln; // 接口内部 last-wins（同地址取最后一行）
            defContribs.push({ name: def.name, lines: dLines, lastByReg });
        }
        // 完整原始行（含接口内部同地址多行），供变动值 dump 输出（跨接口合并在 dump / SVD 处统一处理）
        const lines = defContribs.flatMap(c => c.lines);

        // 4. 写入 svdRegValues（落到当前激活 SVD 的命名空间，与编辑器一致）。
        //    跨接口同地址 → 按 “|” 合并（不同接口/通道的位设置互不覆盖）；
        //    接口内部同地址 → 取最后一行（last-wins，SVD 一个寄存器只存一个值，取最终使能值）；
        //    手动编辑（非 iface 源）的基值仍与之 OR 保留。变动值 dump 的完整多行由 _ifaceRegLines 提供。
        const svdMap = this._svdActiveMap();
        const finalByReg = {}; // regId -> { value, line }：跨接口 OR 合并（接口内部已先 last-wins）
        for (const c of defContribs) {
            for (const regId in c.lastByReg) {
                if (!finalByReg[regId]) finalByReg[regId] = { value: 0, line: c.lastByReg[regId] };
                finalByReg[regId].value = (finalByReg[regId].value | c.lastByReg[regId].value) >>> 0;
                finalByReg[regId].line = c.lastByReg[regId];
            }
        }
        const newIds = [];
        const idSet = new Set();
        for (const regId in finalByReg) {
            const f = finalByReg[regId];
            let manualBase = 0;
            const existing = svdMap[regId];
            if (existing && existing._src !== 'iface') manualBase = existing.value >>> 0;
            const finalVal = (f.value | manualBase) >>> 0;
            svdMap[regId] = { id: regId, address: f.line.address, name: f.line.regName, reset: f.line.reset, value: finalVal, _src: 'iface', _iface: '*' };
            if (!idSet.has(regId)) { idSet.add(regId); newIds.push(regId); }
        }
        this._ifaceRegIds = newIds;
        // 完整原始行（含接口内部同地址多行），供变动值 dump 按输入顺序/分组输出（跨接口合并在 dump 内处理）
        this._ifaceRegLines = lines;

        // 5. 持久化；仅变化时触发刷新
        this.persistSvdRegValues();
        const sig = JSON.stringify(newIds.map(id => [id, svdMap[id].value]));
        if (sig !== this._ifaceSig) {
            this._ifaceSig = sig;
            this.triggerCallback('onRegistersChanged', { ids: newIds });
        }
    },

    /**
     * 保存到SVD：把当前编辑的接口初始化段直接写入 MCU 寄存器状态（svdRegValues），
     * 不依赖连接。用于「先应用 → 去 SVD 视图微调寄存器 → 从SVD加载回初始化」的微调闭环。
     * 仅清除本接口此前写入的 iface 条目（按 _iface 名隔离），不影响其它接口/连接的 iface 条目。
     * @param {string} raw 接口初始化原始文本（首行=接口名，后续 地址,值）
     * @returns {{ok:boolean, msg?:string, count?:number}}
     */
    applyInterfaceInitToSvd(raw, svdKey) {
        const r = this.parseInterfaceInit(this.toNewFormatRaw(raw));
        if (!r.name) return { ok: false, msg: '第 1 行必须为名称（如 通用SPI）' };
        const name = r.name;
        // 目标 SVD 命名空间：显式指定（面板底部选择器）优先，否则回退当前激活 SVD
        const targetKey = svdKey || this._svdActiveKey();

        // 1. 清除本接口此前写入的 iface 条目（svdRegValues + 逐行记录 + id 列表，跨所有 svdKey）
        const svdAll = this.svdRegValues || {};
        for (const sk in svdAll) {
            const m = svdAll[sk];
            for (const id in m) {
                const e = m[id];
                if (e && e._src === 'iface' && e._iface === name) delete m[id];
            }
        }
        // 逐行记录：删除本接口名的旧行（保留其它接口的多行）
        this._ifaceRegLines = (this._ifaceRegLines || []).filter(l => !(l._src === 'iface' && l.name === name));
        // id 列表：保留其它 iface 源的 id
        const keepIds = (this._ifaceRegIds || []).filter(id => {
            for (const sk in svdAll) { const e = svdAll[sk] && svdAll[sk][id]; if (e) return !(e._src === 'iface' && e._iface === name); }
            return false;
        });

        // 2. 生成本接口各 (addr,value) 的逐行记录（同地址多行保留，如先赋值再使能），写入目标 SVD 命名空间（按 svdKey 隔离）。
        //    同一地址只保留“最后一行”的值（last-wins），手动编辑基值仍与之 OR 保留。
        const svdMap = this._svdMap(targetKey);
        const lines = this._makeIfaceLines(r.entries, name);
        const lastByReg = {}; // regId -> 最后出现的 line（本接口内部 last-wins）
        for (const ln of lines) lastByReg[ln.regId] = ln;
        const newIds = [];
        const idSet = new Set();
        for (const regId in lastByReg) {
            const lv = lastByReg[regId];
            // 跨接口同地址 → 与已有值（手动编辑 或 其它接口写入）按 “|” 合并；本接口自身旧值已先清除，无需再 OR。
            let base = 0;
            const existing = svdMap[regId];
            if (existing && !(existing._src === 'iface' && existing._iface === name)) {
                base = existing.value >>> 0;
            }
            const finalVal = (lv.value | base) >>> 0;
            svdMap[regId] = { id: regId, address: lv.address, name: lv.regName, reset: lv.reset, value: finalVal, _src: 'iface', _iface: name };
            if (!idSet.has(regId)) { idSet.add(regId); newIds.push(regId); }
        }
        this._ifaceRegIds = keepIds.concat(newIds);
        // 追加本接口的完整多行记录，供变动值 dump 按输入顺序输出（含同地址两行）
        this._ifaceRegLines = (this._ifaceRegLines || []).concat(lines);

        // 3. 顺带把该接口对应的外设加入“已使用外设”列表（从别名提取，供后续时钟使能收集）
        for (const a of (r.names || [])) {
            const p = this.extractPeripheralName(a);
            if (p && this.usedPeripherals.indexOf(p) < 0) {
                this.usedPeripherals = Array.from(new Set(this.usedPeripherals.concat(p))).sort();
            }
        }

        // 4. 持久化 + 触发 SVD 视图刷新
        this.persistSvdRegValues();
        this.triggerCallback('onRegistersChanged', { ids: newIds, reason: 'iface-save-svd' });
        return { ok: true, count: newIds.length };
    },

    /**
     * 从SVD加载：根据当前 SVD 寄存器实际数值，回填接口初始化文本。
     * 严格按原输入顺序、对应地址重新赋值（不会破坏顺序），便于在 SVD 微调后同步回初始化文本。
     * @param {string} raw 当前接口初始化原始文本
     * @returns {{ok:boolean, msg?:string, raw?:string}}
     */
    loadInterfaceInitFromSvd(raw, svdKey) {
        const r = this.parseInterfaceInit(this.toNewFormatRaw(raw));
        if (!r.name) return { ok: false, msg: '第 1 行必须为名称（如 通用SPI）', raw: null };
        const targetKey = svdKey || this._svdActiveKey();
        const idx = this.buildRegAddressIndex();
        const hx = (v) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
        // 第 1 行还原为管理名；第 2 行还原为别名行（保留 & 条件前缀）；第 3 行起为 地址,值
        const aliasLine = [].concat(
            (r.required || []).map(n => '&' + n),
            (r.defaults || [])
        ).join(' ');
        const lines = [r.name];
        if (aliasLine) lines.push(aliasLine);
        for (const ent of r.entries) {
            const key = hx(ent.addr);
            const info = idx.get(key);
            let curVal = ent.value >>> 0;
            if (info) {
                const stored = this._svdMap(targetKey)[info.regId];
                curVal = stored ? (stored.value >>> 0) : (info.reset >>> 0);
            }
            lines.push(hx(ent.addr) + ',' + hx(curVal) + ',');
        }
        return { ok: true, raw: lines.join('\n') };
    },

    startNodeDrag(e) {
        // 仅左键（button 0）启动拖动；右键留给 contextmenu 弹出器件菜单。
        // （触摸事件经 synthetic MouseEvent 注入，button 默认为 0，不受影响）
        if (e.button !== 0) return;
        if (e.target.classList.contains('node-port') || e.target.classList.contains('delete-node')) return;

        const nodeId = e.currentTarget.id;
        const node = this.nodes.get(nodeId);

        // 检查是否按住Shift键进行多选
        if (e.shiftKey) {
            // 切换节点选中状态
            if (this.selectedNodes.has(nodeId)) {
                this.selectedNodes.delete(nodeId);
                node.setSelected(false);
            } else {
                this.selectedNodes.add(nodeId);
                node.setSelected(true);
            }
            e.stopPropagation();
            return;
        }

        // 如果没有按住Shift键且点击的节点未被选中，则清空选择并选中当前节点
        if (!this.selectedNodes.has(nodeId)) {
            this.clearSelection();
            this.selectedNodes.add(nodeId);
            node.setSelected(true);
        }

        // 开始拖动所有选中节点
        this.isDraggingNode = true;
        this.draggedNode = nodeId;

        // 存储所有选中节点的初始位置
        this.selectedNodes.forEach(id => {
            const n = this.nodes.get(id);
            if (n) {
                n.startX = n.position.x;
                n.startY = n.position.y;
            }
        });

        // 存储鼠标初始位置
        this.mouseStartX = e.clientX;
        this.mouseStartY = e.clientY;

        // 改变所有选中节点的样式
        this.selectedNodes.forEach(id => {
            const n = this.nodes.get(id);
            if (n) {
                n.element.style.opacity = "0.8";
                n.element.style.cursor = "grabbing";
            }
        });

        e.preventDefault();
        e.stopPropagation();
    },

    startSelection(e) {
        // 只有在空白处点击且没有按住Shift键时才开始选择
        if (e.target !== this.container || e.shiftKey) return;

        // 清空现有选择
        this.clearSelection();

        this.isSelecting = true;
        const containerRect = this.container.getBoundingClientRect();
        this.selectionStart.x = e.clientX - containerRect.left;
        this.selectionStart.y = e.clientY - containerRect.top;

        // 创建选择矩形
        if (!this.selectionRectangle) {
            this.selectionRectangle = document.createElement('div');
            this.selectionRectangle.className = 'selection-rectangle';
            this.selectionRectangle.style.left = this.selectionStart.x + 'px';
            this.selectionRectangle.style.top = this.selectionStart.y + 'px';
        }
        this.selectionRectangle.style.width = '0px';
        this.selectionRectangle.style.height = '0px';
        this.container.appendChild(this.selectionRectangle);

        e.preventDefault();
    },

    updateSelection(e) {
        if (!this.isSelecting || !this.selectionRectangle) return;

        const containerRect = this.container.getBoundingClientRect();
        const currentX = e.clientX - containerRect.left;
        const currentY = e.clientY - containerRect.top;

        // 更新选择矩形的位置和大小
        const left = Math.min(this.selectionStart.x, currentX);
        const top = Math.min(this.selectionStart.y, currentY);
        const width = Math.abs(currentX - this.selectionStart.x);
        const height = Math.abs(currentY - this.selectionStart.y);

        this.selectionRectangle.style.left = left + 'px';
        this.selectionRectangle.style.top = top + 'px';
        this.selectionRectangle.style.width = width + 'px';
        this.selectionRectangle.style.height = height + 'px';

        // 使用矩形相交算法检查哪些节点在选择区域内
        this.nodes.forEach((node, nodeId) => {
            const rect = node.element.getBoundingClientRect();
            const nodeLeft = rect.left - containerRect.left;
            const nodeTop = rect.top - containerRect.top;
            const nodeRight = nodeLeft + rect.width;
            const nodeBottom = nodeTop + rect.height;

            // 矩形相交检测算法
            const selectionRight = left + width;
            const selectionBottom = top + height;

            const intersect = !(nodeLeft > selectionRight ||
                nodeRight < left ||
                nodeTop > selectionBottom ||
                nodeBottom < top);

            if (intersect) {
                if (!this.selectedNodes.has(nodeId)) {
                    this.selectedNodes.add(nodeId);
                    node.setSelected(true);
                }
            } else {
                // 如果节点不在选择区域内且之前被选中，则取消选中
                if (this.selectedNodes.has(nodeId)) {
                    this.selectedNodes.delete(nodeId);
                    node.setSelected(false);
                }
            }
        });
    },

    endSelection() {
        if (this.isSelecting && this.selectionRectangle) {
            this.selectionRectangle.remove();
            this.selectionRectangle = null;
            this.isSelecting = false;
        }
    },

    clearSelection() {
        this.selectedNodes.forEach(nodeId => {
            const node = this.nodes.get(nodeId);
            if (node) {
                node.setSelected(false);
            }
        });
        this.selectedNodes.clear();
    },

    startPanning(e) {
        this.isPanning = true;
        this.panStart.x = e.clientX;
        this.panStart.y = e.clientY;
        this.container.classList.add('dragging');
        e.preventDefault();
    },

    mouseMove(e) {
        const containerRect = this.container.getBoundingClientRect();
        this.currentMousePos.x = e.clientX - containerRect.left;
        this.currentMousePos.y = e.clientY - containerRect.top;

        // 处理平移
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            this.panOffset.x += dx;
            this.panOffset.y += dy;
            this.panStart.x = e.clientX;
            this.panStart.y = e.clientY;
            this.applyTransform();
            this.drawAll(); // 同步更新连接线
            return;
        }

        // 处理选择区域更新
        if (this.isSelecting) {
            this.updateSelection(e);
            return;
        }

        // 处理节点拖动
        if (this.isDraggingNode && this.draggedNode) {
            const dx = e.clientX - this.mouseStartX;
            const dy = e.clientY - this.mouseStartY;

            // 移动所有选中节点
            this.selectedNodes.forEach(nodeId => {
                const node = this.nodes.get(nodeId);
                if (node) {
                    let newX = node.startX + dx / this.zoomLevel;
                    let newY = node.startY + dy / this.zoomLevel;

                    // 更新节点位置
                    node.position.x = newX;
                    node.position.y = newY;

                    // 应用变换
                    this.applyNodeTransform(node);
                }
            });

            // 更新连接线
            this.drawAll();
            this.updateStatus();
        }

        // 处理连接拖拽
        if (this.isDraggingConnection) {
            // 检查鼠标是否在Pad上
            const hoveredPort = this.checkPortHover(this.currentMousePos.x, this.currentMousePos.y);

            if (hoveredPort) {
                // 高亮目标节点
                this.highlightNode(hoveredPort.nodeId);
                this.connectionTarget = hoveredPort;
            } else {
                // 移除高亮
                this.removeHighlight();
                this.connectionTarget = null;
            }

            // 更新连接线
            this.drawAll();
        }
    },

    mouseUp(e) {
        // 处理平移结束
        if (this.isPanning) {
            this.isPanning = false;
            this.container.classList.remove('dragging');
            return;
        }

        // 处理选择结束
        if (this.isSelecting) {
            this.endSelection();
            return;
        }

        // 处理连接完成
        if (this.isDraggingConnection && this.connectionSource) {
            if (this.connectionTarget) {
                // 完成连接
                this.createConnection(this.connectionSource, this.connectionTarget);
                // 根据本次连接锁定总线实例（如 SPI1），影响后续外设连线高亮
                this.applyBusLock(this.connectionSource, this.connectionTarget);
                // 外设连到 MCU 时，自动配置该 IO 的 AF 与 GPIO 寄存器
                this.autoConfigureDevicePin(this.connectionSource, this.connectionTarget);
                // 连接完成后，按当前连接重新应用“自定义接口初始化参数”到 MCU 寄存器
                this.recomputeInterfaceInitRegisters();
            } else {
                // 取消连接
                this.updateConnectionStatus("连接已取消", "#ff4444", "点击任意Pad开始连接");
            }

            // 清除总线高亮
            this.clearBusHighlight();

            // 重置状态
            this.isDraggingConnection = false;
            this.connectionSource = null;
            this.removeHighlight();
            this.drawAll();
        }

        // 处理节点拖动结束
        if (this.isDraggingNode && this.draggedNode) {
            // 恢复所有选中节点的样式
            this.selectedNodes.forEach(nodeId => {
                const node = this.nodes.get(nodeId);
                if (node) {
                    node.element.style.opacity = "1";
                    node.element.style.cursor = "move";
                }
            });

            this.isDraggingNode = false;
            this.draggedNode = null;
        }

        this.updateStatus();
    },

    checkPortHover(x, y) {
        const ports = this.container.querySelectorAll('.node-port');
        const containerRect = this.container.getBoundingClientRect();

        // 吸附半径随缩放调整：引脚密集（LQFP/QFN）时仍能准确命中“最近”的那个，
        // 而不是 DOM 顺序里第一个落在半径内的（那会连到高亮 pad 的前一个）。
        // 上限 45px，避免高倍缩放下过度吸附到不相关的引脚。
        const snapRadius = Math.min(45, 30 * Math.max(this.zoomLevel, 1));

        let nearest = null;
        let nearestDist = Infinity;

        for (const port of ports) {
            // 跳过被禁用的Pad
            if (port.classList.contains('disabled')) {
                continue;
            }

            const rect = port.getBoundingClientRect();

            const portX = rect.left + rect.width / 2 - containerRect.left;
            const portY = rect.top + rect.height / 2 - containerRect.top;

            // 计算距离
            const distance = Math.sqrt(
                Math.pow(x - portX, 2) + Math.pow(y - portY, 2)
            );

            // 仅在吸附半径内考虑，且取离鼠标最近的一个
            if (distance <= snapRadius && distance < nearestDist) {
                nearestDist = distance;
                nearest = {
                    nodeId: port.dataset.node,
                    port: port.dataset.port,
                    index: port.dataset.index,
                    element: port
                };
            }
        }

        if (!nearest) return null;

        // 不能连接到同一个节点的Pad
        if (this.connectionSource && this.connectionSource.nodeId === nearest.nodeId) {
            return null;
        }

        // 检查是否已经存在相同的连接
        const existingConnection = this.connections.find(conn =>
            conn.source.nodeId === this.connectionSource.nodeId &&
            conn.source.port === this.connectionSource.port &&
            conn.source.index === this.connectionSource.index &&
            conn.target.nodeId === nearest.nodeId &&
            conn.target.port === nearest.port &&
            conn.target.index === nearest.index
        );

        if (existingConnection) {
            return null;
        }

        return nearest;
    },

    createConnection(source, target) {
        const newConnection = {
            source: {
                nodeId: source.nodeId,
                port: source.port,
                index: source.index
            },
            target: {
                nodeId: target.nodeId,
                port: target.port,
                index: target.index
            },
            id: Date.now() + Math.random(),
            // 保存当前的线条配置
            style: {
                color: this.lineConfig.color,
                width: this.lineConfig.width
            }
        };

        this.connections.push(newConnection);

        // 触发连接变化回调
        this.triggerCallback('onConnectionChange', { type: 'connect', connection: newConnection });

        // 更新UI
        this.updateConnectionStatus("已连接", "#00ff88", `${source.nodeId}(${source.port}[${source.index}]) → ${target.nodeId}(${target.port}[${target.index}])`);

        // 播放成功连接动画
        const sourceNode = this.nodes.get(source.nodeId);
        const targetNode = this.nodes.get(target.nodeId);

        if (sourceNode) sourceNode.element.classList.add('active');
        if (targetNode) targetNode.element.classList.add('active');

        setTimeout(() => {
            if (sourceNode) sourceNode.element.classList.remove('active');
            if (targetNode) targetNode.element.classList.remove('active');
        }, 500);

        this.drawAll();
    },

    drawConnection(connection, isActive = false, isHighlighted = false) {
        const sourceNode = this.nodes.get(connection.source.nodeId);
        const targetNode = this.nodes.get(connection.target.nodeId);

        if (!sourceNode || !targetNode) return;

        const sourcePos = sourceNode.getPortPosition(connection.source.port, connection.source.index);
        const targetPos = targetNode.getPortPosition(connection.target.port, connection.target.index);

        if (!sourcePos || !targetPos) return;

        this.ctx.save();

        // 设置线条样式 - 使用连接对象中的样式或默认样式
        let lineWidth = isActive ? (connection.style?.width || this.lineConfig.width) + 1 : (connection.style?.width || this.lineConfig.width);
        let lineColor = isActive ? '#00ff88' : (connection.style?.color || this.lineConfig.color);

        // 如果是高亮状态，增加亮度和宽度
        if (isHighlighted) {
            lineWidth = lineWidth + 2;
            // 提高颜色亮度
            if (lineColor.startsWith('#')) {
                const r = parseInt(lineColor.substr(1, 2), 16);
                const g = parseInt(lineColor.substr(3, 2), 16);
                const b = parseInt(lineColor.substr(5, 2), 16);
                lineColor = `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`;
            }
            // 添加发光效果
            this.ctx.shadowColor = lineColor;
            this.ctx.shadowBlur = 10;
        }

        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeStyle = lineColor;
        this.ctx.lineCap = 'round';

        // 开始绘制贝塞尔曲线
        this.ctx.beginPath();
        this.ctx.moveTo(sourcePos.x, sourcePos.y);

        // 根据Pad方向和相对位置调整曲线控制点
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 控制点偏移量
        const offset = Math.min(distance * 0.4, 130);

        let cp1x, cp1y, cp2x, cp2y;

        // 根据源Pad方向调整第一个控制点
        switch (connection.source.port) {
            case 'top':
                cp1x = sourcePos.x;
                cp1y = sourcePos.y - offset;
                break;
            case 'right':
                cp1x = sourcePos.x + offset;
                cp1y = sourcePos.y;
                break;
            case 'bottom':
                cp1x = sourcePos.x;
                cp1y = sourcePos.y + offset;
                break;
            case 'left':
                cp1x = sourcePos.x - offset;
                cp1y = sourcePos.y;
                break;
        }

        // 根据目标Pad方向调整第二个控制点
        switch (connection.target.port) {
            case 'top':
                cp2x = targetPos.x;
                cp2y = targetPos.y - offset;
                break;
            case 'right':
                cp2x = targetPos.x + offset;
                cp2y = targetPos.y;
                break;
            case 'bottom':
                cp2x = targetPos.x;
                cp2y = targetPos.y + offset;
                break;
            case 'left':
                cp2x = targetPos.x - offset;
                cp2y = targetPos.y;
                break;
        }

        // 绘制三次贝塞尔曲线
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, targetPos.x, targetPos.y);

        // 绘制箭头（实心填充三角形，跟随缩放大小）
        this.ctx.stroke();
        const angle = Math.atan2(targetPos.y - cp2y, targetPos.x - cp2x);
        // 箭头长度随画布缩放：缩放越大箭头越大，缩放越小箭头越小（避免缩到不可见设下限）
        const arrowLength = Math.max(5, 15 * this.zoomLevel);
        const half = Math.PI / 6;
        const ax1 = targetPos.x - arrowLength * Math.cos(angle - half);
        const ay1 = targetPos.y - arrowLength * Math.sin(angle - half);
        const ax2 = targetPos.x - arrowLength * Math.cos(angle + half);
        const ay2 = targetPos.y - arrowLength * Math.sin(angle + half);

        this.ctx.beginPath();
        this.ctx.moveTo(targetPos.x, targetPos.y);
        this.ctx.lineTo(ax1, ay1);
        this.ctx.lineTo(ax2, ay2);
        this.ctx.closePath();
        this.ctx.fillStyle = lineColor;
        this.ctx.fill();

        // 绘制Pad连接点
        this.ctx.beginPath();
        this.ctx.arc(sourcePos.x, sourcePos.y, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = isActive ? '#00ff88' : '#ffffff';
        if (isHighlighted) {
            this.ctx.fillStyle = '#00ff88';
            this.ctx.shadowColor = '#00ff88';
            this.ctx.shadowBlur = 10;
        }
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(targetPos.x, targetPos.y, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = isActive ? '#00ff88' : '#ffffff';
        if (isHighlighted) {
            this.ctx.fillStyle = '#00ff88';
            this.ctx.shadowColor = '#00ff88';
            this.ctx.shadowBlur = 10;
        }
        this.ctx.fill();

        this.ctx.restore();
    },

    drawDraggingConnection() {
        if (!this.isDraggingConnection || !this.connectionSource) return;

        const sourceNode = this.nodes.get(this.connectionSource.nodeId);
        if (!sourceNode) return;

        const sourcePos = sourceNode.getPortPosition(this.connectionSource.port, this.connectionSource.index);
        if (!sourcePos) return;

        this.ctx.save();

        // 设置拖拽线条样式 - 使用当前配置
        this.ctx.lineWidth = this.lineConfig.width;
        this.ctx.strokeStyle = this.lineConfig.color;
        this.ctx.lineCap = 'round';
        this.ctx.setLineDash([5, 5]);

        this.ctx.beginPath();
        this.ctx.moveTo(sourcePos.x, sourcePos.y);

        // 计算控制点
        const dx = this.currentMousePos.x - sourcePos.x;
        const dy = this.currentMousePos.y - sourcePos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.min(distance * 0.3, 100);

        let cp1x, cp1y;

        // 根据源Pad方向调整控制点
        switch (this.connectionSource.port) {
            case 'top':
                cp1x = sourcePos.x;
                cp1y = sourcePos.y - offset;
                break;
            case 'right':
                cp1x = sourcePos.x + offset;
                cp1y = sourcePos.y;
                break;
            case 'bottom':
                cp1x = sourcePos.x;
                cp1y = sourcePos.y + offset;
                break;
            case 'left':
                cp1x = sourcePos.x - offset;
                cp1y = sourcePos.y;
                break;
        }

        // 绘制到鼠标位置的曲线
        this.ctx.quadraticCurveTo(cp1x, cp1y, this.currentMousePos.x, this.currentMousePos.y);
        this.ctx.stroke();

        // 绘制拖拽端点
        this.ctx.beginPath();
        this.ctx.arc(this.currentMousePos.x, this.currentMousePos.y, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = this.lineConfig.color;
        this.ctx.fill();

        this.ctx.restore();
    },

    drawAll() {
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.shadowBlur = 0; // 重置阴影

        // 绘制所有连接线
        this.connections.forEach((conn, index) => {
            const isHighlighted = this.highlightedConnections.has(index);
            this.drawConnection(conn, false, isHighlighted);
        });

        // 绘制拖拽中的连接线
        this.drawDraggingConnection();

        // 更新连接计数
        this.updateConnectionCount(this.connections.length);
    },

    updateStatus() {
        let statusText = "";

        if (this.isDraggingConnection && this.connectionSource) {
            const node = this.nodes.get(this.connectionSource.nodeId);
            const nodeName = node ? node.element.textContent.trim() : this.connectionSource.nodeId;
            statusText = `正在从 ${nodeName} 的${this.connectionSource.port}Pad[${this.connectionSource.index}] 创建连接`;
        } else if (this.isDraggingNode && this.draggedNode) {
            if (this.selectedNodes.size > 1) {
                statusText = `正在移动 ${this.selectedNodes.size} 个选中节点`;
            } else {
                const node = this.nodes.get(this.draggedNode);
                statusText = `正在移动 ${node ? node.element.textContent.trim() : this.draggedNode}`;
            }
        } else if (this.isSelecting) {
            statusText = `正在选择节点... (${this.selectedNodes.size} 个节点已选中)`;
        } else if (this.isPanning) {
            statusText = `正在平移画布`;
        } else {
            statusText = "点击任意节点的Pad并拖动到其他节点Pad创建连接";
        }

        // 更新状态信息
        this.updateStatusInfo(statusText);
    },

    highlightNode(nodeId) {
        // 移除之前的高亮
        this.removeHighlight();

        // 添加新的高亮
        const node = this.nodes.get(nodeId);
        if (node) {
            node.element.classList.add('highlight');
            this.highlightedNode = node.element;

            // 设置高亮强度
            const glowIntensityInput = document.getElementById('glowIntensity');
            if (glowIntensityInput) {
                const intensity = parseInt(glowIntensityInput.value) / 10;
                node.element.style.filter = `drop-shadow(0 0 ${15 + intensity * 10}px rgba(0, 255, 100, ${0.5 + intensity * 0.3}))`;
            }
        }
    },

    removeHighlight() {
        if (this.highlightedNode) {
            this.highlightedNode.classList.remove('highlight');
            this.highlightedNode.style.filter = '';
            this.highlightedNode = null;
        }
    },

    deleteNode(nodeId) {
        // 删除相关的连接
        const originalLength = this.connections.length;
        this.connections = this.connections.filter(conn =>
            conn.source.nodeId !== nodeId && conn.target.nodeId !== nodeId
        );

        // 删除节点
        const node = this.nodes.get(nodeId);
        if (node) {
            node.remove();
            this.nodes.delete(nodeId);
            this.selectedNodes.delete(nodeId);
        }

        // 如果连接数发生变化，触发回调
        if (originalLength !== this.connections.length) {
            this.triggerCallback('onConnectionChange', { type: 'nodeDeleted', nodeId });
        }

        // 触发节点变化回调
        this.triggerCallback('onNodeChange', { type: 'delete', nodeId });

        // 连接数变化后重新应用接口初始化
        this.recomputeInterfaceInitRegisters();

        // 重新绘制
        this.drawAll();
    },

    deleteSelectedNodes() {
        if (this.selectedNodes.size === 0) return;

        // 删除所有选中节点及其连接
        const nodesToDelete = Array.from(this.selectedNodes);
        nodesToDelete.forEach(nodeId => {
            this.deleteNode(nodeId);
        });

        // 清空选择
        this.clearSelection();

        // 重新绘制
        this.drawAll();
    },

    clearAllConnections() {
        this.connections = [];
        this.busLocks = {}; // 重置总线实例锁定
        this.updateConnectionStatus("未连接", "#ff4444", "点击任意Pad开始连接");
        this.recomputeInterfaceInitRegisters();
        this.drawAll();

        // 触发连接变化回调
        this.triggerCallback('onConnectionChange', { type: 'clearAll' });
    },

    resetNodes() {
        let x = 100;
        let y = 100;

        for (const [nodeId, node] of this.nodes) {
            node.updatePosition(x, y);
            x += 200;
            if (x > 800) {
                x = 100;
                y += 150;
            }
            this.applyNodeTransform(node);
        }

        this.drawAll();

        // 触发节点变化回调
        this.triggerCallback('onNodeChange', { type: 'reset' });
    },

    addNewNode(config) {
        config = config || {
            name: `新节点${this.nodeIdCounter}`,
            top: ['输入'],
            right: ['输出'],
            bottom: [],
            left: []
        };

        const containerRect = this.container.getBoundingClientRect();
        const NODE_WIDTH = config.width || 140;
        const NODE_HEIGHT = config.height || 100;
        const maxX = containerRect.width - NODE_WIDTH;
        const maxY = containerRect.height - NODE_HEIGHT;

        const x = Math.max(50, Math.min(Math.random() * maxX, maxX - 50));
        const y = Math.max(50, Math.min(Math.random() * maxY, maxY - 50));

        const id = this.createNode(config, x, y);
        if (Math.random() < 0.5)
            nodeSystem.nodes.get(id).setPadDisabled('top', 0, true);
    },

    /**
     * 生成一个 IC 封装节点（SOP / LQFP / QFN）
     * @param {string} type   封装类型：'SOP' | 'LQFP' | 'QFN'
     * @param {number} perSide 每边引脚数
     * @param {number} [x] 放置坐标
     * @param {number} [y]
     * @returns {string} nodeId
     */
    addPackage(type, perSide, x, y) {
        const config = buildPackage(type, perSide);
        // 默认放置到画布中央附近
        const containerRect = this.container.getBoundingClientRect();
        if (x == null) x = Math.max(40, (containerRect.width - config.width) / 2 + (Math.random() * 80 - 40));
        if (y == null) y = Math.max(40, (containerRect.height - config.height) / 2 + (Math.random() * 80 - 40));
        return this.createNode(config, x, y);
    },

    /**
     * 生成一个预制设备节点（如 CIU32F003，含 PORT->AF0..AF7 复用表）
     * @param {string} deviceName  APP_CONFIG.devices 的键名
     * @returns {string|null} nodeId
     */
    addDevice(deviceName) {
        const config = buildDevice(deviceName);
        if (!config) {
            console.warn('未知预制设备:', deviceName);
            return null;
        }
        const containerRect = this.container.getBoundingClientRect();
        const x = Math.max(40, (containerRect.width - config.width) / 2 + (Math.random() * 140 - 70));
        const y = Math.max(40, (containerRect.height - config.height) / 2 + (Math.random() * 140 - 70));
        return this.createNode(config, x, y);
    },

    /**
     * 生成一个外设节点（如 Serial Flash SOP8，含总线类引脚）
     * @param {string} peripheralName  APP_CONFIG.peripherals 的键名
     * @returns {string|null} nodeId
     */
    addPeripheral(peripheralName) {
        const config = buildPeripheral(peripheralName);
        if (!config) {
            console.warn('未知外设:', peripheralName);
            return null;
        }
        const containerRect = this.container.getBoundingClientRect();
        const x = Math.max(40, (containerRect.width - config.width) / 2 + (Math.random() * 140 - 70));
        const y = Math.max(40, (containerRect.height - config.height) / 2 + (Math.random() * 140 - 70));
        return this.createNode(config, x, y);
    },

    /**
     * 生成一个「自定义器件」节点（来自文本框 / 收藏夹的器件定义）。
     * 建成外设风格（peripheral），其总线类引脚可高亮 MCU 对应 IO。
     * @param {Object} def  { name, pins: [{label,bus,signal}|{label,power}|{label}] }
     * @returns {string|null} nodeId
     */
    addCustomDevice(def) {
        const config = buildCustomDevice(def);
        const containerRect = this.container.getBoundingClientRect();
        const x = Math.max(40, (containerRect.width - config.width) / 2 + (Math.random() * 140 - 70));
        const y = Math.max(40, (containerRect.height - config.height) / 2 + (Math.random() * 140 - 70));
        const nodeId = this.createNode(config, x, y);
        // 预设输入引脚模式：声明 GPIO_IN / GPIO_INPU / GPIO_INPD 的引脚直接置为输入模式并带上/下拉，
        // 使“自定义器件 GPIO_IN 无法改变 IO 模式”的痛点从源头解决（无需等待连线）。
        const node = this.nodes.get(nodeId);
        if (node) {
            ['left', 'right', 'top', 'bottom'].forEach(side => {
                const len = (node.config && node.config[side] ? node.config[side].length : 0);
                for (let idx = 0; idx < len; idx++) {
                    const fns = (typeof node.getPadFunctions === 'function') ? node.getPadFunctions(side, idx) : [];
                    const inFn = fns.find(f => (typeof isGpioInput === 'function') ? isGpioInput(f) : false);
                    if (inFn) {
                        const pull = (typeof gpioInputPull === 'function') ? gpioInputPull(inFn) : 0;
                        node.setIoRegs(side, idx, { mode: 0, otype: 0, pupd: pull });
                    }
                }
            });
        }
        return nodeId;
    },

    /**
     * 生成一个「自定义 MCU 设备」的多个封装节点（参考 config 的 mcu.packages 结构）。
     * def.packages 为封装数组，每个含 { name, packageType, pins:[{label,port}] }，
     * 共享顶层 af / special / gpio。每个封装生成一个独立设备节点（错开摆放）。
     * @param {Object} def  { name, packages:[...], af, special, gpio }
     * @returns {string[]} 生成的节点 id 列表
     */
    addCustomDeviceSet(def) {
        const pkgs = (def && def.packages) || [];
        if (!pkgs.length) return [];
        const mcuName = def.name || '自定义设备';
        const shared = {
            af: def.af || null,
            special: def.special || null,
            gpio: def.gpio || null
        };
        const containerRect = this.container.getBoundingClientRect();
        const ids = [];
        const cols = Math.ceil(Math.sqrt(pkgs.length));
        pkgs.forEach((pkg, i) => {
            const single = {
                name: pkg.name || (pkgs.length === 1 ? mcuName : `${mcuName} (${pkg.packageType || 'PKG'})`),
                packageType: pkg.packageType || 'SOP',
                pins: pkg.pins || [],
                af: shared.af,
                special: shared.special,
                gpio: shared.gpio
            };
            const config = buildCustomDevice(single);
            const col = i % cols, row = Math.floor(i / cols);
            const x = Math.max(40, (containerRect.width - config.width) / 2 + col * 180 - (cols - 1) * 90 + (Math.random() * 40 - 20));
            const y = Math.max(40, (containerRect.height - config.height) / 2 + row * 220 - (Math.ceil(pkgs.length / cols) - 1) * 110 + (Math.random() * 40 - 20));
            const nodeId = this.createNode(config, x, y);
            const node = this.nodes.get(nodeId);
            if (node) {
                ['left', 'right', 'top', 'bottom'].forEach(side => {
                    const len = (node.config && node.config[side] ? node.config[side].length : 0);
                    for (let idx = 0; idx < len; idx++) {
                        const fns = (typeof node.getPadFunctions === 'function') ? node.getPadFunctions(side, idx) : [];
                        const inFn = fns.find(f => (typeof isGpioInput === 'function') ? isGpioInput(f) : false);
                        if (inFn) {
                            const pull = (typeof gpioInputPull === 'function') ? gpioInputPull(inFn) : 0;
                            node.setIoRegs(side, idx, { mode: 0, otype: 0, pupd: pull });
                        }
                    }
                });
            }
            ids.push(nodeId);
        });
        return ids;
    },

    toggleDeleteButtons(hide) {
        if (hide) {
            this.container.classList.add('hide-delete-btn');
        } else {
            this.container.classList.remove('hide-delete-btn');
        }
    },

    // 保存为JSON
    saveAsJSON() {
        const data = {
            nodes: [],
            connections: [...this.connections],
            nodeIdCounter: this.nodeIdCounter,
            lineConfig: { ...this.lineConfig },
            zoomLevel: this.zoomLevel,
            panOffset: { ...this.panOffset },
            // 保存当前画布的调试程序（ide.js 全局对象 __ideFiles）。无程序则留空数组。
            ide: (typeof window.Ide !== 'undefined' && window.Ide && typeof window.Ide.getFiles === 'function')
                ? window.Ide.getFiles() : [],
            // 保存全部面板（全局 + 会话），每个带 global 标志；加载时按标志落回对应存储
            panels: (typeof PanelWorkbench !== 'undefined' && PanelWorkbench.exportCanvasPanels)
                ? PanelWorkbench.exportCanvasPanels() : []
        };

        // 序列化所有节点
        this.nodes.forEach(node => {
            data.nodes.push(node.serialize());
        });

        // 创建下载链接
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'node-system.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // 从JSON加载
    loadFromJSON(jsonData) {
        try {
            // 清空现有内容
            this.clearAll();

            // 恢复节点ID计数器
            this.nodeIdCounter = jsonData.nodeIdCounter || 1;

            // 恢复线条配置
            if (jsonData.lineConfig) {
                this.lineConfig = { ...jsonData.lineConfig };
                // 更新UI控件
                const lineColorInput = document.getElementById('lineColor');
                const lineWidthInput = document.getElementById('lineWidth');
                if (lineColorInput) lineColorInput.value = this.lineConfig.color;
                if (lineWidthInput) lineWidthInput.value = this.lineConfig.width;
            }

            // 恢复缩放和平移
            if (jsonData.zoomLevel !== undefined) {
                this.zoomLevel = jsonData.zoomLevel;
            }
            if (jsonData.panOffset) {
                this.panOffset = { ...jsonData.panOffset };
            }

            // 创建节点
            jsonData.nodes.forEach(nodeData => {
                const node = Node.deserialize(nodeData, this);
                this.nodes.set(node.nodeId, node);
                this.container.appendChild(node.element);

                // 应用变换
                this.applyNodeTransform(node);

                // 绑定节点全部交互事件（拖动 / 删除 / Pad / 自定义器件右键菜单 / MCU 寄存器编辑）
                this.bindNodeEvents(node, node.nodeId);
            });

            // 恢复连接
            this.connections = [...jsonData.connections];
            // 恢复连接后重新应用接口初始化
            this.loadInterfaceInits();
            this.recomputeInterfaceInitRegisters();

            // 恢复画布的调试程序（ide.js 全局对象 __ideFiles）。无程序则留空。
            if (jsonData.ide !== undefined && typeof window.Ide !== 'undefined' && window.Ide && typeof window.Ide.setFiles === 'function') {
                window.Ide.setFiles(jsonData.ide || []);
            }

            // 恢复面板（按 global 标志分别写回 localStorage / 会话内存）
            if (jsonData.panels !== undefined && typeof PanelWorkbench !== 'undefined' && typeof PanelWorkbench.importCanvasPanels === 'function') {
                PanelWorkbench.importCanvasPanels(jsonData.panels || []);
            }

            // 应用变换
            this.applyTransform();

            // 重新绘制
            this.drawAll();
            this.updateZoomLevelDisplay();

            console.log('成功加载JSON数据');
        } catch (error) {
            console.error('加载JSON数据失败:', error);
            alert('加载JSON数据失败，请检查文件格式');
        }
    },

    // 清空所有内容
    clearAll() {
        // 删除所有节点
        this.nodes.forEach((node, nodeId) => {
            node.remove();
        });

        // 清空数据结构
        this.nodes.clear();
        this.connections = [];
        this.nodeIdCounter = 1;
        this.clearSelection();
        this.zoomLevel = 1;
        this.panOffset = { x: 0, y: 0 };
        this.busLocks = {}; // 重置总线实例锁定

        // 重新绘制
        this.drawAll();
        this.updateZoomLevelDisplay();
    },

    setupEventListeners() {
        // 全局鼠标事件
        document.addEventListener('mousemove', (e) => this.mouseMove(e));
        document.addEventListener('mouseup', (e) => this.mouseUp(e));

        // Delete / Backspace 键：删除选中的节点（输入框聚焦时不触发，避免误删正在输入的内容）
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (this.selectedNodes.size === 0) return;
            e.preventDefault();
            this.deleteSelectedNodes();
        });

        // 容器鼠标事件
        this.container.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // 左键
                if (e.target === this.container) {
                    this.clearSelection();
                    this.startSelection(e);
                }
            } else if (e.button === 2) { // 右键：仅在空白处平移画布（Pad 上由 openAF 处理）
                if (e.target === this.container) {
                    this.startPanning(e);
                }
            }
        });

        // 阻止右键菜单（Pad 上的菜单由 openAF 处理，也会阻止默认）
        this.container.addEventListener('contextmenu', (e) => {
            // 仅当点击在空白处（container 自身）时阻止；Pad 的菜单已在 openAF 中处理
            if (e.target === this.container) {
                e.preventDefault();
            }
        });

        // 滚轮缩放
        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const containerRect = this.container.getBoundingClientRect();
            const mouseX = e.clientX - containerRect.left;
            const mouseY = e.clientY - containerRect.top;

            // 设置缩放原点为鼠标位置
            this.origin.x = mouseX;
            this.origin.y = mouseY;

            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });

        // 添加触摸事件支持
        this.container.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('node-port')) {
                const touch = e.touches[0];
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                this.startConnection(mouseEvent, e.target);
            } else if (e.target.classList.contains('node')) {
                const touch = e.touches[0];
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                this.startNodeDrag(mouseEvent);
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.mouseMove(mouseEvent);
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            const mouseEvent = new MouseEvent('mouseup');
            this.mouseUp(mouseEvent);
        });
    },

    // 更新连接状态显示
    updateConnectionStatus(status, color, info) {
        const statusElement = this.container.querySelector('#connectionStatus');
        const infoElement = this.container.querySelector('#connectionInfo');

        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.color = color;
        }

        if (infoElement) {
            infoElement.textContent = info;
        }
    },

    // 更新连接计数显示
    updateConnectionCount(count) {
        const countElement = this.container.querySelector('#connectionCount');
        if (countElement) {
            countElement.textContent = `连接数: ${count}`;
        }
    },

    // 更新状态信息显示
    updateStatusInfo(text) {
        const statusInfo = document.getElementById('statusInfo');
        if (statusInfo) {
            statusInfo.textContent = text;
        }

        // 触发状态变化回调
        this.triggerCallback('onStatusChange', { text });
    },

    // 更新线条配置
    updateLineConfig(color, width) {
        if (color !== undefined) {
            this.lineConfig.color = color;
        }
        if (width !== undefined) {
            this.lineConfig.width = width;
        }
        this.drawAll();
    },

    // 缩放功能
    zoom(delta) {
        const newZoom = this.zoomLevel + delta;
        if (newZoom >= this.minZoom && newZoom <= this.maxZoom) {
            // 计算缩放中心点相对于容器的位置
            const containerRect = this.container.getBoundingClientRect();
            const centerX = this.origin.x;
            const centerY = this.origin.y;

            // 计算缩放前后的比例
            const scaleRatio = newZoom / this.zoomLevel;

            // 调整平移偏移量以保持缩放中心点不变
            this.panOffset.x = centerX - (centerX - this.panOffset.x) * scaleRatio;
            this.panOffset.y = centerY - (centerY - this.panOffset.y) * scaleRatio;

            this.zoomLevel = newZoom;
            this.applyTransform();
            this.drawAll();
            this.updateZoomLevelDisplay();
        }
    },

    // 应用变换到所有节点
    applyTransform() {
        this.nodes.forEach(node => {
            this.applyNodeTransform(node);
        });
    },

    // 应用变换到单个节点
    applyNodeTransform(node) {
        if (node.element) {
            const scaledX = node.position.x * this.zoomLevel + this.panOffset.x;
            const scaledY = node.position.y * this.zoomLevel + this.panOffset.y;
            node.element.style.left = `${scaledX}px`;
            node.element.style.top = `${scaledY}px`;
            node.element.style.transform = `scale(${this.zoomLevel})`;
        }
    },

    // 更新缩放级别显示
    updateZoomLevelDisplay() {
        const zoomLevelElement = document.getElementById('zoomLevel');
        if (zoomLevelElement) {
            zoomLevelElement.textContent = `${Math.round(this.zoomLevel * 100)}%`;
        }
    },

    // 重置缩放
    resetZoom() {
        this.zoomLevel = 1;
        this.panOffset = { x: 0, y: 0 };
        this.applyTransform();
        this.drawAll();
        this.updateZoomLevelDisplay();
    }
};
