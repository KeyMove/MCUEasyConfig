/**
 * 调试 IDE 窗口
 * - 用 MacWindow 做容器，内部用 RichMenu（layout: 'tabs', mode: 'inline'）做两栏 Tab：
 *   第一栏 代码、第二栏 设置。
 * - 「代码」栏自绘 VSCode 风格布局：
 *   左侧多个代码文件管理框（新建/编辑/删除小按钮）；
 *   中间巨大带语法高亮的输入框（textarea + 高亮 overlay）；
 *   顶部靠右侧浮动按钮：编译 / 编译并运行 / 编译并下载；
 *   底部固定高度信息输出框。
 * - 「设置」栏先空着。
 * - 编译逻辑复用 cc/ 目录下的 C4 编译器（c4_reg.js / thumb_backend.js）。
 */

// 单实例引用
let __ideWin = null;
let __ideMenu = null;

// 文件管理状态
let __ideFiles = [];          // [{ id, name, code }]
let __ideActiveId = null;
let __ideFileSeq = 1;
// 已关联的本地文件夹：非空表示打开了用户文件夹，编译时无缝写回（仅可写 handle 时）。
// __ideDirHandle: FileSystemDirectoryHandle（可写）| null；__ideDirReadOnly: 回退只读模式标记。
let __ideDirHandle = null;
let __ideDirReadOnly = false;
let __ideDirName = '';

// 编译选项（顶部下拉框）
let __ideBackend = 'thumb';    // 默认 thumb 后端
let __ideOpt = 2;             // 默认 -O2

// 编译所需后端（由 cc/c4_reg.js、cc/thumb_backend.js 注入全局）
function __ideC4Reg() { return window.C4Reg; }
function __ideC4Thumb() { return window.C4Thumb; }

// Thumb M0 内存参数（参考 cc/index.html）
const __ideMem = { romBase: 0x20000000, ramBase: 0x20000C00, ramSize: 1020, stackSize: 0x100 };

// 最近一次编译结果（供「在 RAM 中运行」「下载」复用，二者只对结果做处理）
let __ideLastResult = null;

// ====== 编译器懒加载（点开调试面板时才注入 cc 脚本，避免拖慢首屏） ======
let __ideCompilerPromise = null;   // 加载中的 Promise（保证只加载一次）
let __ideCompilerLoading = false;

function __ideLoadCompiler() {
    if (window.C4Reg && window.C4Thumb) return Promise.resolve(true);
    if (__ideCompilerPromise) return __ideCompilerPromise;
    __ideCompilerPromise = new Promise((resolve, reject) => {
        const scripts = ['cc/c4_reg.js', 'cc/thumb_backend.js'];
        let idx = 0;
        const loadNext = () => {
            if (idx >= scripts.length) { resolve(true); return; }
            const s = document.createElement('script');
            s.src = scripts[idx++];
            s.onload = loadNext;
            s.onerror = () => reject(new Error('编译器脚本加载失败: ' + s.src));
            document.head.appendChild(s);
        };
        loadNext();
    });
    return __ideCompilerPromise;
}

// 在窗口内容区盖一层加载动画，返回移除函数
function __ideShowLoading() {
    const mask = document.createElement('div');
    mask.id = 'ideLoadingMask';
    mask.style.cssText = 'position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;'
        + 'align-items:center;justify-content:center;gap:16px;background:rgba(11,14,20,.82);'
        + 'backdrop-filter:blur(4px);color:#cbd5e1;font-size:14px;';
    mask.innerHTML = '<div class="ide-spinner"></div><div>正在加载 C4 编译器…</div>';
    const win = __ideWin && __ideWin.contentElement;
    if (win) win.appendChild(mask);
    if (!document.getElementById('ide-spinner-style')) {
        const st = document.createElement('style');
        st.id = 'ide-spinner-style';
        st.textContent = '.ide-spinner{width:38px;height:38px;border:3px solid #2a3550;'
            + 'border-top-color:#4ea1ff;border-radius:50%;animation:ide-spin .7s linear infinite;}'
            + '@keyframes ide-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
    }
    return () => { if (mask.parentNode) mask.parentNode.removeChild(mask); };
}

// 确保编译器已就绪（带加载动画），返回 Promise<boolean>
function __ideEnsureCompiler() {
    if (window.C4Reg && window.C4Thumb) return Promise.resolve(true);
    const remove = __ideShowLoading();
    return __ideLoadCompiler()
        .then(() => { remove(); return true; })
        .catch((e) => { remove(); console.error(e); return false; });
}

