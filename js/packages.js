/**
 * packages.js - IC 封装生成 + IO/AF 功能库
 *
 * 提供：
 *   - assignPinNumbers(type, perSide)  按标准引脚编号规则生成四方向引脚号
 *   - buildPackage(type, perSide)      生成可直接交给 NodeSystem.createNode 的 config
 *   （IO 复用功能库已随 MCU 设备定义内联进 config.js 的 devices[].af，不再单独维护默认 IO 库）
 */

/**
 * 标准引脚编号（逆时针，Pin1 在左上角圆点处）
 *   SOP  : 仅左右两边，左 1..n（上→下），右 n+1..2n（下→上）
 *   SIP  : 单列直插，仅一边（左）有引脚，1..n（上→下）；适合定义模块/排针等单边设施
 *   QFN/LQFP: 四边，左 1..n、底 n+1..2n、右 2n+1..3n、顶 3n+1..4n（均按视觉位置排布）
 *
 * 返回的数组顺序与 UI 排布一致（index 0 在边的最前端）。
 */
function assignPinNumbers(type, n) {
    const r = { top: [], right: [], bottom: [], left: [] };
    if (type === 'SOP') {
        for (let i = 0; i < n; i++) r.left.push(i + 1);
        const rightNums = [];
        for (let i = 0; i < n; i++) rightNums.push(n + 1 + i);
        for (let i = n - 1; i >= 0; i--) r.right.push(rightNums[i]); // 视觉上：下→上
    } else if (type === 'SIP') {
        // 单列直插：所有引脚排在单侧（左），1..n 自上而下
        for (let i = 0; i < n; i++) r.left.push(i + 1);
    } else {
        // LQFP / QFN 四边
        for (let i = 0; i < n; i++) r.left.push(i + 1);                          // 左：上→下
        for (let i = 0; i < n; i++) r.bottom.push(n + 1 + i);                    // 底：左→右
        const rn = [];
        for (let i = 0; i < n; i++) rn.push(2 * n + 1 + i);
        for (let i = n - 1; i >= 0; i--) r.right.push(rn[i]);                    // 右：下→上
        const tn = [];
        for (let i = 0; i < n; i++) tn.push(3 * n + 1 + i);
        for (let i = n - 1; i >= 0; i--) r.top.push(tn[i]);                      // 顶：右→左
    }
    return r;
}

/**
 * 生成一个 IC 封装的 Node 配置。
 * @param {string} type   'SOP' | 'LQFP' | 'QFN' | 'SIP'
 * @param {number} perSide 每边引脚数（SIP 即单列引脚总数）
 */
function buildPackage(type, perSide) {
    const n = Math.max(1, parseInt(perSide) || 1);
    const pins = assignPinNumbers(type, n);

    let width, height, chipColor, title;
    if (type === 'SOP') {
        width = 120;
        height = Math.max(150, n * 26);
        chipColor = '#27314a';
        title = `SOP-${n * 2}`;
    } else if (type === 'SIP') {
        width = 70;                                     // 仅单侧有引脚，宽度收窄
        height = Math.max(150, n * 26);
        chipColor = '#2c3a4f';
        title = `SIP-${n}`;
    } else if (type === 'QFN') {
        const side = Math.max(170, n * 26);
        width = side;
        height = side;
        chipColor = '#1f3a2e';
        title = `QFN-${n * 4}`;
    } else { // LQFP
        const side = Math.max(170, n * 26);
        width = side;
        height = side;
        chipColor = '#33284a';
        title = `LQFP-${n * 4}`;
    }

    return {
        name: title,
        chip: true,
        chipType: type,
        chipColor: chipColor,
        width: width,
        height: height,
        top: pins.top,
        right: pins.right,
        bottom: pins.bottom,
        left: pins.left
    };
}

/**
 * 预制设备（MCU 风格，带 IO 复用 / Alternate Function 表）
 *
 * 设备定义集中在 js/config.js 的 window.APP_CONFIG.devices 中。
 * 每个设备包含：
 *   - name : 芯片型号（如 "CIU32F003"）
 *   - gpio : GPIO 端口基址 + 寄存器偏移（用于 AF 菜单展示寄存器映射）
 *   - af   : PORT(如 "PA0") -> [AF0..AF15] 功能名数组（'-' 表示该 AF 无功能，最多 16 个）
 *   - pins : 物理引脚顺序（SOP 封装，Pin1 在左上，逆时针），
 *            entry 为 { label, port }，port=null 表示电源/无复用引脚
 *
 * 右键设备上的 Pad，AF 菜单会按该 PORT 的 AF0–AF15 列表列出可选功能（pin0~7→AFL，pin8~15→AFH）。
 */

