/**
 * Node - 画布上的节点 / IC 封装
 *
 * 每个节点有四个方向的 Pad（上 top / 右 right / 下 bottom / 左 left）。
 * 当 config.chip === true 时，节点被视为一个 IC 封装：
 *   - body 渲染为芯片本体（矩形）
 *   - 四边的 Pad 渲染为长方形引脚（pin）
 *   - 支持 AF（Alternate Function / IO 复用功能）赋值
 */
class Node {
    constructor(config, x, y, nodeId, system) {
        this.config = config;
        this.position = { x, y };
        this.originalPosition = { x, y }; // 保存原始坐标用于缩放计算
        this.nodeId = nodeId;
        this.system = system;
        this.element = null;
        this.pads = new Map(); // 存储pad元素  key: `${side}-${index}`
        this.disabledPads = new Set(); // 存储禁用的pad
        this.rotation = 0; // 旋转角度（度），R 键 90° 步进，便于布局；连接端点随节点一起旋转

        // 封装相关状态
        this.isChip = !!config.chip;
        this.af = new Map(); // key: `${side}-${index}` -> 功能对象 {id,label,group,afIndex}
        this.ioRegs = new Map(); // key: `${side}-${index}` -> { mode, otype, pupd, afl }  GPIO 寄存器配置（afl 为 AFL 复用功能选择，null=未分配）

        this.NODE_WIDTH = config.width || 140;
        this.NODE_HEIGHT = config.height || 100;

        this.nodeColors = [
            "linear-gradient(135deg, rgba(255, 119, 198, 0.8), rgba(120, 119, 198, 0.8))",
            "linear-gradient(135deg, rgba(0, 219, 222, 0.8), rgba(0, 184, 217, 0.8))",
            "linear-gradient(135deg, rgba(255, 184, 0, 0.8), rgba(255, 119, 0, 0.8))",
            "linear-gradient(135deg, rgba(100, 255, 100, 0.8), rgba(0, 200, 100, 0.8))",
            "linear-gradient(135deg, rgba(184, 119, 255, 0.8), rgba(119, 119, 255, 0.8))",
            "linear-gradient(135deg, rgba(255, 119, 119, 0.8), rgba(255, 184, 119, 0.8))"
        ];

        this.createNodeElement();
    }

    createNodeElement() {
        this.element = document.createElement('div');
        this.element.className = 'node' + (this.isChip ? ' chip' : '') + (this.config.flat ? ' flat' : '');
        this.element.id = this.nodeId;
        // 超级扁平小封装（SOP2 等 2pin 转换器）也在体内显示名称（小字体，CSS 控制不溢出）；
        // 名称同时作为悬浮提示。
        this.element.innerHTML = this.config.name;
        this.element.title = this.config.title || this.config.name;

        // 设置颜色
        const colorIndex = parseInt(this.nodeId.replace('node', '')) % this.nodeColors.length;
        this.element.style.background = this.isChip
            ? (this.config.chipColor || '#2b3245')
            : this.nodeColors[colorIndex];
        this.element.style.width = this.NODE_WIDTH + 'px';
        this.element.style.height = this.NODE_HEIGHT + 'px';

        // 芯片本体额外样式
        if (this.isChip) {
            this.element.style.borderRadius = '6px';
            this.element.style.border = '2px solid #4b5670';
            this.element.style.fontSize = '13px';
            this.element.style.fontWeight = '600';
        }

        // 设置位置
        this.element.style.left = `${this.position.x}px`;
        this.element.style.top = `${this.position.y}px`;

        // 创建删除按钮
        const deleteButton = document.createElement('div');
        deleteButton.className = 'delete-node';
        deleteButton.innerHTML = '×';
        deleteButton.dataset.node = this.nodeId;
        this.element.appendChild(deleteButton);

        // 创建Pad
        this.createPads();

        return this.element;
    }

    createPads() {
        const sides = ['top', 'right', 'bottom', 'left'];
        sides.forEach(side => {
            const list = this.config[side];
            if (list && list.length > 0) {
                for (let i = 0; i < list.length; i++) {
                    const pad = this.createPadElement(side, i, list[i]);
                    this.element.appendChild(pad);
                    this.pads.set(`${side}-${i}`, pad);
                }
            }
        });
    }