// ====== 打开/聚焦「调试」窗口（单实例） ======
function openIdeWindow() {
    if (__ideWin && document.body.contains(__ideWin.windowElement)) {
        __ideWin.show();
        return;
    }

    const win = new MacWindow({
        parent: document.body,
        title: '调试',
        dark: true,
        width: Math.round(window.innerWidth * 0.92),
        height: Math.round(window.innerHeight * 0.90),
        x: Math.round(window.innerWidth * 0.04),
        y: Math.round(window.innerHeight * 0.05),
        resizable: true,
        canTopMost: true
    });
    win.contentElement.style.padding = '0';
    win.contentElement.style.overflow = 'hidden';
    win.contentElement.style.display = 'flex';
    win.contentElement.style.flexDirection = 'column';
    win.contentElement.style.minHeight = '0';

    // 高度链：让 RichMenu 根与内部正确 flex
    if (!document.getElementById('ide-glow-style')) {
        const st = document.createElement('style');
        st.id = 'ide-glow-style';
        st.textContent = `
/* 调试 IDE 布局 */
.ide-root{height:100%;width:100%;min-height:0;display:flex;flex-direction:column;}
.ide-code{flex:1 1 auto;min-height:0;display:flex;flex-direction:row;}
.ide-files{width:200px;min-width:160px;max-width:280px;flex:0 0 auto;display:flex;flex-direction:column;
    background:#0e1219;border-right:1px solid #2a3140;min-height:0;}
.ide-files-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
    border-bottom:1px solid #2a3140;color:#8b94a7;font-size:12px;font-weight:600;}
.ide-files-btns{display:flex;gap:4px;}
.ide-files-btns button{width:24px;height:24px;border:none;border-radius:5px;cursor:pointer;
    background:#1e2430;color:#cbd5e1;font-size:13px;line-height:1;padding:0;}
.ide-files-btns button:hover{background:#2a3550;}
.ide-files-list{flex:1 1 auto;overflow:auto;min-height:0;padding:4px;position:relative;}
.ide-file{padding:6px 8px;border-radius:6px;cursor:pointer;color:#cbd5e1;font-size:13px;
    display:flex;align-items:center;gap:6px;margin-bottom:2px;}
.ide-file:hover{background:#161b26;}
.ide-file.active{background:#1e2a3f;color:#9fd0ff;}
.ide-file .nm{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ide-file .dl{opacity:0;color:#7dd3fc;font-size:13px;padding:0 2px;cursor:pointer;}
.ide-file:hover .dl{opacity:1;}
.ide-file .dl:hover{color:#38bdf8;}
.ide-file .del{opacity:0;color:#ff6b6b;font-size:12px;padding:0 2px;}
.ide-file:hover .del{opacity:1;}
.ide-file .del:hover{color:#ff3b3b;}
.ide-files-head .opened{color:#39d98a;font-size:11px;font-weight:500;margin-left:6px;}
.ide-file .nm-edit{flex:1 1 auto;min-width:0;font-size:13px;color:#e2e8f0;background:#0b1220;
    border:1px solid #4ea1ff;border-radius:4px;padding:2px 4px;outline:none;}

.ide-main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;}
.ide-toolbar{display:flex;justify-content:flex-end;gap:8px;padding:8px 12px;background:#11151d;
    border-bottom:1px solid #2a3140;}
.ide-toolbar button{border:none;border-radius:6px;padding:7px 14px;font-weight:600;cursor:pointer;font-size:13px;}
.ide-toolbar .b-compile{background:#4ea1ff;color:#06121f;}
.ide-toolbar .b-run{background:#39d98a;color:#06121f;}
.ide-toolbar .b-down{background:#f59e0b;color:#06121f;}
.ide-toolbar .b-settings{background:#1e2430;color:#cbd5e1;border:1px solid #2a3140;}
.ide-toolbar button:hover{filter:brightness(1.08);}

/* 语法高亮编辑区 */
.ide-editor-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:row;overflow:hidden;background:#11141c;}
.ide-gutter{flex:0 0 auto;width:52px;overflow:hidden;background:#0d1017;border-right:1px solid #232a38;
    color:#4b5670;font:13px/1.55 'SF Mono',Consolas,'Liberation Mono',Menlo,monospace;text-align:right;
    padding:12px 8px 12px 0;user-select:none;white-space:pre;}
.ide-gutter div{height:1.55em;}
.ide-editor-box{flex:1 1 auto;position:relative;min-width:0;overflow:hidden;}
.ide-editor{position:absolute;inset:0;margin:0;border:none;padding:12px 14px;white-space:pre;
    tab-size:4;font:13px/1.55 'SF Mono',Consolas,'Liberation Mono',Menlo,monospace;
    overflow:auto;resize:none;outline:none;}
textarea.ide-editor{color:transparent;background:transparent;caret-color:#e6ebf2;z-index:2;
    -webkit-text-fill-color:transparent;}
pre.ide-editor{color:#e6ebf2;z-index:1;pointer-events:none;}
.ide-editor .ln{color:#4b5670;}
.c-tok-kw{color:#c792ea;}
.c-tok-str{color:#c3e88d;}
.c-tok-num{color:#f78c6c;}
.c-tok-com{color:#637777;font-style:italic;}
.c-tok-fn{color:#82aaff;}
.c-tok-pre{color:#ffcb6b;}

/* 工具栏下拉框 */
.ide-toolbar select{background:#1e2430;color:#cbd5e1;border:1px solid #2a3140;border-radius:6px;
    padding:6px 10px;font-size:13px;margin-right:8px;}
.ide-toolbar .tb-left{display:flex;align-items:center;gap:6px;margin-right:auto;}
.ide-toolbar .tb-left label{font-size:12px;color:#8b94a7;}

/* 设置表单 */
.ide-settings{padding:18px 22px;overflow:auto;color:#cbd5e1;font-size:13px;}
.ide-settings .row{display:flex;flex-direction:column;gap:4px;margin-bottom:16px;max-width:420px;}
.ide-settings .row label{font-size:12px;color:#8b94a7;}
.ide-settings .row input{background:#1e2430;color:#e6ebf2;border:1px solid #2a3140;border-radius:6px;
    padding:8px 10px;font:13px 'SF Mono',Consolas,monospace;}
.ide-settings .row .hint{font-size:11px;color:#5b6478;}
.ide-settings .savebar{display:flex;gap:10px;margin-top:8px;}
.ide-settings button{border:none;border-radius:6px;padding:7px 16px;font-weight:600;cursor:pointer;font-size:13px;}
.ide-settings .b-save{background:#4ea1ff;color:#06121f;}
.ide-settings .b-reset{background:#1e2430;color:#cbd5e1;border:1px solid #2a3140;}

.ide-output{height:180px;flex:0 0 auto;background:#0b0e14;color:#cdd5e1;
    font:12.5px/1.5 'SF Mono',Consolas,monospace;padding:10px 12px;overflow:auto;
    border-top:1px solid #2a3140;white-space:pre-wrap;}
.ide-output .err{color:#ff6b6b;}
.ide-output .regs{color:#39d98a;}
.ide-output .ok{color:#39d98a;}

/* Tab 面板显隐：RichMenu 默认 .rm-tab-panel{display:none} + .active{display:block}，
   这里让 IDE 代码面板用 flex 填满容器，且仅在 active 时显示 */
.rm-tab-panel.ide-panel{display:none !important;}
.rm-tab-panel.ide-panel.active{display:flex !important;flex-direction:column;}
.rm-tab-panel.ide-panel .ide-root{height:100%;}
`;
        document.head.appendChild(st);
    }

    const host = document.createElement('div');
    host.style.cssText = 'height:100%;width:100%;min-height:0;display:flex;';
    win.contentElement.appendChild(host);

    const menu = new RichMenu({
        mode: 'inline',
        layout: 'tabs',
        theme: 'dark',
        width: '100%',
        showHeader: false,
        showFooter: false,
        sections: [
            { key: 'code', title: '代码', controls: [] }
        ]
    });
    if (menu.element.parentNode) menu.element.parentNode.removeChild(menu.element);
    host.appendChild(menu.element);
    menu.element.style.height = '100%';
    menu.element.style.width = '100%';
    menu.element.style.flex = '1 1 auto';
    menu.element.style.display = 'flex';
    menu.element.style.flexDirection = 'column';
    menu.element.style.minHeight = '0';

    // 让 tabs 面板正确 flex
    const bodyEl = menu.element.querySelector('.rm-body');
    if (bodyEl) {
        bodyEl.style.flex = '1 1 auto';
        bodyEl.style.minHeight = '0';
        bodyEl.style.display = 'flex';
        bodyEl.style.flexDirection = 'column';
        bodyEl.style.overflow = 'hidden';
    }
    const panelsEl = menu.element.querySelector('.rm-tabs-panels');
    if (panelsEl) {
        panelsEl.style.flex = '1 1 auto';
        panelsEl.style.minHeight = '0';
        panelsEl.style.position = 'relative';
        panelsEl.style.display = 'flex';
        panelsEl.style.flexDirection = 'column';
    }
    const navEl = menu.element.querySelector('.rm-tabs-nav');
    if (navEl) { navEl.style.flex = '0 0 auto'; }

    const codePanel = menu.element.querySelector('[data-tab-panel="code"]');
    if (codePanel) buildIdeCodePanel(codePanel);

    const closeBtn = win.windowElement.querySelector('.control-btn.close');
    if (closeBtn) closeBtn.addEventListener('click', () => win.hide());

    __ideWin = win;
    __ideMenu = menu;

    // 首次打开：懒加载 cc 编译器（带加载动画），完成后再填充默认示例文件。
    // 若已加载过（脚本已注入全局），直接填充，无需动画。
    if (!window.C4Reg || !window.C4Thumb) {
        __ideEnsureCompiler().then(() => {
            if (__ideFiles.length === 0) addIdeFile('main.c', DEFAULT_IDE_SRC, true);
            else { renderIdeFileList(); selectIdeFile(__ideActiveId); }
        });
    } else {
        if (__ideFiles.length === 0) addIdeFile('main.c', DEFAULT_IDE_SRC, true);
        else { renderIdeFileList(); selectIdeFile(__ideActiveId); }
    }
}

