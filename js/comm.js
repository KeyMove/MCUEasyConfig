/**
 * 通讯工具窗口
 * - 用 MacWindow 做容器，内部用 RichMenu（layout: 'tabs', mode: 'inline'）做三栏 Tab：
 *   第一栏 SWD、第二栏 串口助手、第三栏 CAN助手。
 * - 本文件只实现第一栏 SWD 的完整 UI 与交互；其余两栏预留占位。
 *
 * 依赖（需在 index.html 中先于本文件加载）：
 *   MacWindow (macwindow.js)、RichMenu (rich-menu.js)、swd.js (提供 SWD / Elfparse / downloadbin_device)
 */

// 单实例引用
let __commWin = null;
// SWD 已加载固件字节数组（bin/hex 的 ROM）
let __swdBin = null;
// 当前解析出的 download_info（{ROM}|null，参考 imgfile）
let __downloadInfo = null;
// 当前选中的 flashDevice（download_flm，参考实现）
let __downloadFlm = null;
// 已注册算法表：name -> { info(下载/上传 device), type:'flm'|'spi'|'bin' }
// 对应参考中的 download_device / upload_device 闭包集合
let __downloadDevice = {};
let __uploadDevice = {};
// 算法下拉当前所选（name 或 'bin' 内嵌）
let __swdAlgoName = '';

// 打开/聚焦「通讯」窗口（单实例）
function openCommWindow() {
    if (__commWin && document.body.contains(__commWin.windowElement)) {
        __commWin.show();
        return;
    }

    const win = new MacWindow({
        parent: document.body,
        title: '通讯',
        dark: true,
        // 宽度减半、高度保持视口 90%：宽度取视口 46%，居中显示
        width: Math.round(window.innerWidth * 0.46),
        height: Math.round(window.innerHeight * 0.90),
        x: Math.round((window.innerWidth - window.innerWidth * 0.46) / 2),
        y: Math.round(window.innerHeight * 0.05),
        resizable: true,
        canTopMost: true
    });
    win.contentElement.style.padding = '0';
    win.contentElement.style.overflow = 'hidden';
    win.contentElement.style.display = 'flex';
    win.contentElement.style.flexDirection = 'column';
    win.contentElement.style.minHeight = '0';

    // 注入按钮宽度自适应样式（仅一次）
    if (!document.getElementById('swd-glow-style')) {
        const st = document.createElement('style');
        st.id = 'swd-glow-style';
        st.textContent = `
/* 行内按钮宽度自适应文字（不再被 flex:1 拉伸），下拉框仍按 flex 占比拉伸 */
.rm-row > .rm-control:has(.rm-control-btn) {
    flex: 0 0 auto;
    min-width: 0;
}
.rm-row > .rm-control:has(.rm-control-btn) .rm-control-btn {
    width: auto;
}
/* 数据预览（十六进制）：等宽字体、缩小字号，看起来更规则 */
#swd_hex.rm-textarea {
    font-family: 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', monospace;
    font-size: 11px;
    line-height: 1.45;
    letter-spacing: 0.3px;
    white-space: pre;
    tab-size: 4;
}`;
        document.head.appendChild(st);
    }

    // 容器：RichMenu inline tabs 撑满（显式 width:100% 确保左列收发区自适应窗口宽度）
    const host = document.createElement('div');
    host.style.cssText = 'height:100%; width:100%; min-height:0; display:flex;';
    win.contentElement.appendChild(host);

    const menu = new RichMenu({
        mode: 'inline',
        layout: 'tabs',
        theme: 'dark',
        width: '100%',
        showHeader: false,
        showFooter: false,
        sections: [
            swdTabSection(),
            { key: 'uart', title: '串口助手', controls: [] },
            { key: 'can', title: 'CAN助手', controls: [
                { type: 'heading', label: 'CAN助手（待实现）' }
            ] }
        ]
    });
    // RichMenu inline 已自行 append 到 body，需要移动到 host 内
    if (menu.element.parentNode) menu.element.parentNode.removeChild(menu.element);
    host.appendChild(menu.element);
    menu.element.style.height = '100%';
    menu.element.style.width = '100%';
    menu.element.style.flex = '1 1 auto';   // 在 flex 容器(host)中拉伸占满整行宽度，右列才能贴边

    // 串口助手：放弃 rich-menu 控件，自绘一个填满面板的大 div
    const uartPanel = menu.element.querySelector('[data-tab-panel="uart"]');
    if (uartPanel) buildUartPanel(uartPanel);

    // 启动时恢复已持久化的下载算法（静默，不弹 toast；仅在首次创建窗口时执行一次）
    restoreAlgos();

    // 关闭仅隐藏（单实例，保留引用）
    const closeBtn = win.windowElement.querySelector('.control-btn.close');
    if (closeBtn) closeBtn.addEventListener('click', () => win.hide());

    __commWin = win;
    window.__commMenu = menu;

    // SWD 栏自定义逻辑（hex 视图 / 下拉框 / 按钮）在 RichMenu 生成后挂接
    bindSwdTab(menu);

    // 拖拽接收固件/算法文件（bin/hex/axf/flm/spi），松手即走 imgfile 解析
    bindDropFiles(win, menu);
}