    createPadElement(side, index, label) {
        const pad = document.createElement('div');
        pad.className = `node-port port-${side}` + (this.isChip ? ' pin' : '');
        pad.dataset.port = side;
        pad.dataset.node = this.nodeId;
        pad.dataset.index = index;

        // 引脚 entry 支持三种形式：
        //   - 数字（普通芯片物理引脚号）
        //   - 对象 {label, port, pin}（预制设备引脚，port=null 为电源）
        //   - 对象 {label, bus, signal, pin}（外设总线类引脚）
        //   - 对象 {label, power:true, pin}（外设电源引脚）
        let labelText, portName = null, pinNum = null, isPower = false, busName = null, signalName = null;
        if (label && typeof label === 'object') {
            labelText = label.label;
            portName = label.port || null;
            pinNum = label.pin != null ? label.pin : null;
            busName = label.bus || null;
            signalName = label.signal || null;
            // 电源脚：显式 power:true；或 MCU 设备引脚 port=null 且无总线（VDD/VSS 等）。
            // 外设的普通配置脚 / 转接板 IO 脚（无 bus、无 power）不应被误判为电源。
            isPower = !!label.power;
            if (!isPower && this.isChip && this.config.device && portName === null && !busName) {
                isPower = true;
            }
        } else {
            labelText = label;
            if (this.isChip && typeof label === 'number') pinNum = label;
        }

        pad.dataset.portName = portName || '';
        pad.dataset.bus = busName || '';
        pad.dataset.signal = signalName || '';
        if (pinNum != null) pad.dataset.pin = pinNum;
        pad.dataset.baseLabel = labelText;
        if (isPower) pad.classList.add('pin-power');
        // 总线类引脚特殊标记（外设 SPI 信号脚：CS/MISO/MOSI/CLK…）
        if (busName) pad.classList.add('pin-bus');
        // 预制设备引脚若在其 AF 表中存在总线复用功能，则标记为“可复用总线”脚
        if (portName && this.config && this.config.device && this.config.device.af) {
            const afArr = this.config.device.af[portName];
            if (Array.isArray(afArr) && afArr.some(fn => {
                if (!fn || fn === '-') return false;
                const info = (typeof parseFunctionId === 'function') ? parseFunctionId(fn) : null;
                return !!(info && info.bus);
            })) {
                pad.classList.add('pin-buscap');
            }
        }

        pad.title = labelText;
        pad.innerHTML = '<span class="pin-label">' + labelText + '</span>';
        this._fitPinFont(pad, labelText);

        // 均匀分布
        const padCount = this.config[side].length;
        if (padCount === 1) {
            if (side === 'top' || side === 'bottom') {
                pad.style.left = '50%';
                pad.style.transform = 'translateX(-50%)';
            } else {
                pad.style.top = '50%';
                pad.style.transform = 'translateY(-50%)';
            }
        } else {
            const spacing = 100 / (padCount + 1);
            if (side === 'top' || side === 'bottom') {
                pad.style.left = `${spacing * (index + 1)}%`;
                pad.style.transform = 'translateX(-50%)';
            } else {
                pad.style.top = `${spacing * (index + 1)}%`;
                pad.style.transform = 'translateY(-50%)';
            }
        }

        return pad;
    }

    // 返回某侧端口在"当前旋转"下的实际屏幕朝向（top/right/bottom/left）。
    // 用于连线控制点方向计算，确保整体旋转后连线仍从引脚正确的外侧引出。
    getEffectivePortDir(side) {
        const order = ['top', 'right', 'bottom', 'left'];
        const idx = order.indexOf(side);
        if (idx < 0) return side;
        const steps = Math.round(((this.rotation || 0) % 360) / 90);
        return order[(idx + ((steps % 4) + 4) % 4) % 4];
    }