// ====== 「代码」栏布局 ======
function buildIdeCodePanel(panel) {
    panel.classList.add('ide-panel', 'ide-panel-code');
    panel.style.cssText = 'position:absolute;inset:0;';
    const root = document.createElement('div');
    root.className = 'ide-root';

    // 主体：左文件列表 + 右编辑/输出
    const code = document.createElement('div');
    code.className = 'ide-code';

    // ---- 左侧文件管理 ----
    const files = document.createElement('div');
    files.className = 'ide-files';
    const fhead = document.createElement('div');
    fhead.className = 'ide-files-head';
    fhead.innerHTML = '<span>文件<span class="opened" id="ideDirTag"></span></span>';
    const fbtns = document.createElement('div');
    fbtns.className = 'ide-files-btns';
    const bNew = document.createElement('button'); bNew.textContent = '＋'; bNew.title = '新建文件';
    const bEdit = document.createElement('button'); bEdit.textContent = '✎'; bEdit.title = '重命名当前文件';
    const bDel = document.createElement('button'); bDel.textContent = '🗑'; bDel.title = '删除当前文件';
    bNew.onclick = () => {
        // 新建：直接在文件列表里插入可编辑的文件名（行内编辑态）
        const f = { id: __ideFileSeq++, name: 'untitled.c', code: '' };
        __ideFiles.push(f);
        renderIdeFileList();
        selectIdeFile(f.id);
        startRename(f, true);
    };
    bEdit.onclick = () => {
        if (!__ideActiveId) return;
        const f = __ideFiles.find(x => x.id === __ideActiveId);
        startRename(f, false);
    };
    bDel.onclick = () => {
        if (!__ideActiveId) return;
        const f = __ideFiles.find(x => x.id === __ideActiveId);
        ideConfirmInList('删除文件', '确定要删除「' + f.name + '」吗？此操作不可撤销。',
            '删除', '取消').then(ok => { if (ok) deleteIdeFile(f.id); });
    };
    // 打开文件夹：读取用户本地文件夹，载入现成源码。关联后编译即无缝写回本地。
    const bFolder = document.createElement('button'); bFolder.textContent = '📁'; bFolder.title = '打开文件夹';
    bFolder.onclick = () => ideOpenFolder();
    fbtns.append(bNew, bEdit, bDel, bFolder);
    fhead.appendChild(fbtns);
    const flist = document.createElement('div');
    flist.className = 'ide-files-list';
    flist.id = 'ideFileList';
    files.append(fhead, flist);

    // ---- 右侧主区 ----
    const main = document.createElement('div');
    main.className = 'ide-main';

    // 顶部工具栏：左侧下拉（后端 / 优化），右侧浮动按钮
    const toolbar = document.createElement('div');
    toolbar.className = 'ide-toolbar';
    const tbLeft = document.createElement('div');
    tbLeft.className = 'tb-left';
    const selBackend = document.createElement('select');
    selBackend.id = 'ideBackend';
    [['reg', '寄存器 VM'], ['thumb', 'Thumb M0']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; selBackend.appendChild(o);
    });
    selBackend.value = __ideBackend;
    selBackend.onchange = () => { __ideBackend = selBackend.value; };
    const selOpt = document.createElement('select');
    selOpt.id = 'ideOpt';
    [0, 1, 2, 3, 4, 5].forEach(o => {
        const op = document.createElement('option'); op.value = String(o); op.textContent = '-O' + o; selOpt.appendChild(op);
    });
    selOpt.value = String(__ideOpt);
    selOpt.onchange = () => { __ideOpt = parseInt(selOpt.value, 10); };
    const btnSettings = mkBtn('📊内存', 'b-settings', () => ideOpenMemDialog());
    tbLeft.append(
        Object.assign(document.createElement('label'), { textContent: '后端' }),
        selBackend,
        Object.assign(document.createElement('label'), { textContent: '优化' }),
        selOpt,
        btnSettings
    );
    const btnCompile = mkBtn('编译', 'b-compile', () => ideDoCompile());
    const btnRun = mkBtn('在 RAM 中运行', 'b-run', () => ideDoRun());
    const btnDown = mkBtn('下载', 'b-down', () => ideDoDownload());
    toolbar.append(tbLeft, btnCompile, btnRun, btnDown);

    // 编辑区：左侧行号 gutter + （textarea + pre 高亮 overlay）
    const editorWrap = document.createElement('div');
    editorWrap.className = 'ide-editor-wrap';
    const gutter = document.createElement('div');
    gutter.className = 'ide-gutter';
    gutter.id = 'ideGutter';
    const editorBox = document.createElement('div');
    editorBox.className = 'ide-editor-box';
    const pre = document.createElement('pre');
    pre.className = 'ide-editor';
    pre.id = 'ideHighlight';
    pre.setAttribute('aria-hidden', 'true');
    const ta = document.createElement('textarea');
    ta.className = 'ide-editor';
    ta.id = 'ideInput';
    ta.spellcheck = false;
    ta.wrap = 'off';
    ta.addEventListener('input', () => { syncIdeEditor(); });
    ta.addEventListener('scroll', () => {
        pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
        gutter.scrollTop = ta.scrollTop;
    });
    // Tab 键插入缩进（VSCode 风格），不丢失焦点
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
            ta.selectionStart = ta.selectionEnd = s + 4;
            syncIdeEditor();
        }
    });
    editorBox.append(pre, ta);
    editorWrap.append(gutter, editorBox);

    // 底部固定高度输出
    const out = document.createElement('div');
    out.className = 'ide-output';
    out.id = 'ideOutput';
    out.textContent = '就绪';

    main.append(toolbar, editorWrap, out);
    code.append(files, main);
    root.appendChild(code);
    panel.appendChild(root);
}

// ====== 「设置」栏：Thumb M0 内存参数 ======
function parseHexOrDec(s) {
    s = (s || '').trim();
    if (/^0x/i.test(s)) return parseInt(s, 16);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    return parseInt(s, 16);
}
function toHex(v) { return '0x' + ((v >>> 0).toString(16)).toUpperCase(); }