// 拖拽放置：在窗口内容区显示高亮遮罩，松开后逐个处理文件
function bindDropFiles(win, menu) {
    const zone = win.contentElement;

    // 半透明高亮遮罩（拖入时显示）
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;'
        + 'background:rgba(99,102,241,0.18);border:2px dashed #818cf8;border-radius:12px;'
        + 'color:#c7d2fe;font-size:15px;font-weight:600;z-index:50;pointer-events:none;';
    overlay.textContent = '松开以加载固件 / 算法文件（bin / hex / axf / flm / spi）';
    win.windowElement.appendChild(overlay);
    // 让内容区可相对定位，遮罩覆盖整个窗口
    win.contentElement.style.position = 'relative';

    let dragDepth = 0;
    const show = () => { overlay.style.display = 'flex'; };
    const hide = () => { overlay.style.display = 'none'; };

    zone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragDepth++;
        show();
    });
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) hide();
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDepth = 0;
        hide();
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;
        // 逐个按 imgfile 处理（FLM/SPI 会注册算法，bin/hex 直接预览）
        Array.from(files).forEach(f => imgfile(f, menu));
        // 若窗口停在其它 Tab，切到 SWD 方便看到预览
        const swdTab = menu.element.querySelector('.rm-tab-btn[data-tab-key="swd"]');
        if (swdTab && !swdTab.classList.contains('active')) swdTab.click();
    });
}

// ====== 第一栏：SWD ======
function swdTabSection() {
    return {
        key: 'swd',
        title: 'SWD',
        // grid + 行内并排（rm-row）混合布局
        layout: 'grid',
        controls: [
            // 设备下拉框 + 打开 SWD 设备按钮（并排，下拉在前、按钮在后）
            { type: 'select', id: 'swd_devtype', label: '设备', flex: 2, row: 'dev',
                value: 'COM',
                options: [
                    { value: 'COM', label: 'COM（921600）' },
                    { value: 'BLE', label: 'BLE' },
                    { value: 'STLINK', label: 'STLINK' }
                ] },
            { type: 'button', id: 'swd_open', label: '打开 SWD 设备', style: 'primary', row: 'dev',
                onClick: () => swdOpenDevice() },
            // 测试连接按钮（与下拉、打开按钮并排，执行 SWD.connect() 并华丽发光反馈；宽度自适应文字）
            { type: 'button', id: 'swd_test', label: '测试连接', row: 'dev',
                onClick: () => swdTestConnect() },
            // 下载算法下拉 + 添加(+)/删除(-) 按钮（并排，下拉在左、按钮在右）
            { type: 'select', id: 'swd_algo', label: '下载算法', flex: 3, row: 'algo',
                options: [ { value: '', label: '（未选择）' } ] },
            { type: 'button', id: 'swd_algo_add', label: '＋', style: 'secondary', row: 'algo',
                onClick: () => swdAddAlgorithm() },
            { type: 'button', id: 'swd_algo_del', label: '－', style: 'danger', row: 'algo',
                onClick: () => swdRemoveAlgorithm() },
            // 选择固件文件：支持 bin / hex / axf / flm / spi（与参考 imgfile 一致）
            { type: 'file', id: 'swd_bin', label: '选择固件文件', placeholder: '点击选择 .bin/.hex/.axf/.flm/.spi',
                accept: '.bin,.hex,.axf,.flm,.spi', span: 'full' },
            // 十六进制显示（类 WinHex）
            { type: 'heading', label: '数据预览（十六进制）', span: 'full' },
            { type: 'textarea', id: 'swd_hex', label: '', hideLabel: true, readonly: true, span: 'full',
                rows: 12, placeholder: '选择 bin 文件后在此显示十六进制内容',
                value: '' },
            // 下载按钮 + 在 RAM 中运行按钮（并排，下载占满、运行按钮宽度自适应文字）
            { type: 'button', id: 'swd_download', label: '下载', style: 'success', row: 'run',
                onClick: () => swdDownload() },
            { type: 'button', id: 'swd_runram', label: '在 RAM 中运行', row: 'run',
                onClick: () => swdRunInRam() }
        ]
    };
}

// 在 RichMenu 生成 DOM 后挂接 SWD 栏的自定义行为
function bindSwdTab(menu) {
    const ctrls = menu.menuControls;

    // 进度条（供 setUploadRate 使用）：注入到 SWD 标签面板底部
    const panel = menu.element.querySelector('[data-tab-panel="swd"]');
    if (panel) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'height:6px;background:#1e293b;border-radius:3px;overflow:hidden;margin:8px 0;visibility:hidden;';
        const bar = document.createElement('div');
        bar.id = 'swd_progress';
        bar.style.cssText = 'height:100%;width:0%;background:#10b981;transition:width .15s;';
        wrap.appendChild(bar);
        panel.appendChild(wrap);
    }

    // 固件文件变化 -> 按类型解析（参考 imgfile 分发）
    const binInput = ctrls['swd_bin'];
    if (binInput && binInput.tagName === 'INPUT') {
        binInput.addEventListener('change', () => {
            const file = binInput.files && binInput.files[0];
            if (!file) { __swdBin = null; return; }
            imgfile(file, menu);
        });
    }

    // 下载按钮占满整行剩余宽度（与其右侧“在 RAM 中运行”按钮并排，运行按钮按文字宽度自适应）
    const dlBtn = ctrls['swd_download'];
    if (dlBtn) {
        const wrap = dlBtn.closest('.rm-control');
        if (wrap) wrap.style.flex = '1';
    }

    // 算法下拉变化 -> 记录当前选择
    const algoSel = ctrls['swd_algo'];
    if (algoSel) {
        algoSel.addEventListener('change', () => {
            __swdAlgoName = algoSel.value;
        });
    }
}

// 已加载的下载算法列表：name -> { info, type:'flm'|'spi' }
let __swdAlgos = [];