/** 取全局配置（config.js 提供的 APP_CONFIG，可能经 fetch 异步就绪） */
function getAppConfig() {
    return window.APP_CONFIG || { devices: {}, peripherals: {} };
}

/** 返回全部预制设备名（供 UI 下拉） */
function listDevices() {
    return Object.keys(getAppConfig().devices || {});
}

/** 返回全部外设名（供 UI 下拉） */
function listPeripherals() {
    return Object.keys(getAppConfig().peripherals || {});
}

/**
 * 生成预制设备的 Node 配置（芯片本体 + 物理引脚 + 复用表）。
 * 每个引脚 entry 为对象 { label, port, pin }，供 Node 识别 PORT 名与物理引脚号。
 * 物理布局：左半（上→下）= Pin1..PinN/2，右半（下→上）= PinN/2+1..PinN。
 */
function buildDevice(deviceName) {
    const dev = (getAppConfig().devices || {})[deviceName];
    if (!dev) return null;

    // 自定义 MCU 设备以 packages 数组保存（每个封装含 pins）；预制设备为扁平 pins。
    // 下拉「添加设备」只生成一个封装节点，故取第一个 package（或扁平 pins）即可。
    let pins;
    let pkgType = dev.packageType || 'SOP';
    if (Array.isArray(dev.packages) && dev.packages.length) {
        const pkg = dev.packages[0];
        pins = (pkg.pins || []).map((p, i) => ({ label: p.label, port: p.port, pin: i + 1 }));
        pkgType = pkg.packageType || pkgType;
    } else {
        pins = (dev.pins || []).map((p, i) => ({ label: p.label, port: p.port, pin: i + 1 }));
    }

    const half = Math.ceil(pins.length / 2);
    const left = pins.slice(0, half);          // 左：上→下
    const right = pins.slice(half).reverse();  // 右：下→上（视觉）

    // 物理引脚号映射 port -> pin（便于菜单/导出）
    const physical = {};
    pins.forEach(p => { if (p.port) physical[p.port] = p.pin; });

    return {
        name: dev.name,
        chip: true,
        chipType: pkgType,
        chipColor: '#243a52',
        device: {
            key: deviceName,
            af: dev.af,
            special: dev.special || null,
            physical: physical,
            gpio: dev.gpio || null
        },
        width: 140,
        height: Math.max(170, half * 26),
        top: [],
        right: right,
        bottom: [],
        left: left
    };
}

/**
 * 生成外设（Peripheral）的 Node 配置（芯片本体 + 总线类引脚）。
 * 引脚 entry 为对象 { label, bus, signal, pin }（电源引脚为 { label, power, pin }）。
 * 物理布局同样为：左半（上→下）/ 右半（下→上）。
 */
function buildPeripheral(peripheralName) {
    const p = (getAppConfig().peripherals || {})[peripheralName];
    if (!p) return null;

    const pins = p.pins.map((pin, i) => Object.assign({}, pin, { pin: i + 1 }));
    const half = Math.ceil(pins.length / 2);
    const left = pins.slice(0, half);          // 左：上→下
    const right = pins.slice(half).reverse();  // 右：下→上（视觉）

    // SOP2 等超小封装（≤2 脚）做成“超级扁平”板：高度仅比引脚（16px）略高，
    // 体内名称改为小字体显示（见 node.js / index.html .node.chip.flat）。
    const isFlat = pins.length <= 2;

    return {
        name: p.name,
        chip: true,
        chipType: p.packageType || 'SOP',
        chipColor: '#3a2a45',
        peripheral: { key: peripheralName },
        width: 120,
        height: isFlat ? 30 : Math.max(150, half * 26),
        flat: isFlat,
        passThrough: !!p.passThrough,   // 直通器件：左右脚内部直连，hover 透传高亮
        top: [],
        right: right,
        bottom: [],
        left: left
    };
}