    getPortPosition(side, index) {
        if (!this.element) return null;

        const containerRect = this.system.container.getBoundingClientRect();

        // 获取该节点该侧的pad
        const padKey = `${side}-${index}`;
        const pad = this.pads.get(padKey);

        if (!pad) return null;

        const padRect = pad.getBoundingClientRect();

        // 连接点 = pad 中心 + 沿「该侧实际朝向（已按旋转映射）」外推半个引脚半径。
        // 用旋转映射后的方向向量，而非 pad 矩形边缘：旋转后矩形边缘是斜的，
        // 取边缘会偏到斜向；取中心+方向外推，端点始终落在 pad 朝外侧的正中、方向正确。
        const padCx = padRect.left + padRect.width / 2 - containerRect.left;
        const padCy = padRect.top + padRect.height / 2 - containerRect.top;

        // 该侧在旋转后的实际屏幕朝向 -> 单位方向向量（指向节点外侧）
        const effDir = this.getEffectivePortDir(side);
        let ux = 0, uy = 0;
        if (effDir === 'top') { ux = 0; uy = -1; }
        else if (effDir === 'bottom') { ux = 0; uy = 1; }
        else if (effDir === 'left') { ux = -1; uy = 0; }
        else { ux = 1; uy = 0; } // right

        // 半个引脚（pad）外伸半径：取 pad 在对应轴向上的半长（旋转后用外接半宽近似）
        const r = Math.max(padRect.width, padRect.height) / 2;

        return { x: padCx + ux * r, y: padCy + uy * r };
    }

    // 获取所有连接到此节点的连接
    getConnections() {
        return this.system.connections.filter(conn =>
            conn.source.nodeId === this.nodeId || conn.target.nodeId === this.nodeId
        );
    }

    // 删除节点
    remove() {
        if (this.element) {
            this.element.remove();
        }
    }

    // 更新位置
    updatePosition(x, y) {
        this.position.x = x;
        this.position.y = y;
        this.originalPosition.x = x;
        this.originalPosition.y = y;
        if (this.element) {
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
        }
    }

    // 设置旋转角度（度），R 键用于 90° 步进旋转器件，方便布局
    setRotation(deg) {
        this.rotation = ((deg % 360) + 360) % 360;
        if (this.system) this.system.applyNodeTransform(this);
    }