// 刷新算法下拉框（保留“（bin/hex 内嵌）”选项 + 已加载算法）
function refreshAlgoSelect() {
    const sel = window.__commMenu && window.__commMenu.menuControls['swd_algo'];
    if (!sel) return;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = 'bin'; opt0.textContent = '（bin/hex 内嵌）';
    sel.appendChild(opt0);
    __swdAlgos.forEach(a => {
        const o = document.createElement('option');
        o.value = a.name; o.textContent = a.name + (a.type === 'spi' ? '（SPI）' : '');
        sel.appendChild(o);
    });
    sel.value = __swdAlgoName || 'bin';
}

// ====== 持久化（localStorage） ======
// 下载算法与快捷发送内容在刷新/重开浏览器后保留。
const ALGO_STORE_KEY = 'swd_algos_v1';
const QUICK_STORE_KEY = 'uart_quick_v1';

// Uint8Array <-> base64（分块避免栈溢出）
function bytesToB64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
}
function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// 算法持久化：读出/写入存储列表
function loadAlgoStore() {
    try { return JSON.parse(localStorage.getItem(ALGO_STORE_KEY) || '[]'); }
    catch (e) { return []; }
}
function saveAlgoStore(name, type, bytes) {
    try {
        const list = loadAlgoStore();
        const b64 = bytesToB64(bytes);
        const it = list.find(a => a.name === name);
        if (it) { it.type = type; it.b64 = b64; }
        else list.push({ name, type, b64 });
        localStorage.setItem(ALGO_STORE_KEY, JSON.stringify(list));
    } catch (e) { console.warn('保存算法失败', e); }
}
function removeAlgoStore(name) {
    try {
        const list = loadAlgoStore().filter(a => a.name !== name);
        localStorage.setItem(ALGO_STORE_KEY, JSON.stringify(list));
    } catch (e) {}
}

// 从字节注册一个下载算法（FLM/SPI）：Elfparse + 重建闭包 + 更新下拉
function registerAlgoFromBytes(name, type, bytes) {
    const info = Elfparse(bytes);
    if (type === 'flm') {
        __downloadDevice[name] = (bin) => downloadbin_device(bin, info);
    } else {
        __downloadDevice[name] = (bin) => downloadspibin(bin, info);
        __uploadDevice[name] = (addr, size) => uploadspibin(addr, size, info);
    }
    __downloadFlm = info;
    __newflm(name, type);
}

// 启动时恢复已持久化的下载算法（静默，不弹 toast）
function restoreAlgos() {
    loadAlgoStore().forEach(a => {
        try { registerAlgoFromBytes(a.name, a.type, b64ToBytes(a.b64)); }
        catch (e) { console.warn('恢复算法失败', a.name, e); }
    });
}

// 快捷发送持久化：读出/写入 101 条 {c:勾选, t:文本}
function loadQuickItems() {
    try { return JSON.parse(localStorage.getItem(QUICK_STORE_KEY) || '[]'); }
    catch (e) { return []; }
}
function saveQuickItems(rows) {
    try {
        const arr = rows.map(r => ({ c: r.chk.checked, t: r.txt.value }));
        localStorage.setItem(QUICK_STORE_KEY, JSON.stringify(arr));
    } catch (e) {}
}

// 固件文件解析（参考既有 imgfile 分发逻辑）
async function imgfile(file, menu) {
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = async function (e) {
        let download_info = null;
        if (extension === 'hex') {
            download_info = { ROM: hex2bin(e.target.result) };
        } else if (extension === 'bin') {
            download_info = { ROM: Array.from(new Uint8Array(e.target.result)) };
        } else if (extension === 'axf') {
            download_info = Elfparse(new Uint8Array(e.target.result));
        } else if (extension === 'flm') {
            const bytes = new Uint8Array(e.target.result);
            registerAlgoFromBytes(file.name, 'flm', bytes);
            saveAlgoStore(file.name, 'flm', bytes);   // 持久化原始字节，重启后自动恢复
            download_info = null;
        } else if (extension === 'spi') {
            const bytes = new Uint8Array(e.target.result);
            registerAlgoFromBytes(file.name, 'spi', bytes);
            saveAlgoStore(file.name, 'spi', bytes);   // 持久化原始字节，重启后自动恢复
            download_info = null;
        } else {
            Toast.warning('不支持的文件类型', '.' + extension);
            return;
        }
        __downloadInfo = download_info;
        window.lastdownloadinfo = download_info;

        // 预览（bin/hex/axf 才有实际 ROM；flm/spi 为算法本身）
        const hexArea = menu && menu.menuControls['swd_hex'];
        if (hexArea) {
            if (download_info && download_info.ROM) {
                __swdBin = (download_info.ROM instanceof Uint8Array)
                    ? download_info.ROM : Uint8Array.from(download_info.ROM);
                hexArea.value = renderHex(__swdBin);
            } else {
                __swdBin = null;
                hexArea.value = '（算法文件：' + file.name + '，无直接固件数据，请在右侧选择固件后下载）';
            }
        }
        // 自动选定刚加载的算法
        if ((extension === 'flm' || extension === 'spi')) {
            __swdAlgoName = file.name;
            refreshAlgoSelect();
        }
    };
    if (extension === 'hex') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
}

// 注册一个下载算法（FLM/SPI），更新下拉与闭包表
function __newflm(name, type) {
    if (!__swdAlgos.find(a => a.name === name)) {
        __swdAlgos.push({ name, type, info: __downloadFlm });
    } else {
        const a = __swdAlgos.find(x => x.name === name);
        a.type = type; a.info = __downloadFlm;
    }
    refreshAlgoSelect();
}

