'use strict';
/*
 * svd2js.js — Keil SVD + SFD -> JS 转换模块
 *
 * 输入:
 *   - *.svd  : CMSIS-SVD XML，描述 MCU 寄存器分布（外设 -> 寄存器 -> 字段: bitOffset/bitWidth/resetValue）
 *   - *.sfd  : Keil SVD Field Description，描述寄存器绝对地址与字段的位作用范围（<o.M..N>）和读写权限（<i> 行）
 *
 * 输出 (mcu型号.js):
 *   window.MCU_REG_DB["<型号>"] = {
 *     meta:  { name, vendor, series, version, schemaVersion, cpu, width },
 *     menu:  [ { label, base, registers:[ { name, offset, address, reset, access, fields:[{name,bits,rw,desc}] } ] } ]  // 寄存器编辑/右键菜单用的唯一外设数据
 *   }
 *
 * 注: 历史上曾同时输出 keyed 的 peripherals 对象（数字地址 / 前缀寄存器名，
 *     register 名带 'reg' 前缀如 regADC_CR），与 menu 同构且本应用从未消费，
 *     已于 svd2js 改造中移除；peripherals 仅作为内部中间产物用于派生 menu 与地址校验。
 *
 * 用法: node svd2js.js [xxx.svd] [xxx.sfd]
 *   缺省读取同目录 CIU32F003x5.svd / CIU32F003x5.sfd，输出 CIU32F003x5.js
 */
let fs = null, path = null;
if (typeof require === 'function') { fs = require('fs'); path = require('path'); }

// ============================================================
// 轻量 XML 解析（SVD 结构规整，无需 DOM 库）
// ============================================================
function parseAttrs(s) {
  const o = {};
  const re = /([\w.-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s))) o[m[1]] = m[2];
  return o;
}