/**
 * 生成「自定义器件」节点配置（芯片本体 + 引脚；引脚带 bus/signal 可参与总线高亮）。
 * 器件定义来自文本框/收藏夹的解析结果：
 *   def = { name, pins: [ {label, bus, signal} | {label, power:true} | {label} ] }
 * 引脚布局与外设一致：左半（上→下）/ 右半（下→上），≤2 脚做成超级扁平板。
 * 建成 peripheral 风格，连到 MCU 时其总线脚会高亮 MCU 对应 IO。
 */
/**
 * 规整引脚列表为对象数组 [{label, port?}]。
 * 兼容三种输入：
 *   - 对象数组 [{label, port}]          → 原样
 *   - 字符串数组 ['PA0', 'VSS']          → 包装成 {label}，并按 PAx 自动推断 port
 *   - 多行文本 "PA0 PA0\nVSS"（编辑器文本形态） → 按行解析（与 main.js parsePinsText 同格式）
 * 供 buildCustomDevice 消费，避免 text 形态（pins 为字符串）直接传入时 .map 报错。
 */
function normalizePins(pins) {
    if (!pins) return [];
    if (typeof pins === 'string') {
        const out = [];
        pins.split('\n').forEach(raw => {
            const line = raw.trim();
            if (!line) return;
            const parts = line.split(/\s+/);
            const label = parts[0];
            let port = parts[1] || null;
            if (!port && /^P[A-Z]\d+$/.test(label)) port = label;
            out.push(port ? { label, port } : { label });
        });
        return out;
    }
    if (Array.isArray(pins)) {
        return pins.map(p => {
            if (typeof p === 'string') {
                let port = null;
                if (/^P[A-Z]\d+$/.test(p)) port = p;
                return port ? { label: p, port } : { label: p };
            }
            return Object.assign({}, p);
        });
    }
    return [];
}

/**
 * 给 GPIO 的 regs / reset 表包一层「重命名代理」：
 * 访问标准名（AFL/AFH）时透明转发到 rename 后的真实 SVD 寄存器名（如 AFRL/AFRH），
 * 写回也落到真实名；未声明 rename 时完全透传（AFL→AFL）。
 * 这样业务代码（computeRegisterDump / getPortResetValues 等）统一按标准名访问，
 * 无需感知各厂 SVD 寄存器名差异。仅对 object 形态生效，原对象不被修改。
 */
function makeGpioRenameProxy(target, rename) {
    if (!target || typeof target !== 'object') return target;
    const rn = rename || {};
    return new Proxy(target, {
        get(t, prop) {
            if (typeof prop !== 'string') return t[prop];
            const real = rn[prop];
            if (real != null && real !== prop && real in t) return t[real];
            return t[prop];
        },
        set(t, prop, value) {
            if (typeof prop === 'string') {
                const real = rn[prop];
                if (real != null && real !== prop) { t[real] = value; return true; }
            }
            t[prop] = value;
            return true;
        },
        has(t, prop) {
            if (typeof prop === 'string') {
                const real = rn[prop];
                if (real != null && real !== prop && real in t) return true;
            }
            return prop in t;
        }
    });
}