// SWD 连接状态（与参考实现一致：SWD 为全局已连接实例，UARTSWD 为串口 SWD 封装）
let __swdOpen = false;       // 设备是否已打开
let __swdConnect = false;    // 是否已与 MCU 建立 SWD 连接
let __swdType = null;        // 当前设备类型
let __uartSWD = null;        // UARTSWDDevice 实例（COM/BLE 用）
let __uartTransport = null;  // 底层 transport（COMHelper/BLEUART），只创建一次并复用
let __swdClosing = false;    // 正在手动关闭，避免 close 回调误报断线

// 串口助手独立状态（不与 SWD 共用 transport，避免互相抢占端口）
let __uartOpen = false;      // 串口是否已打开
let __uartClosing = false;   // 正在手动关闭串口，避免 close 回调误报断线
let __uartPort = null;       // 串口底层 transport（独立实例，裸收发不走 SWD 封装）
let __uartHexMode = false;   // 全局 HEX 模式：true 时收发均按 Hex 处理
let __uartRecvLen = 0;       // 已消费的接收缓冲长度（COMHelper.buffer 为累积数组，需增量读取避免重复）

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 统一更新“打开/关闭 SWD 设备”按钮文字 + 全局状态（状态由底层 status 回调驱动，不轮询探活）
function swdSetOpenState(open, opts = {}) {
    __swdOpen = open;
    if (!open) __swdConnect = false;
    // 同步到 window，供 swd.js 的 mcuR32/mcuW32 等跨文件读取真实连接状态
    window.__swdOpen = __swdOpen;
    window.__swdConnect = __swdConnect;
    const btn = window.__commMenu && window.__commMenu.menuControls['swd_open'];
    if (btn) btn.innerText = open ? '关闭 SWD 设备' : '打开 SWD 设备';
    if (!open && opts.reason) Toast.warning('已断开', opts.reason);
}

// 打开 / 断开 SWD 设备：按下拉类型选择底层实现（参考既有 detectDevice 逻辑）
function swdOpenDevice() {
    const type = (window.__commMenu && window.__commMenu.getValue('swd_devtype')) || 'COM';

    // 已打开 -> 断开（手动点击“关闭 SWD 设备”）
    if (__swdOpen) {
        __swdClosing = true;       // 标记手动关闭，避免底层 close 回调（可能触发两次）误报断线
        __swdOpen = __swdConnect = false;
        __swdType = null;
        swdSetOpenState(false);   // 更新按钮文字
        // 底层 close 会通过 status 回调触发一次或多次 ok=false（COM 关闭时 close() 与读取循环
        // finally 各触发一次），用延时清除 __swdClosing，确保整段关闭过程中的回调都被抑制。
        setTimeout(() => { __swdClosing = false; }, 200);
        // UARTSWDDevice 自身无 close，需关闭底层 transport；STLINK 实例自带 close
        if (__uartSWD && __uartSWD.COM && __uartSWD.COM.close) {
            try { __uartSWD.COM.close(); } catch (e) {}
        } else if (typeof SWD !== 'undefined' && SWD && SWD.close) {
            try { SWD.close(); } catch (e) {}
        }
        return;
    }

    if (type === 'STLINK' && typeof STLINK !== 'undefined') {
        const dev = new STLINK();
        dev.OnstatusChange = (d, ok) => {
            if (ok) {
                SWD = dev;            // downloadbin_device 依赖全局 SWD
                __swdType = 'STLINK';
                swdSetOpenState(true);
            } else if (__swdClosing) {
                // 手动关闭触发的回调（可能多次），忽略提示
            } else {
                // ok=false：已打开过属于意外断线，否则是打开失败
                const wasOpen = __swdOpen;
                swdSetOpenState(false);
                if (wasOpen) Toast.warning('已断开', 'STLINK 连接已丢失');
                else Toast.error('STLINK 打开失败', '请检查设备连接或权限');
            }
        };
        dev.open();
    } else if ((type === 'COM' || type === 'BLE') && typeof UARTSWDDevice !== 'undefined') {
        // 复用 transport 实例，但当下拉类型与已创建 transport 的类型不一致时必须重建，
        // 否则切到 BLE 仍会打开之前创建的 COM（或反之）——这正是“切设备下拉无效”的根因。
        const wantBle = (type === 'BLE');
        const isBle = __uartTransport && typeof BLEUART !== 'undefined' && __uartTransport instanceof BLEUART;
        const isCom = __uartTransport && typeof COMHelper !== 'undefined' && __uartTransport instanceof COMHelper;
        if (!__uartTransport || (wantBle !== isBle)) {
            // 旧 transport 存在且不是目标类型 -> 先关闭释放端口/配对，再重建
            if (__uartTransport && __uartTransport.close) {
                try { __uartTransport.close(); } catch (e) {}
            }
            __uartTransport = wantBle
                ? (typeof BLEUART !== 'undefined' ? new BLEUART(onTransStatus) : null)
                : (typeof COMHelper !== 'undefined' ? new COMHelper(onTransStatus, () => {}) : null);
            if (__uartTransport) __uartSWD = new UARTSWDDevice(__uartTransport);
        } else if (!__uartSWD) {
            __uartSWD = new UARTSWDDevice(__uartTransport);
        }
        if (!__uartTransport) { Toast.error('不支持的接口', '当前浏览器需 Web Serial / Web Bluetooth'); return; }

        function onTransStatus(d, ok) {
            if (ok) {
                SWD = __uartSWD;       // downloadbin_device 依赖全局 SWD
                SWD.packetsize = (type === 'COM') ? 0 : 4;
                if (isMobileDevice()) SWD.packetsize = 1;  // 移动端高速打包
                __swdType = type;
                swdSetOpenState(true);
            } else if (__swdClosing) {
                // 手动关闭触发的回调（可能多次），忽略提示
            } else {
                const wasOpen = __swdOpen;
                swdSetOpenState(false, { reason: type + ' 连接已断开' });
                if (!wasOpen) Toast.error('打开失败', '无法建立 ' + type + ' 连接');
            }
        }
        // 一直调用 open 即可：open 内部已处理“已打开则先关闭再开”
        if (type === 'COM') __uartTransport.open(921600); else __uartTransport.open();
    } else {
        Toast.error('不支持的接口', '当前浏览器需 WebUSB / Web Serial / Web Bluetooth');
        return;
    }
}

