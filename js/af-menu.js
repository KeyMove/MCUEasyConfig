/**
 * AFMenu - 右键 Pad 打开的 AF（Alternate Function / IO 复用）选择菜单
 *
 * 依赖：rich-menu.js 提供的 RichMenu 组件。
 *
 * 行为：
 *   - 右键 MCU 设备 Pad → 按该 PORT 的 device.af（来自 config.js）列出可选复用功能
 *   - 右键外设 Pad → 只读展示总线/信号信息
 *   - 选择即实时赋值给该 Pad（或点"保存功能"）
 *   - 提供"清除功能"与"断开该 Pin 连接"
 */
class AFManager {
    constructor(system) {
        this.system = system;
        this.menu = null;       // 当前打开的 RichMenu 实例
        this._ctx = null;       // { node, port, index, padElement }
    }

    _theme() {
        // 跟随系统 IDE 主题：这里使用浅色面板（也可改为 'dark'）
        return 'light';
    }

    /** 右键入口 */
    open(e, padElement) {
        const nodeId = padElement.dataset.node;
        const port = padElement.dataset.port;
        const index = parseInt(padElement.dataset.index);
        const node = this.system.nodes.get(nodeId);
        if (!node) return;

        // 外设引脚：总线类引脚为只读信息（无 AF 复用表）
        if (node.config && node.config.peripheral) {
            this._openPeripheral(e, padElement, node, port, index);
            return;
        }

        this._ctx = { node, port, index, padElement };

        const pinNum = node.getPinNumber(port, index);
        const portName = node.getPortName(port, index);
        const pkgType = node.config.chipType || (node.isChip ? 'CHIP' : 'NODE');
        const current = node.getAF(port, index);
        const padLabel = padElement.dataset.baseLabel || (pinNum != null ? pinNum : '');

        // 是否为预制设备引脚
        const isDevice = !!(node.config && node.config.device);
        // 设备引脚的 AF 复用表（PORT -> [AF0..AF15]，最多 16 个复用功能）
        const devAf = (isDevice && portName && node.config.device.af[portName])
            ? node.config.device.af[portName]
            : null;

        // 当前功能文案 & 控件声明
        let currentText, funcControl = null, regsSection = null;

        if (isDevice && portName && devAf) {
            // —— 设备 IO 引脚：模式 / 上下拉 / 开漏 / 特殊功能 四项配置 ——
            const regs = node.getIoRegs(port, index);
            // AFL 选择反映“已选复用功能”（current）；原始 AFL 寄存器位值在下方位域读数中展示
            const curAfl = (current && current.afIndex != null) ? String(current.afIndex) : '';
            currentText = current ? `AF${current.afIndex}: ${current.label}` : '未配置';

            const modeOptions = [
                { value: '0', label: '输入模式 (00)' },
                { value: '1', label: '输出模式 (01)' },
                { value: '2', label: '复用功能模式 (10)' },
                { value: '3', label: '模拟模式 (11)' }
            ];
            const pupdOptions = [
                { value: '0', label: '无上拉/下拉 (00)' },
                { value: '1', label: '上拉 (01)' },
                { value: '2', label: '下拉 (10)' },
                { value: '3', label: '保留 (11)' }
            ];
            const otypeOptions = [
                { value: '0', label: '推挽输出 (0)' },
                { value: '1', label: '开漏输出 (1)' }
            ];
            const aflOptions = [{ value: '', label: '— 未分配 —' }];
            devAf.forEach((fn, k) => {
                const name = fn === '-' ? '(无)' : fn;
                aflOptions.push({ value: String(k), label: `AF${k}: ${name}` });
            });

            const regsControls = [
                { type: 'select', id: 'mode', label: '模式', value: String(regs.mode), options: modeOptions },
                { type: 'select', id: 'pupd', label: '上下拉', value: String(regs.pupd), options: pupdOptions },
                { type: 'select', id: 'otype', label: '开漏', value: String(regs.otype), options: otypeOptions },
                { type: 'select', id: 'afl', label: '特殊功能', value: curAfl, options: aflOptions }
            ];
            regsSection = { title: '引脚配置', controls: regsControls };
        } else if (isDevice && !portName) {
            // —— 电源引脚：无复用功能 ——
            currentText = '电源引脚（无复用功能）';
            funcControl = { type: 'heading', label: `${padLabel} · 无复用功能` };
        } else {
            // —— 理论上所有节点均为 MCU 设备或外设，不会走到这里 ——
            currentText = '无复用功能';
            funcControl = { type: 'heading', label: `${padLabel} · 无复用功能` };
        }

        // 菜单标题
        let title;
        if (isDevice && portName) title = `${portName} · Pin${pinNum}`;
        else if (isDevice && !portName) title = `${padLabel} · Pin${pinNum} (电源)`;
        else title = `Pin ${pinNum != null ? pinNum : ''}${pkgType ? ' · ' + pkgType : ''}`;

        const menuConfig = {
            mode: 'context',
            layout: 'compact',
            theme: this._theme(),
            title: title,
            width: 320,
            showFooter: true,
            sections: [
                {
                    title: '当前状态',
                    controls: [
                        { type: 'heading', label: `当前: ${currentText}` }
                    ]
                },
                ...(funcControl ? [{ title: '选择 AF 功能', controls: [funcControl] }] : []),
                ...(regsSection ? [regsSection] : []),
                {
                    title: '操作',
                    controls: [
                        {
                            type: 'button',
                            id: 'clear',
                            label: '清除功能',
                            style: 'danger',
                            onClick: () => {
                                node.resetIoRegs(port, index);
                                this.system.drawAll();
                            }
                        },
                        {
                            type: 'button',
                            id: 'disconnect',
                            label: '断开该 Pin 连接',
                            style: 'secondary',
                            onClick: () => {
                                this.system.disconnectPad({ preventDefault() {}, stopPropagation() {} }, padElement);
                                this._hideAndDestroy();
                            }
                        }
                    ]
                }
            ],
            buttons: [
                { type: 'cancel', label: '取消' },
                { type: 'submit', label: '保存功能', style: 'primary' }
            ]
        };

        // 复用 / 重建菜单
        this._hideAndDestroy();
        this.menu = new RichMenu(menuConfig);
        this.menu.onChange((id, value) => {
            if (id === 'mode' || id === 'otype' || id === 'pupd') {
                const cur = node.getIoRegs(port, index);
                cur[id] = parseInt(value, 10);
                node.setIoRegs(port, index, cur);
                this.system.drawAll();
            } else if (id === 'afl') {
                // AF 通过 AFL 寄存器选择：选中真实功能则置为复用功能模式
                this._applyAfl(value, devAf, node, port, index);
                // 同步 MODE 下拉显示，避免提交时回退
                const mc = this.menu.menuControls['mode'];
                if (mc) {
                    const k = parseInt(value, 10);
                    const fn = (value !== '' && value != null && devAf) ? devAf[k] : null;
                    mc.value = (fn && fn !== '-') ? '2' : '0';
                }
                this.system.drawAll();
            }
        });
        this.menu.onSubmit(() => {
            ['mode', 'otype', 'pupd'].forEach(rid => {
                const c = this.menu.menuControls[rid];
                if (c) {
                    const cur = node.getIoRegs(port, index);
                    cur[rid] = parseInt(c.value, 10);
                    node.setIoRegs(port, index, cur);
                }
            });
            // AFL 已在 onChange 中实时写入，这里不再重复（避免覆盖 MODE 选择）
            this.system.drawAll();
            this._hideAndDestroy();
        });
        this.menu.onCancel(() => this._hideAndDestroy());

        this.menu.show(e.clientX, e.clientY);
    }