function buildCustomDevice(def) {
    const pins = normalizePins(def.pins).map((p, i) => Object.assign({}, p, { pin: i + 1 }));
    const half = Math.ceil(pins.length / 2);
    const pkgType = (def.packageType || def.pkg || '').toUpperCase();
    // 单列直插（SIP）：所有引脚排在单侧（左），不分左右两半
    const isSip = pkgType === 'SIP';
    // 四边封装（LQFP / QFN）：引脚分布在四边，视觉与真实 QFP 一致
    const isFourSide = pkgType === 'LQFP' || pkgType === 'QFN';
    let top = [], right = [], bottom = [], left;
    if (isSip) {
        left = pins;                           // 全部引脚在左侧（上→下）
        right = [];
    } else if (isFourSide) {
        // 按声明顺序四等分：左（上→下）、底（左→右）、右（下→上）、顶（右→左），
        // 与 assignPinNumbers 的 QFP 视觉一致；每组从上/左端起依次排布。
        const q = Math.ceil(pins.length / 4);
        left = pins.slice(0, q);                                   // 左：上→下
        bottom = pins.slice(q, 2 * q);                             // 底：左→右
        const rSlice = pins.slice(2 * q, 3 * q);
        right = rSlice.reverse();                                  // 右：下→上
        const tSlice = pins.slice(3 * q);
        top = tSlice.reverse();                                    // 顶：右→左
    } else {
        left = pins.slice(0, half);            // 左：上→下
        // 模拟接口转换器：右侧不翻转，使 left[i]↔right[i] 在视觉与高亮上成对直通
        // （左=GPIO、右=接口；如 GPIO_SCK ↔ SPI_SCK / GPIO_MOSI ↔ SPI_MOSI）。
        right = def.converter ? pins.slice(half) : pins.slice(half).reverse();
    }
    const isFlat = pins.length <= 2;

    // 悬浮提示：名称 + 封装 + 接口（若为数组则多个接口用 “ / ” 分隔）
    const titleParts = [];
    if (def.name) titleParts.push(def.name);
    if (def.pkg) titleParts.push('封装:' + def.pkg);
    if (def.iface) {
        const iv = Array.isArray(def.iface) ? def.iface.join(' / ') : def.iface;
        titleParts.push('接口:' + iv);
    }
    const title = titleParts.join(' · ');

    // —— 设备风格（MCU 自定义）：带 gpio / af / special 复用表，节点按 device 处理 ——
    // 判定：def 携带 af 或 gpio 或 special，且引脚声明了 port（否则退回外设风格）。
    const isDevice = !!(def.af || def.gpio || def.special) && (pins.some(p => p.port));

    const physical = {};
    pins.forEach(p => { if (p.port) physical[p.port] = p.pin; });

    if (isDevice) {
        // 给 gpio.regs / gpio.reset 包重命名代理：访问 AFL/AFH 透明转发到真实 SVD 名（如 AFRL），
        // 业务代码统一按标准名访问即可，无需改动 system.js / node.js。
        const gpioDef = def.gpio ? Object.assign({}, def.gpio, {
            regs: makeGpioRenameProxy(def.gpio.regs, def.gpio.rename),
            reset: makeGpioRenameProxy(def.gpio.reset, def.gpio.rename)
        }) : null;
        return {
            name: def.name || '自定义设备',
            title: title,
            chip: true,
            chipType: def.packageType || def.pkg || 'SOP',
            chipColor: '#243a52',
            device: {
                key: '__custom_dev__',
                name: def.name || '自定义设备',
                af: def.af || null,
                special: def.special || null,
                physical: physical,
                gpio: gpioDef,
                svdKey: def.svdKey || '__auto__'   // 显式绑定的 SVD（'__auto__' 按型号自动匹配）
            },
            pkg: def.pkg || null,
            iface: def.iface || null,
            converter: !!def.converter,
            deviceMenu: def.deviceMenu || null,
            width: isSip ? 70 : 140,
            height: isFlat ? 30 : Math.max(170, half * 26),
            top: top,
            right: right,
            bottom: bottom,
            left: left
        };
    }

    return {
        name: def.name || '自定义器件',
        title: title,
        chip: true,
        chipType: def.converter ? 'SOP' : (def.pkg || 'SOP'),
        chipColor: '#3a2a45',
        peripheral: { key: '__custom__', name: def.name || '自定义器件' },
        pkg: def.pkg || null,
        iface: def.iface || null,
        converter: !!def.converter,
        // 右键菜单 JSON（原始字符串）：留空=不使用弹出式菜单。serialize 会自动持久化。
        deviceMenu: def.deviceMenu || null,
        width: isSip ? 70 : 120,
        height: isFlat ? 30 : Math.max(150, half * 26),
        flat: isFlat,
        top: top,
        right: right,
        bottom: bottom,
        left: left
    };
}

// ============================================================
// 总线（Bus）解析工具：用于“外设 SPI pad 连线时高亮 MCU 对应 IO”
// ============================================================

/**
 * 外设信号名 -> MCU 复用功能 signal 名的归一化映射已收编进 config
 * （window.APP_SIGNAL_CONFIG.map），运行时由 signalMatches 动态读取，不再内联常量。
 * 例：外设 "CLK" 对应 MCU 功能信号 "SCK"（或 "CLK"）。
 * 值为空数组表示外设信号没有对应的 MCU 复用功能（如 WP / HOLD，仅作 GPIO）。
 */

/**
 * 解析复用功能 id（如 "SPI1_MOSI" / "I2C1_SCL" / "USART1_TX"）为 { bus, instance, signal }。
 *   - bus     : 总线前缀（SPI / I2C / UART / USART / TIM ...，可含数字如 I2C / I2C1）
 *   - instance: 带编号的实例名（SPI1 / I2C1 ...）；无编号时等于总线前缀（I2C）
 *   - signal  : 信号名（MOSI / SCL ...）
 * 约定：实例编号为 id 中 “_” 之前最后一段数字；其前者为总线前缀。
 * 若前缀无数字（如 "I2C_SCL"），整段前缀即总线名，instance 取原前缀。
 * 无法解析（如 "MCO" / "SWDIO" / "GPIO"，无下划线）返回 null。
 */