// 测试连接：执行 SWD.connect() 并依据 coreID 反馈（Win10 风格 toast）
async function swdTestConnect() {
    if (!__swdOpen) { Toast.warning('提示', '请先打开 SWD 设备'); return; }
    if (typeof SWD === 'undefined' || !SWD || !SWD.connect) { Toast.warning('提示', 'SWD 设备未就绪'); return; }
    try {
        await SWD.connect();
        if ((SWD.coreID & 0xffff) === 0x1477) {
            Toast.success('连接成功', '已识别到目标内核（coreID 0x1477）');
        } else {
            Toast.warning('连接成功但内核不匹配',
                'coreID = 0x' + (SWD.coreID & 0xffff).toString(16) + '，期望 0x1477');
        }
    } catch (e) {
        console.error(e);
        Toast.error('连接失败', (e && e.message ? e.message : String(e)));
    }
}

function swdAddAlgorithm() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.flm,.spi,.elf,.axf';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        imgfile(file, window.__commMenu);
    };
    input.click();
}

// 删除当前选中的下载算法
function swdRemoveAlgorithm() {
    const name = __swdAlgoName && __swdAlgoName !== 'bin' ? __swdAlgoName : '';
    if (!name) { Toast.warning('提示', '请先在下拉框选择要删除的下载算法'); return; }
    if (!confirm(`确定删除下载算法「${name}」？`)) return;
    delete __downloadDevice[name];
    delete __uploadDevice[name];
    __swdAlgos = __swdAlgos.filter(a => a.name !== name);
    removeAlgoStore(name);   // 同步移除持久化条目
    if (__swdAlgoName === name) __swdAlgoName = 'bin';
    refreshAlgoSelect();
    Toast.info('已删除', '下载算法「' + name + '」已移除');
}

// 下载：分发给当前所选算法（参考 download_device 闭包 / downloadbin_device）
async function swdDownload() {
    if (!__swdBin || !__swdBin.length) { Toast.warning('提示', '请先选择固件文件（.bin/.hex/.axf）'); return; }

    // 已选定具体算法（FLM/SPI）-> 调用其闭包
    if (__swdAlgoName && __swdAlgoName !== 'bin' && __downloadDevice[__swdAlgoName]) {
        try {
            await __downloadDevice[__swdAlgoName](__swdBin);
            Toast.success('下载完成', '固件已通过「' + __swdAlgoName + '」写入');
        } catch (e) {
            console.error(e);
            Toast.error('下载失败', (e && e.message ? e.message : String(e)));
        }
        return;
    }

    // bin/hex 内嵌：需要已加载的 download_flm（由 FLM/SPI 提供）
    if (typeof downloadbin_device === 'function' && __downloadFlm) {
        try {
            await downloadbin_device(__swdBin, __downloadFlm);
            Toast.success('下载完成', '固件已成功写入');
        } catch (e) {
            console.error(e);
            Toast.error('下载失败', (e && e.message ? e.message : e));
        }
        return;
    }

    Toast.warning('提示', '请先加载下载算法（FLM/SPI），或选择带内嵌 ROM 的算法');
}

// 在 RAM 中运行：把当前固件写入 RAM（0x20000000）并跳转执行（参考 swd.js runram）
async function swdRunInRam() {
    if (!__swdOpen) { Toast.warning('提示', '请先打开 SWD 设备'); return; }
    if (typeof SWD === 'undefined' || !SWD || !SWD.connect) { Toast.warning('提示', 'SWD 设备未就绪'); return; }
    if (!__swdBin || !__swdBin.length) { Toast.warning('提示', '请先选择固件文件（.bin/.hex/.axf）'); return; }
    if (typeof runram !== 'function') { Toast.error('功能不可用', '未找到 runram 实现（swd.js）'); return; }
    // runram 内部使用全局 lastdownloadinfo.ROM，确保已同步
    window.lastdownloadinfo = __downloadInfo || { ROM: __swdBin };
    try {
        Toast.info('在 RAM 中运行', '正在写入 RAM 并跳转执行…');
        await runram(__swdBin);
        Toast.success('已在 RAM 中运行', '程序已跳转执行（0x20000000）');
    } catch (e) {
        console.error(e);
        Toast.error('运行失败', (e && e.message ? e.message : String(e)));
    }
}

// 渲染类 WinHex 的十六进制视图：地址 | 16 进制 | ASCII
function renderHex(bytes, maxBytes = 0x2000) {
    const view = (bytes.length > maxBytes) ? bytes.slice(0, maxBytes) : bytes;
    const lines = [];
    const pad = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');
    for (let i = 0; i < view.length; i += 16) {
        const chunk = view.slice(i, i + 16);
        const hex = Array.from(chunk).map(b => pad(b, 2)).join(' ');
        const asc = Array.from(chunk).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
        lines.push(`${pad(i, 8)}  ${hex.padEnd(47, ' ')}  ${asc}`);
    }
    let out = lines.join('\n');
    if (bytes.length > maxBytes) out += `\n... (共 ${bytes.length} 字节，仅预览前 ${maxBytes})`;
    return out;
}

