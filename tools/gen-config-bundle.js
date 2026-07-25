/**
 * gen-config-bundle.js - 由 config.json（用户叠加层）生成 config.bundle.js（file:// 直接打开的兜底）。
 *
 * 用法：node tools/gen-config-bundle.js
 * 基础库已内联于 js/config.js（window.APP_BASE_CONFIG）；config.json 只是用户叠加层。
 * 当页面以 file:// 方式直接打开、fetch('config.json') 不可用时，config.js 会回退读取
 * window.__APP_CONFIG_RAW（由本文件生成的 config.bundle.js 注入）。保持两者同步即可避免漂移。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'config.json');
const outPath = path.join(root, 'config.bundle.js');

const raw = fs.readFileSync(jsonPath, 'utf8');
JSON.parse(raw); // 校验 JSON 合法性
const out = '/* AUTO-GENERATED from config.json — 勿手改；改 config.json 后运行 node tools/gen-config-bundle.js */\n' +
    'window.__APP_CONFIG_RAW = ' + raw.trim() + ';\n';
fs.writeFileSync(outPath, out);
console.log('已生成 ' + outPath + '（与 config.json 同步，供 file:// 打开兜底）');