/**
 * 总线族归一化：把语义等价但前缀不同的总线统一到同一 bus 名，
 * 使高亮 / 连线匹配按“同一套逻辑”处理。
 * 仅影响 bus（用于匹配/锁定），instance 仍保留原始名（如 USART1 / I2C1 / I2C）。
 * 例：USART/USART1 与 UART 视为同一串行总线族；I2C1 与 I2C 视为同一 I2C 总线族。
 */
var BUS_ALIASES = {
    'USART': 'UART',
    'USART1': 'UART',
    'I2C1': 'I2C'
};
function normalizeBus(bus) {
    const b = (bus || '').toUpperCase();
    return BUS_ALIASES[b] || b;
}

/**
 * 整名即功能名（含下划线但表示单一功能、非“总线_信号”结构）的白名单。
 * 例：IR_OUT 是红外输出功能的整体名，不应被拆成 IR + OUT。
 * 这些名在 parseFunctionId 拆分前优先整体识别为 bus=instance=signal=原名。
 */
var WHOLE_FUNCTION_NAMES = {
    'IR_OUT': true
};

function parseFunctionId(id) {
    if (!id || typeof id !== 'string') return null;
    const up0 = id.toUpperCase();
    if (WHOLE_FUNCTION_NAMES[up0]) {
        return { bus: up0, instance: up0, signal: up0 };
    }
    const us = id.indexOf('_');
    if (us <= 0) return null;
    const head = id.slice(0, us);
    const signal = id.slice(us + 1);
    const m = /(\d+)$/.exec(head); // 末尾的数字段 = 实例编号
    // 无数字段（如 I2C_SCL）：整段前缀即总线名，instance 取原前缀
    const bus = (m ? head.slice(0, m.index) : head).toUpperCase();
    return {
        bus: normalizeBus(bus),
        instance: head.toUpperCase(),
        signal: signal.toUpperCase()
    };
}

/**
 * 解析复用功能 id 的容错版本（供总线高亮 / 自动配置使用）。
 * 在 parseFunctionId 基础上，额外支持“无下划线的裸功能名”（如 MCO / IR_OUT / SWDIO）：
 * 这些功能没有实例编号，按字面视为自身独立的总线类型（bus=instance=signal=原 id）。
 * 这样“转换器”类外设只要把引脚的 bus/signal 设成该裸功能名，即可直接高亮/匹配到
 * MCU AF 表中同名的复用脚（高亮直通），无需为每个裸功能单独写映射。
 * 含下划线的功能（SPI1_MOSI / TIM1_CH1 / I2C1_SCL …）行为与 parseFunctionId 完全一致。
 */
function resolveFunctionId(id) {
    if (!id || typeof id !== 'string') return null;
    const base = parseFunctionId(id);
    if (base) return base;
    if (id === '-') return null;
    const up = id.toUpperCase();
    return { bus: normalizeBus(up), instance: up, signal: up };
}

/**
 * 解析“特殊功能”标签（非 AF 复用表，属引脚固有能力）为 { bus, instance, signal }。
 * 用于 MCU 特殊功能（ADC_INx / GPIO_OUT / NRST / EXTCLK）与外设连线时的反向高亮 / 匹配，
 * 使其 bus 字段正确（ADC_IN3 → bus="ADC"，GPIO_OUT → bus="GPIO"），从而命中对应外设。
 *   - ADC_INx / ADC_AINx : bus="ADC", instance=null, signal=原标签
 *   - GPIO_OUT / GPIO    : bus="GPIO", instance=null, signal="GPIO_OUT"
 *   - 其余（NRST / EXTCLK 等）：按字面视为独立总线类型（bus=instance=signal=原标签）
 */