// 进度反馈（downloadbin_device 内部使用 setUploadRate 显示烧录进度，0~1 结束传 -1）
function setUploadRate(rate) {
    if (rate === undefined || rate === null) return;
    const bar = document.getElementById('swd_progress');
    if (!bar) return;
    if (rate < 0) { bar.style.width = '0%'; bar.parentNode.style.visibility = 'hidden'; return; }
    bar.parentNode.style.visibility = 'visible';
    bar.style.width = Math.round(rate * 100) + '%';
}

// ====== 串口助手（完全自绘，不依赖 rich-menu 控件） ======
// UI 布局：
//   左上：大接收区    左下：小发送区
//   右上：快捷发送 0-100  右下：打开/波特率/清屏等
function buildUartPanel(panel) {
    panel.innerHTML = '';
    panel.classList.add('uart-panel');   // 专属类：仅在 .active 时显示，避免切到其它 Tab 仍浮出

    // 仅给共享祖先设定高（不影响 SWD/CAN 的默认流式布局），并让 panels 成为定位上下文
    const panels = panel.parentElement;            // .rm-tabs-panels
    if (panels) {
        panels.style.flex = '1 1 auto';            // 占满 tab 导航以下剩余高度
        panels.style.minHeight = '0';
        panels.style.position = 'relative';        // uart-panel 绝对定位的参照
    }
    const menuEl = panels && panels.parentElement;  // RichMenu 根
    if (menuEl) {
        menuEl.style.height = '100%';
        menuEl.style.minHeight = '0';
        menuEl.style.display = 'flex';             // 根节点改为 flex 列，让 .rm-body 能正确 flex
        menuEl.style.flexDirection = 'column';
    }
    // .rm-body 必须在根 flex 列中占满剩余高度（min-height:0 防止被内容撑高）
    const bodyEl = menuEl && menuEl.querySelector('.rm-body');
    if (bodyEl) {
        bodyEl.style.flex = '1 1 auto';
        bodyEl.style.minHeight = '0';
        bodyEl.style.display = 'flex';
        bodyEl.style.flexDirection = 'column';
        bodyEl.style.overflow = 'hidden';          // 高度交给内部 grid，禁止自身滚动撑破布局
    }
    // tab 导航固定高度，不随内容伸缩
    const navEl = menuEl && menuEl.querySelector('.rm-tabs-nav');
    if (navEl) navEl.style.flex = '0 0 auto';

    // 注入自绘样式（仅一次）
    if (!document.getElementById('uart-panel-style')) {
        const st = document.createElement('style');
        st.id = 'uart-panel-style';
        st.textContent = `
/* uart 面板：绝对定位填满 panels，仅 active 时显示，切到其它 Tab 自动隐藏 */
.uart-panel { position:absolute; inset:0; display:none; flex-direction:column; min-height:0; padding:0; }
.uart-panel.active { display:flex; }
.uart-grid { display:grid; width:100%; height:100%; min-height:0; gap:8px; padding:8px; box-sizing:border-box;
    /* 左列（接收区+发送区）自适应窗口剩余宽度；右列（快捷+设置）固定 320px */
    grid-template-columns: minmax(0,1fr) 320px; grid-template-rows: minmax(0,1fr) 200px; }
.uart-cell { background:#0f172a; border:1px solid #1e293b; border-radius:6px;
    display:flex; flex-direction:column; min-height:0; min-width:0; overflow:hidden; }
.uart-cell > .uart-h { flex:0 0 auto; padding:6px 10px; font-size:12px; font-weight:600;
    color:#94a3b8; background:#111c33; border-bottom:1px solid #1e293b; letter-spacing:.5px;
    display:flex; align-items:center; gap:8px; }
.uart-rx { grid-column:1; grid-row:1; }
.uart-tx { grid-column:1; grid-row:2; }
.uart-quick { grid-column:2; grid-row:1; }
.uart-cfg { grid-column:2; grid-row:2; }
.uart-rx-area { flex:1 1 auto; width:100%; border:0; resize:none; outline:none; padding:8px 10px;
    background:#0b1220; color:#cbd5e1; font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;
    box-sizing:border-box; white-space:pre-wrap; word-break:break-all; }
.uart-tx-area { flex:1 1 auto; width:100%; border:0; resize:none; outline:none; padding:8px 10px;
    background:#0b1220; color:#e2e8f0; font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;
    box-sizing:border-box; }
.uart-quick-grid { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; padding:8px;
    display:flex; flex-direction:column; gap:6px; }
.uart-quick-row { display:flex; gap:6px; align-items:center; }
.uart-quick-row input[type=checkbox] { flex:0 0 auto; width:16px; height:16px; cursor:pointer; }
.uart-quick-row input[type=text] { flex:1 1 auto; min-width:0; background:#0b1220; color:#e2e8f0;
    border:1px solid #334155; border-radius:4px; padding:6px 8px; font:12px/1.4 ui-monospace,Menlo,Consolas,monospace; }
.uart-quick-row input[type=text]:focus { outline:none; border-color:#475569; }
.uart-quick-row button { flex:0 0 auto; border:1px solid #334155; background:#1e293b; color:#cbd5e1;
    border-radius:4px; padding:6px 10px; font-size:12px; cursor:pointer; }
.uart-quick-row button:hover { background:#334155; border-color:#475569; }
.uart-quick-row button:active { background:#475569; }
.uart-cfg-body { flex:1 1 auto; padding:10px; display:flex; flex-direction:column; gap:8px; overflow:auto; }
.uart-cfg-row { display:flex; gap:8px; align-items:center; }
.uart-cfg-row label { flex:0 0 64px; font-size:12px; color:#94a3b8; }
.uart-cfg-row select, .uart-cfg-row input { flex:1 1 auto; min-width:0; background:#0b1220;
    color:#e2e8f0; border:1px solid #334155; border-radius:4px; padding:6px 8px; font-size:12px; }
.uart-btn { border:1px solid #334155; background:#1e293b; color:#e2e8f0; border-radius:4px;
    padding:8px 10px; font-size:13px; cursor:pointer; }
.uart-btn:hover { background:#334155; }
.uart-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.uart-btn.primary:hover { background:#1d4ed8; }
.uart-btn.success { background:#10b981; border-color:#10b981; color:#fff; }
.uart-btn.success:hover { background:#059669; }
.uart-btn.danger { background:#ef4444; border-color:#ef4444; color:#fff; }
.uart-btn.danger:hover { background:#dc2626; }
.uart-btn.full { width:100%; }
.uart-stat { font-size:11px; color:#64748b; padding:0 2px; }
.uart-tx-foot { flex:0 0 auto; display:flex; align-items:center; justify-content:flex-end; gap:10px;
    padding:6px 8px; border-top:1px solid #1e293b; background:#0b1220; }
.uart-tx-foot label { display:flex; align-items:center; gap:5px; font-size:12px; color:#94a3b8; cursor:pointer; }
.uart-tx-foot input[type=checkbox] { width:15px; height:15px; cursor:pointer; }`;
        document.head.appendChild(st);
    }

    const grid = document.createElement('div');
    grid.className = 'uart-grid';

    // 左上：接收区
    const rx = document.createElement('div');
    rx.className = 'uart-cell uart-rx';
    rx.innerHTML = '<div class="uart-h">接收区</div>';
    const rxArea = document.createElement('div');
    rxArea.className = 'uart-rx-area';
    rxArea.id = 'uart_rx_area';
    rx.appendChild(rxArea);

    // 左下：发送区（textarea + 右下角底栏：HEX 模式勾选 + 发送按钮）
    const tx = document.createElement('div');
    tx.className = 'uart-cell uart-tx';
    tx.innerHTML = '<div class="uart-h">发送区</div>';
    const txArea = document.createElement('textarea');
    txArea.className = 'uart-tx-area';
    txArea.id = 'uart_tx_area';
    txArea.placeholder = '在此输入要发送的内容…';
    tx.appendChild(txArea);

    const txFoot = document.createElement('div');
    txFoot.className = 'uart-tx-foot';
    const hexLbl = document.createElement('label');
    const hexChk = document.createElement('input');
    hexChk.type = 'checkbox';
    hexChk.id = 'uart_tx_hex';
    hexChk.title = '勾选：发送按 Hex 解析、接收按 Hex 显示';
    hexLbl.appendChild(hexChk);
    hexLbl.appendChild(document.createTextNode('HEX 模式'));
    const txSend = document.createElement('button');
    txSend.className = 'uart-btn success';
    txSend.textContent = '发送';
    txSend.addEventListener('click', () => {
        __uartHexMode = hexChk.checked;
        uartQuickSend(txArea.value, hexChk.checked);
    });
    txFoot.appendChild(hexLbl);
    txFoot.appendChild(txSend);
    tx.appendChild(txFoot);

    // 右上：快捷发送（每行 [Hex勾选][内容][发送]，勾选=按Hex发送，未勾选=按文本发送）
    const quick = document.createElement('div');
    quick.className = 'uart-cell uart-quick';
    quick.innerHTML = '<div class="uart-h">快捷发送 0-100'
        + '<span style="font-weight:400;color:#64748b;font-size:11px;">勾选=Hex发送</span></div>';
    const quickGrid = document.createElement('div');
    quickGrid.className = 'uart-quick-grid';
    const quickRows = [];   // { chk, txt, btn } 列表
    const savedQuick = loadQuickItems();   // 持久化的快捷发送内容
    const persistQuick = () => saveQuickItems(quickRows);
    for (let i = 0; i <= 100; i++) {
        const row = document.createElement('div');
        row.className = 'uart-quick-row';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.title = '勾选：内容按 Hex 发送；不勾选：按文本发送';
        if (savedQuick[i] && savedQuick[i].c) chk.checked = true;   // 回填勾选
        chk.addEventListener('change', persistQuick);

        const txt = document.createElement('input');
        txt.type = 'text';
        txt.placeholder = '内容（勾选则按 Hex 解析）';
        txt.dataset.idx = String(i);
        if (savedQuick[i] && savedQuick[i].t) txt.value = savedQuick[i].t;   // 回填文本
        txt.addEventListener('input', persistQuick);

        const btn = document.createElement('button');
        btn.textContent = '发送';
        btn.title = '发送第 ' + i + ' 条';
        // 发送时把 checkbox 状态一并传入，决定 Hex / 文本
        btn.addEventListener('click', () => uartQuickSend(txt.value, chk.checked));

        row.appendChild(chk);
        row.appendChild(txt);
        row.appendChild(btn);
        quickGrid.appendChild(row);
        quickRows.push({ chk, txt, btn });
    }
    quick.appendChild(quickGrid);

    // 右下：打开串口 / 波特率 等
    const cfg = document.createElement('div');
    cfg.className = 'uart-cell uart-cfg';
    cfg.innerHTML = '<div class="uart-h">串口设置</div>';
    const cfgBody = document.createElement('div');
    cfgBody.className = 'uart-cfg-body';

    // 波特率
    const baudRow = document.createElement('div');
    baudRow.className = 'uart-cfg-row';
    baudRow.innerHTML = '<label>波特率</label>';
    const baudSel = document.createElement('select');
    baudSel.id = 'uart_baud';
    [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        if (v === 921600) o.selected = true;
        baudSel.appendChild(o);
    });
    baudRow.appendChild(baudSel);
    cfgBody.appendChild(baudRow);

    // 打开 / 关闭
    const openBtn = document.createElement('button');
    openBtn.className = 'uart-btn primary full';
    openBtn.id = 'uart_open_btn';
    openBtn.textContent = '打开串口';
    openBtn.addEventListener('click', () => uartToggle(openBtn, baudSel));
    cfgBody.appendChild(openBtn);

    // 清屏接收
    const clearBtn = document.createElement('button');
    clearBtn.className = 'uart-btn full';
    clearBtn.textContent = '清空接收区';
    clearBtn.addEventListener('click', () => { rxArea.textContent = ''; });
    cfgBody.appendChild(clearBtn);

    const stat = document.createElement('div');
    stat.className = 'uart-stat';
    stat.id = 'uart_stat';
    stat.textContent = '未打开';
    cfgBody.appendChild(stat);

    cfg.appendChild(cfgBody);

    grid.appendChild(rx);
    grid.appendChild(tx);
    grid.appendChild(quick);
    grid.appendChild(cfg);
    panel.appendChild(grid);

    // 暴露引用供后续逻辑
    window.__uart = { rxArea, txArea, baudSel, openBtn, stat, quickGrid };
}