function parseXML(xml) {
  // 去除 XML 注释
  xml = xml.replace(/<!--[\s\S]*?-->/g, '');
  const re = /<(\/?)([a-zA-Z_][\w.-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  const root = { tag: '#root', children: [], text: '' };
  const stack = [root];
  let m, last = 0;
  while ((m = re.exec(xml))) {
    const pre = xml.slice(last, m.index);
    if (pre.trim()) stack[stack.length - 1].text = (stack[stack.length - 1].text || '') + pre.trim();
    last = re.lastIndex;
    const [, close, tag, attrsStr, selfClose] = m;
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { tag, attrs: parseAttrs(attrsStr), children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

function child(el, tag) { return el.children.find(c => c.tag === tag); }
function childText(el, tag) { const c = child(el, tag); return c ? (c.text || '').trim() : ''; }
function childrenNamed(el, tag) { return el.children.filter(c => c.tag === tag); }

// 解析字段 enumeratedValues（预留“下拉框”接口：如 GPIO MODE / AF 的命名枚举）
function parseEnums(fieldEl) {
  const ev = child(fieldEl, 'enumeratedValues');
  if (!ev) return [];
  return childrenNamed(ev, 'enumeratedValue').map(e => ({
    value: (childText(e, 'value') || '').trim(),
    name: (childText(e, 'name') || '').trim(),
    description: (childText(e, 'description') || '').trim()
  })).filter(x => x.name);
}

// ============================================================
// SFD 解析（逐行正则）
//   - Register Item Address: <PERIPH>_reg<REG> __AT (0xADDR)
//   - Field Item: <PERIPH>_reg<REG>_<FIELD>
//   - <name> SHORT </name>        字段短名
//   - <i> [Bit X] RW (@ 0x..) Field .. </i>   位范围 + 读写
// ============================================================
function parseSFD(text) {
  const regs = {};
  const lines = text.split(/\r?\n/);
  const regRe = /Register Item Address:\s*(\w+)\s*__AT\s*\((0x[0-9A-Fa-f]+)\)/;
  const fieldRe = /Field Item:\s*(\S+)/;
  const nameRe = /<name>\s*([^<]+?)\s*<\/name>/;
  const iRe = /<i>\s*\[(?:Bit|Bits)\s*(\d+)(?:\.\.(\d+))?\]\s*(\w+)/;
  const rtreeRe = /Register RTree:/;

  let state = 'none', curReg = null, curField = null;
  for (const line of lines) {
    let m;
    if ((m = regRe.exec(line))) {
      const key = m[1];
      regs[key] = { address: parseInt(m[2], 16), fields: {} };
      curReg = key; state = 'reg'; curField = null; continue;
    }
    if (rtreeRe.test(line)) { state = 'rtree'; curField = null; continue; }
    if ((m = fieldRe.exec(line))) {
      state = 'field'; curField = m[1];
      if (curReg && !regs[curReg].fields[curField]) regs[curReg].fields[curField] = {};
      continue;
    }
    if (state === 'field' && curReg && curField) {
      if ((m = nameRe.exec(line))) {
        regs[curReg].fields[curField].short = m[1].trim(); continue;
      }
      if ((m = iRe.exec(line))) {
        const hi = parseInt(m[1], 10);
        const lo = (m[2] != null) ? parseInt(m[2], 10) : hi;
        const f = regs[curReg].fields[curField];
        f.bitHi = hi; f.bitLo = lo;
        f.bitRange = `${lo}..${hi}`;
        f.access = m[3];
        continue;
      }
    }
  }
  return regs;
}

// SVD 的 register 级 access -> 字段级简写
const ACCESS_MAP = {
  'read-write': 'RW', 'read-only': 'RO', 'write-only': 'WO',
  'read-writeOnce': 'RWW', 'writeOnce': 'WO', 'clear': 'W1C'
};
function mapAccess(acc) { return ACCESS_MAP[acc] || (acc ? acc.toUpperCase() : 'RW'); }

// ============================================================
// 主转换
// ============================================================
function convert(svdText, sfdText) {
  const sfd = parseSFD(sfdText || '');
  const xml = parseXML(svdText);
  const device = child(xml, 'device');
  if (!device) throw new Error('SVD 缺少 <device> 根节点');

  const cpuEl = child(device, 'cpu');
  const meta = {
    name: childText(device, 'name'),
    vendor: childText(device, 'vendorID'),
    series: childText(device, 'series'),
    version: childText(device, 'version'),
    schemaVersion: device.attrs.schemaVersion || '',
    cpu: cpuEl ? childText(cpuEl, 'name') : '',
    width: parseInt(childText(device, 'width'), 10) || 32
  };

  const peripherals = {};
  const peripheralsEl = child(device, 'peripherals');
  if (peripheralsEl) {
    for (const per of childrenNamed(peripheralsEl, 'peripheral')) {
      const pname = childText(per, 'name');
      if (!pname) continue;
      const base = parseInt(childText(per, 'baseAddress'), 16);
      const group = (childText(per, 'groupName') || '').trim() || pname;
      const desc = childText(per, 'description');

      const registers = {};
      const regsEl = child(per, 'registers');
      if (regsEl) {
        for (const reg of childrenNamed(regsEl, 'register')) {
          const rname = childText(reg, 'name');
          if (!rname) continue;
          const disp = childText(reg, 'displayName') || rname.replace(/^reg/, '');
          const off = parseInt(childText(reg, 'addressOffset'), 16);
          const sz = parseInt(childText(reg, 'size'), 16) || meta.width;
          const acc = childText(reg, 'access');
          const reset = childText(reg, 'resetValue');

          const fields = {};
          const fieldsEl = child(reg, 'fields');
          if (fieldsEl) {
            for (const f of childrenNamed(fieldsEl, 'field')) {
              const fname = (childText(f, 'name') || '').trim();
              if (!fname) continue;
              const fdesc = (childText(f, 'description') || '').trim();
              const bo = parseInt(childText(f, 'bitOffset'), 10);
              const bw = parseInt(childText(f, 'bitWidth'), 10);
              const enums = parseEnums(f);
              const field = {
                bitOffset: bo, bitWidth: bw, description: fdesc,
                enums,
                // 预留“下拉框”接口：若 SVD 提供 enumeratedValues，则 options 非空，
                // 渲染时可直接渲染为 <select>；为空则回退为 输入框 / 1-bit 勾选框。
                options: enums.map(e => ({ value: e.value, label: e.name + (e.description ? ' · ' + e.description : '') }))
              };

              // 合并 SFD 的字段级位范围 / 读写权限（SFD 为权威补充）
              const sfdReg = sfd[`${pname}_${rname}`];
              if (sfdReg && sfdReg.fields[fname]) {
                const sf = sfdReg.fields[fname];
                field.bitRange = sf.bitRange || `${bo}..${bo + bw - 1}`;
                field.access = sf.access || mapAccess(acc);
                if (sf.short) field.shortName = sf.short;
              } else {
                field.bitRange = (bw > 1) ? `${bo}..${bo + bw - 1}` : `${bo}`;
                field.access = mapAccess(acc);
              }
              fields[fname] = field;
            }
          }

          const sfdAddr = sfd[`${pname}_${rname}`] ? sfd[`${pname}_${rname}`].address : null;
          const address = (sfdAddr != null) ? sfdAddr : (base + off);
          registers[disp] = {
            name: rname,
            addressOffset: off,
            address: address,
            size: sz,
            access: acc,
            resetValue: reset,
            fields
          };
        }
      }
      peripherals[pname] = { description: desc, group, baseAddress: base, registers };
    }
  }

  // 构建 menu（右键菜单对象）：外设 -> 寄存器 -> 字段 层级
  const menu = Object.keys(peripherals).sort().map(pname => {
    const p = peripherals[pname];
    return {
      label: pname,
      base: '0x' + p.baseAddress.toString(16).toUpperCase(),
      registers: Object.keys(p.registers).sort().map(rdisp => {
        const r = p.registers[rdisp];
        return {
          name: rdisp,
          offset: '0x' + r.addressOffset.toString(16).toUpperCase(),
          address: '0x' + r.address.toString(16).toUpperCase(),
          reset: r.resetValue,
          access: mapAccess(r.access),
          fields: Object.keys(r.fields).sort().map(fname => {
            const f = r.fields[fname];
            return {
              name: fname,
              bits: f.bitRange ? `[${f.bitRange}]` : `[${f.bitOffset}]`,
              rw: f.access || mapAccess(r.access),
              desc: f.description,
              options: f.options || []
            };
          })
        };
      })
    };
  });

  // peripherals 仅作内部中间产物（派生 menu + 地址校验），不写入最终产物
  return { meta, menu };
}

// ============================================================
// 输出为 JS 文件
// ============================================================
function toJS(module, data) {
  const json = JSON.stringify(data, null, 2);
  const banner =
    '// ============================================================\n' +
    '// 自动生成文件，请勿手动编辑\n' +
    '// 生成工具 : svd2js.js (Keil SVD + SFD -> JS)\n' +
    '// 源文件   : ' + path.basename(module.svd) + ' + ' + path.basename(module.sfd) + '\n' +
    '// MCU 型号 : ' + data.meta.name + ' (' + data.menu.length + ' 个外设)\n' +
    '// ============================================================\n';
  return banner +
    '(function () {\n' +
    '  const DATA = ' + json + ';\n' +
    '  if (typeof module !== "undefined" && module.exports) module.exports = DATA;\n' +
    '  if (typeof window !== "undefined") {\n' +
    '    window.MCU_REG_DB = window.MCU_REG_DB || {};\n' +
    '    window.MCU_REG_DB[' + JSON.stringify(module.model) + '] = DATA;\n' +
    '  }\n' +
    '})();\n';
}

// ============================================================
// CLI
// ============================================================
if (typeof require === 'function' && require.main === module) {
  const svd = process.argv[2] || 'CIU32F003x5.svd';
  const sfd = process.argv[3] || 'CIU32F003x5.sfd';
  const model = path.basename(svd).replace(/\.svd$/i, '');
  const out = model + '.js';
  const svdText = fs.readFileSync(svd, 'utf8');
  const sfdText = fs.readFileSync(sfd, 'utf8');
  const data = convert(svdText, sfdText);
  fs.writeFileSync(out, toJS({ svd, sfd, model }, data));

  let regCount = 0, fieldCount = 0;
  for (const p of data.menu)
    for (const r of p.registers) { regCount++; fieldCount += r.fields.length; }
  console.log(`生成 ${out}: ${data.menu.length} 外设 / ${regCount} 寄存器 / ${fieldCount} 字段`);

  // 抽样校验：地址一致性（SFD 绝对地址 == base + offset）
  let addrMismatch = 0;
  for (const p of data.menu) {
    const base = parseInt(p.base, 16);
    for (const r of p.registers)
      if (parseInt(r.address, 16) !== base + parseInt(r.offset, 16)) addrMismatch++;
  }
  console.log(`地址一致性检查: ${addrMismatch} 个寄存器地址不匹配 (base+offset != SFD 绝对地址)`);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { convert, parseSFD, parseXML, parseAttrs, toJS, mapAccess };
}
// 浏览器环境：以 <script> 加载时暴露为 window.SvdConverter（供 SVD/SFD 文件即时转换）
if (typeof window !== 'undefined') {
  window.SvdConverter = { convert, parseSFD, parseXML, parseAttrs, toJS, mapAccess };
}