function resolveSpecialFunctionId(id) {
    if (!id || typeof id !== 'string') return null;
    const up = id.toUpperCase();
    let m = /^ADC_(IN|AIN)(\d+)$/.exec(up);
    if (m) return { bus: 'ADC', instance: null, signal: up };
    if (up === 'AINX' || up === 'ADC_INX') return { bus: 'ADC', instance: null, signal: up };
    if (up === 'GPIO_OUT' || up === 'GPIO') return { bus: 'GPIO', instance: null, signal: 'GPIO_OUT' };
    // 输入变体：GPIO_IN（无上下拉）/ GPIO_INPU（输入+上拉）/ GPIO_INPD（输入+下拉）
    // 归一为 GPIO 总线、信号 GPIO_IN，使其与 GPIO 输入路径一致匹配；上下拉方向由 gpioInputPull 单独解析。
    if (up === 'GPIO_INPU' || up === 'GPIO_INPD' || up === 'GPIO_IN' || up === 'GPI')
        return { bus: 'GPIO', instance: null, signal: 'GPIO_IN' };
    return { bus: up, instance: up, signal: up };
}

/**
 * 判断某引脚“附加功能”标签是否为 GPIO 输入变体
 * （GPIO_IN 无上下拉 / GPIO_INPU 输入+上拉 / GPIO_INPD 输入+下拉）。
 * 用于自定义器件引脚声明输入（含上下拉）时，连接 MCU 自动置为输入模式并带上/下拉。
 */
function isGpioInput(fn) {
    const u = String(fn || '').toUpperCase();
    return u === 'GPIO_IN' || u === 'GPIO_INPU' || u === 'GPIO_INPD';
}

/** 返回 GPIO 输入变体对应的上下拉寄存器值：0=无 1=上拉 2=下拉 */
function gpioInputPull(fn) {
    const u = String(fn || '').toUpperCase();
    if (u === 'GPIO_INPU') return 1;
    if (u === 'GPIO_INPD') return 2;
    return 0;
}

/**
 * 判断 MCU 功能 signal 是否与外设信号 peripheralSignal 属于同一信号。
 * 双向兼容：已对大小写做归一化。
 */
function signalMatches(peripheralSignal, funcSignal) {
    if (!peripheralSignal || !funcSignal) return false;
    const ps = String(peripheralSignal).toUpperCase();
    const fs = String(funcSignal).toUpperCase();
    if (ps === fs) return true;
    // 通配通道：AINX / ADC_INX 高亮任意 ADC_INx / ADC_AINx 通道 IO（类比 TIM 的 CHX）
    if ((ps === 'AINX' || ps === 'ADC_INX') && /^ADC_(IN|AIN)\d+$/.test(fs)) return true;
    const sc = (typeof window !== 'undefined' && window.APP_SIGNAL_CONFIG) || {};
    const norm = (sc.map && sc.map[ps]) || [];
    return norm.includes(fs);
}

/**
 * 判断某引脚“附加功能”标签 fnLabel 是否与外设引脚的 (bus, signal) 匹配。
 * 用于自定义器件引脚（通过文本框“引脚名 空格 附加功能”声明）与外设连线时高亮/匹配：
 *   - 直接同名：fnLabel === signal（如 "ADC_IN3" === "ADC_IN3"）
 *   - 功能名即总线名：fnLabel === bus（如 "GPIO" === "GPIO"）
 *   - 经 resolveFunctionId 归一化后 bus 相同且 signal 经 signalMatches 匹配
 *     例：外设 SPI/MOSI 连到自定义器件脚声明的 "SPI1_MOSI" 也能匹配。
 * 返回布尔。
 */
function funcMatchesPeripheral(fnLabel, bus, sig) {
    if (!fnLabel || !bus || !sig) return false;
    const f = String(fnLabel).toUpperCase();
    const b = String(bus).toUpperCase();
    const s = String(sig).toUpperCase();
    if (f === s || f === b) return true;
    // 通配通道：AINX / ADC_INX 双向匹配任意 ADC_INx / ADC_AINx（自定义器件 ↔ 外设/MCU 任意 ADC 通道）
    const adcWild = (x) => x === 'AINX' || x === 'ADC_INX';
    const adcCh = (x) => /^ADC_(IN|AIN)\d+$/.test(x);
    if ((adcWild(f) || adcCh(f)) && (adcWild(s) || adcCh(s)) && (adcWild(f) || adcWild(s) || f === s)) return true;
    const info = (typeof resolveFunctionId === 'function') ? resolveFunctionId(fnLabel) : null;
    if (info) {
        if (info.bus === b) {
            if (typeof signalMatches === 'function') return signalMatches(s, info.signal);
            return info.signal === s;
        }
    }
    return false;
}