// 弹出「设置内存」模态框（RichMenu dialog 模式，但遮罩限制在 IDE 窗口内部，不弹全屏）
let __ideMemDialog = null;
function ideOpenMemDialog() {
    if (__ideMemDialog) { __ideMemDialog.show(); ideMemDialogToWindow(__ideMemDialog); return; }
    const dlg = new RichMenu({
        mode: 'dialog',
        layout: 'vertical',
        theme: 'dark',
        title: 'Thumb M0 内存参数',
        width: 460,
        showHeader: true,
        showFooter: true,
        sections: [
            {
                key: 'mem', title: '',
                controls: [
                    { type: 'text', id: 'romBase', label: 'romBase（ROM 基地址，十六进制）', value: toHex(__ideMem.romBase) },
                    { type: 'text', id: 'ramBase', label: 'ramBase（RAM 基地址，十六进制）', value: toHex(__ideMem.ramBase) },
                    { type: 'text', id: 'ramSize', label: 'ramSize（RAM 大小，十进制字节）', value: String(__ideMem.ramSize) },
                    { type: 'text', id: 'stackSize', label: 'stackSize（栈大小，十六进制）', value: toHex(__ideMem.stackSize) },
                ]
            }
        ],
        buttons: [
            { type: 'button', label: '保存', style: 'primary', onClick: () => {
                const map = { romBase: true, ramBase: true, ramSize: false, stackSize: true };
                for (const id in map) {
                    const raw = (dlg.getValue(id) || '').trim();
                    const v = parseHexOrDec(raw);
                    if (isNaN(v)) { ideModal({ title: '输入有误', message: id + ' 解析失败：' + raw }); return; }
                    __ideMem[id] = v;
                }
                ideSetOutput('<span class="ok">✓ 内存参数已更新</span>（' + toHex(__ideMem.romBase) + ' / '
                    + toHex(__ideMem.ramBase) + ' / ' + __ideMem.ramSize + ' / ' + toHex(__ideMem.stackSize) + '）');
            } },
            { type: 'button', label: '恢复默认', style: 'secondary', onClick: () => {
                dlg.setValue('romBase', toHex(0x20000000));
                dlg.setValue('ramBase', toHex(0x20000C00));
                dlg.setValue('ramSize', '1020');
                dlg.setValue('stackSize', toHex(0x100));
            } },
            { type: 'cancel', label: '关闭', style: 'secondary' },
        ]
    });
    dlg.show();
    // 把遮罩限制在 IDE 窗口内部（覆盖整个窗口大小），而不是全屏固定
    ideMemDialogToWindow(dlg);
    __ideMemDialog = dlg;
}

// 将 RichMenu dialog 的遮罩从 body 移到 IDE 窗口内容容器内，改为 absolute 限制窗口范围
function ideMemDialogToWindow(dlg) {
    if (!dlg || !dlg.overlay) return;
    const host = (__ideWin && __ideWin.contentElement) ? __ideWin.contentElement : document.body;
    if (dlg.overlay.parentNode !== host) host.appendChild(dlg.overlay);
    // 覆盖 RichMenu 默认 fixed 全屏样式：限制在窗口内
    dlg.overlay.style.position = 'absolute';
    dlg.overlay.style.inset = '0';
    dlg.overlay.style.zIndex = '40';
}

// 把 RichMenu 对话框提到所有 MacWindow 之上（避免被窗口遮挡）
function ideDialogToFront(dlg) {
    if (!dlg) return;
    const base = (typeof MacWindow !== 'undefined' && MacWindow && MacWindow._topZ) ? MacWindow._topZ : 10000;
    const z = base + 1;
    if (dlg.overlay) dlg.overlay.style.zIndex = z;
    if (dlg.element) dlg.element.style.zIndex = z;
}

function mkBtn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = cls; b.textContent = label;
    b.onclick = onClick;
    return b;
}

// ====== 内置模态窗（基于 RichMenu sidebar，从右侧滑出，不弹全屏遮罩） ======
// 通用模态：opts = { title, message, controls[], buttons[], side }
function ideModal(opts) {
    const dlg = new RichMenu({
        mode: 'sidebar',
        sidebarSide: opts.side || 'right',
        layout: 'vertical',
        theme: 'dark',
        title: opts.title || '',
        width: opts.width || 380,
        showHeader: true,
        showFooter: true,
        sections: [
            {
                key: '_m', title: '',
                controls: opts.controls || (opts.message
                    ? [{ type: 'textarea', id: '_msg', value: opts.message, readonly: true, hideLabel: true }]
                    : [])
            }
        ],
        buttons: opts.buttons || [{ type: 'cancel', label: '关闭', style: 'secondary' }]
    });
    dlg.show();
    ideDialogToFront(dlg);
    return dlg;
}

// 确认模态（替代原生 confirm）。onOk 在点击主按钮时触发。单例复用，避免反复堆积隐藏面板。
let __ideConfirmDlg = null;
let __ideConfirmOnOk = null;
function ideConfirmModal(title, message, okLabel, cancelLabel, onOk) {
    if (__ideConfirmDlg) {
        // 复用已有实例：更新标题、消息、回调
        const titleEl = __ideConfirmDlg.element.querySelector('.rm-title');
        if (titleEl) titleEl.textContent = title || '';
        __ideConfirmDlg.setValue('_msg', message || '');
        __ideConfirmOnOk = onOk || null;
        __ideConfirmDlg.show();
        ideDialogToFront(__ideConfirmDlg);
        return __ideConfirmDlg;
    }
    const dlg = ideModal({
        title, message, width: 400,
        buttons: [
            { type: 'button', label: okLabel || '确定', style: 'primary', onClick: () => { if (__ideConfirmOnOk) __ideConfirmOnOk(); dlg.hide(); } },
            { type: 'cancel', label: cancelLabel || '取消', style: 'secondary' }
        ]
    });
    __ideConfirmDlg = dlg;
    __ideConfirmOnOk = onOk || null;
    return dlg;
}

