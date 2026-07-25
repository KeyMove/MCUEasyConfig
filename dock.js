
    /**
     * MacOS风格的距离感应Dock栏类
     * @class
     * @classdesc 创建一个具有距离感应放大效果的MacOS风格Dock栏
     * 
     * @param {HTMLElement|string} container - 容器元素或元素ID，Dock将渲染到此容器中
     * @param {Array<Object>} [items=[]] - 初始Dock项目数组，每个项目应包含emoji和app属性
     * @param {Object} [options={}] - 配置选项
     * @param {string} [options.position='left'] - Dock位置 ('left', 'right', 'top' 或 'bottom')
     * @param {number} [options.scaleFactor=0.6] - 鼠标悬停时的放大系数
     * 
     * @example
     * // 基本用法
     * const dock = new MacOSDock('myDock', [
     *     { emoji: '😀', app: 'finder' },
     *     { emoji: '😄', app: 'safari' }
     * ], { position: 'top' });
     * 
     * // 动态添加项目
     * dock.addItem({ emoji: '🎉', app: 'party' });
     */
     class MacOSDock {
        constructor(container, items = [], options = {}) {
            this.container = typeof container === 'string' ? document.getElementById(container) : container;
            this.items = items;
            this.options = {
                position: 'left',
                scaleFactor: 0.6,
                ...options
            };
            
            // 初始化Dock
            this.init();
            // 渲染Dock内容
            this.render();
            // 设置事件监听
            this.setupEventListeners();
        }
        
        /**
         * 初始化Dock结构
         * @private
         */
        init() {
            // 如果样式不存在则创建样式
            if (!document.getElementById('dock-styles')) {
                const style = document.createElement('style');
                style.id = 'dock-styles';
                style.textContent = this.getDockStyles();
                document.head.appendChild(style);
            }
            
            // 创建Dock容器
            this.dockContainer = document.createElement('div');
            this.dockContainer.className = 'dock-container';
            
            // 创建Dock主体
            this.dock = document.createElement('div');
            this.dock.className = 'dock';
            this.dock.id = 'dock';
            
            // 组装DOM结构
            this.dockContainer.appendChild(this.dock);
            this.container.appendChild(this.dockContainer);
            
            // 初始尺寸设置
            this.updateDockDimensions();
        }
        
        /**
         * 更新Dock尺寸（带动画）
         * @private
         */
        updateDockDimensions() {
            const isVertical = this.options.position === 'left' || this.options.position === 'right';
            const itemSize = 50; // 每个项目大小
            const itemMargin = 10; // 每个项目的margin总和
            const dockPadding = 'topbottom'.includes(this.options.position)?0:20; // Dock的padding总和
            
            if (isVertical) {
                // 垂直Dock（左/右）
                const newHeight = this.items.length * (itemSize + itemMargin) + dockPadding;
                this.dock.style.height = `${newHeight}px`;
                this.dock.style.width = '';
            } else {
                // 水平Dock（上/下）
                const newWidth = this.items.length * (itemSize + itemMargin) + dockPadding;
                this.dock.style.width = `${newWidth}px`;
                this.dock.style.height = '';
            }
        }
        
        /**
         * 获取Dock基础样式
         * @private
         * @returns {string} CSS样式字符串
         */
        getDockStyles() {
            return `
                .dock-container {
                    position: fixed;
                    z-index: 1000;
                }
                
                /* 垂直Dock（左/右）样式 */
                .dock-container[data-position="left"] {
                    left: 20px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                
                .dock-container[data-position="right"] {
                    right: 20px;
                    top: 50%;
                    transform: translateY(-50%);
                }
                
                /* 水平Dock（上/下）样式 */
                .dock-container[data-position="top"] {
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                
                .dock-container[data-position="bottom"] {
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                }
    
                .dock {
                    user-select: none;
                    background: rgba(255, 255, 255, 0.4);
                    backdrop-filter: blur(10px);
                    border-radius: 18px;
                    padding: 5px 10px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    font-size: 2rem;
                    transition: all 0.2s ease-out;
                    will-change: height, width;
                }
                
                /* 垂直Dock布局 */
                .dock[data-position="left"],
                .dock[data-position="right"] {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                
                /* 水平Dock布局 */
                .dock[data-position="top"],
                .dock[data-position="bottom"] {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                }
    
                .dock-item {
                    width: 50px;
                    height: 50px;
                    position: relative;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: calc(2rem * var(--scale, 1));
                    transition: all 0.15s ease-out;
                    opacity: 1;
                }
                
                /* 垂直Dock项目间距 */
                .dock[data-position="left"] .dock-item,
                .dock[data-position="right"] .dock-item {
                    margin: 5px 0;
                    position: relative;
                    left: calc((2rem * var(--scale, 1) - 2rem)/2);
                }
                
                /* 水平Dock项目间距 */
                .dock[data-position="top"] .dock-item,
                .dock[data-position="bottom"] .dock-item {
                    margin: 0 5px;
                    position: relative;
                    top: calc((2rem * var(--scale, 1) - 2rem)/2);
                }
    
                /* 添加项目时的动画 */
                .dock-item.adding {
                    animation: fadeIn 0.5s ease-out forwards;
                }
    
                /* 移除项目时的动画 */
                .dock-item.removing {
                    animation: fadeOut 0.1s ease-out forwards;
                }
    
                .dock-item::after {
                    content: '';
                    position: absolute;
                    background-color: rgba(0, 0, 0, 0.4);
                    border-radius: 50%;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }
                
                /* 垂直Dock的活动指示器位置 */
                .dock[data-position="left"] .dock-item::after,
                .dock[data-position="right"] .dock-item::after {
                    bottom: -5px;
                    width: 5px;
                    height: 5px;
                }
                
                /* 水平Dock的活动指示器位置 */
                .dock[data-position="top"] .dock-item::after,
                .dock[data-position="bottom"] .dock-item::after {
                    width: 5px;
                    height: 5px;
                }
                
                .dock[data-position="top"] .dock-item::after {
                    bottom: -5px;
                }
                
                .dock[data-position="bottom"] .dock-item::after {
                    top: -5px;
                }
    
                .dock-item.active::after {
                    opacity: 1;
                }
    
                /* 应用名称提示框 */
                .dock-item-tooltip {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.7);
                    color: white;
                    padding: 5px 10px;
                    border-radius: 4px;
                    font-size: 14px;
                    white-space: nowrap;
                    pointer-events: none;
                    opacity: 0;
                    transition: all 0.3s ease;
                    z-index: 1001;
                }
                
                /* 垂直Dock的工具提示位置 */
                .dock[data-position="left"] .dock-item-tooltip {
                    left: 60px;
                    transform: translateX(-10px);
                }
                
                .dock[data-position="right"] .dock-item-tooltip {
                    right: 60px;
                    transform: translateX(10px);
                }
                
                /* 水平Dock的工具提示位置 */
                .dock[data-position="bottom"] .dock-item-tooltip {
                    bottom: 60px;
                    transform: translateY(10px);
                }
                
                .dock[data-position="top"] .dock-item-tooltip {
                    top: 60px;
                    transform: translateY(-10px);
                }
    
                .dock-item:hover .dock-item-tooltip {
                    opacity: 1;
                    transform: translateX(0);
                }
                
                .dock[data-position="top"] .dock-item:hover .dock-item-tooltip,
                .dock[data-position="bottom"] .dock-item:hover .dock-item-tooltip {
                    transform: translateY(0);
                }
    
                /* 淡入动画 */
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
    
                /* 淡出动画 */
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                }
            `;
        }
        
        /**
         * 创建工具提示元素
         * @private
         * @param {string} appName - 应用名称
         * @returns {HTMLElement} 工具提示元素
         */
        createTooltip(appName) {
            const tooltip = document.createElement('div');
            tooltip.className = 'dock-item-tooltip';
            tooltip.textContent = appName;
            return tooltip;
        }
        
        /**
         * 渲染Dock内容
         * @private
         */
        render() {
            if(this.items.length==0) this.dockContainer.style.display='none';
            
            // 设置Dock位置属性
            this.dockContainer.setAttribute('data-position', this.options.position);
            this.dock.setAttribute('data-position', this.options.position);
            
            // 清空现有内容
            this.dock.innerHTML = '';
            
            // 遍历所有项目并创建对应的DOM元素
            this.items.forEach((item, index) => {
                const dockItem = document.createElement('div');
                dockItem.className = 'dock-item';
                dockItem.dataset.app = item.app || `app-${index}`;
                dockItem.callback = (()=>item.callback(this,index)) || (()=>null);
                dockItem.dataset.index = index;
                dockItem.textContent = item.emoji || '📁';
                
                // 添加工具提示
                const tooltip = this.createTooltip(item.app || `App ${index + 1}`);
                dockItem.appendChild(tooltip);
                
                this.dock.appendChild(dockItem);
            });
            
            // 更新Dock尺寸
            this.updateDockDimensions();
        }
        
        /**
         * 设置事件监听器
         * @private
         */
        setupEventListeners() {
            // 点击事件 - 标记活动项目
            this.dock.addEventListener('click', (e) => {
                const item = e.target.closest('.dock-item');
                if (item) {
                    // 移除所有活动状态
                    this.dock.querySelectorAll('.dock-item').forEach(i => i.classList.remove('active'));
                    // 添加当前活动状态
                    item.classList.add('active');
                    item.callback();
                }
            });
            
            // 鼠标移动事件 - 实现距离感应效果
            this.dock.addEventListener('mousemove', (e) => {
                const item = e.target.closest('.dock-item');
                if (item) {
                    const isVertical = this.options.position === 'left' || this.options.position === 'right';
                    const rect = item.getBoundingClientRect();
                    
                    // 根据Dock方向计算偏移量
                    let offset;
                    if (isVertical) {
                        offset = Math.abs(e.clientY - rect.top) / rect.height;
                    } else {
                        offset = Math.abs(e.clientX - rect.left) / rect.width;
                    }
                    
                    const prev = item.previousElementSibling;
                    const next = item.nextElementSibling;
                    
                    // 重置所有缩放
                    this.resetScale();
                    
                    // 根据距离设置相邻元素的缩放
                    if (prev) prev.style.setProperty('--scale', 1 + this.options.scaleFactor * Math.abs(offset - 1));
                    item.style.setProperty('--scale', 1 + this.options.scaleFactor);
                    if (next) next.style.setProperty('--scale', 1 + this.options.scaleFactor * offset);
                }
            });
            
            // 鼠标离开事件 - 重置所有缩放
            this.dock.addEventListener('mouseleave', () => {
                this.resetScale();
            });
        }
        
        /**
         * 重置所有Dock项目的缩放比例
         * @public
         */
        resetScale() {
            this.dock.querySelectorAll('.dock-item').forEach(item => {
                item.style.setProperty('--scale', 1);
            });
        }
        
        /**
         * 添加一个新项目到Dock（带淡入动画和尺寸动画）
         * @public
         * @param {Object} item - 要添加的项目
         * @param {string} item.emoji - 项目显示的emoji图标
         * @param {string} item.app - 项目关联的应用标识
         * @returns {Promise} 动画完成后resolve的Promise
         */
        addItem(item) {
            if(this.items.length==0) this.dockContainer.style.display='block';
            return new Promise((resolve) => {
                // 先更新数据
                this.items.push(item);
                
                let index=this.items.length-1;
                // 创建新项目元素
                const dockItem = document.createElement('div');
                dockItem.className = 'dock-item adding';
                dockItem.dataset.app = item.app || `app-${index}`;
                dockItem.callback = (()=>item.callback(this,index)) || (()=>null);
                dockItem.dataset.index = index;
                dockItem.textContent = item.emoji || '📁';
                
                // 添加工具提示
                const tooltip = this.createTooltip(item.app || `App ${this.items.length}`);
                dockItem.appendChild(tooltip);
                
                // 添加到DOM
                this.dock.appendChild(dockItem);
                
                // 同步更新尺寸（CSS transition会自动处理动画）
                this.updateDockDimensions();
                
                // 动画结束后移除临时类
                dockItem.addEventListener('animationend', () => {
                    dockItem.classList.remove('adding');
                    resolve();
                }, { once: true });
            });
        }
        
        /**
         * 移除指定索引的项目（带淡出动画和尺寸动画）
         * @public
         * @param {number} index - 要移除的项目索引
         * @returns {Promise<boolean>} Promise，动画完成后resolve是否移除成功
         */
        removeItem(index) {
            return new Promise((resolve) => {
                if (index >= 0 && index < this.items.length) {
                    const dockItems = this.dock.querySelectorAll('.dock-item');
                    if (index < dockItems.length) {
                        const itemToRemove = dockItems[index];
                        
                        // 添加移除动画类
                        itemToRemove.classList.add('removing');
                        
                        // 同步更新尺寸（CSS transition会自动处理动画）
                        this.updateDockDimensions();
                        
                        // 动画结束后移除元素
                        itemToRemove.addEventListener('animationend', () => {
                            this.items.splice(index, 1);
                            this.render(); // 重新渲染确保状态一致
                            if(this.items.length==0) this.dockContainer.style.display='none';
                            resolve(true);
                        }, { once: true });
                    } else {
                        this.items.splice(index, 1);
                        this.render();
                        if(this.items.length==0) this.dockContainer.style.display='none';
                        resolve(true);
                    }
                } else {
                    resolve(false);
                }
            });
        }
        
        /**
         * 移除最后一个项目（带淡出动画和尺寸动画）
         * @public
         * @returns {Promise<boolean>} Promise，动画完成后resolve是否移除成功
         */
        removeLastItem() {
            return this.removeItem(this.items.length - 1);
        }
        
        /**
         * 更新所有Dock项目
         * @public
         * @param {Array<Object>} newItems - 新的项目数组
         */
        updateItems(newItems) {
            this.items = newItems;
            this.render();
        }
        
        /**
         * 销毁Dock实例，清理DOM
         * @public
         */
        destroy() {
            this.dockContainer.remove();
        }
    }