// 打开 / 关闭串口（复用 __uartTransport 单实例）
function uartToggle(btn, baudSel) {
    if (__uartOpen) {
        __uartClosing = true;
        __uartOpen = false;
        btn.textContent = '打开串口';
        btn.className = 'uart-btn primary full';
        if (window.__uart) window.__uart.stat.textContent = '已关闭';
        setTimeout(() => { __uartClosing = false; }, 200);
        if (__uartPort && __uartPort.close) {
            try { __uartPort.close(); } catch (e) {}
        }
        return;
    }
    const baud = parseInt(baudSel.value, 10) || 921600;
    if (!__uartPort) {
        // 串口助手直接裸收发（不经过 SWD 协议封装），故只需 COMHelper 底层实例。
        // 第二个回调 onrecvdata 把收到的字节流写入接收区。
        __uartPort = (typeof COMHelper !== 'undefined')
            ? new COMHelper(onUartStatus, onUartRecv) : null;
    }
    if (!__uartPort) { Toast.error('不支持的接口', '当前浏览器需 Web Serial'); return; }
    function onUartStatus(d, ok) {
        if (ok) {
            __uartOpen = true;
            __uartRecvLen = 0;   // 重置接收增量游标（COMHelper.buffer 为累积数组）
            if (window.__uart && window.__uart.rxArea) window.__uart.rxArea.textContent = '';
            btn.textContent = '关闭串口';
            btn.className = 'uart-btn danger full';
            if (window.__uart) window.__uart.stat.textContent = '已打开 @ ' + baud + ' bps';
        } else if (__uartClosing) {
            // 手动关闭，忽略
        } else if (__uartOpen) {
            __uartOpen = false;
            btn.textContent = '打开串口';
            btn.className = 'uart-btn primary full';
            if (window.__uart) window.__uart.stat.textContent = '连接已断开';
            Toast.warning('已断开', '串口连接丢失');
        } else {
            Toast.error('打开失败', '无法打开串口');
        }
    }
    __uartPort.open(baud);
}