// 删除确认：模态只弹在文件列表 div 内部（遮罩 absolute;inset:0 限制在列表范围），不弹全屏。
// 参考 main.js 的 confirmModal（挂在 dock 菜单面板内部的做法）。返回 Promise<boolean>。
function ideConfirmInList(title, message, okLabel, cancelLabel) {
    return new Promise((resolve) => {
        const host = document.getElementById('ideFileList');
        if (!host) { resolve(false); return; }
        // 清掉旧的（避免堆积）
        const old = host.querySelector('.ide-list-confirm');
        if (old) old.remove();
        const overlay = document.createElement('div');
        overlay.className = 'ide-list-confirm';
        overlay.style.cssText = 'position:absolute;inset:0;background:rgba(8,12,20,0.72);' +
            'display:flex;align-items:center;justify-content:center;z-index:5;' +
            'font-family:system-ui,-apple-system,sans-serif;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#1e293b;border:1px solid #475569;border-radius:10px;padding:16px;' +
            'width:calc(100% - 24px);max-width:240px;box-shadow:0 12px 32px rgba(0,0,0,0.5);';
        const h = document.createElement('div');
        h.textContent = title;
        h.style.cssText = 'color:#f87171;font-size:14px;font-weight:600;margin-bottom:8px;';
        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.cssText = 'color:#e2e8f0;font-size:12px;line-height:1.6;margin-bottom:14px;white-space:pre-wrap;';
        const btns = document.createElement('div');
        btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelLabel || '取消';
        cancelBtn.style.cssText = 'padding:6px 12px;border:1px solid #475569;background:transparent;color:#cbd5e1;border-radius:6px;cursor:pointer;font-size:12px;';
        const okBtn = document.createElement('button');
        okBtn.textContent = okLabel || '删除';
        okBtn.style.cssText = 'padding:6px 12px;border:none;background:#f87171;color:#0f172a;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;';
        btns.append(cancelBtn, okBtn);
        box.append(h, msg, btns);
        overlay.appendChild(box);
        host.appendChild(overlay);
        const finish = (res) => {
            if (overlay.parentNode) overlay.remove();
            document.removeEventListener('keydown', onKey, true);
            resolve(res);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
        };
        // 点遮罩空白处 = 取消
        overlay.onclick = (e) => { if (e.target === overlay) finish(false); };
        cancelBtn.onclick = () => finish(false);
        okBtn.onclick = () => finish(true);
        // 捕获阶段拦截 ESC，避免触发 IDE 窗口自身关闭
        document.addEventListener('keydown', onKey, true);
    });
}

// ====== 文件管理 ======
function addIdeFile(name, code, active) {
    const f = { id: __ideFileSeq++, name, code };
    __ideFiles.push(f);
    renderIdeFileList();
    if (active) selectIdeFile(f.id);
    else if (!__ideActiveId) selectIdeFile(f.id);
}

function renderIdeFileList() {
    const list = document.getElementById('ideFileList');
    if (!list) return;
    list.innerHTML = '';
    __ideFiles.forEach(f => {
        const row = document.createElement('div');
        row.className = 'ide-file' + (f.id === __ideActiveId ? ' active' : '');
        row.dataset.id = f.id;
        const nm = document.createElement('span');
        nm.className = 'nm'; nm.textContent = f.name;
        const dl = document.createElement('span');
        dl.className = 'dl'; dl.textContent = '⤓'; dl.title = '下载该文件';
        dl.onclick = (e) => {
            e.stopPropagation();
            ideDownloadFile(f);
        };
        const del = document.createElement('span');
        del.className = 'del'; del.textContent = '✕';
        del.title = '删除';
        del.onclick = (e) => {
            e.stopPropagation();
            ideConfirmInList('删除文件', '确定要删除「' + f.name + '」吗？此操作不可撤销。',
                '删除', '取消').then(ok => { if (ok) deleteIdeFile(f.id); });
        };
        row.append(nm, dl, del);
        // 单击：切换文件（编辑窗口跟随更新）
        row.onclick = () => selectIdeFile(f.id);
        // 双击：进入修改文件名状态
        row.ondblclick = (e) => { e.stopPropagation(); startRename(f, false); };
        list.appendChild(row);
    });
}

// 进入文件名行内编辑态（isNew=true 用于新建时预填并选中）
function startRename(f, isNew) {
    const list = document.getElementById('ideFileList');
    if (!list) return;
    const row = list.querySelector('.ide-file[data-id="' + f.id + '"]');
    if (!row) { renderIdeFileList(); return startRename(f, isNew); }
    const nm = row.querySelector('.nm');
    if (!nm) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'nm-edit';
    input.value = f.name;
    nm.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const commit = () => {
        if (done) return; done = true;
        const v = input.value.trim();
        if (!v) { // 空名：新建则删除，重命名则还原
            if (isNew) { deleteIdeFile(f.id); return; }
        } else {
            f.name = v;
        }
        renderIdeFileList();
        if (__ideActiveId === f.id) selectIdeFile(f.id);
    };
    const cancel = () => {
        if (done) return; done = true;
        if (isNew) { deleteIdeFile(f.id); return; }
        renderIdeFileList();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
}

// 删除文件（统一入口）
function deleteIdeFile(id) {
    const i = __ideFiles.findIndex(x => x.id === id);
    if (i < 0) return;
    __ideFiles.splice(i, 1);
    if (__ideFiles.length === 0) { addIdeFile('main.c', '', true); }
    else {
        const nextId = __ideFiles[Math.max(0, i - 1)].id;
        __ideActiveId = nextId;
        renderIdeFileList();
        selectIdeFile(nextId);
    }
}

function selectIdeFile(id) {
    const ta = document.getElementById('ideInput');
    const pre = document.getElementById('ideHighlight');
    // 先保存当前编辑框内容到「旧」文件（此时 __ideActiveId 还是旧 id）
    saveIdeCurrent();
    __ideActiveId = id;
    const f = __ideFiles.find(x => x.id === id);
    if (f && ta) {
        ta.value = f.code;
        syncIdeEditor();
    }
    renderIdeFileList();
}

function saveIdeCurrent() {
    if (!__ideActiveId) return;
    const ta = document.getElementById('ideInput');
    const f = __ideFiles.find(x => x.id === __ideActiveId);
    if (f && ta) f.code = ta.value;
}

// ====== 文件夹：打开 / 无缝保存 / 单文件下载 ======

// 打开用户本地文件夹，把文本文件载入为 IDE 文件列表。
// 优先用 File System Access API（可读可写，之后编译即无缝写回）；
// 不支持时回退到 <input webkitdirectory>（仅加载，写回不可用）。
async function ideOpenFolder() {
    // 1) 现代 API：showDirectoryPicker（Chrome/Edge 等，需安全上下文）
    if (typeof window.showDirectoryPicker === 'function') {
        try {
            const dir = await window.showDirectoryPicker();
            const files = [];
            for await (const [name, handle] of dir.entries()) {
                if (handle.kind !== 'file') continue;
                if (!/\.(c|h|cpp|cc|hpp|txt|s|asm|S|inc)$/i.test(name)) continue;
                const file = await handle.getFile();
                const code = await file.text();
                files.push({ id: __ideFileSeq++, name, code });
            }
            if (!files.length) {
                Toast.warning('打开文件夹', '文件夹中没有可识别的源码文件（支持 .c/.h/.cpp/.cc/.hpp/.txt/.s/.asm/.inc）');
                return;
            }
            applyOpenedFolder(dir, files, false);
            return;
        } catch (e) {
            if (e && e.name === 'AbortError') return; // 用户取消
            console.error(e);
            Toast.warning('打开文件夹', '目录读取失败：' + (e.message || e) + '，尝试其他方式的打开。');
            // 落到回退方案
        }
    }
    // 2) 回退：<input type=file webkitdirectory>，仅可读
    ideOpenFolderFallback();
}

function ideOpenFolderFallback() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.webkitdirectory = true;
    inp.onchange = async () => {
        const list = Array.from(inp.files || []);
        const files = [];
        for (const file of list) {
            const name = file.name;
            if (!/\.(c|h|cpp|cc|hpp|txt|s|asm|S|inc)$/i.test(name)) continue;
            const code = await file.text();
            files.push({ id: __ideFileSeq++, name, code });
        }
        if (!files.length) {
            Toast.warning('打开文件夹', '未选择到可识别的源码文件');
            return;
        }
        applyOpenedFolder(null, files, true);
    };
    inp.click();
}

