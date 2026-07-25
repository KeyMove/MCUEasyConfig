'use strict';
/*
 * svd-lib.js — SVD 寄存器库管理（localStorage 持久化）
 *
 * 模型：
 *   - window.MCU_REG_DB[key] = { meta, menu }  全局寄存器库（原本由 CIU32F003x5.js 注入的内置 SVD）
 *   - localStorage['svdLibrary']   = { key: {meta, menu} }  用户导入的 SVD（覆盖同名 key）
 *   - localStorage['svdActiveKey'] = 当前激活的 SVD key
 *
 * 行为：
 *   - 启动时把 svdLibrary 合并进 MCU_REG_DB（用户库可覆盖内置同名）
 *   - 配置菜单可：下拉切换当前 SVD / 导入 SVD JSON / 选择 .svd+.sfd 文件即时转换并导入 /
 *     导出当前 SVD 为 JSON / 删除（仅用户库）
 *   - 所有读取寄存器 DB 的代码统一通过 window.getActiveSvdDb() 取“当前 SVD”，
 *     不再硬编码 'CIU32F003x5'。
 */
(function () {
  const LS_LIB = 'svdLibrary';
  const LS_ACTIVE = 'svdActiveKey';

  function readLib() {
    try { return JSON.parse(localStorage.getItem(LS_LIB) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeLib(lib) {
    try { localStorage.setItem(LS_LIB, JSON.stringify(lib)); } catch (e) {}
  }

  // 把用户库合并进全局 MCU_REG_DB（保留内置，用户库可覆盖同名 key）
  function mergeLib() {
    window.MCU_REG_DB = window.MCU_REG_DB || {};
    const lib = readLib();
    Object.keys(lib).forEach(k => { if (lib[k] && lib[k].menu) window.MCU_REG_DB[k] = lib[k]; });
  }

  function listSvdKeys() {
    return Object.keys(window.MCU_REG_DB || {});
  }

  function getActiveSvdKey() {
    const k = (typeof localStorage !== 'undefined') ? (localStorage.getItem(LS_ACTIVE) || '') : '';
    if (k && window.MCU_REG_DB && window.MCU_REG_DB[k]) return k;
    const keys = listSvdKeys();
    return keys[0] || '';
  }

  function getActiveSvdDb() {
    const k = getActiveSvdKey();
    return (window.MCU_REG_DB && window.MCU_REG_DB[k]) || null;
  }

  function setActiveSvdKey(key) {
    if (!key || !(window.MCU_REG_DB && window.MCU_REG_DB[key])) return;
    try { localStorage.setItem(LS_ACTIVE, key); } catch (e) {}
    window.dispatchEvent(new Event('svdkeychanged'));
  }

  // 内置 SVD：未存进 svdLibrary 的 key（来自 CIU32F003x5.js 等静态文件）
  function isBuiltin(key) {
    const lib = readLib();
    return !lib[key];
  }

  // 由 MCU 设备（或设备 id 字符串）解析其对应的 SVD key。
  //
  // 匹配策略：优先取 MCU “大类名称”（device.mcu，如 CIU32F003）做匹配，而非具体封装的设备 id
  // （如 CIU32F003_SOP20）。同一硅基的多个封装（SOP16 / SOP20 …）在归一化时共享同一个 .mcu 大类，
  // 因此“下面的封装继承”该大类的匹配结果——同一大类的不同封装都会解析到同一个 SVD key。
  //
  // 对大类名 familyId 的匹配规则：
  //   1) 精确相等；2) familyId 是某 SVD key 的前缀（如 CIU32F003 -> CIU32F003x5）；
  //   3) 某 SVD key 是 familyId 的前缀（如 CIU32F003x5 -> CIU32F003）。
  // 返回 '' 表示未找到。
  function matchFamily(familyId) {
    const keys = listSvdKeys();
    if (keys.indexOf(familyId) !== -1) return familyId;
    const byPrefix = keys.filter(k => k.indexOf(familyId) === 0).sort((a, b) => a.length - b.length);
    if (byPrefix.length) return byPrefix[0];
    const byContain = keys.filter(k => familyId.indexOf(k) === 0).sort((a, b) => b.length - a.length);
    if (byContain.length) return byContain[0];
    return '';
  }
  function resolveSvdKeyForDevice(deviceOrId) {
    // 允许直接传 device 对象：取出其大类名称（family）。无 device 对象时按字符串处理。
    let familyId;
    let isObject = false;
    if (deviceOrId && typeof deviceOrId === 'object') {
      isObject = true;
      familyId = (deviceOrId.mcu || deviceOrId.id || deviceOrId.name) || '';
    } else {
      familyId = deviceOrId || '';
    }
    if (!familyId) return '';
    const hit = matchFamily(familyId);
    if (hit) return hit;
    // 仅字符串回退：去掉末尾 _封装 段（如 CIU32F003_SOP20 -> CIU32F003）再试一次，
    // 让“裸字符串 + 带封装后缀”也能继承大类匹配。
    if (!isObject && familyId.indexOf('_') !== -1) {
      const base = familyId.split('_')[0];
      if (base && base !== familyId) return matchFamily(base);
    }
    return '';
  }

  // 导入 SVD JSON 对象 { meta, menu }；key 默认取 meta.name；返回 key
  function importSvdJson(obj, keyOverride) {
    if (!obj || !obj.menu || !Array.isArray(obj.menu)) {
      throw new Error('SVD JSON 缺少合法 menu 数组（应为 [{label,base,registers}]）');
    }
    const key = (keyOverride || (obj.meta && obj.meta.name) || ('SVD_' + Date.now()));
    const lib = readLib();
    lib[key] = obj;
    writeLib(lib);
    mergeLib();
    return key;
  }

  // 通过 SVD/SFD 文本转换并导入；name 可选，覆盖 meta.name
  function importSvdFromText(svdText, sfdText, name) {
    if (typeof window.SvdConverter === 'undefined' || !window.SvdConverter.convert) {
      throw new Error('SVD 转换器未加载（svd2js.js），无法转换 SVD/SFD 文件');
    }
    const data = window.SvdConverter.convert(svdText, sfdText || '');
    if (!data || !data.menu) throw new Error('SVD 转换结果为空');
    if (name && data.meta) data.meta.name = name;
    return importSvdJson(data);
  }

  function getSvdDb(key) {
    return (window.MCU_REG_DB && window.MCU_REG_DB[key]) || null;
  }

  // 删除 SVD（仅用户库可删，内置返回 false）
  function deleteSvd(key) {
    const lib = readLib();
    if (!lib[key]) return false;
    delete lib[key];
    writeLib(lib);
    if (window.MCU_REG_DB) delete window.MCU_REG_DB[key];
    if (getActiveSvdKey() === key) {
      const keys = listSvdKeys();
      setActiveSvdKey(keys[0] || '');
    }
    return true;
  }

  function init() { mergeLib(); }

  window.SvdLib = {
    init, listSvdKeys, getActiveSvdKey, getActiveSvdDb, setActiveSvdKey,
    isBuiltin, resolveSvdKeyForDevice, importSvdJson, importSvdFromText, getSvdDb, deleteSvd,
    LS_LIB, LS_ACTIVE
  };
  // 全局便捷取“当前 SVD 库”函数，供 findSvdReg 等统一调用
  window.getActiveSvdDb = getActiveSvdDb;

  init();
})();