// 串口收到的字节写入接收区（COMHelper 的 onrecvdata 回调）
// 注意：COMHelper.buffer 是累积数组，每次回调都传回完整历史，故只处理“新增”部分，避免指数级重复。
function onUartRecv(buf) {
    const area = window.__uart && window.__uart.rxArea;
    if (!area) return;
    if (!buf || !buf.length) return;
    const from = __uartRecvLen;
    if (from >= buf.length) return;            // 无新增
    const added = Array.from(buf.slice(from)); // 本次真正新收到的字节
    __uartRecvLen = buf.length;                // 推进消费游标
    if (__uartHexMode) {
        // HEX 模式：按字节渲染为 "AA BB CC" 并以空格分隔
        const hex = added.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        area.textContent += (area.textContent.length ? ' ' : '') + hex;
    } else {
        area.textContent += added.map(b => String.fromCharCode(b)).join('');
    }
    // 自动滚到底
    area.scrollTop = area.scrollHeight;
}

// 把 Hex 文本（空格/逗号分隔，可带 0x 前缀）解析为 Uint8Array；非法返回 null
function parseHex(text) {
    if (!text) return null;
    const parts = text.split(/[\s,]+/).filter(p => p.length > 0);
    const out = [];
    for (const p of parts) {
        const h = p.replace(/^0x/i, '');
        if (!/^[0-9a-fA-F]{1,2}$/.test(h)) return null;
        out.push(parseInt(h, 16));
    }
    return out.length ? Uint8Array.from(out) : null;
}

// 快捷发送：asHex=true 按 Hex 解析发送，否则按文本（UTF-8）发送
function uartQuickSend(text, asHex) {
    if (text === undefined || text === null || !String(text).trim()) {
        Toast.warning('提示', '发送内容为空'); return;
    }
    text = String(text);
    if (!__uartOpen || !__uartPort) { Toast.warning('提示', '请先打开串口'); return; }
    let data;
    if (asHex) {
        data = parseHex(text);
        if (!data) { Toast.error('格式错误', '请输入合法 Hex，如 AA BB 0D'); return; }
    } else {
        // 文本按 UTF-8 编码为字节
        data = new TextEncoder().encode(text);
    }
    try {
        __uartPort.sendBytes(data);
    } catch (e) {
        Toast.error('发送失败', (e && e.message) ? e.message : String(e));
    }
}