// 套用打开结果：替换文件列表、记录文件夹句柄、刷新 UI
function applyOpenedFolder(dirHandle, files, readOnly) {
    __ideDirHandle = dirHandle;          // 可写句柄 或 null
    __ideDirReadOnly = !!readOnly;
    __ideDirName = dirHandle ? (dirHandle.name || '文件夹') : '本地文件夹（只读）';
    __ideFiles = files;
    __ideActiveId = files[0] ? files[0].id : null;
    const tag = document.getElementById('ideDirTag');
    if (tag) tag.textContent = ' · ' + __ideDirName;
    renderIdeFileList();
    if (__ideActiveId) selectIdeFile(__ideActiveId);
    const mode = readOnly ? '（只读，单文件可下载但不写回）' : '（已关联，编译即自动保存）';
    ideSetOutput('<span class="ok">✓ 已打开文件夹「' + escapeHtml(__ideDirName) + '」：' + files.length + ' 个文件 ' + mode + '</span>');
    Toast.success('已打开文件夹', files.length + ' 个文件已载入' + mode);
}

// 无缝写回：把当前文件列表内容保存回已关联的本地文件夹。
// 仅在有可写句柄时执行（现代 API）。返回是否执行了写回。
async function ideSyncFolder() {
    if (!__ideDirHandle) return false; // 未关联文件夹，或只读回退模式
    saveIdeCurrent(); // 确保当前编辑内容最新
    try {
        for (const f of __ideFiles) {
            const fh = await __ideDirHandle.getFileHandle(f.name, { create: true });
            const w = await fh.createWritable();
            await w.write(f.code || '');
            await w.close();
        }
        return true;
    } catch (e) {
        console.error(e);
        ideSetOutput('<span class="err">写回文件夹失败: ' + escapeHtml(e.message || e) + '</span>');
        return false;
    }
}