    // 更新节点文本
    updateText(newText) {
        if (this.element) {
            this.element.innerHTML = newText;
            // 重新添加删除按钮
            const deleteButton = document.createElement('div');
            deleteButton.className = 'delete-node';
            deleteButton.innerHTML = '×';
            deleteButton.dataset.node = this.nodeId;
            this.element.appendChild(deleteButton);

            // 重新绑定删除按钮事件
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.system.deleteNode(this.nodeId);
            });
        }
    }

    // 更新Pad文本
    updatePadText(side, index, newText) {
        const padKey = `${side}-${index}`;
        const pad = this.pads.get(padKey);
        if (pad) {
            pad.innerHTML = newText;
            pad.title = newText;
        }
    }

    // 禁用/启用Pad的方法
    setPadDisabled(side, index, disabled) {
        const padKey = `${side}-${index}`;
        const pad = this.pads.get(padKey);

        if (pad) {
            if (disabled) {
                pad.classList.add('disabled');
                this.disabledPads.add(padKey);
            } else {
                pad.classList.remove('disabled');
                this.disabledPads.delete(padKey);
            }
        }
    }

    // 检查Pad是否被禁用
    isPadDisabled(side, index) {
        const padKey = `${side}-${index}`;
        return this.disabledPads.has(padKey);
    }

    // 设置选中状态
    setSelected(selected) {
        if (selected) {
            this.element.classList.add('selected');
        } else {
            this.element.classList.remove('selected');
        }
    }

    // ==================== AF（Alternate Function / IO 复用） ====================

    // 返回 Pad 的引脚号（芯片模式下为 config 中的标签；预制设备为 entry.pin）
    getPinNumber(side, index) {
        if (this.isChip) {
            const entry = this.config[side] && this.config[side][index];
            if (entry == null) return undefined;
            if (typeof entry === 'object') return entry.pin != null ? entry.pin : undefined;
            return entry; // 普通芯片：数字即物理引脚号
        }
        return undefined;
    }

    // 返回 Pad 的 PORT 名（仅预制设备引脚有，如 "PA0"；否则 null）
    getPortName(side, index) {
        if (this.isChip && this.config.device) {
            const entry = this.config[side] && this.config[side][index];
            if (entry && typeof entry === 'object') return entry.port || null;
        }
        return null;
    }

    // 返回 Pad 的总线类型（外设总线脚为 "SPI" 等；否则 null）
    getPadBus(side, index) {
        const entry = this.config[side] && this.config[side][index];
        if (entry && typeof entry === 'object') return entry.bus || null;
        return null;
    }

    // 返回 Pad 的总线信号名（外设总线脚为 "MOSI" 等；否则 null）
    getPadSignal(side, index) {
        const entry = this.config[side] && this.config[side][index];
        if (entry && typeof entry === 'object') return entry.signal || null;
        return null;
    }

    // 返回 Pad 的“附加功能”列表（自定义器件通过文本框“引脚名 空格 功能”声明；
    // 用于与外设（如模拟输入/ GPIO 输出）连线时高亮匹配）。无则返回空数组。
    getPadFunctions(side, index) {
        const entry = this.config[side] && this.config[side][index];
        if (entry && typeof entry === 'object' && Array.isArray(entry.functions)) {
            return entry.functions.map(f => String(f).toUpperCase());
        }
        return [];
    }

    // 返回 Pad 的“特殊功能”列表（MCU 通过 device.special[port]；自定义器件通过 entry.functions）。
    // 特殊功能是非 AF 表的固有能力（ADC_INx / GPIO_OUT / NRST / EXTCLK 等），
    // 供“需要特殊功能引脚时高亮 MCU 对应 IO”使用。无则返回空数组。
    getSpecialFunctions(side, index) {
        if (this.config && this.config.device && this.config.device.special) {
            const port = this.getPortName(side, index);
            if (port) return (this.config.device.special[port] || []).map(f => String(f).toUpperCase());
        }
        const entry = this.config[side] && this.config[side][index];
        if (entry && typeof entry === 'object' && Array.isArray(entry.functions)) {
            return entry.functions.map(f => String(f).toUpperCase());
        }
        return [];
    }

    // 设置某个 Pad 的 AF 功能
    setAF(side, index, func) {
        const key = `${side}-${index}`;
        if (func) {
            this.af.set(key, func);
        } else {
            this.af.delete(key);
        }
        this.refreshPad(side, index);
    }

    // 获取某个 Pad 的 AF 功能
    getAF(side, index) {
        return this.af.get(`${side}-${index}`) || null;
    }

    // 清除某个 Pad 的 AF 功能
    clearAF(side, index) {
        this.setAF(side, index, null);
    }

    // ==================== GPIO 寄存器配置（per-pin） ====================
    // mode : 0=输入 1=输出 2=复用功能 3=模拟
    // otype: 0=推挽 1=开漏
    // pupd : 0=无 1=上拉 2=下拉 3=保留

    /** 写入某 Pad 的 GPIO 寄存器配置（增量合并） */
    setIoRegs(side, index, regs) {
        const key = `${side}-${index}`;
        const cur = this.ioRegs.get(key) || { mode: 0, otype: 0, pupd: 0, afl: null };
        const next = Object.assign({}, cur, regs);
        this.ioRegs.set(key, next);
        this.refreshPad(side, index);
    }

    /** 读取某 Pad 的 GPIO 寄存器配置（带默认） */
    getIoRegs(side, index) {
        const key = `${side}-${index}`;
        return Object.assign({ mode: 0, otype: 0, pupd: 0, afl: null }, this.ioRegs.get(key) || {});
    }

    /**
     * 聚合某 GPIO 端口（x = A~F）四个寄存器的当前 32 位值（来自各引脚 ioRegs）。
     * 位域：MODE/PUPD 2bit/pin @[2y+1:2y]；OTYPE 1bit/pin @[y]；
     *       AFL 4bit/pin @[4y+3:4y]（pin 0~7，低 8 个 IO）；
     *       AFH 4bit/pin @[4(y-8)+3:4(y-8)]（pin 8~15，高 8 个 IO）。
     * 仅遍历该端口实际存在的引脚（config 中 entry.port 形如 "PA0"），未配置引脚贡献 0。
     * 返回 { MODE, OTYPE, PUPD, AFL, AFH }（兼容旧调用：仍以 AFL 表示低 8 位，新增 AFH 高 8 位）。
     */
    getPortRegisterValues(portLetter) {
        const L = (portLetter || '').toUpperCase();
        const val = { MODE: 0, OTYPE: 0, PUPD: 0, AFL: 0, AFH: 0 };
        if (!this.config || !this.config.device) return val;
        for (const s of ['top', 'right', 'bottom', 'left']) {
            const list = this.config[s] || [];
            list.forEach((entry, i) => {
                if (!entry || typeof entry !== 'object' || !entry.port) return;
                const pl = (entry.port.replace(/[^A-F]/gi, '') || '').toUpperCase();
                if (pl !== L) return;
                const y = parseInt(entry.port.replace(/\D/g, ''), 10);
                if (isNaN(y) || y < 0 || y > 15) return;
                const regs = this.getIoRegs(s, i);
                val.MODE  |= ((regs.mode & 0x3) << (y * 2));
                val.OTYPE |= ((regs.otype & 0x1) << y);
                val.PUPD  |= ((regs.pupd & 0x3) << (y * 2));
                const afl = (regs.afl == null) ? 0 : (regs.afl & 0xF);
                if (y < 8) val.AFL |= (afl << (y * 4));
                else       val.AFH |= (afl << ((y - 8) * 4));
            });
        }
        return val;
    }

    /**
     * 聚合某 GPIO 端口（x = A~C）四个寄存器的“复位聚合值”。
     * 与 getPortRegisterValues 遍历完全相同的引脚集合（仅封装实际引出的脚），
     * 从复位值中取出对应 bit 聚合得到；未引出的脚在两边均为 0。
     * 用途：dump 比较时用它作为“复位基准”，使放置瞬间 current==复位（无假差异，符合“一样不输出”）。
     */
    getPortResetValues(portLetter) {
        const L = (portLetter || '').toUpperCase();
        const val = { MODE: 0, OTYPE: 0, PUPD: 0, AFL: 0, AFH: 0 };
        const dev = this.config && this.config.device;
        if (!dev || !dev.gpio || !dev.gpio.reset) return val;
        const reset = dev.gpio.reset;
        const hxv = (v) => (v == null ? 0 : (typeof v === 'string' ? parseInt(v, 16) : v) >>> 0);
        for (const s of ['top', 'right', 'bottom', 'left']) {
            const list = this.config[s] || [];
            list.forEach((entry, i) => {
                if (!entry || typeof entry !== 'object' || !entry.port) return;
                const pl = (entry.port.replace(/[^A-F]/gi, '') || '').toUpperCase();
                if (pl !== L) return;
                const y = parseInt(entry.port.replace(/\D/g, ''), 10);
                if (isNaN(y) || y < 0 || y > 15) return;
                const rMode  = (reset.MODE  && reset.MODE[L]  != null) ? hxv(reset.MODE[L])  : 0;
                const rPupd  = (reset.PUPD  && reset.PUPD[L]  != null) ? hxv(reset.PUPD[L])  : 0;
                const rOtype = (reset.OTYPE && reset.OTYPE[L] != null) ? hxv(reset.OTYPE[L]) : 0;
                const rAfl   = (reset.AFL   && reset.AFL[L]   != null) ? hxv(reset.AFL[L])   : 0;
                const rAfh   = (reset.AFH   && reset.AFH[L]   != null) ? hxv(reset.AFH[L])   : 0;
                val.MODE  |= (((rMode  >> (y * 2)) & 0x3) << (y * 2));
                val.OTYPE |= (((rOtype >> y) & 0x1) << y);
                val.PUPD  |= (((rPupd  >> (y * 2)) & 0x3) << (y * 2));
                if (y < 8) val.AFL |= (((rAfl >> (y * 4)) & 0xF) << (y * 4));
                else       val.AFH |= (((rAfh >> ((y - 8) * 4)) & 0xF) << ((y - 8) * 4));
            });
        }
        return val;
    }

    /**
     * 计算某 Pad 的 GPIO 寄存器“复位值”（来自预制设备的 device.gpio.reset 表）。
     * 位域解析与 initRegistersFromReset / getPortRegisterValues 完全一致。
     * 无复位表（外设节点 / 非预制芯片）或引脚无 port 时返回全 0 默认值。
     * @returns {{mode:number, otype:number, pupd:number, afl:number}}
     */
    getPinResetRegs(side, index) {
        const def = { mode: 0, otype: 0, pupd: 0, afl: 0 };
        const dev = this.config && this.config.device;
        if (!dev || !dev.gpio || !dev.gpio.reset) return def;
        const entry = this.config[side] && this.config[side][index];
        if (!entry || typeof entry !== 'object' || !entry.port) return def;
        const L = (entry.port.replace(/[^A-F]/gi, '') || '').toUpperCase();
        const y = parseInt(entry.port.replace(/\D/g, ''), 10);
        if (isNaN(y) || y < 0 || y > 15) return def;
        const reset = dev.gpio.reset;
        const hxv = (v) => (v == null ? 0 : (typeof v === 'string' ? parseInt(v, 16) : v) >>> 0);
        const rMode  = (reset.MODE  && reset.MODE[L]  != null) ? hxv(reset.MODE[L])  : 0;
        const rPupd  = (reset.PUPD  && reset.PUPD[L]  != null) ? hxv(reset.PUPD[L])  : 0;
        const rOtype = (reset.OTYPE && reset.OTYPE[L] != null) ? hxv(reset.OTYPE[L]) : 0;
        if (y < 8) {
            const rAfl = (reset.AFL && reset.AFL[L] != null) ? hxv(reset.AFL[L]) : 0;
            def.afl = (rAfl >> (y * 4)) & 0xF;
        } else {
            const rAfh = (reset.AFH && reset.AFH[L] != null) ? hxv(reset.AFH[L]) : 0;
            def.afl = (rAfh >> ((y - 8) * 4)) & 0xF;
        }
        return {
            mode:  (rMode  >> (y * 2)) & 0x3,
            pupd:  (rPupd  >> (y * 2)) & 0x3,
            otype: (rOtype >> y) & 0x1,
            afl:   def.afl
        };
    }

    /**
     * 将某 Pad 的 GPIO 寄存器配置复位到芯片复位值（替代“清除功能”时直接清零）。
     * 复位 AFL 对应真实功能时一并将 AF 标签恢复为该复位功能，否则清除手动分配。
     */
    resetIoRegs(side, index) {
        const r = this.getPinResetRegs(side, index);
        this.setIoRegs(side, index, r);
        const dev = this.config && this.config.device;
        const entry = this.config[side] && this.config[side][index];
        const portName = (entry && typeof entry === 'object') ? (entry.port || null) : null;
        if (portName && dev && dev.af && dev.af[portName]) {
            const t = dev.af[portName];
            const afl = r.afl & 0xF;
            const fn = (afl !== 0 && t[afl] && t[afl] !== '-')
                ? { id: t[afl], label: t[afl], group: `AF${afl}`, afIndex: afl }
                : null;
            this.setAF(side, index, fn);
        } else {
            this.clearAF(side, index);
        }
    }

    /**
     * 用端口复位值初始化各引脚的 GPIO 寄存器配置（寄存器 → 右键菜单配置 的方向）。
     * 仅对带 reset 表的预制 MCU 设备生效；外设节点（无 device.gpio.reset）不受影响。
     * 调用时机：createNode 放置设备时，使右键菜单初始即呈现芯片复位态；
     * 由于初始化后 current==reset，寄存器变动值 dump 在放置瞬间为空（与“一样不输出”一致）。
     * 注意：本方法只写 ioRegs（寄存器配置），不调用 setAF（避免改变引脚可视标签），
     * AFL 选择由 af-menu 直接读 ioRegs.afl 反映。
     */
    initRegistersFromReset() {
        const dev = this.config && this.config.device;
        if (!dev || !dev.gpio || !dev.gpio.reset) return;
        for (const s of ['top', 'right', 'bottom', 'left']) {
            const list = this.config[s] || [];
            list.forEach((entry, i) => {
                if (!entry || typeof entry !== 'object' || !entry.port) return;
                this.setIoRegs(s, i, this.getPinResetRegs(s, i));
            });
        }
        // 复位值写入后立即按模式重着色（确保启动时引脚颜色即反映复位模式）
        this.refreshAllPads();
    }

    // 引脚字号随名称长度缩放（暗色风格观感）：长名自动缩小避免溢出
    _fitPinFont(pad, text) {
        if (!this.isChip || !pad) return;
        const len = (text || '').length;
        let fs = 11;
        if (len >= 9) fs = 7;
        else if (len >= 7) fs = 8;
        else if (len >= 5) fs = 9;
        else fs = 11;
        pad.style.fontSize = fs + 'px';
    }

    // 刷新 Pad 显示（根据 AF 状态）
    refreshPad(side, index) {
        const key = `${side}-${index}`;
        const pad = this.pads.get(key);
        if (!pad) return;

        const func = this.af.get(key);
        const pinNum = this.getPinNumber(side, index);
        const portName = this.getPortName(side, index);

        if (func) {
            const label = func.label || func.id;
            pad.innerHTML = '<span class="pin-label">' + label + '</span>';
            const extra = func.group ? ` [${func.group}]` : '';
            const pinTxt = pinNum != null ? `Pin ${pinNum}` : '';
            const portTxt = portName ? ` · ${portName}` : '';
            pad.title = `${pinTxt}${portTxt} · ${label}${extra}`;
            pad.classList.add('pin-assigned');
            this._fitPinFont(pad, label);
        } else {
            const base = pad.dataset.baseLabel || (pinNum != null ? pinNum : '');
            pad.innerHTML = '<span class="pin-label">' + base + '</span>';
            const pinTxt = pinNum != null ? `Pin ${pinNum}` : '';
            const portTxt = portName ? ` · ${portName}` : '';
            pad.title = `${pinTxt}${portTxt}` || base;
            pad.classList.remove('pin-assigned');
            this._fitPinFont(pad, base);
        }
        // 按 GPIO 模式 / AF 选中着色（MCN 芯片引脚）
        this._applyPinColor(pad, side, index);
    }

    // 刷新全部 Pad 显示（用于初始化/批量状态变更后重着色）
    refreshAllPads() {
        for (const [key, pad] of this.pads) {
            const [s, i] = key.split('-');
            this.refreshPad(s, parseInt(i, 10));
        }
    }

    /**
     * MCU 引脚按 GPIO 模式（及 AF 选中）着色，暗色系，一眼区分：
     *   0 输入  → 暗蓝     1 输出 → 暗绿
     *   2 复用  → 暗紫     3 模拟 → 暗琥珀
     * 若已分配 AF（复用功能选定）→ 亮琥珀色 + 深色字，醒目突出。
     * 电源脚（pin-power）与外围设备脚不在此着色（保持各自原色）。
     */
    _applyPinColor(pad, side, index) {
        if (!pad) return;

        // 电源脚：外设电源脚给稳定橙底；MCU 电源脚沿用既有 CSS 橙，不改
        if (pad.classList.contains('pin-power')) {
            if (this.isChip) return;
            pad.style.backgroundColor = '#b45309';
            pad.style.color = '#fde68a';
            pad.style.textShadow = 'none';
            pad.style.borderColor = '#7c2d12';
            return;
        }

        // —— MCU 芯片引脚：按 GPIO 模式 / AF 选中着色（暗色系）——
        if (this.isChip) {
            const func = this.af.get(`${side}-${index}`);
            if (func) {
                // AF 已选 → 亮琥珀底色 + 亮色字（带阴影，保证长功能名在亮底上清晰可读）
                pad.style.backgroundColor = '#f59e0b';   // 亮琥珀
                pad.style.color = '#fff7ed';
                pad.style.textShadow = '0 1px 2px rgba(0,0,0,0.55)';
                pad.style.borderColor = '#fbbf24';
                return;
            }
            const mode = this.getIoRegs(side, index).mode & 0x3;
            const palette = {
                0: '#1e4d6b', // 输入：暗蓝
                1: '#1f6b3a', // 输出：暗绿
                2: '#5b3a8a', // 复用：暗紫
                3: '#6b4a1f'  // 模拟：暗琥珀
            };
            pad.style.backgroundColor = palette[mode] || '#334155';
            pad.style.color = '#e2e8f0';
            pad.style.textShadow = 'none';
            // 保留具备总线复用能力引脚的蓝色边提示（pin-buscap）
            pad.style.borderColor = pad.classList.contains('pin-buscap')
                ? 'rgba(56, 189, 248, 0.55)'
                : 'rgba(148,163,184,0.5)';
            return;
        }

        // —— 外设 / 自定义器件引脚：稳定语义着色，使 hover 高亮可正确叠加与恢复 ——
        // 自定义器件（带 IO 附加功能）：按 ioRegs.mode 暗色系（autoConfigure 已写入模式）
        const fns = (typeof this.getPadFunctions === 'function') ? this.getPadFunctions(side, index) : [];
        if (fns.length) {
            const mode = this.getIoRegs(side, index).mode & 0x3;
            const palette = { 0:'#1e4d6b', 1:'#1f6b3a', 2:'#5b3a8a', 3:'#6b4a1f' };
            pad.style.backgroundColor = palette[mode] || '#334155';
            pad.style.color = '#e2e8f0';
            pad.style.textShadow = 'none';
            pad.style.borderColor = 'rgba(148,163,184,0.5)';
            return;
        }
        // 普通外设总线脚：按 bus 着色（GPIO 输出→暗绿、ADC 模拟输入→暗蓝 …）
        const bus = (typeof this.getPadBus === 'function') ? this.getPadBus(side, index) : null;
        const sig = (typeof this.getPadSignal === 'function') ? this.getPadSignal(side, index) : null;
        if (bus) {
            let bg = '#334155';
            if (bus === 'GPIO') bg = '#1f6b3a';
            else if (bus === 'ADC' || (sig && /^ADC_(IN|AIN)/i.test(sig))) bg = '#0e7490';
            pad.style.backgroundColor = bg;
            pad.style.color = '#e2e8f0';
            pad.style.textShadow = 'none';
            pad.style.borderColor = 'rgba(148,163,184,0.5)';
            return;
        }
        // 中性配置脚：稳定浅色基线（覆盖 CSS :hover 纯白跳变，hover 时仅加绿光晕）
        pad.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        pad.style.color = '#333';
        pad.style.textShadow = 'none';
        pad.style.borderColor = 'rgba(148,163,184,0.5)';
    }

    // 序列化节点数据
    serialize() {
        const afArr = [];
        this.af.forEach((func, key) => afArr.push({ key, func }));
        const ioRegsArr = [];
        this.ioRegs.forEach((regs, key) => ioRegsArr.push({ key, regs }));
        return {
            nodeId: this.nodeId,
            config: this.config,
            position: { ...this.position },
            rotation: this.rotation || 0,
            disabledPads: Array.from(this.disabledPads),
            af: afArr,
            ioRegs: ioRegsArr
        };
    }

    // 从序列化数据还原节点
    static deserialize(data, system) {
        const node = new Node(data.config, data.position.x, data.position.y, data.nodeId, system);
        // 恢复旋转角度
        if (data.rotation) node.rotation = ((data.rotation % 360) + 360) % 360;
        // 恢复禁用的Pad
        (data.disabledPads || []).forEach(padKey => {
            const [side, index] = padKey.split('-');
            node.setPadDisabled(side, parseInt(index), true);
        });
        // 恢复 AF
        (data.af || []).forEach(item => {
            const [side, index] = item.key.split('-');
            node.setAF(side, parseInt(index), item.func);
        });
        // 恢复 GPIO 寄存器配置
        (data.ioRegs || []).forEach(item => {
            const [side, index] = item.key.split('-');
            node.setIoRegs(side, parseInt(index), item.regs);
        });
        return node;
    }
}
