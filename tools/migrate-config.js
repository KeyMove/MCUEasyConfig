/**
 * migrate-config.js - 把旧 config.js 的扁平结构迁移为新的嵌套 JSON 结构。
 *
 * 旧结构：window.APP_CONFIG = { devices:{ <封装名>:{ gpio,af,special,pins } }, peripherals:{...} }
 *   - 多个 MCU 封装（SOP16/SOP20）各自引用同一份 gpio/af/special，存在隐式重复。
 *
 * 新结构：{
 *   mcu: { <型号>: { gpio, af, special, packages:[ {id,name,packageType,pins} ] } },
 *   peripherals: { ... }   // 与 MCU 无关的外设/转换器库
 * }
 *   - gpio/af/special 归并到 mcu 大类下，packages 数组列出该型号的所有封装；
 *   - 共享同一份硅基的封装自动归入同一个 mcu（按 gpio/af/special 内容签名分组）。
 *
 * 用法：node tools/migrate-config.js   （在覆盖 js/config.js 之前运行）
 */
const fs = require('fs');
const path = require('path');

// 在 Node 中模拟浏览器全局，加载旧 config.js（其末尾会执行 window.APP_CONFIG = {...}）
global.window = {};
require(path.join(__dirname, '..', 'js', 'config.js'));
const raw = global.window.APP_CONFIG;
if (!raw || !raw.devices) { console.error('未能从 js/config.js 读取 window.APP_CONFIG'); process.exit(1); }

const groups = {};
for (const [key, dev] of Object.entries(raw.devices)) {
  // 以 gpio/af/special 内容签名作为“同一型号硅基”的判据
  const sig = JSON.stringify([dev.gpio, dev.af, dev.special]);
  if (!groups[sig]) {
    // mcu 名称：取设备名中 "(" 或空格之前的部分（"CIU32F003 (SOP16)" -> "CIU32F003"）
    const mcuName = (dev.name.split(' (')[0].split(' ')[0]) || key;
    groups[sig] = { mcuName, gpio: dev.gpio, af: dev.af, special: dev.special, packages: [] };
  }
  groups[sig].packages.push({
    id: key,
    name: dev.name,
    packageType: dev.packageType,
    pins: dev.pins
  });
}

const out = { mcu: {}, peripherals: raw.peripherals || {} };
for (const g of Object.values(groups)) {
  out.mcu[g.mcuName] = { gpio: g.gpio, af: g.af, special: g.special, packages: g.packages };
}

const outPath = path.join(__dirname, '..', 'config.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log('已写出 ' + outPath);
console.log('  mcu 型号 :', Object.keys(out.mcu).join(', '));
for (const [name, m] of Object.entries(out.mcu)) console.log('    └ ' + name + ' : ' + m.packages.length + ' 个封装 (' + m.packages.map(p => p.id).join(', ') + ')');
console.log('  peripherals :', Object.keys(out.peripherals).length + ' 个');
