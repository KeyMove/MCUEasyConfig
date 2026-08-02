/**
 * Toast —— Windows 10 风格右下角提示，用于代替浏览器原生 alert 弹窗。
 *
 * 特性：
 *  - 右下角滑入、自动消失（默认 3.5s，可配置）
 *  - 四类样式：success / error / warning / info
 *  - 多提示自动自下而上堆叠，互不遮挡
 *  - 点击关闭按钮或提示本体可手动关闭
 *  - 首次使用时自动注入样式与容器，无需在 index.html 里额外添加
 *
 * 用法：
 *   Toast.success('下载完成', '固件已成功写入');
 *   Toast.error('连接失败', e.message);
 *   Toast.info('提示', '请先打开 SWD 设备');
 *   new Toast({ type:'warning', title:'注意', message:'coreID 不匹配' });
 */
class Toast {
    /**
     * @param {Object} opts
     * @param {string} [opts.type='info']  success | error | warning | info
     * @param {string} [opts.title='']
     * @param {string} [opts.message='']
     * @param {number} [opts.duration=3500]  自动关闭毫秒数，<=0 不自动关闭
     */
    constructor(opts = {}) {
        this.type = ['success', 'error', 'warning', 'info'].includes(opts.type) ? opts.type : 'info';
        this.title = opts.title || '';
        this.message = opts.message || '';
        this.duration = opts.duration === undefined ? 3500 : opts.duration;
        this._ensureStyle();
        this._ensureContainer();
        this._build();
        this._show();
    }

    _ensureStyle() {
        if (document.getElementById('toast-style')) return;
        const css = `
.toast-container {
    position: fixed;
    right: 20px;
    bottom: 20px;
    display: flex;
    flex-direction: column-reverse;
    gap: 12px;
    z-index: 99999;
    pointer-events: none;
}
.toast-item {
    pointer-events: auto;
    position: relative;
    min-width: 280px;
    max-width: 360px;
    background: #2b2f36;
    color: #f3f4f6;
    border-radius: 0;
    border-left: 4px solid #6366f1;
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    line-height: 1.45;
    opacity: 0;
    transform: translateX(120%);
    transition: opacity .25s ease, transform .35s cubic-bezier(.22,1,.36,1);
}
.toast-item.toast-show { opacity: 1; transform: translateX(0); }
.toast-item.toast-hide { opacity: 0; transform: translateX(120%); }
.toast-item.toast-success { border-left-color: #10b981; }
.toast-item.toast-error   { border-left-color: #ef4444; }
.toast-item.toast-warning { border-left-color: #f59e0b; }
.toast-item.toast-info    { border-left-color: #6366f1; }
/* 左侧矩形色块（无圆角，方方正正） */
.toast-icon {
    flex: 0 0 auto;
    width: 20px; height: 20px;
    border-radius: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; color: #fff;
    margin-top: 1px;
}
.toast-success .toast-icon { background: #10b981; }
.toast-error   .toast-icon { background: #ef4444; }
.toast-warning .toast-icon { background: #f59e0b; }
.toast-info    .toast-icon { background: #6366f1; }
.toast-body { flex: 1 1 auto; min-width: 0; padding-bottom: 6px; }
.toast-title { font-weight: 600; margin-bottom: 2px; word-break: break-word; }
.toast-msg { color: #cbd5e1; word-break: break-word; white-space: pre-wrap; }
.toast-close {
    flex: 0 0 auto;
    background: transparent; border: none; color: #94a3b8;
    font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px;
}
.toast-close:hover { color: #f3f4f6; }
/* 底部剩余时间条：从满宽慢慢缩短到 0 */
.toast-progress {
    position: absolute;
    left: 0; bottom: 0;
    height: 3px;
    width: 100%;
    border-radius: 0;
}
.toast-success .toast-progress { background: #10b981; }
.toast-error   .toast-progress { background: #ef4444; }
.toast-warning .toast-progress { background: #f59e0b; }
.toast-info    .toast-progress { background: #6366f1; }
/* 用 keyframes 动画（而非 transition），避免“起始帧未绘制”导致进度条直接跳到 0% 而不可见 */
.toast-progress-run {
    animation: toast-shrink linear forwards;
}
@keyframes toast-shrink {
    from { width: 100%; }
    to   { width: 0%; }
}
`;
        const st = document.createElement('style');
        st.id = 'toast-style';
        st.textContent = css;
        document.head.appendChild(st);
    }

    _ensureContainer() {
        if (!Toast._container) {
            const c = document.createElement('div');
            c.className = 'toast-container';
            document.body.appendChild(c);
            Toast._container = c;
        }
    }

    _iconText() {
        return { success: '✓', error: '✕', warning: '!', info: 'i' }[this.type];
    }

    _build() {
        const item = document.createElement('div');
        item.className = `toast-item toast-${this.type}`;

        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        icon.textContent = this._iconText();

        const body = document.createElement('div');
        body.className = 'toast-body';
        if (this.title) {
            const t = document.createElement('div');
            t.className = 'toast-title';
            t.textContent = this.title;
            body.appendChild(t);
        }
        if (this.message) {
            const m = document.createElement('div');
            m.className = 'toast-msg';
            m.textContent = this.message;
            body.appendChild(m);
        }

        const close = document.createElement('button');
        close.className = 'toast-close';
        close.textContent = '×';
        close.setAttribute('aria-label', '关闭');
        close.addEventListener('click', (e) => { e.stopPropagation(); this._dismiss(); });

        // 底部剩余时间条
        const progress = document.createElement('div');
        progress.className = 'toast-progress';

        item.appendChild(icon);
        item.appendChild(body);
        item.appendChild(close);
        item.appendChild(progress);
        item.addEventListener('click', () => this._dismiss());

        this._el = item;
        this._progress = progress;
    }

    _show() {
        Toast._container.appendChild(this._el);
        // 触发进入动画
        requestAnimationFrame(() => this._el.classList.add('toast-show'));
        if (this.duration > 0) {
            // 底部剩余时间条：通过 keyframes 动画从满宽线性缩短到 0，时长 = duration
            this._progress.style.animationDuration = (this.duration / 1000) + 's';
            // 强制触发动画（先移除再在下一帧加回，确保每次显示都重新播放）
            this._progress.classList.remove('toast-progress-run');
            void this._progress.offsetWidth;
            requestAnimationFrame(() => this._progress.classList.add('toast-progress-run'));
            this._timer = setTimeout(() => this._dismiss(), this.duration);
        }
    }

    _dismiss() {
        if (this._dismissed) return;
        this._dismissed = true;
        clearTimeout(this._timer);
        this._el.classList.remove('toast-show');
        this._el.classList.add('toast-hide');
        this._el.addEventListener('transitionend', () => {
            if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
        }, { once: true });
    }

    // 便捷静态方法
    static success(title, message, duration) { return new Toast({ type: 'success', title, message, duration }); }
    static error(title, message, duration)   { return new Toast({ type: 'error',   title, message, duration }); }
    static warning(title, message, duration) { return new Toast({ type: 'warning', title, message, duration }); }
    static info(title, message, duration)    { return new Toast({ type: 'info',    title, message, duration }); }
}
