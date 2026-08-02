/**
 * main.js - 引导与 UI 事件绑定
 *
 * 布局改为全屏画布 + 顶部 Dock 栏（dock.js）：
 *   - 顶部 Dock 项点击弹出对应操作面板（RichMenu 表单 / 说明 HTML 面板）
 *   - 说明、IO 配置、封装/设备/外设/画布 设置全部收纳进 Dock 弹出菜单
 *
 * 顺序：rich-menu.js → js/node.js → js/packages.js → js/af-menu.js
 *       → js/system.js → dock.js → js/main.js
 */
document.addEventListener('DOMContentLoaded', function () {
    // 配置（config.json / config.bundle.js）可能经 fetch 异步加载，需等就绪后再启动应用。
    function boot() {
    // 暴露给 system.js：createNode 的 contextmenu 处理器通过 `typeof openCustomDeviceMenu === 'function'` 调用本函数。
    // 因本文件整体包在 DOMContentLoaded 闭包内，openCustomDeviceMenu 默认不是全局，必须显式挂到 window。
    // （函数声明已提升，此处可立即引用；放在节点创建之前，保证任何自定义器件节点都能访问到）
    window.openCustomDeviceMenu = openCustomDeviceMenu;
    // 供 system.js 右键 MCU 节点打开「该 MCU 的寄存器」编辑器使用
    window.openSvdWindow = openSvdWindow;

    const container = document.getElementById('container');
    nodeSystem.init(container);

    // 启动时把旧版「单一混合收藏夹」按定义结构分流为 MCU 设备 / 外设两个独立收藏夹（仅一次）
    migrateFavorites();

    // 注入 AF 右键菜单管理器（依赖 RichMenu / packages.js）
    nodeSystem.afManager = new AFManager(nodeSystem);

    // 恢复 SVD 编辑器保存的寄存器改动（localStorage 持久化），确保刷新/重开后仍保留。
    // 数据结构：{ [svdKey]: { [regId]: {id,address,name,reset,value} } }，按 SVD 命名空间，
    // 使画布上多个不同 MCU 各自保存各自的寄存器改动、互不串值。
    try {
        const saved = localStorage.getItem('svdRegValues');
        if (saved) {
            let parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const ks = Object.keys(parsed);
                // 兼容旧扁平格式（{ regId: {...} }）→ 整体迁移到当前激活 SVD 下
                const flat = ks.length && parsed[ks[0]] && typeof parsed[ks[0]] === 'object' && ('address' in parsed[ks[0]]);
                if (flat) {
                    const ak = (window.SvdLib && window.SvdLib.getActiveSvdKey()) || '';
                    parsed = ak ? { [ak]: parsed } : {};
                }
            }
            nodeSystem.svdRegValues = parsed || {};
        }
    } catch (e) {}
    if (!nodeSystem.svdRegValues) nodeSystem.svdRegValues = {};

    // 接口初始化写入寄存器后，若 SVD 编辑器窗口处于打开可见状态，原地刷新以反映新值
    // （与「改完寄存器值失去焦点」的同步行为一致：仅就地改写控件，不整树重建）
    nodeSystem.registerCallback('onRegistersChanged', () => {
        const ed = window.__svdEditor;
        if (ed && window.__svdWin && document.body.contains(window.__svdWin.windowElement)
            && window.__svdWin.windowElement.style.display !== 'none') {
            refreshSvdInPlace(ed);
        }
    });

    // 全局激活 SVD 变化（配置菜单下拉框切换）时：若编辑器窗口已开且未钉定到某 MCU，
    // 跟随新激活 SVD 重建内容；钉定状态（右键某 MCU 打开）下不受影响。
    window.addEventListener('svdkeychanged', () => {
        if (window.__svdWin && document.body.contains(window.__svdWin.windowElement)
            && !window.__svdPinnedKey && window.__svdHost) {
            openSvdWindow();
        }
    });

    // ============ 隐藏文件输入（dock 弹出菜单触发） ============
    const fileInput = document.getElementById('fileInput');
    const favFileInput = document.getElementById('favFileInput');
    const configFileInput = document.getElementById('configFileInput');
    const svdJsonFileInput = document.getElementById('svdJsonFileInput');
    const svdFilesInput = document.getElementById('svdFilesInput');
    const workspaceFileInput = document.getElementById('workspaceFileInput');

    // 加载节点 JSON
    if (fileInput) fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    nodeSystem.loadFromJSON(JSON.parse(ev.target.result));
                } catch (error) {
                    console.error('解析JSON文件失败:', error);
                    alert('解析JSON文件失败，请检查文件格式');
                }
            };
            reader.readAsText(file);
        }
        fileInput.value = '';
    });

    // 加载「外设收藏夹」JSON（按 kind 分流合并进对应 localStorage 收藏夹）
    if (favFileInput) favFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    const obj = JSON.parse(ev.target.result);
                    const mcu = loadFavorites('mcu'), peri = loadFavorites('peripheral');
                    let count = 0;
                    Object.keys(obj).forEach(n => {
                        const d = obj[n];
                        if (d && d.kind === 'peripheral') { peri[n] = d; }
                        else { mcu[n] = d; }   // 缺省 / kind==='mcu' 均归 MCU 设备
                        count++;
                    });
                    saveFavorites(mcu, 'mcu'); saveFavorites(peri, 'peripheral');
                    nodeSystem.updateConnectionStatus('已加载收藏夹', '#38bdf8', `共 ${count} 个收藏器件`);
                    updateFavSelect();
                } catch (err) {
                    alert('解析收藏夹失败：' + err.message);
                }
                favFileInput.value = '';
            };
            reader.readAsText(file);
        }
    });

    // 加载「应用配置」（config.json 叠加层）：读取后 deep-merge 到基础库并刷新界面
    if (configFileInput) configFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    const obj = JSON.parse(ev.target.result);
                    if (window.importAppConfigObject && window.importAppConfigObject(obj)) {
                        nodeSystem.updateConnectionStatus('已加载配置', '#38bdf8', 'config.json 已存入本地（localStorage）并叠加到基础库');
                    } else {
                        alert('config.json 格式不正确');
                    }
                } catch (err) {
                    alert('解析 config.json 失败：' + err.message);
                }
                configFileInput.value = '';
            };
            reader.readAsText(file);
        }
    });

    // 导入「整个工作区」JSON：写回所有本地配置并就地刷新（面板 + 收藏 + SVD + 接口等）
    if (workspaceFileInput) workspaceFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    const obj = JSON.parse(ev.target.result);
                    if (window.applyWorkspace && window.applyWorkspace(obj)) {
                        nodeSystem.updateConnectionStatus('已导入工作区', '#38bdf8', '整个工作区配置已恢复（面板/收藏/SVD/接口）');
                    } else {
                        alert('工作区文件格式不正确');
                    }
                } catch (err) {
                    alert('解析工作区文件失败：' + err.message);
                }
                workspaceFileInput.value = '';
            };
            reader.readAsText(file);
        }
    });
    if (svdJsonFileInput) svdJsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    const json = JSON.parse(ev.target.result);
                    const key = window.SvdLib.importSvdJson(json);
                    window.SvdLib.setActiveSvdKey(key);
                    nodeSystem.updateConnectionStatus('已导入 SVD', '#38bdf8', 'SVD JSON 已导入并设为当前：' + key);
                } catch (err) {
                    alert('导入 SVD JSON 失败：' + err.message);
                }
                svdJsonFileInput.value = '';
            };
            reader.readAsText(file);
        }
    });

    // 选择 .svd / .sfd 文件：即时转换为 SVD 并导入（可同时选中两个文件，按扩展名识别）
    if (svdFilesInput) svdFilesInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const svdFile = files.find(f => /\.svd$/i.test(f.name));
        const sfdFile = files.find(f => /\.sfd$/i.test(f.name));
        if (!svdFile) { alert('请选择 .svd 文件（可连同 .sfd 一起多选）'); svdFilesInput.value = ''; return; }
        let pending = 1 + (sfdFile ? 1 : 0);
        let svdText = '', sfdText = '';
        const finish = () => {
            try {
                const key = window.SvdLib.importSvdFromText(svdText, sfdText, svdFile.name.replace(/\.svd$/i, ''));
                window.SvdLib.setActiveSvdKey(key);
                nodeSystem.updateConnectionStatus('已转换 SVD', '#38bdf8', 'SVD/SFD 已转换并导入：' + key);
            } catch (err) {
                alert('转换 SVD 失败：' + err.message);
            }
            svdFilesInput.value = '';
        };
        const rd = (f, cb) => {
            const r = new FileReader();
            r.onload = () => { cb(r.result); if (--pending === 0) finish(); };
            r.readAsText(f);
        };
        rd(svdFile, t => { svdText = t; });
        if (sfdFile) rd(sfdFile, t => { sfdText = t; });
    });

    // ============ 缩放按钮（悬浮在画布右下） ============
    const zoomInBtn = document.getElementById('zoomIn');
    const zoomOutBtn = document.getElementById('zoomOut');
    const zoomResetBtn = document.getElementById('zoomReset');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => nodeSystem.zoom(0.1));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => nodeSystem.zoom(-0.1));
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => nodeSystem.resetZoom());

    // ============ Dock 弹出式菜单 ============
    let dockMenu = null;

    function closeDockMenu() {
        if (dockMenu) {
            try { dockMenu.hide(); } catch (e) {}
            try { dockMenu.destroy(); } catch (e) {}
            dockMenu = null;
        }
        regMenuOpen = false;
    }

    // 用 RichMenu 打开一个 dock 表单弹出（定位在触发 dock 项下方）
    function openDockMenu(anchor, cfg) {
        // 打开表单面板时收起说明面板
        const hp = document.getElementById('helpPanel');
        if (hp) hp.classList.remove('show');
        closeDockMenu();
        const menu = new RichMenu(Object.assign({
            mode: 'context',
            layout: 'vertical',
            theme: 'light',
            width: 300,
            showFooter: false,
            title: cfg.title
        }, cfg));
        if (cfg.onChange) menu.onChange(cfg.onChange);
        if (cfg.onSubmit) menu.onSubmit(cfg.onSubmit);
        menu.onCancel(() => { dockMenu = null; });
        dockMenu = menu;
        const r = anchor.getBoundingClientRect();
        menu.show(r.left + r.width / 2, r.bottom + 8);
    }

    const clampPins = (v) => Math.min(Math.max(parseInt(v) || 8, 1), 30);

    // —— 各 dock 弹出面板配置 ——
    function pkgMenuCfg() {
        return {
            title: '生成封装',
            width: 380,
            sections: [
                { title: '每边引脚数', controls: [
                    { type: 'number', id: 'pins', label: '引脚数 (1-30)', value: 8, min: 1, max: 30 }
                ] },
                { title: '封装类型', controls: [
                    { type: 'button', id: 'genSOP', label: '生成 SOP', onClick: () => nodeSystem.addPackage('SOP', clampPins(dockMenu.menuControls['pins'].value)) },
                    { type: 'button', id: 'genLQFP', label: '生成 LQFP', onClick: () => nodeSystem.addPackage('LQFP', clampPins(dockMenu.menuControls['pins'].value)) },
                    { type: 'button', id: 'genQFN', label: '生成 QFN', onClick: () => nodeSystem.addPackage('QFN', clampPins(dockMenu.menuControls['pins'].value)) }
                ] }
            ]
        };
    }

    function devMenuCfg() {
        const names = listDevices();
        return {
            title: '设备',
            sections: [
                { title: '预制设备', controls: [
                    { type: 'select', id: 'device', label: '设备', value: names[0], options: names.map(n => ({ value: n, label: n })) },
                    { type: 'button', id: 'addDevice', label: '添加设备', onClick: () => { const n = dockMenu.menuControls['device'].value; if (n) nodeSystem.addDevice(n); } }
                ] },
                { title: '自定义设备', controls: [
                    { type: 'button', id: 'newDevice', label: '➕ 添加新设备…', onClick: () => { closeDockMenu(); openDeviceEditorWindow(); } }
                ] }
            ]
        };
    }

    // 把结构化引脚转成「每行一个 pin」的多行文本：
    //   行格式：<标签> [<port>]   —— port 省略时自动从标签推断（如 PA0→port=PA0）
    function pinsToText(pins) {
        return (pins || []).map(p => {
            const label = p.label != null ? p.label : p;
            const port = p.port != null ? p.port : (typeof label === 'string' && /^P[A-Z]\d+$/.test(label) ? label : '');
            return port ? `${label} ${port}` : `${label}`;
        }).join('\n');
    }

    // 把 AF 表 { "PA0": ["-","SPI1_SCK",...] } 转成多行文本：
    //   每行：<PORT> <AF0> <AF1> ... <AF7>（空格分隔，'-' 表示无功能）
    function afToText(af) {
        const lines = [];
        Object.keys(af || {}).forEach(port => {
            const arr = Array.isArray(af[port]) ? af[port] : [];
            lines.push([port].concat(arr.map(v => (v == null || v === '' ? '-' : v))).join(' '));
        });
        return lines.join('\n');
    }

    // 把 special 表 { "PA0": ["ADC_IN0","..."] } 转成多行文本：
    //   每行：<PORT> <功能1> <功能2> ...（空格分隔）
    function specialToText(special) {
        const lines = [];
        Object.keys(special || {}).forEach(port => {
            const arr = Array.isArray(special[port]) ? special[port] : [special[port]];
            lines.push([port].concat(arr.filter(v => v != null && v !== '')).join(' '));
        });
        return lines.join('\n');
    }

    // 解析「引脚」多行文本 → [{ label, port }]
    function parsePinsText(text) {
        const pins = [];
        (text || '').split('\n').forEach(raw => {
            const line = raw.trim();
            if (!line) return;
            const parts = line.split(/\s+/);
            const label = parts[0];
            let port = parts[1] || null;
            if (!port && /^P[A-Z]\d+$/.test(label)) port = label;   // 自动推断
            pins.push(port ? { label, port } : { label });
        });
        return pins;
    }

    // 解析「AF」多行文本 → { "PORT": ["AF0".."AF7"] }
    function parseAfText(text) {
        const af = {};
        (text || '').split('\n').forEach(raw => {
            const line = raw.trim();
            if (!line) return;
            const parts = line.split(/\s+/);
            const port = parts[0];
            if (!port) return;
            const funcs = parts.slice(1).map(v => (v === '-' || v === '' ? '-' : v));
            while (funcs.length < 8) funcs.push('-');   // 补齐到 8 个 AF
            af[port] = funcs.slice(0, 8);
        });
        return af;
    }

    // 解析「special」多行文本 → { "PORT": ["功能1","功能2",...] }
    function parseSpecialText(text) {
        const special = {};
        (text || '').split('\n').forEach(raw => {
            const line = raw.trim();
            if (!line) return;
            const parts = line.split(/\s+/);
            const port = parts[0];
            if (!port) return;
            const funcs = parts.slice(1).filter(v => v && v !== '-');
            if (funcs.length) special[port] = funcs;
        });
        return special;
    }

    // 骨架：直接拿现成预制设备（如 CIU32F003）的完整 JSON 作为编辑起点，
    // 封装部分完全参考 config 的「mcu.packages」结构：顶层为 MCU 名 + 共享 af/special/gpio，
    // packages 为多个封装数组（每个含 name/packageType/pins 文本）。
    // pins / af / special 均为「多行文本」形态（方便用户从手册直接复制粘贴），
    // 并附 schema 让 RichObjectEditor 用 textarea 渲染；gpio 保持结构化原样。
    function defaultDeviceSkeleton() {
        const devices = (window.APP_CONFIG && window.APP_CONFIG.devices) || {};
        const firstKey = Object.keys(devices)[0];
        const base = firstKey ? devices[firstKey] : null;

        let data, schema;
        if (!base) {
            // 兜底：极端情况下无任何预制设备，退回最小空骨架（纯文本形态，1 个封装）
            data = {
                name: 'MyMCU',
                packages: [
                    { name: 'SOP16', packageType: 'SOP', pins: 'PA0 PA0\nPA1 PA1\nPB0 PB0\nVSS\nVDD' }
                ],
                af: 'PA0 - SPI1_SCK - - - - - -\nPA1 - SPI1_MOSI - - - - - -',
                special: 'PA0 ADC_IN0\nPA1 ADC_IN1',
                gpio: {}
            };
        } else {
            const clone = JSON.parse(JSON.stringify(base));
            delete clone.mcu;   // 运行时归一层字段，自定义设备无需保留
            // GPIO 复位值转成 16 进制字符串（如 "0x00000000"），让编辑器里直接显示、
            // 用户复制即用，无需再手动从数字换算；下游读取时按 parseInt(x,16) 兼容字符串/数字。
            if (clone.gpio && clone.gpio.reset) {
                const order = ['MODE', 'OTYPE', 'PUPD', 'AFL'];
                order.forEach(reg => {
                    const tbl = clone.gpio.reset[reg];
                    if (tbl && typeof tbl === 'object') {
                        Object.keys(tbl).forEach(letter => {
                            const v = tbl[letter];
                            if (typeof v === 'number') {
                                tbl[letter] = '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
                            }
                        });
                    }
                });
            }
            // 把单个已摊平 device 反推成「packages」结构（1 个封装）
            const pkgName = clone.name || firstKey;
            data = {
                name: String(pkgName).replace(/\s*\(.*\)\s*$/, '') || pkgName,  // 顶层 MCU 名（去掉括号注释）
                packages: [
                    {
                        name: pkgName,
                        packageType: clone.packageType || clone.pkg || 'SOP',
                        pins: pinsToText(clone.pins)
                    }
                ],
                af: afToText(clone.af),
                special: specialToText(clone.special),
                gpio: clone.gpio || {}
            };
        }

        // schema：让 pins/af/special 用多行文本（textarea）编辑，给出格式提示。
        // '@pins' 为末级通配：packages 数组里每个元素的 pins 字段都套用相同样式。
        schema = {
            '@pins':   { type: 'textarea', rows: 10, placeholder: '每行一个引脚：<标签> [<port>]\n例：PA0 PA0\nVSS（无 port 可省略）' },
            '["af"]':      { type: 'textarea', rows: 10, placeholder: '每行：<PORT> <AF0> <AF1> ... <AF7>（空格分隔，- 表示无）\n例：PA0 - SPI1_SCK - - - - - -' },
            '["special"]': { type: 'textarea', rows: 6,  placeholder: '每行：<PORT> <功能1> <功能2> ...（空格分隔）\n例：PA0 ADC_IN0' }
        };
        return { data, schema };
    }

    // 把编辑器里的「文本形态」定义解析回 buildCustomDevice 需要的结构化定义
    function parseDeviceEditorText(def) {
        const out = JSON.parse(JSON.stringify(def));
        // 每个封装的 pins 文本 → 结构化 [{label,port}]
        if (Array.isArray(out.packages)) {
            out.packages.forEach(pkg => { if (typeof pkg.pins === 'string') pkg.pins = parsePinsText(pkg.pins); });
        }
        if (typeof out.af === 'string') out.af = parseAfText(out.af);
        if (typeof out.special === 'string') out.special = parseSpecialText(out.special);
        return out;
    }

    // 打开 MacWindow：内置 RichObjectEditor（预填骨架）+ 添加/删除设备操作
    function openDeviceEditorWindow(existingDef) {
        if (typeof MacWindow !== 'function' || typeof RichObjectEditor !== 'function') {
            alert('设备编辑器依赖 MacWindow / RichObjectEditor，未加载'); return;
        }
        // skeleton 形态：{ data, schema }；existingDef 为文本形态的结构化定义（编辑已有收藏时）
        let skeleton;
        if (existingDef) {
            const d = JSON.parse(JSON.stringify(existingDef));
            if (d.gpio && d.gpio.reset) {
                ['MODE', 'OTYPE', 'PUPD', 'AFL'].forEach(reg => {
                    const tbl = d.gpio.reset[reg];
                    if (tbl && typeof tbl === 'object') {
                        Object.keys(tbl).forEach(letter => {
                            const v = tbl[letter];
                            if (typeof v === 'number') {
                                tbl[letter] = '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
                            }
                        });
                    }
                });
            }
            skeleton = { data: d, schema: null };
        } else {
            skeleton = defaultDeviceSkeleton();
        }
        // 若 def 自带文本字段（pins/af/special 为字符串）但无 schema，补上默认文本 schema
        const editorSchema = skeleton.schema || {
            '@pins':   { type: 'textarea', rows: 10, placeholder: '每行一个引脚：<标签> [<port>]\n例：PA0 PA0\nVSS（无 port 可省略）' },
            '["af"]':      { type: 'textarea', rows: 10, placeholder: '每行：<PORT> <AF0> <AF1> ... <AF7>（空格分隔，- 表示无）\n例：PA0 - SPI1_SCK - - - - - -' },
            '["special"]': { type: 'textarea', rows: 6,  placeholder: '每行：<PORT> <功能1> <功能2> ...（空格分隔）\n例：PA0 ADC_IN0' }
        };

        const win = new MacWindow({
            title: existingDef ? ('编辑设备 · ' + (existingDef.name || '')) : '新建自定义设备',
            width: 560, height: 680, dark: true,
            parent: document.body, resizable: true
        });

        // 内容容器：上方 ROE（撑满），下方操作条
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; height:100%; min-height:0; background:#0f172a;';
        const roeHost = document.createElement('div');
        roeHost.style.cssText = 'flex:1; min-height:0;';
        const bar = document.createElement('div');
        bar.style.cssText = 'flex-shrink:0; display:flex; gap:8px; align-items:center; padding:10px 12px; background:#0f172a; border-top:1px solid #334155; flex-wrap:wrap;';

        // 自定义设备显式绑定的 SVD key：'__auto__' 表示按型号自动匹配
        let currentSvdKey = (existingDef && existingDef.svdKey) ? existingDef.svdKey : '__auto__';

        // SVD 选择下拉（含「自动匹配」选项）
        const svdSel = document.createElement('select');
        svdSel.style.cssText = 'background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:4px; padding:5px 8px; font-size:12px; flex:1; min-width:120px;';
        const refreshSvdSel = () => {
            const keys = (window.SvdLib && window.SvdLib.listSvdKeys) ? window.SvdLib.listSvdKeys() : [];
            svdSel.innerHTML = '';
            const auto = document.createElement('option');
            auto.value = '__auto__';
            auto.textContent = '自动匹配 (按型号)';
            svdSel.appendChild(auto);
            keys.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k + (window.SvdLib && window.SvdLib.isBuiltin(k) ? '（内置）' : ''); svdSel.appendChild(o); });
            // 若当前绑定不在列表且非自动，回退到自动
            svdSel.value = (currentSvdKey === '__auto__' || keys.indexOf(currentSvdKey) !== -1) ? currentSvdKey : '__auto__';
            if (svdSel.value === '__auto__') currentSvdKey = '__auto__';
        };
        refreshSvdSel();
        const svdHint = document.createElement('span');
        svdHint.style.cssText = 'font-size:11px; color:#94a3b8; flex-basis:100%;';
        const updateSvdHint = () => {
            if (currentSvdKey === '__auto__') {
                const hit = (window.SvdLib && window.SvdLib.resolveSvdKeyForDevice)
                    ? window.SvdLib.resolveSvdKeyForDevice({ name: (skeleton && skeleton.data && skeleton.data.name) || '' }) : '';
                svdHint.textContent = hit ? ('自动匹配将使用: ' + hit) : '自动匹配：当前型号未匹配到 SVD';
            } else {
                svdHint.textContent = '已显式绑定 SVD: ' + currentSvdKey;
            }
        };
        updateSvdHint();
        svdSel.addEventListener('change', () => {
            currentSvdKey = svdSel.value;
            updateSvdHint();
        });
        bar.appendChild(svdSel);
        bar.appendChild(svdHint);

        // 收藏夹下拉
        const favSel = document.createElement('select');
        favSel.style.cssText = 'background:#1e293b; color:#e2e8f0; border:1px solid #334155; border-radius:4px; padding:5px 8px; font-size:12px; flex:1; min-width:120px;';
        const refreshFavSel = () => {
            const favs = loadFavorites('mcu');
            favSel.innerHTML = '';
            const ph = document.createElement('option'); ph.value = ''; ph.textContent = '— 收藏夹设备 —'; favSel.appendChild(ph);
            Object.keys(favs).forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; favSel.appendChild(o); });
        };
        refreshFavSel();
        bar.appendChild(favSel);

        const mkBtn = (label, style, fn) => {
            const b = document.createElement('button');
            b.textContent = label;
            const base = 'padding:6px 12px; border:none; border-radius:5px; cursor:pointer; font-size:12px; color:#0f172a; font-weight:600;';
            const map = { primary: 'background:#0ea5e9;', secondary: 'background:#475569;color:#e2e8f0;', danger: 'background:#ef4444;color:#fff;', success: 'background:#10b981;' };
            b.style.cssText = base + (map[style] || map.secondary);
            b.onclick = fn;
            return b;
        };

        bar.appendChild(mkBtn('生成设备', 'primary', () => {
            const raw = editor.getObj();
            if (!raw || !raw.name) { alert('请填写设备名称（name）'); return; }
            if (!Array.isArray(raw.packages) || raw.packages.length === 0) { alert('请至少定义一个封装（packages）'); return; }
            // 把多行文本形态（每个 package 的 pins / 顶层 af/special 为字符串）解析回结构化定义再生成
            const def = parseDeviceEditorText(raw);
            def.svdKey = currentSvdKey;   // 显式绑定 SVD（'__auto__' 表示按型号自动匹配）
            const ids = nodeSystem.addCustomDeviceSet(def);
            if (ids && ids.length) {
                const total = def.packages.reduce((s, p) => s + (p.pins ? p.pins.length : 0), 0);
                nodeSystem.updateConnectionStatus('已生成自定义设备', '#38bdf8', `设备「${def.name}」已放置 ${ids.length} 个封装（共 ${total} 引脚）`);
            }
            try { editor.destroy(); } catch (e) {}
            win.destroy();
        }));
        bar.appendChild(mkBtn('存为收藏', 'success', () => {
            const def = editor.getObj();
            if (!def || !def.name) { alert('请填写设备名称（name）'); return; }
            def.svdKey = currentSvdKey;   // 显式绑定 SVD（'__auto__' 表示按型号自动匹配）
            def.kind = 'mcu';             // 设备编辑器定义一律归入 MCU 设备收藏夹
            const favs = loadFavorites('mcu');
            favs[def.name] = def; saveFavorites(favs, 'mcu');
            refreshFavSel();
            nodeSystem.updateConnectionStatus('已加入收藏', '#38bdf8', `设备「${def.name}」已存入收藏夹`);
        }));
        bar.appendChild(mkBtn('载入', 'secondary', () => {
            const name = favSel.value;
            if (!name) { alert('请先在收藏夹下拉选择设备'); return; }
            const def = loadFavorites('mcu')[name];
            if (!def) return;
            editor.setObj(JSON.parse(JSON.stringify(def)), editorSchema);
            // 同步该设备显式绑定的 SVD key
            currentSvdKey = (def && def.svdKey) ? def.svdKey : '__auto__';
            refreshSvdSel();
            updateSvdHint();
        }));
        bar.appendChild(mkBtn('删除收藏', 'danger', () => {
            const name = favSel.value;
            if (!name) { alert('请先在收藏夹下拉选择要删除的设备'); return; }
            confirmModal('删除收藏', `确定删除收藏「${name}」？此操作不可撤销。`, '删除', '取消').then(ok => {
                if (!ok) return;
                const favs = loadFavorites('mcu');
                delete favs[name]; saveFavorites(favs, 'mcu');
                refreshFavSel();
                nodeSystem.updateConnectionStatus('已删除收藏', '#f87171', `设备「${name}」已从收藏夹移除`);
            });
        }));
        bar.appendChild(mkBtn('载入示例', 'secondary', () => { editor.setObj(defaultDeviceSkeleton().data, editorSchema); }));

        wrap.appendChild(roeHost);
        wrap.appendChild(bar);
        win.setContent(wrap);

        // 编辑器（放到窗口关闭时一并销毁，避免泄漏）
        const editor = new RichObjectEditor(roeHost, { hideTypeBadge: false, hideAddRoot: false });
        editor.setObj(skeleton.data, editorSchema);
        // 默认展开根 / packages（含首个封装的 pins）/ af / special，方便直接查看
        editor.expandedPaths.add(JSON.stringify([]));
        editor.expandedPaths.add(JSON.stringify(['packages']));
        editor.expandedPaths.add(JSON.stringify(['packages', 0]));
        editor.expandedPaths.add(JSON.stringify(['packages', 0, 'pins']));
        editor.expandedPaths.add(JSON.stringify(['af']));
        editor.expandedPaths.add(JSON.stringify(['special']));
        editor.renderTree();

        const prevClose = win.onWindowClose;
        win.onWindowClose = () => { try { editor.destroy(); } catch (e) {} if (typeof prevClose === 'function') prevClose(win); };
    }

    function periMenuCfg() {
        const names = listPeripherals();
        // 收藏夹下拉：外设 tab 选择即放置；自定义器件 tab 仅回填文本框供编辑（不放置）
        const openFav = (id, value) => {
            if (!value) return;
            const def = loadFavorites('peripheral')[value];
            if (!def) return;
            const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['devdef'] : null;
            if (ta) ta.value = defToText(def);
            // 把右键菜单 JSON 也回填到 devmenu 文本框（选择与保存一致），避免重新编辑/生成时菜单内容丢失
            const dm = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['devmenu'] : null;
            if (dm) dm.value = (def.deviceMenu && typeof def.deviceMenu === 'string') ? def.deviceMenu : '';
            if (id === 'favPeri') { nodeSystem.addCustomDevice(def); nodeSystem.updateConnectionStatus('已放置收藏器件', '#38bdf8', `器件「${def.name}」已放置到画布（${def.pins.length} 引脚）`); } // 仅外设 tab 选择即放置
        };
        return {
            title: '外设与自定义器件',
            layout: 'tabs',
            onChange: (id, value) => {
                if (id === 'favPeri' || id === 'favCustom') openFav(id, value);
            },
            sections: [
                { key: 'peri', title: '【外设】', controls: [
                    { type: 'select', id: 'peri', label: '外设', value: names[0], options: names.map(n => ({ value: n, label: n })) },
                    { type: 'button', id: 'addPeri', label: '添加外设', onClick: () => { const n = dockMenu.menuControls['peri'].value; if (n) nodeSystem.addPeripheral(n); } },
                    { type: 'button', id: 'resetLock', label: '重置总线锁定', style: 'secondary',
                        onClick: () => { nodeSystem.busLocks = {}; nodeSystem.updateConnectionStatus('总线锁定已重置', '#38bdf8', '后续外设连线将高亮全部 SPI 实例的 IO'); } },
                    // 收藏夹也放在外设 tab：少一步切换，选择即放置
                    { type: 'select', id: 'favPeri', label: '收藏夹器件（选择即放置）', value: '', options: favOptions('peripheral') }
                ] },
                { key: 'custom', title: '【自定义器件】', controls: [
                    { type: 'textarea', id: 'devdef', label: '器件定义（第一行=名称 [封装] [接口名1] …；封装位写 conv=左右直通转换器，生成器件用 SOP 展示；接口名以 @ 开头=强制软件模拟，忽略 & 条件，可用于普通器件；后续每行=引脚 空格分隔 BUS IF）', rows: 8, span: 'full',
                      placeholder: '# 普通器件 + 强制软件模拟（@ 接口名可用于任意器件）：\nW25Q16 SOP @通用SPI_模拟\nCS GPIO_OUT\nMISO SPI MISO\nMOSI SPI MOSI\nCLK SPI SCK\nVDD\n\n# GPIO 输入变体（声明即置为输入模式，连 MCU 时两端自动带上/下拉）：\n#   GPIO_IN   输入（无上下拉）\n#   GPIO_INPU 输入 + 上拉\n#   GPIO_INPD 输入 + 下拉\n按键 KEY1 GPIO_INPU\n按键 KEY2 GPIO_INPD\n\n# 左右直通转换器（封装位 conv，左半=GPIO 接 MCU 普通 IO，右半=接口 接外设，pin 左右成对直通）：\nSPI模拟 conv @通用SPI_模拟\nSCK GPIO_OUT\nMOSI GPIO_OUT\nMISO GPIO_IN\nCS GPIO_OUT\nSCK SPI SCK\nMOSI SPI MOSI\nMISO SPI MISO\nCS SPI CS' },
                    // 右键菜单 JSON：留空=不使用弹出式菜单；用于定义滑块/按钮等“器件部分操作”，
                    // 方便直接调寄存器（如 PWM 占空比滑块 → TIMx.CCRn，最大值可引用 TIMx.ARR 动态变化）
                    { type: 'textarea', id: 'devmenu', label: '右键菜单 JSON（留空=不使用弹出式菜单）', rows: 6, span: 'full',
                      placeholder: '{\n  "ops": [\n    { "type":"slider", "label":"PWM 占空比", "register":"TIMx.CCRn", "min":0, "maxRegister":"TIMx.ARR", "width":16 }\n  ]\n}' },
                    { type: 'button', id: 'genCustom', label: '生成自定义器件', onClick: () => {
                        const ta = dockMenu.menuControls['devdef'];
                        const def = parseDeviceDef(ta ? ta.value : '');
                        if (!def || !def.name) { alert('请先填写器件名称（文本框第一行，可加空格分隔的 封装/接口名）'); return; }
                        const mt = dockMenu.menuControls['devmenu'];
                        let menuRaw = (mt && mt.value && mt.value.trim()) ? mt.value.trim() : null;
                        if (menuRaw) {
                            try { const p = JSON.parse(menuRaw); if (!Array.isArray(p) && !p.ops) throw new Error('缺少 ops 数组'); }
                            catch (err) { alert('右键菜单 JSON 解析失败：' + err.message); return; }
                        }
                        def.deviceMenu = menuRaw;
                        const newId = nodeSystem.addCustomDevice(def);
                        nodeSystem.updateConnectionStatus('已生成自定义器件', '#38bdf8', `器件「${def.name}」已放置到画布（${def.pins.length} 引脚）`);
                        // 生成后关闭 dock 菜单，露出画布上的新器件，避免“点了没反应”的错觉
                        closeDockMenu();
                    } },
                    { type: 'button', id: 'addFav', label: '添加到收藏夹', style: 'secondary', onClick: () => addFavoriteFromText() },
                    { type: 'select', id: 'favCustom', label: '收藏夹器件（选择即载入文本框，不放置）', value: '', options: favOptions('peripheral') },
                    { type: 'button', id: 'delFav', label: '删除选中收藏', style: 'danger', onClick: () => {
                        const sel = dockMenu.menuControls['favCustom'];
                        const name = sel ? sel.value : '';
                        if (!name) { alert('请先在「收藏夹器件」下拉中选择要删除的器件'); return; }
                        confirmModal('删除收藏', `确定删除收藏「${name}」？此操作不可撤销。`, '删除', '取消').then(ok => {
                            if (!ok) return;
                            const favs = loadFavorites('peripheral');
                            delete favs[name];
                            saveFavorites(favs, 'peripheral');
                            updateFavSelect();
                            nodeSystem.updateConnectionStatus('已删除收藏', '#f87171', `器件「${name}」已从收藏夹移除`);
                        });
                    } }
                ] }
            ]
        };
    }

    // ============ 自定义器件「右键菜单」：JSON 定义的操作（滑块/按钮）→ 直接写 SVD 寄存器 ============
    // JSON 形态（根对象含 ops 数组，或直接是数组）：
    //   { "ops": [ { "type":"slider", "label":"PWM 占空比", "register":"TIMx.CCRn", "min":0, "maxRegister":"TIMx.ARR", "width":16 },
    //               { "type":"button", "label":"复位ARR", "register":"TIMx.ARR", "value":999 } ] }
    // register 支持通配：TIMx.CCRn / TIMx_CHn（x=实例号占位，n=通道号占位），会从器件连接推导实际 TIM 实例与通道。
    // 通道比较寄存器统一解析为本 MCU 真名：TIMx.CCRn→TIMx.CCn、TIMx_CHn→TIMx.CCn（CIU32F003x5 的 TIM CCR 命名为 CC1~CC4）。

    // 在 SVD 数据里按 "外设.寄存器" 找回地址/复位值（用于写回 svdRegValues）
    function findSvdReg(regKey) {
        const db = window.getActiveSvdDb();
        if (!db || !db.menu) return null;
        const i = regKey.indexOf('.');
        if (i < 0) return null;
        const periName = regKey.slice(0, i), regName = regKey.slice(i + 1);
        const peri = db.menu.find(p => p.label === periName);
        if (!peri) return null;
        const reg = peri.registers.find(r => r.name === regName);
        if (!reg) return null;
        return { address: reg.address, reset: parseInt(reg.reset, 16) >>> 0, name: regKey, reg };
    }

    // 从器件的连接推导 TIM 实例号与通道号（扫描两端 TIMy_CHz 信号 / MCU 端 AF 标签）
    function findDeviceTimChannel(node) {
        if (!nodeSystem.connections) return null;
        const trySig = (sig) => { const m = /TIM(\d+)_CH(\d+)/i.exec(sig || ''); return m ? { instanceNum: m[1], channelNum: m[2] } : null; };
        for (const conn of nodeSystem.connections) {
            let other = null, thisEnd = null;
            if (conn.source.nodeId === node.nodeId) { other = conn.target; thisEnd = conn.source; }
            else if (conn.target.nodeId === node.nodeId) { other = conn.source; thisEnd = conn.target; }
            else continue;
            const onode = nodeSystem.nodes.get(other.nodeId);
            if (!onode) continue;
            // MCU 端（对端）AF 标签 / pad signal
            if (typeof onode.getAF === 'function') { const fn = onode.getAF(other.port, other.index); const r = trySig(fn && fn.label); if (r) return r; }
            if (typeof onode.getPadSignal === 'function') { const r = trySig(onode.getPadSignal(other.port, other.index)); if (r) return r; }
            // 自定义器件自身脚 signal（若声明了具体 TIM1_CH1）
            if (thisEnd && typeof node.getPadSignal === 'function') { const r = trySig(node.getPadSignal(thisEnd.port, thisEnd.index)); if (r) return r; }
        }
        return null;
    }

    // 判断某 op 是否需要「已连接 TIM」才能解析：register / maxRegister 含 TIMx 通配（实例占位 x）
    // 例：TIMx.CCRn / TIMx.ARR / TIMx_CHn 需连接；TIM1.CC1 / CAN / BDTR 等具体名不需要
    function opNeedsConnection(op) {
        const r = (op.register || '').toString();
        const mr = (op.maxRegister || '').toString();
        // 通配占位符只认小写 x（TIMX 中的大写 X 不算通配），故用 /TIM[x]/（不含 i，避免 X 也被当通配）
        return /TIM[x]/.test(r) || /TIM[x]/.test(mr);
    }

    // 解析寄存器名：具体名直接用；含小写 x/n 通配时从连接推导实例/通道号替换
    function resolveRegSpec(spec, node) {
        if (!spec) return null;
        spec = String(spec).trim();
        // TIMx_CHn 写法归一为 TIMx.CCn（CH + 数字 → CC + 数字）。
        // 注：本 MCU（CIU32F003x5）的 TIM 通道比较寄存器真名为 CC1~CC4（非 CCR1），故统一归到 CC。
        // 通配占位符只认小写 x / n：寄存器名通常全大写，避免误伤（如 CAN 中的大写 N、TIMX 中的大写 X）。
        spec = spec.replace(/TIM([x\d]+)_CH([xn\d]+)/g, (m, inst, ch) => 'TIM' + inst + '.CC' + ch);
        // 通配/手写的 CCR 通道比较寄存器统一归一到本 MCU 真名 CC
        // （如 TIMx.CCRn → TIMx.CCn、TIM1.CCR1 → TIM1.CC1），避免查不到真寄存器。
        spec = spec.replace(/\.CCR([xn\d]+)/g, (m, ch) => '.CC' + ch);
        if (!/[xn]/.test(spec)) return spec; // 已是具体寄存器名（无小写 x/n 通配占位符）
        const tc = findDeviceTimChannel(node);
        if (!tc) return null; // 无法解析通配（器件未连到 TIM）
        return spec.replace(/x/g, tc.instanceNum).replace(/n/g, tc.channelNum);
    }

    // 写入单个寄存器到 svdRegValues（按 svdKey 命名空间），并实时刷新 SVD 窗口
    function writeSvdReg(key, v, info, svdKey) {
        v = v >>> 0;
        svdKey = svdKey || editorSvdKey();
        const map = svdValsMap(svdKey);
        if (v !== (info.reset >>> 0)) {
            map[key] = { id: key, address: info.address, name: key, reset: info.reset, value: v };
        } else {
            delete map[key];
        }
        persistSvd();
        nodeSystem.triggerCallback('onRegistersChanged', { ids: [key], reason: 'device-menu' });
    }

    // 右键自定义器件节点：弹出 JSON 定义的操作菜单（RichMenu context），滑块即时写寄存器
    function openCustomDeviceMenu(e, node) {
        const raw = node.config && node.config.deviceMenu;
        if (!raw) return; // 无菜单 → 事件冒泡给画布平移（等同“不使用弹出式菜单”）
        let parsed;
        try { parsed = JSON.parse(raw); } catch (err) { alert('右键菜单 JSON 解析失败：' + err.message); return; }
        const ops = Array.isArray(parsed) ? parsed : (parsed.ops || []);
        if (!ops.length) { alert('右键菜单 JSON 中未找到 ops 操作'); return; }
        e.preventDefault(); e.stopPropagation();
        const controls = [];
        const regMap = {};
        ops.forEach((op, idx) => {
            const cid = 'op' + idx;
            const connected = !!findDeviceTimChannel(node);
            const needsConn = opNeedsConnection(op);
            if (op.type === 'slider') {
                // 需连接 TIM 但未连线：灰禁滑块（不再用 heading 占位）
                if (needsConn && !connected) {
                    controls.push({ type: 'range', id: cid, label: (op.label || op.register) + '  ［未连接 TIM · 已禁用］', min: 0, max: 100, step: 1, value: 0, disabled: true });
                    return;
                }
                const key = resolveRegSpec(op.register, node);
                if (!key) { controls.push({ type: 'heading', label: (op.label || op.register) + '：无法解析（请写具体寄存器名，如 TIM1.CCR1）' }); return; }
                const info = findSvdReg(key);
                if (!info) { controls.push({ type: 'heading', label: (op.label || key) + '：未找到寄存器 ' + key }); return; }
                const reset = info.reset >>> 0;
                const cur = getSvdRegVal(getNodeSvdKey(node), key, reset);
                let max = (op.max != null) ? Number(op.max) : ((1 << (op.width || 16)) - 1);
                if (op.maxRegister) {
                    const mk = resolveRegSpec(op.maxRegister, node);
                    const mi = mk && findSvdReg(mk);
                    if (mi) {
                        const mv = getSvdRegVal(getNodeSvdKey(node), mk, mi.reset >>> 0);
                        // 寄存器值为 0（如 TIMx.ARR 复位未配置 PWM 周期）→ 不把 max 压成 0，否则滑块卡死；
                        // 保留默认（op.max 或位宽满量程），待 ARR 配好后再打开菜单即自动跟随该值。
                        if (mv > 0) max = Number(mv);
                    }
                }
                const min = (op.min != null) ? Number(op.min) : 0;
                const step = (op.step != null) ? Number(op.step) : 1;
                const val = Math.min(Math.max(cur, min), max);
                controls.push({ type: 'range', id: cid, label: (op.label || key) + '  [' + key + ']', min: min, max: max, step: step, value: val });
                regMap[cid] = { key, width: op.width || 16, min, max, regInfo: info };
            } else if (op.type === 'button') {
                // 需连接 TIM 但未连线：灰禁按钮
                if (needsConn && !connected) {
                    controls.push({ type: 'button', id: cid, label: (op.label || op.register) + '  ［未连接 TIM · 已禁用］', style: op.style || 'secondary', disabled: true });
                    return;
                }
                const key = resolveRegSpec(op.register, node);
                const info = key && findSvdReg(key);
                controls.push({ type: 'button', id: cid, label: op.label || (key || op.register), style: op.style || 'secondary',
                    onClick: () => {
                        if (!key || !info) { alert('按钮寄存器无效：' + (op.register || '')); return; }
                        const v = (op.value != null) ? Number(op.value) : info.reset;
                        writeSvdReg(key, v, info, getNodeSvdKey(node));
                    } });
            } else {
                controls.push({ type: 'heading', label: '未知操作类型：' + (op.type || '?') });
            }
        });
        const menu = new RichMenu({
            mode: 'context', layout: 'vertical',
            title: (node.config.name || '自定义器件') + ' · 器件操作',
            width: 360, showFooter: true,
            sections: [{ title: '操作（改动实时写入 SVD 寄存器）', controls }],
            buttons: [{ type: 'cancel', label: '关闭' }]
        });
        menu.onCancel(() => menu.hide());
        menu.onChange((id, value) => {
            const m = regMap[id];
            if (m) { let v = Number(value); v = Math.min(Math.max(v, m.min), m.max); writeSvdReg(m.key, v, m.regInfo, getNodeSvdKey(node)); }
        });
        menu.show(e.clientX, e.clientY);
    }

    function canvasMenuCfg() {
        return {
            title: '画布与节点',
            onChange: (id, value) => {
                if (id === 'lineColor') nodeSystem.updateLineConfig(value, undefined);
                else if (id === 'lineWidth') nodeSystem.updateLineConfig(undefined, parseInt(value));
                else if (id === 'glow') {
                    if (nodeSystem.highlightedNode) {
                        const i = parseInt(value) / 10;
                        nodeSystem.highlightedNode.style.filter = `drop-shadow(0 0 ${15 + i * 10}px rgba(0, 255, 100, ${0.5 + i * 0.3}))`;
                    }
                } else if (id === 'hideDel') {
                    nodeSystem.toggleDeleteButtons(value);
                }
            },
            sections: [
                { title: '连线样式', controls: [
                    { type: 'color', id: 'lineColor', label: '连接线颜色', value: '#00dbde' },
                    { type: 'range', id: 'lineWidth', label: '连接线宽度', min: 1, max: 8, value: 3 },
                    { type: 'range', id: 'glow', label: '高亮强度', min: 1, max: 10, value: 5 },
                    { type: 'checkbox', id: 'hideDel', label: '隐藏删除按钮' }
                ] },
                { title: '节点', controls: [
                    { type: 'button', id: 'addNode', label: '添加新节点', onClick: () => nodeSystem.addNewNode() },
                    { type: 'button', id: 'delSel', label: '删除选中节点', onClick: () => nodeSystem.deleteSelectedNodes() },
                    { type: 'button', id: 'clearConn', label: '清除所有连接', style: 'danger', onClick: () => nodeSystem.clearAllConnections() },
                    { type: 'button', id: 'resetNodes', label: '重置节点位置', onClick: () => nodeSystem.resetNodes() }
                ] },
                { title: '保存 / 加载', controls: [
                    { type: 'button', id: 'saveJson', label: '保存为 JSON', onClick: () => nodeSystem.saveAsJSON() },
                    { type: 'button', id: 'loadJson', label: '加载 JSON', onClick: () => fileInput.click() }
                ] }
            ]
        };
    }

    function configMenuCfg() {
        return {
            title: '配置',
            onChange: (id, value) => {
                if (id === 'svdSelect' && value) {
                    window.SvdLib.setActiveSvdKey(value);
                    const k = window.SvdLib.getActiveSvdKey();
                    nodeSystem.updateConnectionStatus('已切换 SVD', '#38bdf8', '当前 SVD：' + k);
                    // 若 SVD 寄存器编辑器已打开，用新库重建
                    if (window.__svdWin && document.body.contains(window.__svdWin.windowElement) && window.__svdEditor) {
                        const tEl = window.__svdWin.windowElement.querySelector('.macwindow-title, .title, .title-bar .title');
                        if (tEl) tEl.textContent = 'SVD 寄存器编辑器 · ' + (k || '');
                        applySvdModel(window.__svdEditor);
                    }
                }
            },
            sections: [
                { title: '器件收藏夹', controls: [
                    { type: 'button', id: 'loadFav', label: '加载收藏夹', onClick: () => favFileInput.click() },
                    { type: 'button', id: 'saveFav', label: '导出收藏夹', style: 'secondary', onClick: exportFavorites }
                ] },
                { title: '全局工作区（导出/导入整个工作区）', controls: [
                    { type: 'button', id: 'importWorkspace', label: '导入全局配置', onClick: () => workspaceFileInput.click() },
                    { type: 'button', id: 'exportWorkspace', label: '导出全局配置', style: 'success', onClick: () => window.exportWorkspace('workspace.json') },
                    { type: 'heading', label: '包含：应用配置面板、MCU/外设收藏夹、接口初始化/函数面板、SVD 寄存器改动、用户 SVD 库与当前激活型号——相当于导出整个工作区。', span: 'full' }
                ] },
                { title: '应用配置（本地存储 · config.json 仅导入导出）', controls: [
                    { type: 'button', id: 'loadCfg', label: '导入 config.json', onClick: () => configFileInput.click() },
                    { type: 'button', id: 'saveCfg', label: '导出 config.json', style: 'secondary', onClick: () => window.exportAppConfig('config.json') },
                    { type: 'button', id: 'resetCfg', label: '重置为默认', style: 'danger', onClick: async () => {
                        const ok = await confirmModal('重置配置', '将清除本地存储的配置（localStorage），恢复为默认基础库。确定继续？', '重置', '取消');
                        if (ok && window.resetAppConfig) window.resetAppConfig();
                    } }
                ] },
                { title: 'SVD 配置', controls: [
                    { type: 'select', id: 'svdSelect', label: '当前 SVD', value: window.SvdLib.getActiveSvdKey(), options: svdOptions() },
                    { type: 'button', id: 'exportSvd', label: '导出 SVD JSON', onClick: exportActiveSvd },
                    { type: 'button', id: 'importSvdJson', label: '导入 SVD JSON', style: 'secondary', onClick: () => svdJsonFileInput.click() },
                    { type: 'button', id: 'importSvdFiles', label: '导入 SVD/SFD 文件', style: 'secondary', onClick: () => svdFilesInput.click() },
                    { type: 'button', id: 'deleteSvd', label: '删除当前 SVD', style: 'danger', onClick: deleteActiveSvd }
                ] }
            ]
        };
    }

    // 当前已加载的 SVD 列表（内置标记）
    function svdOptions() {
        return window.SvdLib.listSvdKeys().map(k => ({
            value: k,
            label: k + (window.SvdLib.isBuiltin(k) ? '（内置）' : '')
        }));
    }

    // 导出当前 SVD 为 JSON 文件
    function exportActiveSvd() {
        const key = window.SvdLib.getActiveSvdKey();
        const db = window.SvdLib.getSvdDb(key);
        if (!db) { alert('当前无可用 SVD'); return; }
        const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = (key || 'svd') + '.json';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    }

    // 删除当前 SVD（内置不可删）
    function deleteActiveSvd() {
        const key = window.SvdLib.getActiveSvdKey();
        if (!key) return;
        if (window.SvdLib.isBuiltin(key)) { alert('内置 SVD（' + key + '）不可删除'); return; }
        if (!confirm('确定删除 SVD「' + key + '」？此操作不可撤销。')) return;
        window.SvdLib.deleteSvd(key);
        nodeSystem.updateConnectionStatus('已删除 SVD', '#f87171', '已删除：' + key);
    }

    // ============ 自定义器件定义 + 收藏夹（localStorage 持久化） ============
    // 自定义 MCU 设备（ROE 编辑器定义，含 gpio/packages）与自定义外设（文本框定义）使用不同收藏夹，
    // 互不可见、不可混用（主设备与从设备不能混）。
    const FAV_KEY = 'pinDeviceFavorites';           // MCU 自定义设备
    const FAV_KEY_PERI = 'pinPeripheralFavorites';  // 自定义外设（文本框定义）

    // 解析文本框 → 器件定义。
    // 第一行=名称（可空格分隔多栏）：[名称] [封装] [接口名1] [接口名2] [接口名3] ...
    //   · 名称       必填，第 1 个 token（如 W25Q16）
    //   · 封装       可选，第 2 个 token；仅当它为已知封装类型（SOP/QFN/LQFP…）时视为封装，
    //                 否则第 2 个 token 起一律视为接口名（便于省略封装直接写接口）。
    //   · 接口名     可选，第 2 个 token 之后所有 token（可多个）——均为「自定义接口初始化参数」里的接口管理名；
    //                 填了代表该器件优先匹配这些接口（适配同个物理接口多种不同配置），不填则保留原有按引脚信号匹配逻辑。
    //                 多接口同时声明：连接后逐一匹配，可同时命中多个接口的程序段/初始化段。
    // 后续每行=引脚。引脚格式（空格分隔，共三栏）：
    //   第 1 栏 引脚名（可含 “/” 内联特殊功能，如 PC0/NRST → 名称 PC0、特殊功能 NRST）
    //   第 2~3 栏 [BUS SIGNAL]  总线类引脚（参与高亮，bus/signal 大写）；第 2 段须为已知总线前缀
    //   第 4 栏起 [特殊功能 …]   IO 特殊功能（可多个，空格分隔，如 ADC_IN3 / GPIO_OUT / NRST / EXTCLK）
    //                         与外设（模拟输入 / GPIO 输出等）连线时按功能名高亮匹配
    //   电源关键字（VDD/VSS/VCC/GND/VBAT/NC，且为单段无特殊功能）→ 电源脚
    // 示例：
    //   W25Q16 SOP 通用SPI 通用SPI2   → 名称 W25Q16，封装 SOP，接口 [通用SPI, 通用SPI2]
    //   W25Q16 通用SPI 通用SPI2        → 名称 W25Q16，无封装，接口 [通用SPI, 通用SPI2]
    //   PA6 ADC_IN3                    → 名称 PA6，特殊功能 ADC_IN3
    //   PC0/NRST                      → 名称 PC0，特殊功能 NRST
    //   SCK SPI SCK                   → 总线脚 SPI/SCK
    //   MOSI SPI MOSI ADC_IN7         → 总线脚 SPI/MOSI，且具特殊功能 ADC_IN7
    // 已知总线前缀正则已收编进 config（window.APP_SIGNAL_CONFIG.knownBusRe），运行时动态读取。
    const POWER_RE = /^(VDD|VSS|VCC|GND|VBAT|NC)$/i;
    // 已知封装类型：第 1 行第 2 个 token 命中才视为“封装”，否则当作接口名（以支持省略封装）
    const KNOWN_PKG = /^(SOP|DIP|QFN|LQFP|TSSOP|SOIC|BGA|QFP|PLCC|DFN|MSOP|SOT\d*|TO\d*|TSOP|SSOP|VQFN|HVQFN)$/i;
    function parseDeviceDef(text) {
        const lines = (text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
        if (!lines.length) return null;
        // 第一行：名称 [封装] [接口名1] [接口名2] ... —— 空格分隔。
        // 封装可选：仅当第 2 个 token 是已知封装类型时取为 pkg，否则该 token 起全部视为接口名。
        const head = lines[0].split(/\s+/).filter(Boolean);
        const name = head[0] || '';
        const rest = head.slice(1);
        let pkg = null;
        let converter = false;
        let ifaces = [];
        if (rest.length) {
            // 封装位为 'conv' → 标记为“左右直通转换器”，生成器件用 SOP 展示（如 “名称 conv @接口名1”）。
            // 'conv' 仅作标识，不视为真实封装；其后所有 token 视为接口名。
            // 注：是否转换器只由 'conv' 决定；'@' 前缀接口名（强制软件模拟）可出现在普通器件上，不再隐含转换器身份。
            if (rest[0].toUpperCase() === 'CONV') { converter = true; pkg = 'conv'; ifaces = rest.slice(1); }
            else if (KNOWN_PKG.test(rest[0])) { pkg = rest[0]; ifaces = rest.slice(1); }
            else { ifaces = rest; }
        }
        const iface = ifaces.length ? ifaces : null;
        // '@' 前缀接口名（如 @通用SPI_模拟）=「强制软件模拟接口」：必定使用对应软件模拟程序段、忽略 & 条件。
        // 可用于普通器件或 conv 转换器；转换器身份只由 'conv' 封装位决定（见上方）。
        const pins = [];
        for (let i = 1; i < lines.length; i++) {
            const toks = lines[i].split(/\s+/);
            let label = toks[0];
            if (!label) continue;
            // 名称内 “/” 内联特殊功能：PC0/NRST → 名称 PC0、特殊功能 NRST（可多个：PC0/NRST/XXX）
            let inline = [];
            const slash = label.split('/');
            if (slash.length > 1) {
                label = slash[0];
                inline = slash.slice(1).map(t => String(t).toUpperCase());
            }
            const rest = toks.slice(1);
            const funcs = inline.slice();
            const pin = { label: label };
            let isBus = false;
            if (rest.length >= 2 && window.APP_SIGNAL_CONFIG.knownBusRe.test(rest[0])) {
                // 总线脚：第 2 段=BUS，第 3 段=SIGNAL，其后所有段视为 IO 特殊功能
                pin.bus = String(rest[0]).toUpperCase();
                pin.signal = String(rest[1]).toUpperCase();
                isBus = true;
                if (rest.length > 2) funcs.push(...rest.slice(2).map(t => String(t).toUpperCase()));
            } else {
                // 其余所有段均为 IO 特殊功能（可多个）
                funcs.push(...rest.map(t => String(t).toUpperCase()));
            }
            if (funcs.length) pin.functions = funcs;
            // 电源脚：仅单段且为电源关键字、无任何总线/特殊功能时
            if (!isBus && !funcs.length && POWER_RE.test(label)) pin.power = true;
            pins.push(pin);
        }
        return { name: name, pkg: pkg, iface: iface, converter: converter || undefined, pins: pins };
    }

    // 器件定义 → 文本框文本（用于回填编辑）。首行 = 名称 [封装] [接口名1] [接口名2] ...
    function defToText(def) {
        if (!def) return '';
        const head = [];
        if (def.name) head.push(def.name);
        if (def.pkg) head.push(def.pkg);
        if (def.iface) {
            if (Array.isArray(def.iface)) head.push(...def.iface);
            else head.push(def.iface);
        }
        const lines = [head.join(' ')];
        (def.pins || []).forEach(p => {
            if (p.power) lines.push(p.label);
            else if (p.bus && p.signal) {
                const extra = (p.functions && p.functions.length) ? ' ' + p.functions.join(' ') : '';
                lines.push(`${p.label} ${p.bus} ${p.signal}${extra}`);
            } else if (p.functions && p.functions.length) lines.push(`${p.label} ${p.functions.join(' ')}`);
            else lines.push(p.label);
        });
        return lines.join('\n');
    }

    // kind: 'mcu'（自定义 MCU 设备）/ 'peripheral'（自定义外设）/ 缺省视为 'mcu'
    function favKeyFor(kind) { return kind === 'peripheral' ? FAV_KEY_PERI : FAV_KEY; }
    function loadFavorites(kind) {
        try { return JSON.parse(localStorage.getItem(favKeyFor(kind)) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function saveFavorites(obj, kind) {
        try { localStorage.setItem(favKeyFor(kind), JSON.stringify(obj)); } catch (e) {}
    }
    // 旧版本只有一个混合收藏夹（pinDeviceFavorites）。启动时按定义结构把条目分流到两个独立收藏夹：
    //   · 含 packages/gpio → MCU 设备；否则 → 外设。已带 kind 的跳过。仅执行一次。
    function migrateFavorites() {
        const raw = (() => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '{}') || {}; } catch (e) { return {}; } })();
        if (!Object.keys(raw).length) return;
        const mcu = {}, peri = {};
        Object.keys(raw).forEach(n => {
            const d = raw[n];
            if (!d || typeof d !== 'object') { mcu[n] = d; return; }
            if (d.kind === 'peripheral') peri[n] = d;
            else if (d.kind === 'mcu') mcu[n] = d;
            else if (d.packages || d.gpio) { d.kind = 'mcu'; mcu[n] = d; }
            else { d.kind = 'peripheral'; peri[n] = d; }
        });
        try {
            localStorage.setItem(FAV_KEY, JSON.stringify(mcu));
            localStorage.setItem(FAV_KEY_PERI, JSON.stringify(peri));
        } catch (e) {}
    }
    // 内置示例：SOP20 自定义器件（带 IO 附加功能：ADC_INx / NRST / EXTCLK），
    // 用于演示“模拟输入 / GPIO 输出 外设”按附加功能高亮。首次无收藏时自动种入（归入外设收藏夹）。
    const SOP20_DEF_TEXT = [
        'SOP20',
        'PA5',
        'PA6 ADC_IN3',
        'PA7 ADC_IN4',
        'PC0/NRST',
        'PC1 EXTCLK',
        'PB7',
        'VSS',
        'PB6 ADC_IN6',
        'VDD',
        'PB5',
        'PB4',
        'PB3 ADC_IN5',
        'PB2',
        'PB1 ADC_IN0',
        'PB0 ADC_IN7',
        'PA0',
        'PA1',
        'PA2',
        'PA3 ADC_IN1',
        'PA4 ADC_IN2'
    ].join('\n');
    function seedDefaultFavorites() {
        // 内置示例 SOP20 始终以最新定义覆盖（确保“/”内联特殊功能等解析规则生效），不影响用户自建收藏。
        const favs = loadFavorites('peripheral');
        const def = parseDeviceDef(SOP20_DEF_TEXT);
        if (def) { def.kind = 'peripheral'; favs['SOP20'] = def; saveFavorites(favs, 'peripheral'); }
    }
    function favOptions(kind) {
        seedDefaultFavorites();
        const favs = loadFavorites(kind);
        const opts = [{ value: '', label: '— 选择收藏夹器件 —' }];
        Object.keys(favs).forEach(n => opts.push({ value: n, label: n }));
        return opts;
    }
    // 动态刷新收藏夹下拉（外设 / 自定义器件 两个 tab 各一份，均为外设收藏夹）
    function updateFavSelect() {
        if (!dockMenu || !dockMenu.menuControls) return;
        ['favPeri', 'favCustom'].forEach(id => {
            const sel = dockMenu.menuControls[id];
            if (!sel || !sel.appendChild) return;
            const opts = favOptions('peripheral');
            sel.innerHTML = '';
            opts.forEach(o => {
                const op = document.createElement('option');
                op.value = o.value; op.textContent = o.label;
                sel.appendChild(op);
            });
        });
    }
    // 供 config.js 的 importAppConfigObject 刷新界面（收藏夹下拉）
    window.refreshFavUI = function () { updateFavSelect(); };
    // 供 config.js 的 importAppConfigObject 在导入后重新分流收藏夹
    window.migrateFavorites = migrateFavorites;
    // 供 config.js 的 exportAppConfig 收集用户态（MCU 设备收藏夹 + 外设收藏夹，分开导出）
    window.buildUserConfig = function () {
        return { favorites: loadFavorites('mcu'), peripheralFavorites: loadFavorites('peripheral') };
    };
    // ============ 全局工作区导出/导入：打包所有本地持久化配置（面板 + 收藏 + SVD + 接口等） ============
    // 收集当前整个工作区的所有本地存储配置，返回一个结构化对象。
    function grabLS(key) { try { const s = localStorage.getItem(key); return s == null ? null : JSON.parse(s); } catch (e) { return null; } }
    function grabLSRaw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    window.collectWorkspace = function () {
        return {
            _workspace: true,
            _version: 1,
            appConfigOverlay: grabLS('pinAppConfigOverlay'),     // 应用配置叠加层（IO 功能库等）
            mcuFavorites: loadFavorites('mcu'),                   // 自定义 MCU 设备收藏夹
            peripheralFavorites: loadFavorites('peripheral'),     // 自定义外设收藏夹
            interfaceInits: grabLS('interfaceInits'),             // 接口初始化参数面板
            interfaceFunctions: grabLS('interfaceFunctions'),     // 接口函数定义面板
            svdRegValues: grabLS('svdRegValues'),                 // SVD 寄存器改动值
            svdLibrary: (window.SvdLib && window.SvdLib.getLibSnapshot) ? window.SvdLib.getLibSnapshot() : grabLS('svdLibrary'), // 用户导入的 SVD 库（可能存于 IndexedDB）
            svdActiveKey: grabLSRaw(window.SvdLib && window.SvdLib.LS_ACTIVE ? window.SvdLib.LS_ACTIVE : 'svdActiveKey') // 当前激活 SVD
        };
    };
    // 应用（导入）整个工作区配置：写回各 localStorage 键，并就地刷新相关模块（不强制刷新页面）。
    window.applyWorkspace = function (obj) {
        if (!obj || typeof obj !== 'object') return false;
        const putLS = (k, v) => { if (v != null) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} } };
        const LS_LIB = (window.SvdLib && window.SvdLib.LS_LIB) || 'svdLibrary';
        const LS_ACTIVE = (window.SvdLib && window.SvdLib.LS_ACTIVE) || 'svdActiveKey';
        putLS('pinAppConfigOverlay', obj.appConfigOverlay);
        putLS('pinDeviceFavorites', obj.mcuFavorites);
        putLS('pinPeripheralFavorites', obj.peripheralFavorites);
        putLS('interfaceInits', obj.interfaceInits);
        putLS('interfaceFunctions', obj.interfaceFunctions);
        putLS('svdRegValues', obj.svdRegValues);
        // SVD 库走 SvdLib 存储层（localStorage 不够时自动落 IndexedDB），不直接写 localStorage
        if (obj.svdLibrary != null && window.SvdLib && typeof window.SvdLib.setLibSnapshot === 'function') {
            window.SvdLib.setLibSnapshot(obj.svdLibrary);
        }
        if (obj.svdActiveKey != null) putLS(LS_ACTIVE, obj.svdActiveKey);
        // 重新分流收藏夹（兼容旧混合格式）
        if (window.migrateFavorites) window.migrateFavorites();
        // 用户 SVD 库重新合并进全局寄存器库（setLibSnapshot 已写入内存+合并；此处再合并一次确保幂等）
        if (window.SvdLib && typeof window.SvdLib.mergeFromMem === 'function') window.SvdLib.mergeFromMem();
        // 接口面板 / 收藏夹 UI 重新从 localStorage 读取
        if (typeof nodeSystem !== 'undefined' && nodeSystem) {
            if (nodeSystem.loadInterfaceInits) nodeSystem.loadInterfaceInits();
            if (nodeSystem.loadInterfaceFunctions) nodeSystem.loadInterfaceFunctions();
        }
        if (window.refreshFavUI) window.refreshFavUI();
        return true;
    };
    // 导出整个工作区为 JSON 文件
    window.exportWorkspace = function (filename) {
        const data = window.collectWorkspace();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename || 'workspace.json';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
        if (typeof nodeSystem !== 'undefined' && nodeSystem && nodeSystem.updateConnectionStatus) {
            nodeSystem.updateConnectionStatus('已导出工作区', '#38bdf8', '整个工作区配置已导出为 ' + (filename || 'workspace.json'));
        }
    };
    // 模态确认框（挂在 dock 菜单面板内部，避免点击按钮导致菜单被“外部点击关闭”）。返回 Promise<boolean>。
    function confirmModal(title, message, confirmLabel, cancelLabel) {
        return new Promise((resolve) => {
            let overlay = document.getElementById('fsModalOverlay');
            if (overlay) overlay.remove();
            overlay = document.createElement('div');
            overlay.id = 'fsModalOverlay';
            // 优先挂在 dock 菜单面板内部：点按钮时 e.target 仍在面板内 → 菜单不会被外部点击关闭。
            // 面板为 position:fixed（transform 不影响 absolute 的包含块），用 absolute;inset:0 限制在菜单范围内。
            const host = (dockMenu && dockMenu.element) ? dockMenu.element : document.body;
            const insideMenu = host !== document.body;
            overlay.style.cssText = (insideMenu ? 'position:absolute;inset:0;' : 'position:fixed;inset:0;') +
                'background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;' +
                'font-family:system-ui,-apple-system,sans-serif;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#1e293b;border:1px solid #475569;border-radius:10px;padding:20px;width:calc(100% - 32px);max-width:340px;max-height:calc(100% - 32px);overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);';
            const h = document.createElement('div');
            h.textContent = title;
            h.style.cssText = 'color:#38bdf8;font-size:15px;font-weight:600;margin-bottom:10px;';
            const msg = document.createElement('div');
            msg.textContent = message;
            msg.style.cssText = 'color:#e2e8f0;font-size:13px;line-height:1.6;margin-bottom:18px;white-space:pre-wrap;';
            const btns = document.createElement('div');
            btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = cancelLabel || '取消';
            cancelBtn.style.cssText = 'padding:7px 14px;border:1px solid #475569;background:transparent;color:#cbd5e1;border-radius:6px;cursor:pointer;font-size:13px;';
            const okBtn = document.createElement('button');
            okBtn.textContent = confirmLabel || '确定';
            okBtn.style.cssText = 'padding:7px 14px;border:none;background:#38bdf8;color:#0f172a;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;';
            btns.appendChild(cancelBtn); btns.appendChild(okBtn);
            box.appendChild(h); box.appendChild(msg); box.appendChild(btns);
            overlay.appendChild(box);
            host.appendChild(overlay);
            const onKey = (e) => {
                if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
            };
            const finish = (res) => {
                if (overlay.parentNode) overlay.remove();
                document.removeEventListener('keydown', onKey, true);
                resolve(res);
            };
            // 阻止 mousedown 冒泡到 document（dock 菜单的“外部点击关闭”判断），确保菜单保持打开
            overlay.addEventListener('mousedown', (e) => e.stopPropagation());
            cancelBtn.onclick = () => finish(false);
            okBtn.onclick = () => finish(true);
            overlay.onclick = (e) => { if (e.target === overlay) finish(false); };
            // 捕获阶段拦截，避免 ESC 触发 dock 菜单自身的关闭
            document.addEventListener('keydown', onKey, true);
        });
    }
    function addFavoriteFromText() {
        const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['devdef'] : null;
        const text = ta ? ta.value : '';
        const def = parseDeviceDef(text);
        if (!def || !def.name) { alert('请先填写器件名称（文本框第一行）'); return; }
        // 一并捕获右键菜单 JSON（与 genCustom 一致），写入收藏，避免“菜单内容丢失”
        const mt = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['devmenu'] : null;
        let menuRaw = (mt && mt.value && mt.value.trim()) ? mt.value.trim() : null;
        if (menuRaw) {
            try { const p = JSON.parse(menuRaw); if (!Array.isArray(p) && !p.ops) throw new Error('缺少 ops 数组'); }
            catch (err) { alert('右键菜单 JSON 解析失败：' + err.message); return; }
        }
        def.deviceMenu = menuRaw;
        def.kind = 'peripheral';   // 文本框定义一律归入外设收藏夹
        const favs = loadFavorites('peripheral');
        if (favs[def.name]) {
            // 同名覆盖：用全屏模态确认（替代原生 confirm）
            confirmModal('覆盖收藏', `已存在同名收藏「${def.name}」，是否覆盖？\n确定将用当前定义替换原收藏；取消则不操作。`, '覆盖', '取消').then(ok => {
                if (!ok) return;
                favs[def.name] = def;
                saveFavorites(favs, 'peripheral');
                updateFavSelect();
                nodeSystem.updateConnectionStatus('已覆盖收藏', '#38bdf8', `器件「${def.name}」已更新（${def.pins.length} 引脚）`);
            });
            return;
        }
        favs[def.name] = def;
        saveFavorites(favs, 'peripheral');
        updateFavSelect();
        nodeSystem.updateConnectionStatus('已添加到收藏夹', '#38bdf8', `器件「${def.name}」已保存（${def.pins.length} 引脚）`);
    }
    // 导出收藏夹为 JSON 文件（这里导出「外设」收藏夹；MCU 设备随 config.json 导出）
    function exportFavorites() {
        const json = JSON.stringify(loadFavorites('peripheral'), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'device-favorites.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ============ 说明面板（HTML 弹出） ============
    const helpPanel = document.getElementById('helpPanel');
    const helpItems = [
        '每个节点有四个方向的 Pad（上、右、下、左），点击并拖动 Pad 可创建连线',
        '将连线拖到目标节点 Pad 上完成连接；靠近可连接 Pad 时节点高亮',
        '鼠标移到 Pad 上会高亮所有相连 Pad',
        '拖动节点本体可移动；按住 <strong>Shift</strong> 拖拽可框选多个节点，框选后可一起拖动或删除',
        '点击空白处取消选择；鼠标滚轮缩放画布；按住<strong>右键</strong>拖动画布平移',
        '📦 生成 SOP / LQFP / QFN：四方向长方形引脚封装',
        '📦 自定义器件：在「外设」面板用文本框定义器件——<strong>第一行=名称 [封装] [接口名1] [接口名2] …</strong>（空格分隔；封装可省略，仅当第 2 个 token 为已知封装类型如 SOP/QFN/LQFP 才识别为封装，否则第 2 个 token 起均视为接口名）：如 <code>W25Q16 SOP 通用SPI 通用SPI2</code>。<strong>接口名</strong>填「自定义接口初始化参数」里的接口<strong>管理名</strong>时，该器件连接后<strong>优先匹配这些接口</strong>（可同时命中多个程序段/初始化段，用于同一物理接口适配多种配置）；不填则按引脚信号原有逻辑匹配。后续每行一个引脚，分三栏：<code>引脚名 [BUS SIGNAL] [特殊功能…]</code>。<strong>IO 特殊功能</strong>可多个（空格分隔，如 <code>PA6 ADC_IN3</code> / <code>PB0 GPIO_OUT</code> / <code>PC0/NRST</code>，其中 “/” 内联特殊功能）；用于与外设（模拟输入 / GPIO 输出）连线时按功能名高亮。总线脚写 <code>引脚名 BUS SIGNAL</code>（如 <code>SCK SPI SCK</code>）。<strong>ADC 通配</strong>：引脚写 <code>引脚名 ADC_INX</code>（或 <code>AINX</code>），连线时会高亮 MCU 全部 ADC_INx 通道并匹配 ADC 外设的 AINX 脚；具体通道写 <code>ADC_IN3</code> 等',
        '📦 器件收藏夹：文本框填好后点「添加到收藏夹」存入 localStorage；下拉框选已有收藏即<strong>直接放置</strong>该器件；「配置菜单 / 器件收藏夹」可导出/加载收藏夹 JSON',
        '🔌 添加预制设备 <strong>CIU32F003</strong>：提供 SOP16 / SOP20 两种封装，引脚按 PORT 命名（SOP20 含 PC0/NRST 复位脚）',
        '💾 添加外设 <strong>Serial Flash (SOP8)</strong>：CS/MISO/MOSI/CLK 等为<strong>总线类引脚</strong>（蓝色）',
        '💾 虚拟外设 <strong>ADC 模拟输入 (8CH + AINX)</strong> 与 <strong>GPIO 输出 (8CH)</strong>：通道脚带 ADC / GPIO 总线。从 ADC 外设（或 AINX 通配脚）拖线，会高亮<strong>所有具备对应特殊功能的引脚</strong>——既含自定义器件声明的 ADC_INx / GPIO_OUT，也含 <strong>MCU CIU32F003 自身</strong>（其内置特殊功能表含 ADC_INx / GPIO_OUT / NRST / EXTCLK）；连上后自动把该脚置为模拟(3)/输出(1)模式',
        '<strong>总线高亮</strong>：从外设 SPI 引脚（如 MOSI）拖线时，所有 MCU 中可用作该功能的 IO 会高亮（蓝色）',
        '<strong>实例锁定</strong>：MCU 含多个 SPI（SPI1/SPI2）时，一旦连上某实例（如 SPI1），后续外设连线<strong>只高亮已连实例</strong>的 IO',
        '外设连到 MCU IO 时<strong>自动配置</strong>：写入对应 AF 与 GPIO 寄存器（MODE=复用、AFL=AF 编号、I2C 自动开漏+上拉）',
        '右键 MCU IO 引脚 → 仅保留 <strong>模式</strong> 快速选择（输入 / 输出 / 复用 / 模拟），AF 由连线自动配置',
        'MCU 引脚<strong>颜色 = 模式</strong>：暗蓝=输入 · 暗绿=输出 · 暗紫=复用 · 暗琥珀=模拟；<strong>亮琥珀=已选 AF</strong>（醒目）',
        '右键外设引脚 → 只读展示总线/信号信息，可断开连接',
        '📊 寄存器菜单：输出所有<strong>与复位值不同</strong>的 GPIO 寄存器（0x地址,0x值,//GPIOx_寄存器），可直接贴进固件初始化代码；右键 MCU IO 还可看到该引脚各寄存器的复位位值',
        '📑 SVD 寄存器：点 Dock「SVD」打开 macOS 风格窗口（macwindow），内部用 RichObjectEditor 树形+搜索（支持拼音首字母）直改寄存器；每个字段用<strong>勾选框 / 下拉 / 数字</strong>控件直接改，顶部「寄存器值」可填十六进制并与字段双向同步；改动实时写回并收集进「寄存器变动值」，窗口内可<strong>重置所有寄存器</strong>或从接口刷新',
        '📦 外设栏改为<strong>tabs 布局</strong>：【外设】与【自定义器件】原地切换；【外设】tab 也放了「收藏夹器件（选择即放置）」少一步操作；【自定义器件】tab 新增「右键菜单 JSON」输入框——为器件定义滑块/按钮等操作（如 PWM 占空比滑块 → TIMx.CCRn，最大值可引用 TIMx.ARR 动态变化）。<strong>右键该自定义器件节点</strong>即弹出操作菜单，拖动滑块实时写 SVD 寄存器；通配 TIMx_CHn / TIMx.CCRn 会按器件连线自动映射成 TIM1.CCR1（留空 JSON 则不使用弹出式菜单）',
        '⚙️ 自定义接口初始化参数：面板用<strong>原生 tabs 卡项</strong>（参考 test menu 的 tabs 布局，原地切换，不重开面板）——两个 Tab 格式一致：<strong>第 1 行=名称</strong>（便于管理，如 “通用SPI”），<strong>第 2 行=接口别名</strong>（空格分隔，如 “SPI1_CLK SPI1_MOSI SPI1_MISO”），<strong>第 3 行起=正文</strong>（初始化段写 “地址,值”，函数段写 C 代码）。【接口初始化定义】写寄存器段、【接口函数定义】写程序段，两者匹配逻辑一致：外设连到 MCU 某接口（如 SPI1_MOSI / TIM1_CH1）时按接口名命中。<strong>别名前加 & 表示“必需条件”</strong>（如 “&SPI1_CLK &SPI1_MOSI &SPI1_MISO” 需三者全连上才生成），不带 & 的“任一命中即可”，可混用。寄存器段自动写入 MCU 寄存器（同步 SVD 与「寄存器变动值」），函数段在连上对应接口后被收集、可在顶栏「💻 程序段」栏<strong>整段导出</strong>（首行注释汇总已使用外设）。多个接口命中同一地址按 “|” 合并',
        '🎨 画布菜单：连线颜色/宽度、高亮强度、隐藏删除按钮、添加/删除/重置节点、保存/加载 JSON',
        '📁 配置菜单：加载/导出 IO 功能库 JSON；「应用配置」——配置持久化存于本地浏览器存储（localStorage），config.json 仅作导入/导出介质：导入即存入本地并叠加到基础库，导出把当前用户态写成 config.json 文件，重置则清除本地存储恢复默认（硬件库始终在 config.js）'
    ];
    if (helpPanel) {
        helpPanel.innerHTML =
            '<div class="dh-head"><span>使用说明</span><span class="dh-close" id="helpClose">×</span></div>' +
            '<div class="dh-body"><ul>' + helpItems.map(t => `<li>${t}</li>`).join('') + '</ul></div>';
        const helpClose = document.getElementById('helpClose');
        if (helpClose) helpClose.addEventListener('click', () => helpPanel.classList.remove('show'));
    }

    function toggleHelp(anchor) {
        if (!helpPanel) return;
        if (helpPanel.classList.contains('show')) {
            helpPanel.classList.remove('show');
            return;
        }
        const r = anchor.getBoundingClientRect();
        helpPanel.classList.add('show');
        const w = helpPanel.offsetWidth || 440;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
        helpPanel.style.top = (r.bottom + 8) + 'px';
        helpPanel.style.left = left + 'px';
    }

    // 点击说明面板外部关闭
    document.addEventListener('mousedown', (e) => {
        if (helpPanel && helpPanel.classList.contains('show') &&
            !helpPanel.contains(e.target) && !(e.target.closest && e.target.closest('.dock-item'))) {
            helpPanel.classList.remove('show');
        }
    });

    // ============ 全屏切换 ============
    function toggleFullscreen() {
        const doc = document;
        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
            const el = doc.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
            if (doc.exitFullscreen) doc.exitFullscreen();
            else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        }
    }

    // ============ 自定义接口初始化参数 ============
    const DEFAULT_IFACE_EXAMPLE =
`通用SPI
SPI1_CLK SPI1_MOSI SPI1_MISO
0x40013004,0x00001700,//SPI CR2
0x40013000,0x00000347,//SPI CR1`;

    // 接口函数定义（硬件/软件模拟共用同一池）：连上对应接口(满足 & 条件)即收集导出；
    // 想走软件模拟时，无需单独分类——直接在此定义（如“通用SPI_模拟”），再在器件上用 @接口名 强制选择即可。
    const DEFAULT_FUNC_EXAMPLE =
`通用SPI_模拟
&SPI1_CLK &SPI1_MOSI &SPI1_MISO
// 软件模拟 SPI：器件首行用 @通用SPI_模拟 强制选择本段（忽略 & 条件）。
// 多个相同接口接不同 IO → 自动按“器件名+序号”展开为多个实例。
// //replace 把代码里的“天然信号名”替换成“带实例序号/真实 GPIO”，免得满篇写 {{CS}}/{{SCK}}…：
//   before:after 空格分隔，after 可用 {{IDX}}/{{DEV}} 与角色占位符 {{CS}}/{{SCK}}/{{MOSI}}/{{MISO}}
//replace SPI_CS:{{CS}} SPI_CLK:SPI{{IDX}}_CLK SPI_MOSI:SPI{{IDX}}_MOSI SPI_MISO:SPI{{IDX}}_MISO
void {{DEV}}_{{IDX}}_init(void){
  GPIO_DIR(SPI_CS, OUT);   // SPI_CS → 本实例真实 CS 引脚(如 PA4)
  GPIO_DIR(SPI_CLK, OUT);  // SPI_CLK → SPI0_CLK / SPI1_CLK …
}`;

    // 自定义接口初始化参数面板（原生 tabs 卡项布局，参考 test menu 的 layout:'tabs' 设计）：
    //   两个 section 即两个 Tab —— 【接口初始化定义】写寄存器段、【接口函数定义】写程序段，
    //   两者匹配逻辑一致（外设连到 MCU 某接口时按接口名命中）。Tab 切换由 RichMenu 原地完成，无需重开面板。
    function ifaceInitMenuCfg(anchor) {
        // 目标 SVD 型号选择器：列出画布上所有 MCU 节点（按其 SVD key），首项为“全局激活 SVD”。
        // 让接口初始化段在保存/应用时绑定到具体 MCU 类型，避免多 MCU 同画布时串味。
        const buildSvdTargetOpts = () => {
            const opts = [{ value: '', label: '— 全局激活 SVD —' }];
            if (nodeSystem && nodeSystem.nodes) {
                const seen = new Set();
                for (const node of nodeSystem.nodes.values()) {
                    if (node && node.config && node.config.device) {
                        const k = getNodeSvdKey(node);
                        if (k && !seen.has(k)) {
                            seen.add(k);
                            const label = (node.config.device.name || k) + ' · ' + k;
                            opts.push({ value: k, label });
                        }
                    }
                }
            }
            return opts;
        };
        const buildNameOpts = (list) => [{ value: '', label: '— 新建 —' }]
            .concat(list.map(d => {
                const alias = (d.names && d.names.length) ? d.names.join(' ') : '';
                // 全局视图下标出归属：无归属=[通用]（可移植到任意型号），有归属=[型号]
                const own = d.svdKey ? '[' + d.svdKey + '] ' : '[通用] ';
                const lbl = own + d.name + (alias ? ' （' + alias + '）' : '');
                return { value: d.name, label: lbl };
            }));

        // 当前面板选中的 SVD 型号（两个 Tab 联动，取任一即可）
        const currentSvdKey = () => {
            if (!dockMenu || !dockMenu.menuControls) return '';
            const a = dockMenu.menuControls['targetSvd'];
            const b = dockMenu.menuControls['targetSvdFunc'];
            return (a && a.value) || (b && b.value) || '';
        };

        // 读取当前 textarea 内容（不重开面板）
        const readRaw = (id) => {
            const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls[id] : null;
            return ta ? ta.value : '';
        };
        // 原地刷新下拉选项（保持当前选中值），避免保存/删除后还需重开面板
        const refreshSelect = (id, list) => {
            if (!dockMenu || !dockMenu.menuControls) return;
            const sel = dockMenu.menuControls[id];
            if (!sel || !sel.appendChild) return;
            const cur = sel.value;
            sel.innerHTML = '';
            buildNameOpts(list).forEach(o => {
                const op = document.createElement('option');
                op.value = o.value; op.textContent = o.label;
                if (o.value === cur) op.selected = true;
                sel.appendChild(op);
            });
        };

        const initList = nodeSystem.getInterfaceInits();
        const funcList = nodeSystem.getInterfaceFunctions();

        return {
            title: '自定义接口初始化参数',
            width: 600,
            layout: 'tabs',
            onChange: (id, value) => {
                // 选择预设 → 在对应 textarea 原地回填（自动规范化为“名称+别名+正文”新格式，不重开面板）
                // 注意：必须用 nodeSystem 的实时列表（而非面板打开时的快照），否则刚保存的定义在下拉里选不回原文。
                if (id === 'sel') {
                    const cur = nodeSystem.getInterfaceInits().find(d => d.name === value);
                    const v = cur ? nodeSystem.toNewFormatRaw(cur.raw) : (value ? '' : DEFAULT_IFACE_EXAMPLE);
                    if (dockMenu && dockMenu.setValue) dockMenu.setValue('raw', v);
                } else if (id === 'funcSel') {
                    const cur = nodeSystem.getInterfaceFunctions().find(d => d.name === value);
                    const v = cur ? nodeSystem.toNewFormatRaw(cur.raw) : (value ? '' : DEFAULT_FUNC_EXAMPLE);
                    if (dockMenu && dockMenu.setValue) dockMenu.setValue('funcRaw', v);
                } else if (id === 'targetSvd' || id === 'targetSvdFunc') {
                    // 两个 Tab 的 SVD 型号选择器联动：任一处切换，另一侧同步，避免设置初始化与程序段时型号不一致
                    const otherId = id === 'targetSvd' ? 'targetSvdFunc' : 'targetSvd';
                    const other = dockMenu && dockMenu.menuControls ? dockMenu.menuControls[otherId] : null;
                    if (other && other.value !== value) other.value = value;
                    // 切换型号后按型号过滤两个定义下拉：
                    //   选具体型号 → 仅显示“通用定义 + 该型号定义”；选全局 → 显示全部（便于对照/移植）
                    refreshSelect('sel', nodeSystem.getInterfaceInitsForSvd(value));
                    refreshSelect('funcSel', nodeSystem.getInterfaceFunctionsForSvd(value));
                }
            },
            sections: [
                {
                    key: 'init',
                    title: '【接口初始化定义】',
                    // 混合布局：整体保持纵向（heading/下拉/文本域各自占整行更易读），
                    // 仅用控件上的 row 标记把成对按钮收成一行，无需整块 grid。
                    controls: [
                        { type: 'heading', label: '格式：第 1 行=名称（便于管理，如 “通用SPI”）；第 2 行=接口别名（空格分隔，如 “SPI1_CLK SPI1_MOSI SPI1_MISO”），任一被连接即应用整组初始化；第 3 行起=“地址,值”（行尾 // 注释可保留）。别名前加 “&” 表示“必需条件”：所有 & 别名都被连接才生成（如 “&SPI1_CLK &SPI1_MOSI &SPI1_MISO”）；不带 & 的“任一命中即可”；两者可混用。相同地址自动 | 合并。', span: 'full' },
                        { type: 'select', id: 'sel', label: '已定义接口', value: '', options: buildNameOpts(initList), span: 'full' },
                        { type: 'textarea', id: 'raw', label: '定义', value: DEFAULT_IFACE_EXAMPLE, rows: 11, span: 'full' },
                        { type: 'select', id: 'targetSvd', label: '目标 SVD 型号（保存到该 MCU 的寄存器空间并按型号过滤定义列表：选型号=通用+该型号，选全局=全部；与「接口函数」联动）', value: '', options: buildSvdTargetOpts(), span: 'full' },
                        { type: 'button', id: 'saveSvd', label: '保存到所选SVD', style: 'primary', row: 'svdOps', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['targetSvd'] : null;
                            const sk = (sel && sel.value) || (window.SvdLib && window.SvdLib.getActiveSvdKey()) || '';
                            const res = nodeSystem.applyInterfaceInitToSvd(readRaw('raw'), sk);
                            if (!res.ok) { alert(res.msg); return; }
                            // 实时更新：applyInterfaceInitToSvd 已触发 onRegistersChanged，
                            // SVD 窗口若打开可见将自动刷新，无需弹窗提示
                        } },
                        { type: 'button', id: 'loadSvd', label: '从所选SVD加载', style: 'secondary', row: 'svdOps', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['targetSvd'] : null;
                            const sk = (sel && sel.value) || (window.SvdLib && window.SvdLib.getActiveSvdKey()) || '';
                            const res = nodeSystem.loadInterfaceInitFromSvd(readRaw('raw'), sk);
                            if (!res.ok) { alert(res.msg); return; }
                            if (dockMenu && dockMenu.setValue) dockMenu.setValue('raw', res.raw);
                        } },
                        { type: 'button', id: 'save', label: '保存', row: 'defOps', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['sel'] : null;
                            const oldName = sel ? sel.value : '';
                            const txt = readRaw('raw');
                            const r = nodeSystem.parseInterfaceInit(txt);
                            if (!r.name) { alert('第 1 行必须为名称（如 通用SPI）'); return; }
                            // 改名时删除旧名定义，避免残留
                            if (oldName && oldName !== r.name) nodeSystem.deleteInterfaceInit(oldName);
                            // 归属所选型号；选“全局”则存为通用定义（任意型号可见，便于移植）
                            const sk = currentSvdKey();
                            nodeSystem.upsertInterfaceInit(r.name, txt, sk);
                            refreshSelect('sel', nodeSystem.getInterfaceInitsForSvd(sk));
                            if (sel) sel.value = r.name;
                            // 定义新增/修改后，立即按当前连接重算接口初始化，使已连好的器件即时生效
                            nodeSystem.recomputeInterfaceInitRegisters();
                        } },
                        { type: 'button', id: 'del', label: '删除选中', style: 'danger', row: 'defOps', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['sel'] : null;
                            const name = sel ? sel.value : '';
                            if (!name) return;
                            nodeSystem.deleteInterfaceInit(name);
                            refreshSelect('sel', nodeSystem.getInterfaceInitsForSvd(currentSvdKey()));
                            if (dockMenu && dockMenu.setValue) dockMenu.setValue('raw', DEFAULT_IFACE_EXAMPLE);
                            // 删除定义后，立即重算以清除已被删除定义写入的寄存器
                            nodeSystem.recomputeInterfaceInitRegisters();
                        } }
                    ]
                },
                {
                    key: 'func',
                    title: '【接口函数定义】',
                    // 混合布局：同 init 段，仅成对按钮经 row 并排
                    controls: [
                        { type: 'heading', label: '逻辑同接口初始化：第 1 行=名称，第 2 行=接口别名（可带 & 条件），第 3 行起=函数代码（原样保留，可含空行/注释/大括号）。连上对应接口(满足 & 条件)后，代码被收集并在「💻 程序段」栏整段导出。', span: 'full' },
                        { type: 'select', id: 'funcSel', label: '已定义函数', value: '', options: buildNameOpts(funcList), span: 'full' },
                        { type: 'textarea', id: 'funcRaw', label: '定义', value: DEFAULT_FUNC_EXAMPLE, rows: 13, span: 'full' },
                        { type: 'select', id: 'targetSvdFunc', label: '目标 SVD 型号（按型号过滤定义列表：选型号=通用+该型号，选全局=全部；导出程序段时仅含该 MCU 触发的函数；与「接口初始化」联动）', value: '', options: buildSvdTargetOpts(), span: 'full' },
                        { type: 'button', id: 'saveFunc', label: '保存', style: 'primary', row: 'funcOps', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['funcSel'] : null;
                            const oldName = sel ? sel.value : '';
                            const txt = readRaw('funcRaw');
                            const r = nodeSystem.parseInterfaceFunction(txt);
                            if (!r.name) { alert('第 1 行必须为名称（如 通用SPI读写）'); return; }
                            if (oldName && oldName !== r.name) nodeSystem.deleteInterfaceFunction(oldName);
                            // 归属所选型号；选“全局”则存为通用定义（任意型号可见，便于移植）
                            const sk = currentSvdKey();
                            nodeSystem.upsertInterfaceFunction(r.name, txt, sk);
                            refreshSelect('funcSel', nodeSystem.getInterfaceFunctionsForSvd(sk));
                            if (sel) sel.value = r.name;
                            // 函数定义新增/修改后，立即按当前连接重算，使已连好的器件即时收集到函数段
                            nodeSystem.recomputeInterfaceInitRegisters();
                        } },
                        { type: 'button', id: 'delFunc', label: '删除选中', style: 'danger', row: 'funcOps', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['funcSel'] : null;
                            const name = sel ? sel.value : '';
                            if (!name) return;
                            nodeSystem.deleteInterfaceFunction(name);
                            refreshSelect('funcSel', nodeSystem.getInterfaceFunctionsForSvd(currentSvdKey()));
                            if (dockMenu && dockMenu.setValue) dockMenu.setValue('funcRaw', DEFAULT_FUNC_EXAMPLE);
                            // 删除函数定义后，立即重算以清除已被删除定义收集的函数段
                            nodeSystem.recomputeInterfaceInitRegisters();
                        } }
                    ]
                }
            ]
        };
    }

    // ============ SVD 寄存器编辑器：macwindow 窗口 + RichObjectEditor 组件 ============
    // 用 RichObjectEditor 的树形/搜索（支持拼音首字母）/ 富控件（勾选框·下拉·数字）直改寄存器字段；
    // 每个寄存器节点下挂一个「寄存器值」(十六进制文本框)，与字段双向同步；
    // 改动实时写回 nodeSystem.svdRegValues（持久化 + 收集进「寄存器变动值」）。

    function parseBitsSvd(bits) {
        const m = String(bits || '').match(/\[(\d+)(?:\.\.(\d+))?\]/);
        const a = m ? parseInt(m[1], 10) : 0;
        const b = m ? (m[2] !== undefined ? parseInt(m[2], 10) : a) : 0;
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const width = hi - lo + 1;
        const mask = width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1);
        return { lo, hi, width, mask };
    }
    function parseHexSvd(s) {
        s = (s == null ? '' : String(s)).trim();
        const n = /^0x/i.test(s) ? parseInt(s.slice(2), 16) : parseInt(s, 16);
        return isNaN(n) ? 0 : (n >>> 0);
    }
    function persistSvd() {
        try { localStorage.setItem('svdRegValues', JSON.stringify(nodeSystem.svdRegValues || {})); } catch (e) {}
    }

    // ---- SVD 寄存器值按 svdKey 命名空间（多 MCU 各自隔离） ----
    function svdValsMap(svdKey) {
        nodeSystem.svdRegValues = nodeSystem.svdRegValues || {};
        if (!nodeSystem.svdRegValues[svdKey]) nodeSystem.svdRegValues[svdKey] = {};
        return nodeSystem.svdRegValues[svdKey];
    }
    function getSvdRegVal(svdKey, regId, reset) {
        const map = (nodeSystem.svdRegValues && nodeSystem.svdRegValues[svdKey]) || {};
        return map[regId] ? (map[regId].value >>> 0) : (reset >>> 0);
    }
    // 当前编辑器正在操作的 SVD key（钉定时优先，否则跟全局激活）
    function editorSvdKey() {
        return window.__svdActiveKey || (window.SvdLib && window.SvdLib.getActiveSvdKey()) || '';
    }
    // 取某节点（MCU / 自定义器件）对应的 SVD key：优先用 device 显式绑定的 svdKey（'__auto__' 则按型号自动匹配）；
    // 其次按大类名称自动匹配（封装继承同一 SVD）；自定义器件取所连 MCU 的 SVD
    function getNodeSvdKey(node) {
        const resolveFromDev = (dev) => {
            if (!dev) return '';
            if (dev.svdKey && dev.svdKey !== '__auto__') return dev.svdKey;
            if (window.SvdLib && window.SvdLib.resolveSvdKeyForDevice) return window.SvdLib.resolveSvdKeyForDevice(dev);
            return '';
        };
        if (node && node.config && node.config.device) {
            const k = resolveFromDev(node.config.device);
            if (k) return k;
        }
        const mcu = (typeof findDeviceTimChannel === 'function') ? findDeviceTimChannel(node) : null;
        if (mcu && mcu.config && mcu.config.device) {
            const k = resolveFromDev(mcu.config.device);
            if (k) return k;
        }
        return editorSvdKey();
    }

    // 从当前编辑器对应的 SVD（window.__svdActiveKey）的 menu 构建 RichObjectEditor 所需的 data + schema
    function buildSvdModel() {
        const db = window.MCU_REG_DB[editorSvdKey()];
        if (!db || !db.menu) return null;
        const data = {}, schema = {};
        // 外设按 base 地址升序（地址相同按 label 稳定），避免按名称排序导致乱序
        const peris = db.menu.slice().sort((a, b) => {
            const pa = parseHexSvd(a.base), pb = parseHexSvd(b.base);
            return pa - pb || String(a.label).localeCompare(String(b.label));
        });
        for (const peri of peris) {
            const periNode = {};
            // 寄存器按 address 地址升序（地址相同按 name 稳定）
            const regs = peri.registers.slice().sort((a, b) => {
                const pa = parseHexSvd(a.address), pb = parseHexSvd(b.address);
                return pa - pb || String(a.name).localeCompare(String(b.name));
            });
            for (const reg of regs) {
                const regId = peri.label + '.' + reg.name;
                const resetVal = parseInt(reg.reset, 16) >>> 0;
                const stored = getSvdRegVal(editorSvdKey(), regId, resetVal);
                const curVal = stored;
                const regNode = {};
                regNode['__value'] = '0x' + curVal.toString(16).toUpperCase().padStart(8, '0');
                schema[JSON.stringify([peri.label, reg.name, '__value'])] =
                    { type: 'text', keyAlias: reg.name + ' @ ' + reg.address, label: '寄存器值' };
                // 字段（寄存器位）按 offset 升序（低位在前），避免按名称排序导致乱序
                const fields = reg.fields.slice().sort((a, b) => {
                    const oa = parseBitsSvd(a.bits).lo, ob = parseBitsSvd(b.bits).lo;
                    return oa - ob || String(a.name).localeCompare(String(b.name));
                });
                for (const f of fields) {
                    const { lo, width, mask } = parseBitsSvd(f.bits);
                    const fv = (curVal >> lo) & mask;
                    let def;
                    if (f.options && f.options.length) {
                        def = { type: 'select', keyAlias: f.name + ' [' + f.bits + ']',
                                options: f.options.map(o => ({ value: String(o.value), label: (o.label != null ? o.label : (o.name != null ? o.name : o.value)) })) };
                        regNode[f.name] = String(fv);
                    } else if (width === 1) {
                        def = { type: 'checkbox', keyAlias: f.name + ' [' + f.bits + ']' };
                        regNode[f.name] = !!fv;
                    } else {
                        def = { type: 'number', keyAlias: f.name + ' [' + f.bits + ']', min: 0, max: mask, step: 1 };
                        regNode[f.name] = fv;
                    }
                    schema[JSON.stringify([peri.label, reg.name, f.name])] = def;
                }
                periNode[reg.name] = regNode;
                schema[JSON.stringify([peri.label, reg.name])] =
                    { type: 'auto', keyAlias: reg.name + '  ' + reg.address + '  复位 ' + reg.reset };
            }
            data[peri.label] = periNode;
            schema[JSON.stringify([peri.label])] = { type: 'auto', keyAlias: peri.label + '  (' + peri.base + ')' };
        }
        return { data, schema };
    }

    function applySvdModel(editor) {
        const model = buildSvdModel();
        if (!model) return;
        editor.setObj(model.data, model.schema);
        // 自动展开外设 + 寄存器，便于直接看到字段（字段为叶节点，随寄存器展开而显示）
        const db = window.MCU_REG_DB[editorSvdKey()];
        for (const peri of db.menu) {
            editor.expandedPaths.add(JSON.stringify([peri.label]));
            for (const reg of peri.registers) {
                editor.expandedPaths.add(JSON.stringify([peri.label, reg.name]));
            }
        }
        editor.renderTree();
    }

    // 原地刷新 SVD 编辑器显示：把 nodeSystem.svdRegValues 的当前值同步进模型与已渲染控件，
    // 不整树重建 —— 与「改完寄存器值失去焦点」触发 onSvdChange→syncSvdRegister 的行为一致，
    // 保留展开状态/焦点，仅把每个寄存器的值箱与字段控件就地改写为最新值。
    function refreshSvdInPlace(editor) {
        const db = window.MCU_REG_DB[editorSvdKey()];
        if (!db || !editor) return;
        const svdKey = editorSvdKey();
        for (const peri of db.menu) {
            const pnode = editor.data[peri.label];
            if (!pnode) continue;
            for (const reg of peri.registers) {
                const regId = peri.label + '.' + reg.name;
                const resetVal = parseInt(reg.reset, 16) >>> 0;
                const stored = getSvdRegVal(svdKey, regId, resetVal);
                const val = stored;
                const rnode = pnode[reg.name];
                if (!rnode) continue;
                const hex = '0x' + val.toString(16).toUpperCase().padStart(8, '0');
                rnode['__value'] = hex;
                updateSvdControlValue([peri.label, reg.name, '__value'], hex);
                for (const f of reg.fields) {
                    const { lo, width } = parseBitsSvd(f.bits);
                    const fv = (val >> lo) & ((width >= 32 ? 0xFFFFFFFF : ((1 << width) - 1)));
                    const nv = (f.options && f.options.length) ? String(fv) : (width === 1 ? !!fv : fv);
                    rnode[f.name] = nv;
                    updateSvdControlValue([peri.label, reg.name, f.name], nv);
                }
            }
        }
    }

    // 直接更新某个 path 对应控件的值（不整树重绘，避免丢焦点）
    function updateSvdControlValue(path, value) {
        const ed = window.__svdEditor; if (!ed) return;
        const ps = JSON.stringify(path);
        const el = ed.container.querySelector("[data-path='" + ps + "']");
        if (!el) return;
        let ctrl = null;
        if (el.matches('input,select,textarea')) ctrl = el;
        else ctrl = el.querySelector('input,select,textarea');
        if (!ctrl) return;
        if (ctrl.type === 'checkbox') ctrl.checked = !!value;
        else ctrl.value = value;
    }

    // 单寄存器同步：path[2]==='__value' 表示数值框是源→分解到字段；否则字段是源→组合写回数值框
    function syncSvdRegister(data, periName, regName, path) {
        const svdKey = editorSvdKey();
        const db = window.MCU_REG_DB[svdKey];
        const peri = db.menu.find(p => p.label === periName); if (!peri) return;
        const reg = peri.registers.find(r => r.name === regName); if (!reg) return;
        const regId = periName + '.' + regName;
        const resetVal = parseInt(reg.reset, 16) >>> 0;
        const rnode = data[periName] && data[periName][regName];
        if (!rnode) { delete svdValsMap(svdKey)[regId]; persistSvd(); return; }
        if (path[2] === '__value') {
            const v = parseHexSvd(rnode['__value']);
            for (const f of reg.fields) {
                const { lo, width, mask } = parseBitsSvd(f.bits);
                const fv = (v >> lo) & mask;
                const nv = (f.options && f.options.length) ? String(fv) : (width === 1 ? !!fv : fv);
                rnode[f.name] = nv;
                updateSvdControlValue([periName, regName, f.name], nv);
            }
        } else {
            let v = 0;
            for (const f of reg.fields) {
                const { lo, width, mask } = parseBitsSvd(f.bits);
                let fv = rnode[f.name] || 0;
                if (typeof fv === 'boolean') fv = fv ? 1 : 0; else fv = Number(fv);
                v |= (fv & mask) << lo;
            }
            v = v >>> 0;
            const hex = '0x' + v.toString(16).toUpperCase().padStart(8, '0');
            rnode['__value'] = hex;
            updateSvdControlValue([periName, regName, '__value'], hex);
        }
        const composite = parseHexSvd(rnode['__value']);
        const map = svdValsMap(svdKey);
        if (composite !== resetVal) {
            map[regId] = { id: regId, address: reg.address, name: regId, reset: resetVal, value: composite };
        } else {
            delete map[regId];
        }
        persistSvd();
    }

    // 结构变化（增/删节点、导入）后：以字段为准全量重算 svdRegValues（保留 iface 源条目）
    function svdFullRecompute(data) {
        const svdKey = editorSvdKey();
        const db = window.MCU_REG_DB[svdKey]; if (!db) return;
        const newVals = {};
        for (const peri of db.menu) {
            const pnode = data[peri.label];
            for (const reg of peri.registers) {
                const regId = peri.label + '.' + reg.name;
                const resetVal = parseInt(reg.reset, 16) >>> 0;
                const rnode = pnode && pnode[reg.name];
                if (!rnode) continue;
                let v = 0;
                for (const f of reg.fields) {
                    const { lo, width, mask } = parseBitsSvd(f.bits);
                    let fv = rnode[f.name] || 0;
                    if (typeof fv === 'boolean') fv = fv ? 1 : 0; else fv = Number(fv);
                    v |= (fv & mask) << lo;
                }
                v = v >>> 0;
                if (v !== resetVal) newVals[regId] = { id: regId, address: reg.address, name: regId, reset: resetVal, value: v };
            }
        }
        // 保留所有 SVD key 下 iface 源条目，仅用当前 SVD 的 newVals 覆盖对应 key
        const final = {};
        for (const sk in (nodeSystem.svdRegValues || {})) {
            final[sk] = {};
            for (const id in nodeSystem.svdRegValues[sk]) {
                const e = nodeSystem.svdRegValues[sk][id];
                if (e && e._src === 'iface') final[sk][id] = e;
            }
        }
        final[svdKey] = Object.assign(final[svdKey] || {}, newVals);
        nodeSystem.svdRegValues = final;
        persistSvd();
    }

    // RichObjectEditor 的 onChange：path 为改动字段路径（无 path = 结构变化）
    function onSvdChange(data, schema, path) {
        if (path && path.length >= 3) {
            syncSvdRegister(data, path[0], path[1], path);
        } else {
            svdFullRecompute(data);
        }
    }

    // 打开 SVD 编辑器窗口（macwindow 容器 + RichObjectEditor 内容）
    // svdKeyOverride：指定展示的 SVD（如右键某 MCU 节点时传该 MCU 的 SVD key）；
    //   省略则使用全局激活 SVD（配置菜单下拉框选中的）。窗口为单实例，按 key 重建内容。
    function openSvdWindow(svdKeyOverride) {
        const svdKey = svdKeyOverride || (window.SvdLib && window.SvdLib.getActiveSvdKey()) || '';
        const db = window.MCU_REG_DB[svdKey];
        if (!db || !db.menu) { alert('未找到 SVD 寄存器数据：' + (svdKey || '（空）')); return; }
        window.__svdPinnedKey = svdKeyOverride || null;  // 钉定时跟随指定 MCU，否则跟随全局激活
        window.__svdActiveKey = svdKey;
        // 已存在实例：按当前 key 重建内容并显示（不重复 new MacWindow）
        if (window.__svdWin && document.body.contains(window.__svdWin.windowElement)) {
            if (typeof window.__svdWin.setTitle === 'function') window.__svdWin.setTitle('SVD 寄存器编辑器 · ' + svdKey);
            else window.__svdWin.title = 'SVD 寄存器编辑器 · ' + svdKey;
            if (window.__svdHost) buildSvdEditor(window.__svdHost);
            window.__svdWin.show();
            return;
        }
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;';
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 10px;background:#0f172a;border-bottom:1px solid #334155;';
        const hint = document.createElement('span');
        hint.style.cssText = 'color:#94a3b8;font-size:12px;margin-right:auto;';
        hint.textContent = '勾选/下拉/数字直接改 · 顶部「寄存器值」填十六进制同步字段 · 搜索支持拼音';
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'roe-btn'; refreshBtn.textContent = '从接口刷新';
        refreshBtn.onclick = () => { const ed = window.__svdEditor; if (ed) applySvdModel(ed); };
        const resetBtn = document.createElement('button');
        resetBtn.className = 'roe-btn danger'; resetBtn.textContent = '重置所有寄存器';
        resetBtn.onclick = () => {
            const map = svdValsMap(window.__svdActiveKey);
            for (const id in map) delete map[id];
            persistSvd();
            const ed = window.__svdEditor; if (ed) { applySvdModel(ed); ed.collapseAll(); }
        };
        bar.appendChild(hint); bar.appendChild(refreshBtn); bar.appendChild(resetBtn);
        const host = document.createElement('div');
        host.style.cssText = 'flex:1;min-height:0;';
        wrap.appendChild(bar); wrap.appendChild(host);
        window.__svdHost = host;

        const win = new MacWindow({
            parent: document.body, title: 'SVD 寄存器编辑器 · ' + svdKey, dark: true,
            width: 600, height: 740, x: 90, y: 30, content: wrap, resizable: true, canTopMost: true
        });
        win.contentElement.style.padding = '0';
        win.contentElement.style.overflow = 'hidden';
        window.__svdWin = win;
        const closeBtn = win.windowElement.querySelector('.control-btn.close');
        // 单实例：关闭仅隐藏，保留全局引用，供「保存到SVD」实时刷新复用（不重复 new / 不销毁）
        if (closeBtn) closeBtn.addEventListener('click', () => { win.hide(); });

        buildSvdEditor(host);
    }

    // 在 host 内创建/重建 RichObjectEditor（按 window.__svdActiveKey 渲染对应 SVD）
    function buildSvdEditor(host) {
        host.innerHTML = '';
        const editor = new RichObjectEditor(host, {
            onChange: onSvdChange,
            hideTypeBadge: true,        // 隐藏节点类型描述符
            hideKeyOriginal: true,      // 隐藏原始键名（仅显示 keyAlias）
            hideNodeActions: true,      // 隐藏节点的 添加子项/复制/删除 按钮
            hideImportExport: true,     // 隐藏 导入/导出 按钮
            hideAddRoot: true,          // 隐藏工具栏「添加节点」按钮
            editableKey: false,         // 关闭双击编辑 key（防止误改寄存器名）
            rootLabel: '外设'           // 根节点 label 名称
        });
        window.__svdEditor = editor;
        applySvdModel(editor);
    }

    // ============ 寄存器变动值 + 接口程序段输出（合并为 tabs 布局） ============
    function regFuncMenuCfg(anchor) {
        // 目标 SVD 型号：列表画布上所有 MCU 节点（按其 SVD key），首项为“全局”
        const buildSvdTargetOptsForDump = () => {
            const opts = [{ value: '', label: '— 全部 MCU —' }];
            if (nodeSystem && nodeSystem.nodes) {
                const seen = new Set();
                for (const node of nodeSystem.nodes.values()) {
                    if (node && node.config && node.config.device) {
                        const k = getNodeSvdKey(node);
                        if (k && !seen.has(k)) {
                            seen.add(k);
                            opts.push({ value: k, label: (node.config.device.name || k) + ' · ' + k });
                        }
                    }
                }
            }
            return opts;
        };
        const regDump = nodeSystem.computeRegisterDump();
        const funcDump = nodeSystem.computeFunctionDump();
        return {
            title: '寄存器变动值 / 程序段输出',
            width: 460,
            layout: 'tabs',
            sections: [
                {
                    key: 'reg',
                    title: '寄存器变动值',
                    controls: [
                        { type: 'textarea', id: 'dump', label: '寄存器初始化值（仅列出与复位值不同的寄存器）',
                          value: regDump || '（无变动：所有 GPIO 寄存器均与复位值一致）',
                          readonly: true, rows: 12, span: 'full' },
                        { type: 'button', id: 'regCopy', label: '复制到剪贴板', style: 'primary', onClick: () => {
                            const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['dump'] : null;
                            const text = ta ? ta.value : regDump;
                            if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                        } },
                        { type: 'button', id: 'regDownload', label: '下载 .txt', style: 'secondary', onClick: () => {
                            const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['dump'] : null;
                            const text = ta ? ta.value : regDump;
                            const blob = new Blob([text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'gpio_registers.txt';
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        } }
                    ]
                },
                {
                    key: 'func',
                    title: '程序段输出',
                    controls: [
                        { type: 'select', id: 'dumpSvd', label: '仅导出该型号 MCU 触发的函数', value: '', options: buildSvdTargetOptsForDump(), span: 'full' },
                        { type: 'textarea', id: 'code', label: '程序段', value: funcDump, readonly: true, rows: 12, span: 'full' },
                        { type: 'button', id: 'funcRefresh', label: '重新收集', style: 'primary', onClick: () => {
                            nodeSystem.recomputeInterfaceInitRegisters();
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['dumpSvd'] : null;
                            const sk = sel ? sel.value : '';
                            openDockMenu(anchor, regFuncMenuCfg(anchor));
                            if (sk) { const s2 = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['dumpSvd'] : null; if (s2) s2.value = sk; }
                        } },
                        { type: 'button', id: 'funcFilter', label: '按型号过滤', style: 'secondary', onClick: () => {
                            const sel = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['dumpSvd'] : null;
                            const sk = sel ? sel.value : '';
                            nodeSystem.recomputeInterfaceInitRegisters();
                            const filtered = nodeSystem.computeFunctionDump(sk);
                            if (dockMenu && dockMenu.setValue) dockMenu.setValue('code', filtered);
                        } },
                        { type: 'button', id: 'funcCopy', label: '复制到剪贴板', style: 'secondary', onClick: () => {
                            const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['code'] : null;
                            const text = ta ? ta.value : funcDump;
                            if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
                        } },
                        { type: 'button', id: 'funcDownload', label: '下载 .c', style: 'secondary', onClick: () => {
                            const ta = dockMenu && dockMenu.menuControls ? dockMenu.menuControls['code'] : null;
                            const text = ta ? ta.value : funcDump;
                            const blob = new Blob([text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'interface_funcs.c';
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        } }
                    ]
                }
            ]
        };
    }

    // ============ 构建顶部 Dock 栏 ============
    const dockItems = [
        { emoji: '🎛️', app: '设备', callback: (dock, index) => openDockMenu(dock.dock.querySelectorAll('.dock-item')[index], devMenuCfg()) },
        { emoji: '🔧', app: '外设', callback: (dock, index) => openDockMenu(dock.dock.querySelectorAll('.dock-item')[index], periMenuCfg()) },
        { emoji: '🎨', app: '画布', callback: (dock, index) => openDockMenu(dock.dock.querySelectorAll('.dock-item')[index], canvasMenuCfg()) },
        { emoji: '⚙️', app: '配置', callback: (dock, index) => openDockMenu(dock.dock.querySelectorAll('.dock-item')[index], configMenuCfg()) },
        { emoji: '🧰', app: '接口初始化', callback: (dock, index) => { const a = dock.dock.querySelectorAll('.dock-item')[index]; openDockMenu(a, ifaceInitMenuCfg(a)); } },
        { emoji: '🧩', app: '寄存器/程序段', callback: (dock, index) => { const a = dock.dock.querySelectorAll('.dock-item')[index]; openDockMenu(a, regFuncMenuCfg(a)); } },
        { emoji: '📑', app: 'SVD', callback: () => openSvdWindow() },
        { emoji: '❓', app: '说明', callback: (dock, index) => toggleHelp(dock.dock.querySelectorAll('.dock-item')[index]) },
        { emoji: '🖥️', app: '面板', callback: () => { if (window.openPanelMenu) window.openPanelMenu(); } },
        { emoji: '📡', app: '通讯', callback: () => openCommWindow() }
    ];

    const dockHost = document.getElementById('dockHost');
    if (dockHost && typeof MacOSDock === 'function') {
        // 暴露全局 dock 实例，供其它模块（如面板工作台）追加图标
        window.__dock = new MacOSDock(dockHost, dockItems, { position: 'top', scaleFactor: 0.5 });
    }
    } // end boot()

    // 配置就绪后立即启动；若仍加载中（http fetch 异步），监听 appconfigready 后再启动。
    if (window.APP_CONFIG) boot();
    else window.addEventListener('appconfigready', boot, { once: true });
});
