        class MacWindow {
            // 静态方法：只创建一次样式
            static createStyles() {
                if (document.getElementById('mac-window-styles')) return;
                
                const style = document.createElement('style');
                style.id = 'mac-window-styles';
                style.textContent = `
                    .mac-window {
                        position: absolute;
                        z-index: 10000;
                        background-color: white;
                        border-radius: 10px;
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        /* 淡入淡出（参考 RichMenu） */
                        opacity: 0;
                        visibility: hidden;
                        pointer-events: none;
                        transform: scale(0.96);
                        transition: opacity 0.22s ease, transform 0.26s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    }

                    /* 显示态：淡入 */
                    .mac-window.mw-show {
                        opacity: 1;
                        visibility: visible;
                        pointer-events: auto;
                        transform: none;
                    }
                    
                    .mac-window .title-bar {
                        height: 40px;
                        background: linear-gradient(to bottom, #f8f8f8, #e8e8e8);
                        border-top-left-radius: 10px;
                        border-top-right-radius: 10px;
                        display: flex;
                        align-items: center;
                        padding: 0 15px;
                        cursor: move;
                        user-select: none;
                        border-bottom: 1px solid #d0d0d0;
                    }
                    
                    .mac-window .window-controls {
                            position: absolute;
                            right: 20px;
                            cursor: default;
                    }
                    
                    .mac-window .control-btn {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;

                    }
                    
                    .mac-window .close {
                        background-color: #ff5f56;
                    }
                    
                    .mac-window .minimize {
                        background-color: #ffbd2e;
                    }
                    
                    .mac-window .blank {
                        box-shadow: #000 0px 0px 0px 1px;
                    }
                    
                    .mac-window .window-title {
                        flex: 1;
                        text-align: center;
                        font-size: 14px;
                        color: #333;
                        font-weight: 500;
                    }

                    .mac-window .window-title {
                        flex: 1;
                        text-align: center;
                        font-size: 14px;
                        color: #333;
                        font-weight: 500;
                    }
                    
                    .mac-window .window-content {
                        flex: 1;
                        padding: 20px;
                        overflow: auto;
                    }
                    
                    .mac-window .resize-handle {
                        position: absolute;
                        width: 15px;
                        height: 15px;
                        background: transparent;
                        cursor: se-resize;
                        z-index: 10;
                    }
                    
                    .mac-window .resize-se {
                        right: 0;
                        bottom: 0;
                    }
                    
                    .mac-window.no-title .title-bar {
                        display: none;
                    }

                    .mac-window.global-drag .window-content {
                        cursor: move;
                    }

                    /* 暗色窗口：匹配当前深色应用风格 */
                    .mac-window.dark {
                        background-color: #0f172a;
                        color: #e2e8f0;
                    }
                    .mac-window.dark .title-bar {
                        background: linear-gradient(to bottom, #1e293b, #0f172a);
                        border-bottom: 1px solid #334155;
                    }
                    .mac-window.dark .window-title {
                        color: #e2e8f0;
                    }
                    .mac-window.dark .window-content {
                        background: #0f172a;
                        color: #e2e8f0;
                    }
                `;
                document.head.appendChild(style);
            }

            constructor(options) {
                // 确保样式只创建一次
                MacWindow.createStyles();

                // 合并默认配置
                this.options = {
                    parent: document.body,
                    width: 300,
                    height: 200,
                    x: null, // null表示居中
                    y: null, // null表示居中
                    moveX:0,
                    moveY:0,
                    title: 'macOS窗口',
                    content: '',
                    showTitleBar: true,
                    toolBar: true,
                    globalDrag: false,
                    resizable: true,
                    canMuiltSelect: false,
                    canTopMost: true,
                    show: true,               // 构造后是否立即显示（带淡入）；面板工作台设为 false 以延迟显示
                    ...options
                };

                const nullcall=()=>{};
                this.onWindowMove=nullcall;
                this.onWindowStartDrag=nullcall;
                this.onWindowEndDrag=nullcall;
                this.onWindowResize=nullcall;
                this.onWindowClose=nullcall;
                this.__sd=nullcall;//内部使用的onWindowStartDrag
                this.__mv=nullcall;//内部使用的onWindowMove

                // 创建窗口元素
                this.createWindow();
                // 默认显示（带淡入效果），与原 display:flex 默认可见行为一致；
                // 传入 show:false 的窗口（如面板工作台的 4 窗口）延迟到显式 show() 才显示
                if (this.options.show !== false) this.show();
                
                if(this.options.canMuiltSelect){
                    this.initSelection();
                }
                // 设置初始位置和大小
                this.setSize(this.options.width, this.options.height);
                this.setPosition(this.options.x, this.options.y);
                
                // 初始化功能
                this.initDrag();
                if (this.options.resizable) {
                    this.initResize();
                }
            }

            /**
             * 设置可被框选的窗口数组
             * @param {Array<MacWindow>} windows - 可被框选的窗口对象数组
             */
            setSelectableWindows(windows) {
                this.selectableWindows = windows.filter(win => win instanceof MacWindow);
            }

            /**
             * 初始化框选功能
             */
            initSelection() {
                this.selectionRect = null; // 框选矩形元素
                this.selectableWindows = []; // 可被框选的窗口数组
                this.selectedWindows = []; // 当前选中的窗口数组
                this.contentElement.style.position = 'relative';
                this.contentElement.style.userSelect = 'none';

                this.selectArea = document.createElement('div');
                this.selectArea.style.cssText="position: absolute;width: 100%;height: 100%;left: 0;top: 0;z-index: 5;pointer-events: none;";
                this.contentElement.appendChild(this.selectArea);
                // 创建框选矩形
                this.selectionRect = document.createElement('div');
                this.selectionRect.style.position = 'absolute';
                this.selectionRect.style.border = '1px dashed #0066ff';
                this.selectionRect.style.backgroundColor = 'rgba(0, 102, 255, 0.1)';
                this.selectionRect.style.pointerEvents = 'none';
                this.selectionRect.style.display='none';
                this.selectionRect.style.zIndex=10;

                this.contentElement.appendChild(this.selectionRect);

                this.contentElement.addEventListener('mousedown', (e) => {
                    // 排除控制按钮和拖动区域
                    if (e.target.classList.contains('control-btn') || 
                        e.target === this.titleBar || 
                        this.options.globalDrag ||
                        e.target.closest('.mac-window') !== this.windowElement) {
                        return;
                    }
                    
                    let mdiv=this.selectionRect;
                    if(mdiv.parentNode.lastChild!=mdiv)
                        mdiv.parentNode.appendChild(mdiv);
                    
                    // 清除之前的选择
                    this.clearSelection();

                    // 记录起点
                    this.startX = e.clientX;
                    this.startY = e.clientY;

                    let selectRect={left:0,top:0,width:0,height:0};

                    const moveHandler = (e) => {
                        if (!this.selectionRect) return;

                        this.selectionRect.style.display='block';
                        // 计算框选区域
                        const left = Math.min(this.startX, e.clientX);
                        const top = Math.min(this.startY, e.clientY);
                        const width = Math.abs(e.clientX - this.startX);
                        const height = Math.abs(e.clientY - this.startY);

                        // 更新框选矩形
                        this.selectionRect.style.left = `${left - this.contentElement.getBoundingClientRect().left}px`;
                        this.selectionRect.style.top = `${top - this.contentElement.getBoundingClientRect().top}px`;
                        this.selectionRect.style.width = `${width}px`;
                        this.selectionRect.style.height = `${height}px`;

                        selectRect.left=left;
                        selectRect.top=top;
                        selectRect.width=width;
                        selectRect.height=height;
                        // 检测被选中的窗口
                        //this.detectSelectedWindows(left, top, width, height);
                    };

                    const upHandler = () => {
                        document.removeEventListener('mousemove', moveHandler);
                        document.removeEventListener('mouseup', upHandler);
                        // 检测被选中的窗口
                        this.detectSelectedWindows(selectRect.left, selectRect.top, selectRect.width, selectRect.height);
                        // 移除框选矩形
                        if (this.selectionRect) {
                            this.selectionRect.style.display='none';
                            //this.selectionRect.remove();
                            //this.selectionRect = null;
                        }
                    };

                    document.addEventListener('mousemove', moveHandler);
                    document.addEventListener('mouseup', upHandler);
                });
            }

            /**
             * 检测被选中的窗口
             * @param {number} left - 框选区域左侧坐标
             * @param {number} top - 框选区域顶部坐标
             * @param {number} width - 框选区域宽度
             * @param {number} height - 框选区域高度
             */
            detectSelectedWindows(left, top, width, height) {
                // 清除之前的选择状态
                this.selectedWindows.forEach(win => {
                    win.windowElement.style.boxShadow = '';
                });
                this.selectedWindows = [];

                const selectionRect = new DOMRect(left, top, width, height);

                this.selectableWindows.forEach(win => {
                    const winRect = win.windowElement.getBoundingClientRect();
                    
                    // 检测窗口是否在框选区域内
                    if (this.isIntersecting(selectionRect, winRect)) {
                        win.windowElement.style.boxShadow = '0 0 0 2px #0066ff';
                        this.selectedWindows.push(win);
                    }
                });
            }

            /**
             * 判断两个矩形是否相交
             */
            isIntersecting(rect1, rect2) {
                return !(
                    rect1.right < rect2.left || 
                    rect1.left > rect2.right || 
                    rect1.bottom < rect2.top || 
                    rect1.top > rect2.bottom
                );
            }

            /**
             * 清除当前选择
             */
            clearSelection() {
                this.selectedWindows.forEach(win => {
                    win.windowElement.style.boxShadow = '';
                });
                this.selectedWindows = [];
            }

            /**
             * 获取当前选中的窗口数组
             * @return {Array<MacWindow>} 当前选中的窗口数组
             */
            getSelectedWindows() {
                return this.selectedWindows;
            }

            createWindow() {
                // 创建窗口容器
                this.windowElement = document.createElement('div');
                this.windowElement.className = 'mac-window' + (this.options.dark ? ' dark' : '');
                if (!this.options.showTitleBar) {
                    this.windowElement.classList.add('no-title');
                }
                if (this.options.globalDrag) {
                    this.windowElement.classList.add('global-drag');
                }

                if(this.options.showTitleBar){

                    // 创建标题栏
                    this.titleBar = document.createElement('div');
                    this.titleBar.className = 'title-bar';
                    
                    // 创建控制按钮
                    if(this.options.toolBar){
                        const controls = document.createElement('div');
                        controls.className = 'window-controls';
                        controls.innerHTML = `<div class="control-btn close"></div>`;
                        // 点击关闭按钮：默认只隐藏窗口（不销毁），可通过 onWindowClose 自定义
                        const closeBtn = controls.querySelector('.control-btn.close');
                        if (closeBtn) {
                            closeBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (typeof this.onWindowClose === 'function') this.onWindowClose(this);
                                this.hide();
                            });
                        }
                        this.titleBar.appendChild(controls);
                    }
                    
                    // 创建标题
                    const title = document.createElement('div');
                    title.className = 'window-title';
                    title.textContent = this.options.title;
                    
                    this.titleBar.appendChild(title);
                    this.windowElement.appendChild(this.titleBar);
                }
                
                
                // 创建内容区域
                this.contentElement = document.createElement('div');
                this.contentElement.className = 'window-content';
                
                // 组装窗口
                this.windowElement.appendChild(this.contentElement);
                
                // 如果是可调整大小的，添加调整手柄
                if (this.options.resizable) {
                    const resizeHandle = document.createElement('div');
                    resizeHandle.className = 'resize-handle resize-se';
                    this.windowElement.appendChild(resizeHandle);
                }

                if (typeof this.options.content === 'string') {
                    this.contentElement.innerHTML = this.options.content;
                } else {
                    this.contentElement.appendChild(this.options.content);
                }

                // 添加到父容器
                this.options.parent.appendChild(this.windowElement);

                this.windowElement.addEventListener('mousedown',(e)=>{
                    if(this.options.canTopMost){
                        // 置顶改用 z-index 递增，避免 appendChild 重排 DOM 导致内部滚动容器复位到顶部
                        let mdiv=this.windowElement;
                        MacWindow._topZ = (MacWindow._topZ || 10000) + 1;
                        mdiv.style.zIndex = MacWindow._topZ;
                    }
                });
                this.windowElement.handle=this;
            }

            setSize(width, height) {
                const currentLeft = parseInt(this.windowElement.style.left, 10) || 0;
                const currentTop = parseInt(this.windowElement.style.top, 10) || 0;
                const currentWidth = this.options.width;
                const currentHeight = this.options.height;

                // 处理宽度变化
                if (width < 0) {
                    const widthChange = currentWidth - Math.abs(width);
                    this.windowElement.style.left = `${currentLeft + widthChange}px`;
                    this.windowElement.style.width = `${Math.abs(width)}px`;
                } else {
                    this.windowElement.style.width = `${width}px`;
                }

                // 处理高度变化
                if (height < 0) {
                    const heightChange = currentHeight - Math.abs(height);
                    this.windowElement.style.top = `${currentTop + heightChange}px`;
                    this.windowElement.style.height = `${Math.abs(height)}px`;
                } else {
                    this.windowElement.style.height = `${height}px`;
                }

                // 更新配置
                this.options.width = width < 0 ? Math.abs(width) : width;
                this.options.height = height < 0 ? Math.abs(height) : height;
            }

            setPosition(x, y) {
                if (x === null || y === null) {
                    this.center();
                } else {
                    this.windowElement.style.left = `${x}px`;
                    this.windowElement.style.top = `${y}px`;
                    this.options.x = x;
                    this.options.y = y;
                }
            }

            /**
             * 设置窗口相对位置（相对于父容器）
             * @param {number|null} x - 水平偏移量（null表示水平居中）
             * @param {number|null} y - 垂直偏移量（null表示垂直居中）
             */
            setRelativePosition(x, y) {
                this.setPosition(this.options.x+x,this.options.y+y);
            }

            center() {
                const parentRect = this.options.parent.getBoundingClientRect();
                const x = (parentRect.width - this.options.width) / 2;
                const y = (parentRect.height - this.options.height) / 2;
                this.setPosition(x, y);
            }

            initDrag() {
                
                const createDrage=element => {
                    element.addEventListener('mousedown', (e) => {
                        // 排除控制按钮
                        if (e.target.classList.contains('control-btn')) return;
                        // globalDrag 动态检查：当 globalDrag 被设为 false 时不触发拖拽
                        if (element === this.contentElement && !this.options.globalDrag) return;
                        
                        this.__sd(this);
                        this.onWindowStartDrag(this);

                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startLeft = parseInt(window.getComputedStyle(this.windowElement).left, 10) || 0;
                        const startTop = parseInt(window.getComputedStyle(this.windowElement).top, 10) || 0;
                        
                        const moveHandler = (e) => {
                            const dx = e.clientX - startX;
                            const dy = e.clientY - startY;
                            const newX = (startLeft + dx);
                            const newY = (startTop + dy);
                            this.options.moveX=newX-this.options.x;
                            this.options.moveY=newY-this.options.y;
                            this.setPosition(newX,newY);
                            this.__mv(this);
                            this.onWindowMove(this);
                            //console.log(`${this.options.moveX},${this.options.moveY}`);
                            //this.windowElement.style.left = (startLeft + dx) + 'px';
                            //this.windowElement.style.top = (startTop + dy) + 'px';
                        };
                        
                        const upHandler = () => {
                            this.onWindowEndDrag(this);
                            document.removeEventListener('mousemove', moveHandler);
                            document.removeEventListener('mouseup', upHandler);
                        };
                        
                        document.addEventListener('mousemove', moveHandler);
                        document.addEventListener('mouseup', upHandler);
                    });
                };
                if(this.titleBar)
                    createDrage(this.titleBar);
                createDrage(this.contentElement);
            }

            initResize() {
                const resizeHandle = this.windowElement.querySelector('.resize-se');
                
                resizeHandle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startWidth = this.options.width;
                    const startHeight = this.options.height;
                    
                    const moveHandler = (e) => {
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        const newWidth = startWidth + dx;
                        const newHeight = startHeight + dy;
                        
                        this.setSize(newWidth, newHeight);
                        this.onWindowResize(this);
                        //console.log(`${newWidth} ${newHeight}`);
                        
                    };
                    
                    const upHandler = () => {
                        document.removeEventListener('mousemove', moveHandler);
                        document.removeEventListener('mouseup', upHandler);
                    };
                    
                    document.addEventListener('mousemove', moveHandler);
                    document.addEventListener('mouseup', upHandler);
                });
            }

            // 公共方法
            setTitle(title) {
                this.windowElement.querySelector('.window-title').textContent = title;
                this.options.title = title;
            }

            setContent(content) {
                if (typeof content === 'string') {
                    this.contentElement.innerHTML = content;
                } else {
                    this.contentElement.innerHTML = '';
                    this.contentElement.appendChild(content);
                }
            }

            show() {
                // 先确保可见布局，下一帧再置可见并加 mw-show 触发淡入过渡
                const el = this.windowElement;
                el.style.display = 'flex';
                el.style.visibility = 'visible';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (!el.classList.contains('mw-show')) el.classList.add('mw-show');
                    });
                });
            }

            hide() {
                // 移除 mw-show 触发淡出过渡；visibility 由 JS 在淡出结束后才切 hidden，
                // 否则 CSS 里 visibility 会瞬间跳变导致看不到淡出过程
                const el = this.windowElement;
                el.classList.remove('mw-show');
                const onEnd = (e) => {
                    if (e.propertyName !== 'opacity') return;
                    el.removeEventListener('transitionend', onEnd);
                    if (!el.classList.contains('mw-show')) {
                        el.style.visibility = 'hidden';
                        el.style.display = 'none';
                    }
                };
                el.addEventListener('transitionend', onEnd);
                // 兜底：若过渡未触发（如已不可见），直接隐藏
                setTimeout(() => {
                    if (!el.classList.contains('mw-show')) {
                        el.style.visibility = 'hidden';
                        el.style.display = 'none';
                    }
                }, 320);
            }

            destroy() {
                this.windowElement.remove();
            }

            addSubWindow(opt){
                let container = opt.container || this.contentElement;
                let { container: _c, ...rest } = opt;
                let win=new MacWindow({parent: container, width: 150, height: 90, showTitleBar: false, globalDrag: true, ...rest});
                this.selectableWindows.push(win);
                win.windowElement.classList.add('blank');
                win.__mv=($)=>{
                    this.selectedWindows.map(x=>($!=x?x.setRelativePosition($.options.moveX,$.options.moveY):null))
                }
                win.__sd=($)=>{
                    if(!this.selectedWindows.includes($))this.clearSelection();
                }
                return win;
            }

            removeSub(win){
                if(this.selectableWindows.includes(win)){
                    this.selectableWindows = this.selectableWindows.filter(x=>x!=win);
                    win.destroy();
                }
            }
        }