// 单文件下载：把该文件内容以 Blob 形式触发浏览器下载（与顶部「下载 bin」区分）。
function ideDownloadFile(f) {
    if (!f) return;
    const blob = new Blob([f.code || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = f.name || 'untitled.c';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ====== 语法高亮（C 语言，轻量） ======
const IDE_KW = new Set(('int char short long unsigned signed float double void struct union enum '
    + 'if else for while do switch case break continue return sizeof typedef static const '
    + 'extern register volatile auto goto default').split(/\s+/));

function escapeHtml(s) {
    return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function highlightC(src) {
    // 逐字符分词（支持 // 与 /* */ 注释、字符串、字符、数字、标识符、预处理）
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        // 行注释
        if (c === '/' && src[i + 1] === '/') {
            let j = i; while (j < n && src[j] !== '\n') j++;
            out += '<span class="c-tok-com">' + escapeHtml(src.slice(i, j)) + '</span>';
            i = j; continue;
        }
        // 块注释
        if (c === '/' && src[i + 1] === '*') {
            let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
            j = Math.min(n, j + 2);
            out += '<span class="c-tok-com">' + escapeHtml(src.slice(i, j)) + '</span>';
            i = j; continue;
        }
        // 字符串
        if (c === '"') {
            let j = i + 1; while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; j++; }
            j = Math.min(n, j + 1);
            out += '<span class="c-tok-str">' + escapeHtml(src.slice(i, j)) + '</span>';
            i = j; continue;
        }
        // 字符
        if (c === "'") {
            let j = i + 1; while (j < n && src[j] !== "'") { if (src[j] === '\\') j++; j++; }
            j = Math.min(n, j + 1);
            out += '<span class="c-tok-str">' + escapeHtml(src.slice(i, j)) + '</span>';
            i = j; continue;
        }
        // 预处理指令（行首 #）
        if (c === '#') {
            let j = i; while (j < n && src[j] !== '\n') j++;
            out += '<span class="c-tok-pre">' + escapeHtml(src.slice(i, j)) + '</span>';
            i = j; continue;
        }
        // 数字
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
            let j = i; while (j < n && /[0-9a-fA-FxX.bBoOeE+-]/.test(src[j])) j++;
            out += '<span class="c-tok-num">' + escapeHtml(src.slice(i, j)) + '</span>';
            i = j; continue;
        }
        // 标识符
        if (/[A-Za-z_]/.test(c)) {
            let j = i; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
            const word = src.slice(i, j);
            let cls = '';
            if (IDE_KW.has(word)) cls = 'c-tok-kw';
            else if (src[j] === '(') cls = 'c-tok-fn';
            out += cls ? '<span class="' + cls + '">' + escapeHtml(word) + '</span>' : escapeHtml(word);
            i = j; continue;
        }
        out += escapeHtml(c);
        i++;
    }
    return out;
}

function syncIdeEditor() {
    const ta = document.getElementById('ideInput');
    const pre = document.getElementById('ideHighlight');
    const gutter = document.getElementById('ideGutter');
    if (!ta || !pre) return;
    saveIdeCurrent();
    pre.innerHTML = highlightC(ta.value) + '\n';
    // 行号
    if (gutter) {
        const lines = ta.value.split('\n').length;
        let html = '';
        for (let ln = 1; ln <= lines; ln++) html += '<div>' + ln + '</div>';
        gutter.innerHTML = html;
    }
}

// ====== 编译/运行（复用 cc 编译器） ======
function ideCurrentPayload() {
    saveIdeCurrent();
    const f = __ideFiles.find(x => x.id === __ideActiveId);
    return f ? f.code : '';
}

function ideSetOutput(html) {
    const out = document.getElementById('ideOutput');
    if (out) out.innerHTML = html;
}

function ideReadCpuStr(ctx, addr) {
    const mem = ctx._cpu && ctx._cpu.memory;
    if (!mem) { let s = ''; for (let i = addr; ctx.data[i]; i++) s += String.fromCharCode(ctx.data[i]); return s; }
    let s = '', max = 4096;
    while (max--) { const b = mem.readByte(addr); if (b === 0) break; s += String.fromCharCode(b); addr++; }
    return s;
}

function ideThumbSysFuncs() {
    return {
        printf: (ctx, sp, ac) => {
            const base = sp >> 2;
            let fmtPtr = ctx.Intdata[base];
            if (fmtPtr > 0 && fmtPtr < 0x10000) fmtPtr += 0x20000C00;
            const fmt = ideReadCpuStr(ctx, fmtPtr);
            let result = '', ai = 1;
            for (let i = 0; i < fmt.length; i++) {
                if (fmt[i] === '%') {
                    i++; let width = -1;
                    if (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') { width = 0; while (i < fmt.length && fmt[i] >= '0' && fmt[i] <= '9') { width = width * 10 + (fmt.charCodeAt(i) - 48); i++; } }
                    if (i >= fmt.length) break;
                    const spec = fmt[i]; let val; const argVal = ctx.Intdata[base + ai]; ai++;
                    switch (spec) {
                        case 'd': val = '' + (argVal | 0); break;
                        case 'u': val = '' + (argVal >>> 0); break;
                        case 'x': val = (argVal >>> 0).toString(16); break;
                        case 'c': val = String.fromCharCode(argVal & 0xFF); break;
                        case 's': val = ideReadCpuStr(ctx, argVal); break;
                        case '%': val = '%'; break;
                        default: val = '%' + spec; break;
                    }
                    if (width > 0 && val.length < width) val = ' '.repeat(width - val.length) + val;
                    result += val; continue;
                }
                result += fmt[i];
            }
            ctx.output += result; return 0;
        },
        exit: (ctx, sp) => { ctx.output += `exit(${ctx.Intdata[sp >> 2]})\r\n`; ctx._exitFlag = true; return 0; },
        malloc: (ctx, sp) => { const r = ctx.datapos; ctx.datapos += ctx.Intdata[sp >> 2]; ctx.datapos = (ctx.datapos + ctx.intsizeof) & (-ctx.intsizeof); return r; },
        free: () => 0,
        memset: (ctx, sp) => { const b = sp >> 2; const d1 = ctx.Intdata[b], v1 = ctx.Intdata[b + 1] & 0xFF, c1 = ctx.Intdata[b + 2]; for (let i = 0; i < c1; i++) ctx.rwdata[d1 + i] = v1; return 0; },
        memcpy: (ctx, sp) => { const b = sp >> 2; const dst = ctx.Intdata[b], src = ctx.Intdata[b + 1], nn = ctx.Intdata[b + 2]; for (let i = 0; i < nn; i++) ctx.rwdata[dst + i] = ctx.rwdata[src + i]; return 0; },
        memcmp: (ctx, sp) => { const b = sp >> 2; const s1 = ctx.Intdata[b], s2 = ctx.Intdata[b + 1], ln = ctx.Intdata[b + 2]; let df = 0; for (let i = 0; i < ln; i++) { if (ctx.rwdata[s1 + i] !== ctx.rwdata[s2 + i]) { df = 1; break; } } return df; },
    };
}

function ideRegSysFuncs() {
    const kc = __ideC4Reg().kc_reg;
    return Object.assign({}, kc.defaultSysFuncs, {
        printf: (ctx, sp, ac) => { const r = ctx.printf(ctx.Intdata[(sp >> 2) + ac - 1], ctx.Intdata[(sp >> 2) + ac - 2], ctx.Intdata[(sp >> 2) + ac - 3], ctx.Intdata[(sp >> 2) + ac - 4]); ctx.output += r; return 0; },
        exit: (ctx, sp) => { const msg = `exit(${ctx.Intdata[sp >> 2]})\r\n`; ctx.output += msg; ctx._exitFlag = true; return 0; },
    });
}

// 统一编译（依据传入的 backend / opt / src），返回结果对象或抛出。
// 编译即「生成 bin」：Thumb 后端会调用 genROM 产出 rom 数组（这就是 bin）。
function ideCompile(src, backend, opt, globalDefines) {
    const C4 = __ideC4Reg();
    if (!C4) throw Error('cc/c4_reg.js 未加载');
    // 全局宏（面板「define 投射」控件）：优先用调用方显式传入的 globalDefines，
    // 否则自动合并所有运行中的 PanelRuntime 实例投射出的宏，使「面板值 → C 宏」在
    // 调试面板点击编译时自动生效，无需手动关联。
    let mergedDefines = Object.assign({}, globalDefines || {});
    if (window.PanelRuntime && PanelRuntime.registry && PanelRuntime.registry.size) {
        PanelRuntime.registry.forEach(rt => {
            const d = (typeof rt.getDefines === 'function') ? rt.getDefines() : {};
            Object.assign(mergedDefines, d);
        });
    }
    // 多文件支持：把 IDE 中所有文件作为 include 提供给预处理器。
    // 不在这里单独跑预处理器——kc_reg.Comper 内部已用 this.fileIncludes
    // 跑一遍 Preprocessor 拍平 #include，避免重复执行。include 的 key 即文件名
    // （含扩展名），需与源码里 #include 的引号内容一致。
    const buildIncludes = () => {
        const inc = {};
        for (const f of __ideFiles) inc[f.name] = f.code;
        return inc;
    };
    if (backend === 'thumb') {
        const C4T = __ideC4Thumb();
        if (!C4T) throw Error('cc/thumb_backend.js 未加载');
        const be = new C4T.ThumbBackend(opt);
        be.enableLineMapping(src);
        const c = new C4.kc_reg(1, be);
        c.fileIncludes = buildIncludes();
        c.globalDefines = mergedDefines;   // 注入面板 define 投射
        const sys = ideThumbSysFuncs();
        const mainAddr = c.Comper(src, 1, sys);
        // 在 genROM 之前抓取全局变量符号表（此时符号表干净、Val 为 data 区字节偏移、
        // getstring 可读出名字；genROM 之后部分 pass 会改写符号，不可靠）。
        // 地址布局与 genROM 一致：genROM 内 dataBase = opts.ramBase，故全局变量
        // 绝对地址 = ramBase + sym.Val（Val 已是字节偏移，不再乘 4）。
        const ramBase = (__ideMem && __ideMem.ramBase) ? __ideMem.ramBase : 0x20000000;
        const globals = collectGlobals(c, ramBase);
        // 生成 ROM（bin）
        const rom = be.genROM(mainAddr, [], null, c, __ideMem);
        const summary = be._lastSummary || '';
        // 保留 backend/c 实例，供「在 RAM 中运行」直接执行（无需重新编译）
        return { backend: 'thumb', mainAddr, rom, summary, be, c, globals };
    } else {
        const c = new C4.kc_reg(1, new C4.RegBackend());
        c.fileIncludes = buildIncludes();
        c.globalDefines = mergedDefines;   // 注入面板 define 投射
        const mainAddr = c.Comper(src, 1, ideRegSysFuncs());
        return { backend: 'reg', mainAddr, rom: null, summary: '', be: null, c };
    }
}

// 从编译器实例 c 收集全局变量符号表：name → { addr, size, type }
// 必须在 genROM 之前调用（符号表干净）。Val 为 data 区字节偏移，addr = ramBase + Val。
function collectGlobals(c, ramBase) {
    if (!c || !c.sysboltable) return {};
    const C4 = __ideC4Reg();
    const Glo = C4 ? C4.tokens.Glo : 131;
    const sys = c.sysboltable;
    const out = {};
    for (let i = 0; i < sys.length; i++) {
        const s = sys[i];
        if (!s || s.Class !== Glo || !s.Name) continue;
        // 注意：s.Name 是「源码偏移」，不是 data 字符串偏移，必须用 _getSrcId 取名字
        // （getstring(s.Name) 会读错位置得到空串，导致符号被跳过、__ideGlobals 为空）。
        const name = (typeof c._getSrcId === 'function') ? c._getSrcId(s.Name) : String(s.Name);
        if (!name) continue;
        const off = s.Val | 0;                 // 字节偏移
        const size = (s.ArrSize && s.ArrSize > 1) ? s.ArrSize : 1;
        out[name] = { addr: (ramBase + off) >>> 0, size: size * 4, type: s.Type };
    }
    return out;
}

// 编译（生成 bin）：独立按钮。结果存入 __ideLastResult，运行/下载都基于它。
async function ideDoCompile() {
    const ok = await __ideEnsureCompiler();
    if (!ok) { ideSetOutput('<span class="err">编译器未加载（cc/c4_reg.js 缺失）</span>'); return; }
    const src = ideCurrentPayload();
    try {
        const r = ideCompile(src, __ideBackend, __ideOpt);
        __ideLastResult = r; // 含 backend/c/rom/mainAddr，供运行与下载复用
        // 导出全局变量符号表，供 SWD 变量右键菜单直接使用（无需 AXF）。
        // 编译器在编译期即已知每个全局变量在数据区的字节偏移（c.sysboltable[i].Val），
        // 绝对地址 = ramBase + Val。注意 IDE 调试 RAM 基址是 __ideMem.ramBase，
        // 与「在 RAM 中运行」写入的基址一致。
        window.__ideGlobals = r.globals || {};
        let msg = '<span class="ok">✓ 编译成功（已生成 bin）</span>（' + (__ideBackend === 'thumb' ? 'Thumb M0' : '寄存器 VM')
            + ' 后端，-O' + __ideOpt + '）\n主函数地址: 0x' + (r.mainAddr >>> 0).toString(16);
        const gn = window.__ideGlobals ? Object.keys(window.__ideGlobals).length : 0;
        if (gn) msg += '\n全局变量: ' + gn + ' 个（右键单元格可插入地址/R/W）';
        if (r.backend === 'thumb') {
            if (!r.rom || !r.rom.length) throw Error('生成的 ROM 为空');
            msg += '\nbin 大小: ' + r.rom.length + ' B';
            if (r.summary) msg += '\n\n' + escapeHtml(r.summary);
        }
        // 已关联本地文件夹时，编译即把最新内容无缝写回（变动即保存，无需手动保存）
        if (__ideDirHandle) {
            const saved = await ideSyncFolder();
            if (saved) msg += '\n已自动保存 ' + __ideFiles.length + ' 个文件到「' + escapeHtml(__ideDirName) + '」';
        }
        ideSetOutput(msg);
    } catch (e) {
        __ideLastResult = null;
        ideSetOutput('<span class="err">编译失败: ' + escapeHtml(e.message || e) + '</span>');
    }
}

// 在 RAM 中运行：调用 swd.js 的 runram，把编译生成的 bin 写入 RAM（0x20000000）并跳转执行
async function ideDoRun() {
    if (!__ideLastResult) {
        Toast.warning('提示', '请先点击「编译」生成 bin，再运行');
        ideSetOutput('<span class="err">请先点击「编译」生成 bin，再运行</span>');
        return;
    }
    const last = __ideLastResult;
    if (last.backend !== 'thumb') {
        Toast.warning('提示', '「在 RAM 中运行」仅支持 Thumb M0 后端，请切换为 Thumb M0 并重新编译');
        return;
    }
    if (!last.rom || !last.rom.length) {
        Toast.error('运行失败', '编译生成的 bin 为空');
        return;
    }
    if (typeof SWD === 'undefined' || !SWD || !SWD.connect) {
        Toast.warning('提示', 'SWD 设备未打开，请先在 SWD 窗口连接设备');
        return;
    }
    if (typeof runram !== 'function') {
        Toast.error('功能不可用', '未找到 runram 实现（swd.js）');
        return;
    }
    try {
        const bin = (last.rom instanceof Uint8Array) ? last.rom : Uint8Array.from(last.rom);
        // runram 内部使用普通 Array（会对 chunk 调用 push），需转成 Array 而非 Uint8Array
        const romArr = Array.from(bin);
        // runram 内部读取全局 lastdownloadinfo.ROM，需先同步
        window.lastdownloadinfo = { ROM: romArr };
        Toast.info('在 RAM 中运行', '正在写入 RAM（0x20000000）并跳转执行…');
        ideSetOutput('<span class="ok">› 正在通过 SWD 写入 RAM 并运行…</span>');
        await runram(romArr);
        Toast.success('已在 RAM 中运行', '程序已跳转执行（0x20000000）');
        ideSetOutput('<span class="ok">✓ 已在 RAM 中运行（已写入 0x20000000 并跳转执行）</span>');
    } catch (e) {
        console.error(e);
        Toast.error('运行失败', (e && e.message ? e.message : String(e)));
        ideSetOutput('<span class="err">运行失败: ' + escapeHtml(e.message || e) + '</span>');
    }
}

// 下载：直接基于最近一次编译生成的 bin（rom），走与 SWD 窗口共用的下载算法
async function ideDoDownload() {
    if (!__ideLastResult) {
        Toast.warning('提示', '请先点击「编译」生成 bin，再下载');
        ideSetOutput('<span class="err">请先点击「编译」生成 bin，再下载</span>');
        return;
    }
    const last = __ideLastResult;
    if (last.backend !== 'thumb') {
        Toast.warning('提示', '「下载」仅支持 Thumb M0 后端，请切换为 Thumb M0 并重新编译');
        return;
    }
    if (!last.rom || !last.rom.length) {
        Toast.error('下载失败', '编译生成的 bin 为空');
        return;
    }
    // 把编译产物喂给共用的下载流程（comm.js 的 swdDownload 依赖这些全局）
    const bin = (last.rom instanceof Uint8Array) ? last.rom : Uint8Array.from(last.rom);
    __swdBin = bin;
    __downloadInfo = { ROM: bin };
    window.lastdownloadinfo = __downloadInfo;
    // 默认要求先选择下载算法，否则由 swdDownload 统一报错提示
    try {
        ideSetOutput('<span class="ok">› 准备通过下载算法写入芯片…</span>');
        await swdDownload();
    } catch (e) {
        console.error(e);
        Toast.error('下载失败', (e && e.message ? e.message : String(e)));
        ideSetOutput('<span class="err">下载失败: ' + escapeHtml(e.message || e) + '</span>');
    }
}

const DEFAULT_IDE_SRC = `// 一个简单的 C 程序 —— 试试改一改，再点「编译并运行」
int gcd(int a, int b){
    while(b){
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}

int fib(int n){
    int a=0,b=1,i;
    for(i=0;i<n;i++){
        int c=a+b;
        a=b; b=c;
    }
    return a;
}

int main(){
    int x = gcd(48, 36);
    int y = fib(10);
    printf("gcd(48,36)=%d\\n", x);
    printf("fib(10)=%d\\n", y);
    return x + y;
}
`;