    /** 外设引脚菜单：总线类引脚只读展示（无 AF 复用表），可断开连接 */
    _openPeripheral(e, padElement, node, port, index) {
        this._ctx = { node, port, index, padElement };

        const bus = padElement.dataset.bus || node.getPadBus(port, index) || '';
        const sig = padElement.dataset.signal || node.getPadSignal(port, index) || '';
        const isPower = padElement.classList.contains('pin-power');
        const pinNum = node.getPinNumber(port, index);
        const label = padElement.dataset.baseLabel || (pinNum != null ? pinNum : '');

        const isBus = !!bus && !isPower;
        const currentText = isBus ? `总线引脚：${bus} / ${sig}` : '电源引脚（无复用功能）';
        const title = isBus ? `${label} · ${bus}/${sig}` : `${label} · 电源`;

        const menuConfig = {
            mode: 'context',
            layout: 'compact',
            theme: this._theme(),
            title: title,
            width: 300,
            showFooter: true,
            sections: [
                {
                    title: '引脚信息',
                    controls: [
                        { type: 'heading', label: `当前: ${currentText}` },
                        ...(isBus ? [{ type: 'heading', label: `连接 MCU 时：高亮所有可用 ${bus} ${sig} 的 IO` }] : [])
                    ]
                },
                {
                    title: '操作',
                    controls: [
                        {
                            type: 'button',
                            id: 'disconnect',
                            label: '断开该 Pin 连接',
                            style: 'secondary',
                            onClick: () => {
                                this.system.disconnectPad({ preventDefault() {}, stopPropagation() {} }, padElement);
                                this._hideAndDestroy();
                            }
                        }
                    ]
                }
            ],
            buttons: [
                { type: 'cancel', label: '关闭' }
            ]
        };

        this._hideAndDestroy();
        this.menu = new RichMenu(menuConfig);
        this.menu.onCancel(() => this._hideAndDestroy());
        this.menu.show(e.clientX, e.clientY);
    }

    /** 根据 AFL 寄存器选择写入 AF（设备 IO 引脚专用）：AF 即复用功能寄存器选择 */
    _applyAfl(value, devAf, node, port, index) {
        if (value === '' || value == null) {
            node.clearAF(port, index);
            node.setIoRegs(port, index, { afl: null, mode: 0 });
            return;
        }
        const k = parseInt(value, 10);
        const fn = devAf ? devAf[k] : null;
        if (!fn || fn === '-') {
            node.clearAF(port, index);
            node.setIoRegs(port, index, { afl: null, mode: 0 });
        } else {
            node.setAF(port, index, { id: fn, label: fn, group: `AF${k}`, afIndex: k });
            node.setIoRegs(port, index, { afl: k, mode: 2 }); // 选中复用功能 → 自动置 MODE=复用功能模式
        }
    }

    _hideAndDestroy() {
        if (this.menu) {
            try { this.menu.hide(); } catch (e) {}
            try { this.menu.destroy(); } catch (e) {}
            this.menu = null;
        }
    }
}
