/**
 * check-config.js — 在 node 中桩掉浏览器全局，加载 js/config.js，
 * 验证 APP_BASE_CONFIG 包含完整硬件库，且 基础库+空叠加层 的归一化结果
 * 等价于原 config.full.json（即旧 config.json）的归一化结果。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 桩：浏览器全局 ----
const listeners = {};
global.window = global;
global.document = {
    createElement: () => ({ style: {}, click() {}, appendChild() {}, removeChild() {}, set href(v) {}, set download(v) {} }),
    body: { appendChild() {}, removeChild() {} }
};
global.Blob = function () {};
global.URL = { createObjectURL: () => '', revokeObjectURL() {} };
global.Event = function (t) { this.type = t; };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.dispatchEvent = (e) => { (listeners[e.type] || []).forEach(fn => fn(e)); };
global.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
global.window.dispatchEvent = global.dispatchEvent;
global.window.addEventListener = global.addEventListener;
// 启动改为从 localStorage 读叠加层（桩 getItem 返回 null）→ 同步 applyConfig({})（纯基础库）
// 避免 exportAppConfig 里访问 nodeSystem
global.nodeSystem = undefined;

const cfgPath = path.resolve(__dirname, '..', 'js', 'config.js');
const code = fs.readFileSync(cfgPath, 'utf8');
vm.runInThisContext(code);

// 启动为同步（localStorage 读取），APP_CONFIG 已就绪；setImmediate 仅为稳妥
setImmediate(runChecks);

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1); } }

function runChecks() {
const base = global.window.APP_BASE_CONFIG;
const app = global.window.APP_CONFIG;

assert(base, 'APP_BASE_CONFIG 存在');
assert(base.mcu && base.mcu.CIU32F003, 'mcu.CIU32F003 存在');
assert(base.mcu.CIU32F003.af && Object.keys(base.mcu.CIU32F003.af).length >= 18, 'af 引脚数足够: ' + (base.mcu.CIU32F003.af ? Object.keys(base.mcu.CIU32F003.af).length : 0));
assert(base.mcu.CIU32F003.packages && base.mcu.CIU32F003.packages.length === 2, 'packages 两个封装');
assert(base.mcu.CIU32F003.gpio && base.mcu.CIU32F003.gpio.base, 'gpio.base 存在');
assert(base.mcu.CIU32F003.special, 'special 存在');
assert(base.peripherals && Object.keys(base.peripherals).length === 16, 'peripherals 共 16 个: ' + (base.peripherals ? Object.keys(base.peripherals).length : 0));

assert(app && app.devices, 'APP_CONFIG.devices 存在');
assert(Object.keys(app.devices).length === 2, 'devices 摊平为 2: ' + Object.keys(app.devices).length);
assert(app.devices.CIU32F003 && app.devices.CIU32F003_SOP20, '两个封装设备都在');
assert(Object.keys(app.peripherals).length === 16, 'APP_CONFIG.peripherals 16 个');

// ---- 等价性：旧 config.full.json 经相同 normalizeConfig 应一致 ----
const full = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config.full.json'), 'utf8'));
// 复用 config.js 暴露的 normalizeConfig（全局）
const normFull = global.window.normalizeConfig(full);
assert(JSON.stringify(normFull) === JSON.stringify(app), '基础库+空叠加层 归一化结果 与 原 config.full.json 等价');

// ---- signal 配置（原散落于 system.js/packages.js/main.js 的常量，已收编进 config） ----
const sig = global.window.APP_SIGNAL_CONFIG;
assert(sig, 'APP_SIGNAL_CONFIG 存在');
assert(sig.synonyms && Object.keys(sig.synonyms).length === 29, 'synonyms 共 29 项: ' + Object.keys(sig.synonyms || {}).length);
assert(sig.map && Object.keys(sig.map).length === 9, 'map 共 9 项: ' + Object.keys(sig.map || {}).length);
const expectedRe = new RegExp('^(SPI|I2C|UART|USART|TIM|CAN|SDIO|QUADSPI)$', 'i');
assert(sig.knownBusRe && sig.knownBusRe.source === expectedRe.source, 'knownBusRe 编译源串正确');
// 行为等价（与原 SIGNAL_SYNONYMS / SIGNAL_MAP / KNOWN_BUS 一致）
assert((sig.synonyms['SPI1_CLK'] || []).join(',') === 'SPI1_SCK,CLK,SCK', 'synonyms SPI1_CLK 等价');
assert((sig.synonyms['GPIO'] || []).join(',') === '', 'synonyms GPIO 等价(空)');
assert((sig.map['CS'] || []).join(',') === 'NSS,CS', 'map CS 等价');
assert((sig.map['CHX'] || []).join(',') === 'CH1,CH2,CH3,CH4', 'map CHX 等价');
assert(sig.knownBusRe.test('SPI') && sig.knownBusRe.test('TIM') && !sig.knownBusRe.test('XYZ'), 'knownBusRe 行为等价');
// 与库源 config.full.json.signal 完全一致
assert(JSON.stringify(full.signal.synonyms) === JSON.stringify(sig.synonyms), 'synonyms 与 config.full.json 一致');
assert(JSON.stringify(full.signal.map) === JSON.stringify(sig.map), 'map 与 config.full.json 一致');
assert(full.signal.knownBus === sig.knownBus, 'knownBus 与 config.full.json 一致');

console.log('PASS: APP_BASE_CONFIG 完整（mcu/af/special/packages + 16 外设），且等价于原配置');
console.log('  devices:', Object.keys(app.devices).join(', '));
console.log('  peripherals:', Object.keys(app.peripherals).length);
console.log('  signal: synonyms=%d, map=%d, knownBusRe 已编译', Object.keys(sig.synonyms).length, Object.keys(sig.map).length);
}

