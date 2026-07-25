/**
 * gen-config-js.js — 把「硬件库源」(config.full.json) 编译进 js/config.js
 *
 * 设计（与用户约定一致）：
 *   - config.js 持有【静态基础库】（MCU 的 gpio/af/special/封装 + 外设库），属默认配置；
 *   - config.json 仅作为【用户叠加层】，用于保存/加载用户态（收藏夹等）或库覆盖参数；
 *   - 启动时把 config.json 深合并（覆盖或叠加）到基础库之上，实现「加载覆盖到 config.js」。
 *
 * 用法：node tools/gen-config-js.js [源json路径，默认 ../config.full.json]
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'config.full.json');
const dstPath = path.join(root, 'js', 'config.js');

if (!fs.existsSync(srcPath)) {
    console.error('未找到库源文件:', srcPath);
    process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
const dataStr = JSON.stringify(raw, null, 2);

const file = `(function () {
    'use strict';

    /* ============================================================
     * config.js — 静态基础库（默认配置）+ 配置持久化（localStorage）
     *
     * 分层模型（用户约定：localStorage 持久化，config.json 仅作导入/导出介质）：
     *   - APP_BASE_CONFIG : 静态硬件库（MCU 的 gpio/af/special/封装 + 外设库 + signal），
     *                       由 SVD / 器件定义生成，属“默认配置”，不参与用户存档。
     *   - localStorage['pinAppConfigOverlay'] : 用户叠加层（overlay），持久层。
     *                       启动时读取并 deep-merge 到基础库之上。
     *   - config.json     : 仅作导入/导出的文件介质——手动“加载”时读入 → 存进
     *                       localStorage → 叠加；“导出”时把当前用户态写成文件下载。
     *                       不再在启动时自动 fetch。
     *
     * API：
     *   - exportAppConfig(filename?)       导出：当前用户态写成 config.json 文件（并回写本地）
     *   - importAppConfigObject(obj)       导入：读入 config.json → 存 localStorage → 叠加刷新
     *   - resetAppConfig()                 重置：清除 localStorage 叠加层，恢复默认基础库
     *   - applyAppConfig(overlay?)         纯叠加（不写 localStorage），供内部/测试使用
     * ============================================================ */

    // ---------- 静态基础库（默认配置内容） ----------
    var BASE = ${dataStr};
    window.APP_BASE_CONFIG = BASE;

    // ---------- 信号匹配配置兜底（config 未加载时也不致崩溃） ----------
    // 运行时由 applyConfig 用 merged.signal 覆盖为真实配置。
    window.APP_SIGNAL_CONFIG = {
        synonyms: {},
        map: {},
        knownBus: '',
        knownBusRe: /^(?:x^)$/
    };

    // ---------- 深合并：overlay 覆盖/叠加到 target ----------
    function deepMerge(target, source) {
        if (!source || typeof source !== 'object') return target;
        Object.keys(source).forEach(function (k) {
            var sv = source[k];
            var tv = target[k];
            var sObj = sv && typeof sv === 'object' && !Array.isArray(sv);
            var tObj = tv && typeof tv === 'object' && !Array.isArray(tv);
            if (sObj && tObj) deepMerge(tv, sv);
            else if (sv !== undefined) target[k] = Array.isArray(sv) ? sv.slice() : (sObj ? JSON.parse(JSON.stringify(sv)) : sv);
        });
        return target;
    }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ---------- 归一化：mcu.*.packages 摊平为运行时 devices ----------
    function normalizeConfig(raw) {
        var devices = {};
        var mcu = (raw && raw.mcu) || {};
        Object.keys(mcu).forEach(function (mcuName) {
            var m = mcu[mcuName];
            var pkgs = (m && m.packages) || [];
            pkgs.forEach(function (pkg) {
                var id = pkg.id || pkg.name;
                devices[id] = Object.assign({}, pkg, { gpio: m.gpio, af: m.af, special: m.special, mcu: mcuName });
            });
        });
        return { devices: devices, peripherals: (raw && raw.peripherals) || {} };
    }
    window.normalizeConfig = normalizeConfig;

    function applyConfig(overlay) {
        var merged = deepMerge(clone(BASE), overlay || {});
        window.APP_CONFIG = normalizeConfig(merged);
        // 信号匹配知识（同义词 / 外设→MCU 归一层 / 已知总线）收编自 config.signal，
        // 供 system.js / packages.js / main.js 运行时读取，不再各自内联常量。
        var sig = merged.signal || {};
        window.APP_SIGNAL_CONFIG = {
            synonyms: sig.synonyms || {},
            map: sig.map || {},
            knownBus: sig.knownBus || '',
            knownBusRe: sig.knownBus ? new RegExp('^(' + sig.knownBus + ')$', 'i') : /^(?:x^)$/
        };
        window.dispatchEvent(new Event('appconfigready'));
    }
    window.applyAppConfig = applyConfig;

    // ---------- 持久层：localStorage 存储叠加层（config.json 仅作导入/导出介质） ----------
    var OVERLAY_KEY = 'pinAppConfigOverlay';
    function readOverlay() {
        try { var s = localStorage.getItem(OVERLAY_KEY); return s ? (JSON.parse(s) || {}) : {}; }
        catch (e) { return {}; }
    }
    function writeOverlay(obj) {
        try { localStorage.setItem(OVERLAY_KEY, JSON.stringify(obj || {})); } catch (e) {}
    }

    function downloadJSON(obj, filename) {
        var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename || 'config.json';
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    }

    // 收集当前完整用户态叠加层：已存 localStorage 的 overlay + 实时用户态（收藏夹等）
    function currentOverlay() {
        var user = readOverlay();
        if (typeof window.buildUserConfig === 'function') {
            var live = window.buildUserConfig() || {};
            Object.keys(live).forEach(function (k) { user[k] = live[k]; });
        }
        return user;
    }

    // ---------- 导出：把当前用户态写成 config.json 文件（仅下载，不改 localStorage） ----------
    window.exportAppConfig = function (filename) {
        var user = currentOverlay();
        // 顺带把最新态回写 localStorage，保持导出文件与本地存储一致
        writeOverlay(user);
        downloadJSON(user, filename || 'config.json');
        if (typeof nodeSystem !== 'undefined' && nodeSystem && nodeSystem.updateConnectionStatus) {
            nodeSystem.updateConnectionStatus('已导出配置', '#38bdf8', '当前配置已导出为 ' + (filename || 'config.json') + '（同时已存入本地）');
        }
    };

    // ---------- 导入：手动加载 config.json → 存进 localStorage → 叠加并刷新 ----------
    window.importAppConfigObject = function (obj) {
        if (!obj || typeof obj !== 'object') return false;
        writeOverlay(obj);                       // 关键：手动加载后持久化到 localStorage
        applyConfig(obj);
        // 同步收藏夹到独立键，供收藏夹 UI 直接读取
        if (obj.favorites) { try { localStorage.setItem('pinDeviceFavorites', JSON.stringify(obj.favorites)); } catch (e) {} }
        if (typeof window.refreshFavUI === 'function') window.refreshFavUI();
        window.dispatchEvent(new Event('appconfigimported'));
        if (typeof nodeSystem !== 'undefined' && nodeSystem && nodeSystem.updateConnectionStatus) {
            nodeSystem.updateConnectionStatus('已加载配置', '#38bdf8', 'config.json 已存入本地并叠加到基础库');
        }
        return true;
    };

    // ---------- 重置：清除 localStorage 叠加层，恢复纯基础库 ----------
    window.resetAppConfig = function () {
        try { localStorage.removeItem(OVERLAY_KEY); } catch (e) {}
        applyConfig({});
        if (typeof window.refreshFavUI === 'function') window.refreshFavUI();
        window.dispatchEvent(new Event('appconfigimported'));
        if (typeof nodeSystem !== 'undefined' && nodeSystem && nodeSystem.updateConnectionStatus) {
            nodeSystem.updateConnectionStatus('已重置配置', '#f59e0b', '本地配置已清除，恢复默认基础库');
        }
        return true;
    };

    // ---------- 启动：从 localStorage 恢复叠加层（不再 fetch config.json） ----------
    (function () {
        var overlay = readOverlay();
        // 首次无本地存档时，用 bundle 内置默认（若有）作为初始叠加层
        if ((!overlay || !Object.keys(overlay).length) && window.__APP_CONFIG_RAW) {
            try { overlay = window.__APP_CONFIG_RAW; } catch (e) { overlay = {}; }
        }
        applyConfig(overlay || {});
    })();
})();
`;

fs.writeFileSync(dstPath, file, 'utf8');
console.log('已生成', dstPath, '字节=', file.length, '| 库源=', srcPath);
