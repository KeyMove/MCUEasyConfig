'use strict';
/*
 * svd-lib.js — SVD 寄存器库管理（localStorage / IndexedDB 自动切换持久化）
 *
 * 模型：
 *   - window.MCU_REG_DB[key] = { meta, menu }  全局寄存器库（原本由 CIU32F003x5.js 注入的内置 SVD）
 *   - memLib = { key: {meta, menu} }            用户导入 SVD 的“内存权威副本”（所有读都走它，同步）
 *   - 持久化：默认写 localStorage['svdLibrary']；一旦写入触发容量超限（QuotaExceededError），
 *     自动切换到 IndexedDB（库名 pinSvdStore / 对象仓 svdLibrary / 记录键 __all__）并把数据迁过去，
 *     此后该浏览器永久走 IndexedDB，规避 localStorage 约 5MB 的上限——多个大体积 SVD 也不会撑爆。
 *   - localStorage['svdActiveKey'] = 当前激活的 SVD key（仅一个字符串，始终留 localStorage，无需迁移）
 *
 * 行为：
 *   - 启动时：先同步从 localStorage 载入（兼容旧数据、旧用户无回归）；再异步探测 IndexedDB，
 *     若其中已有数据（此前已切到 IDB）则接管并派发 'svdlibready' 事件供 UI 刷新。
 *   - 配置菜单可：下拉切换当前 SVD / 导入 SVD JSON / 选择 .svd+.sfd 文件即时转换并导入 /
 *     导出当前 SVD 为 JSON / 删除（仅用户库）
 *   - 所有读取寄存器 DB 的代码统一通过 window.getActiveSvdDb() 取“当前 SVD”，
 *     不再硬编码 'CIU32F003x5'。
 */
(function () {
  const LS_LIB = 'svdLibrary';
  const LS_ACTIVE = 'svdActiveKey';

  // ---------- 存储层：内存副本 + 自动降级到 IndexedDB ----------
  let memLib = {};                          // SVD 库内存权威副本（同步读取）
  let storageBackend = 'ls';                // 'ls'（默认） | 'idb'（容量超限后切换）

  // IndexedDB 封装（Promise 化）
  const IDB_NAME = 'pinSvdStore';
  const IDB_STORE = 'svdLibrary';
  const IDB_ALL_KEY = '__all__';
  let _idbPromise = null;
  function openIDB() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 不可用')); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _idbPromise;
  }
  function idbGetAll() {
    return openIDB().then(db => new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_ALL_KEY);
        req.onsuccess = () => resolve(req.result || {});
        req.onerror = () => resolve({});
      } catch (e) { resolve({}); }
    }));
  }
  function idbPutAll(lib) {
    return openIDB().then(db => new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(lib, IDB_ALL_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) { reject(e); }
    }));
  }

  // 同步读取：直接返回内存副本（快速且确定，不碰磁盘）
  function readLib() { return memLib; }

  // 异步持久化：按当前后端写入；localStorage 超限时自动切 IndexedDB 并迁移
  function persist(lib) {
    if (storageBackend === 'idb') {
      idbPutAll(lib).catch(err => console.warn('[SvdLib] IndexedDB 写入失败：', err));
      return;
    }
    // 默认走 localStorage：尝试写入，容量不足则切换到 IndexedDB
    try {
      localStorage.setItem(LS_LIB, JSON.stringify(lib));
    } catch (e) {
      // QuotaExceededError 等：localStorage 容量不够，自动切换并迁移到 IndexedDB
      storageBackend = 'idb';
      try { localStorage.removeItem(LS_LIB); } catch (_) {}   // 清掉旧的（可能半截）数据
      idbPutAll(lib).then(() => {
        if (typeof nodeSystem !== 'undefined' && nodeSystem && nodeSystem.updateConnectionStatus) {
          nodeSystem.updateConnectionStatus('SVD 存储已切换', '#38bdf8', 'localStorage 容量不足，已自动切换到 IndexedDB 存储 SVD 库');
        }
      }).catch(err => console.warn('[SvdLib] 迁移到 IndexedDB 失败：', err));
    }
  }
  function writeLib(lib) {
    memLib = lib;          // 内存立即生效（同步），持久化在后台进行
    persist(lib);
  }

  // 内存快照（深拷贝，供工作区导出）
  function getLibSnapshot() {
    try { return JSON.parse(JSON.stringify(memLib)); } catch (e) { return {}; }
  }
  // 用快照整体覆盖（工作区导入）：写内存 + 合并 + 持久化
  function setLibSnapshot(lib) {
    if (!lib || typeof lib !== 'object') return;
    writeLib(lib);
    mergeLib();
  }

  // 把用户库合并进全局 MCU_REG_DB（保留内置，用户库可覆盖同名 key）
  function mergeLib() {
    window.MCU_REG_DB = window.MCU_REG_DB || {};
    const lib = readLib();
    Object.keys(lib).forEach(k => { if (lib[k] && lib[k].menu) window.MCU_REG_DB[k] = lib[k]; });
  }
  // 仅把“内存中的库”重新合并进 MCU_REG_DB（不触碰磁盘）。供工作区导入后就地刷新，
  // 避免再调用 init()（init 会从磁盘重载，可能在 IDB 迁移途中把内存清空）。
  function mergeFromMem() { mergeLib(); }

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

  function init() {
    // 同步：先尝试 localStorage（兼容旧数据，旧用户零回归，启动即可见）
    try { memLib = JSON.parse(localStorage.getItem(LS_LIB) || '{}') || {}; } catch (e) { memLib = {}; }
    mergeLib();
    // 异步：探测 IndexedDB，若其中已有数据（此前因容量切换过）则接管并通知 UI 刷新
    if (typeof indexedDB !== 'undefined') {
      idbGetAll().then(idbLib => {
        if (idbLib && Object.keys(idbLib).length) {
          storageBackend = 'idb';
          memLib = idbLib;
          mergeLib();
          window.dispatchEvent(new Event('svdlibready'));
        }
      }).catch(() => {});
    }
  }

  window.SvdLib = {
    init, mergeFromMem, listSvdKeys, getActiveSvdKey, getActiveSvdDb, setActiveSvdKey,
    isBuiltin, resolveSvdKeyForDevice, importSvdJson, importSvdFromText, getSvdDb, deleteSvd,
    getLibSnapshot, setLibSnapshot,
    LS_LIB, LS_ACTIVE, IDB_NAME, IDB_STORE
  };
  // 全局便捷取“当前 SVD 库”函数，供 findSvdReg 等统一调用
  window.getActiveSvdDb = getActiveSvdDb;

  init();
})();
