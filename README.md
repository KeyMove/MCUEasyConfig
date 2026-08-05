# [MCUEasyConfig（四向 Pad 节点连线系统 · MCU 引脚 / 寄存器可视化配置工具）](https://keymove.github.io/MCUEasyConfig/)

> 项目代号 **MCUEasyConfig**：一个纯前端的 MCU 引脚连线与寄存器配置可视化工具。在画布上拖出 MCU、自定义器件、外设，
> 通过「四向 Pad」连线表达引脚连接关系，系统会**自动完成 AF 复用、GPIO 模式、上下拉、接口初始化代码生成**，
> 并内置 **SVD 寄存器编辑器**，可逐寄存器、逐位地修改芯片寄存器、实时收集「寄存器变动值」直接贴进固件。
> 同时内置 **通信调试模块**（SWD 烧录 / 串口助手 / CAN 助手）用于固件联调。

无需构建、无依赖安装，打开即用。

---

## ✨ 核心功能

- **画布节点连线**：MCU / 自定义器件 / 外设节点，四向 Pad 拖拽连线；鼠标悬停 Pad 高亮所有相连引脚；
  滚轮缩放、右键拖拽平移、`Shift` 框选多节点。
- **引脚自动配置**：外设连到 MCU IO 时自动写入 AF 与 GPIO 寄存器（MODE=复用 / AFL=AF 编号 / I2C 自动开漏+上拉）；
  引脚颜色按模式区分（输入 / 输出 / 复用 / 模拟）。
- **总线高亮 + 实例锁定**：从 SPI MOSI 等引脚拖线，所有可作该功能的 IO 高亮；多实例总线（SPI1/SPI2）连上后只高亮已连实例。
- **接口程序 / 初始化一体化**：
  - 【接口函数定义】写 C 程序段；【接口初始化定义】写寄存器段（`地址,值`）。
  - 外设连接到对应接口（如 `SPI1_MOSI`、`TIM1_CH1`）时按接口名命中并生成。别名前加 `&` 表示「必需条件」（多条件需全连上）。
  - 多实例接口按器件名+序号展开，支持 `//replace` 全局替换表（如 `//replace SPI_CLK:SPI{{IDX}}_CLK`）。
  - 多个接口命中同一地址时按 `|`（OR）合并；**同一接口内部**出现两个相同地址则保留两行（先赋值再使能，SVD 取最后值）。
- **SVD 寄存器编辑器**：macOS 风格窗口 + `RichObjectEditor` 树形视图，支持搜索（拼音首字母）。
  - 外设 / 寄存器按**地址**排序，展开后寄存器位按 **offset** 排序。
  - 字段用勾选框 / 下拉 / 数字控件直改，顶部「寄存器值」填十六进制并与字段**双向同步**；改动实时写回并收集进「寄存器变动值」。
  - 支持「保存到 SVD」（接口初始化直接写入寄存器）、「从 SVD 加载」（回填接口初始化文本）、「重置所有寄存器」。
- **自定义器件 / 封装**：用文本框定义器件（引脚 + 总线 / 特殊功能 / ADC 通配），生成 SOP / LQFP / QFN 四方向封装；
  器件可存入收藏夹、直接放置；右键自定义器件弹出 JSON 定义的操作菜单（滑块 / 按钮 → 实时写 SVD 寄存器）。
- **GPIO 输入变体**：自定义器件输入脚可声明 `GPIO_INPU`（输入+上拉）/ `GPIO_INPD`（输入+下拉），连接 MCU 时两端自动配置输入模式 + 对应上下拉。
- **寄存器变动值导出**：一键输出所有「与复位值不同」的 GPIO / SVD 寄存器（`0x地址,0x值,//寄存器名`），按地址升序，可直接贴进固件初始化。
- **可视化面板系统**：内置「面板工作台」（`PanelWorkbench`）——四窗口工作流（控件定义 / 表格 / 布局 / 成品预览）拖拽设计交互面板，
  可保存为「全局 / 会话」面板，并运行成独立实例（`PanelRuntime`，自带数据总线 + 成品窗口，多开互不干扰）。
  - 面板管理菜单可：创建 / 保存 / 运行当前设计 / 运行·复制 JSON·编辑·删除已有面板。
  - 自定义器件节点的「右键菜单 JSON」同时支持两种格式：① 原 ops JSON（滑块/按钮直写 SVD 寄存器）；
    ② 面板导出 JSON（右键直接弹出该面板，**按节点单例**：同一节点反复右键只提到前台，不重复创建）。
- **配置管理**：IO 功能库（config）导入 / 导出 / 应用 / 重置，持久化到浏览器 localStorage。

### 通信调试模块（comm.js）

- **SWD 烧录**：内置 SWD 调试 / 固件上传 UI（第一栏），走 `COMHelper` 底层 transport + SWD 协议封装。
- **串口助手（第二栏）**：完全自绘面板（不依赖 rich-menu 控件），四区布局：
  - 左上 RX 接收区、左下 TX 发送区（HEX 模式勾选 + 发送按钮）、右上快捷发送列表（每行 `[Hex勾选][文本][发送]` + 滚动）、右下串口设置（波特率 / 打开关闭）。
  - 独立 transport 不与 SWD 共用端口；接收增量游标避免重复刷屏；收发均支持全局 HEX 模式；数据持久化到 localStorage。
- **CAN 助手（第三栏）**：占位预留（UI 框架已搭，功能待实现）。

---

## 🚀 快速开始

纯静态站点，用任意静态服务器打开即可（推荐本地 HTTP 服务，避免 `file://` 限制）：

```bash
# 方式一：Python（无需安装）
cd <项目根目录>
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000

# 方式二：Node 静态服务（如 npx serve）
npx serve .
```

> 无需 `npm install`、无打包步骤。所有逻辑通过经典 `<script>` 标签共享全局作用域加载。

---

## 📁 目录结构

```
<项目根目录>/
├── index.html              入口页面（画布 + 顶部 Dock + 各面板容器）
├── config.bundle.js        由 config.json 生成的运行时配置（自动生成，勿手改）
├── CIU32F003x5.js          内置 MCU 寄存器库（SVD 转换产物，定义 window.MCU_REG_DB）
├── CIU32F003x5.svd / .sfd  MCU 原始 SVD / SFD 源文件
├── cc/
│   └── ...                 收藏夹 / 器件示例资源
├── js/
│   ├── config.js           静态基础库（MCU gpio/af/special/封装 + 外设库）—— 由工具生成
│   ├── node.js             节点类（Node）：创建、连线、序列化 / 反序列化
│   ├── packages.js         封装生成（SOP/LQFP/QFN）、特殊功能归一、信号识别
│   ├── af-menu.js          MCU IO 右键菜单（模式 / AF 快速选择）
│   ├── system.js           核心 NodeSystem：节点管理、连接绘制、缩放平移、接口初始化、SVD 写入
│   ├── svd-lib.js          SVD 寄存器库管理（localStorage 持久化、当前激活 MCU 匹配）
│   ├── comm.js             通信调试模块（SWD / 串口助手 / CAN 助手三栏 Tab，MacWindow 容器）
│   ├── swd.js              SWD 底层协议 / transport 封装
│   ├── main.js             顶层入口：画布初始化、Dock、各面板挂接
│   └── toast.js            轻量提示组件
├── rich-obj-editor.js      RichObjectEditor 组件（树形 + 搜索 + 富控件，SVD 编辑器内核）
├── rich-menu.js / dock.js / macwindow.js   顶栏 Dock / 菜单 / macOS 风格窗口
├── svd2js.js               SVD + SFD → JS 转换器（见下）
├── excel.js                表格 / 数据导入导出辅助
├── chart.js                波形 / 图表控件（面板运行时图表类控件依赖）
├── tools/                  配置 / 库生成与校验脚本
│   ├── panel-workbench.js    可视化面板工作台（四窗口设计 + 面板管理菜单 + 导出快照）
│   ├── panel-runtime.js      面板运行实例（独立数据总线 + 成品窗口，多开/单例/序号回收）
│   ├── preview-window.js     成品窗口（MacWindow 外壳 + 控件渲染，编辑态与运行态共用）
│   ├── layout-window.js      布局窗口（拖拽摆放控件）
│   ├── gen-config-js.js       硬件库源(config.full.json) → js/config.js
│   ├── gen-config-js.js       硬件库源(config.full.json) → js/config.js
│   ├── gen-config-bundle.js   config.json → config.bundle.js
│   ├── check-config.js        校验配置合法性
│   ├── migrate-config.js      配置版本迁移
│   └── add-signal-config.js   追加信号配置
└── io-config.example.json  IO 功能库导入 / 导出示例
```

---

## 🧩 主要功能模块

### 1. 画布与节点（system.js / node.js）

- 节点分三类：**MCU**（含内置引脚功能表）、**自定义器件**（文本框定义）、**预制外设**（Serial Flash、ADC、GPIO 等）。
- 每个节点四向（上/下/左/右）分布 Pad，连线即为引脚连接。
- 画布支持缩放、平移、框选、批量移动 / 删除；状态可保存 / 加载为 JSON。

### 2. 引脚连接与自动配置

- 从外设引脚拖线到 MCU IO：自动识别总线（SPI/I2C/UART/TIM…）与特殊功能（ADC_INx / GPIO_OUT / NRST / EXTCLK）。
- 连接时自动写入：GPIO 模式寄存器、AF 复用编号、I2C 开漏 + 上拉。
- 多实例总线（SPI1/SPI2）采用**实例锁定**，连上某实例后只高亮该实例 IO；TIM 通道不锁定（不同 CHx 可来自不同定时器）。
- 自定义器件引脚支持 ADC 通配（`ADC_INX` / `AINX`）与内联特殊功能（`PC0/NRST`）。

### 3. 接口函数 / 接口初始化（system.js）

面板格式（`⚙️ 自定义接口初始化参数`）：

```
第 1 行：名称          例如 通用SPI
第 2 行：接口别名（空格分隔，& 前缀=必需条件）
        例如 &SPI1_CLK &SPI1_MOSI &SPI1_MISO
第 3 行起：正文
        【接口初始化定义】写  地址,值  （自动写入 MCU 寄存器 + SVD）
        【接口函数定义】  写  C 代码   （连上对应接口后收集，可整段导出）
```

- 接口名以 `@` 开头 = 忽略条件**强制使用**该接口（程序段 + 寄存器段都强制生效）。
- 多相同接口不同 IO：`//replace` 全局替换表 + 占位符副本（`{{CS}}/{{SCK}}/{{MOSI}}/{{MISO}}/{{SCL}}/{{SDA}}/{{DEV}}/{{IDX}}`）。
- 多个接口命中同地址 → `|` 合并；同接口内同地址两行 → 保留两行、SVD 取最后值。

### 4. SVD 寄存器编辑器（rich-obj-editor.js）

- 点顶部 Dock「SVD」打开；外设按 base 地址升序、寄存器按 address 升序、字段按 offset 升序。
- 字段控件：勾选框（1 位）/ 下拉（有 options）/ 数字（多位），与顶部十六进制「寄存器值」双向同步。
- 改动实时写回 `nodeSystem.svdRegValues`（按 SVD 命名空间隔离，多 MCU 不串），并收集进「寄存器变动值」。

### 5. 串口助手（comm.js → buildUartPanel）

- 自绘四区面板（RX / TX / 快捷发送 / 串口设置），仅在「串口助手」Tab 激活时显示（`.uart-panel.active` 绝对定位填满面板）。
- 右上快捷发送列表：每行 `[Hex勾选框][文本输入][发送按钮]`，列表可滚动；勾选框表示该行文本按 Hex 发送。
- 左下 TX 发送区底栏含「HEX 模式」勾选 + 发送按钮；全局 `HEX` 模式（`__uartHexMode`）下收发均按 Hex 处理。
- 接收区增量游标（`__uartRecvLen`）处理 `COMHelper.buffer` 累积数组，避免重复刷屏。
- 下载算法与快捷发送数据持久化到 localStorage。

### 6. 配置管理（config.js / svd-lib.js）

- IO 功能库持久化在浏览器 localStorage；`config.json` 仅作导入 / 导出介质（导入即叠加到基础库）。
- 重置恢复默认（硬件库始终来自 `js/config.js`）。

### 7. 可视化面板系统（panel-workbench.js / panel-runtime.js）

- **设计面板**：Dock 进入「面板」管理菜单 → 创建 / 保存（`全局` 刷新不消失；`会话` 随画布 JSON 导出/加载），
  四窗口实时联动：控件定义（RichObjectEditor）经「➡️」推送到布局窗口，布局驱动成品窗口即时预览，控件值经表格双向绑定。
- **运行面板**：点「运行当前设计」或列表项 `▶` → `PanelRuntime` 构造独立运行实例（多开并存，各自隔离）。
  - 多开序号类 Windows 重命名：仅重复时追加 `#2`/`#3`，关掉后序号回收；窗口按序号错位避免重叠。
  - 运行按钮文案为「运行独立实例」——本系统无编译过程，仅按快照构造运行态。
- **右键单例**：自定义器件节点右键，若 `deviceMenu` 为面板导出 JSON，则弹出**按节点单例**的面板（同节点反复右键仅提到前台）。
- 面板管理菜单 `z-index: 100000`，始终浮于运行实例窗口之上。

---

## 🛠 工具脚本（tools/）

| 脚本 | 作用 |
|------|------|
| `node tools/gen-config-js.js [源json]` | 硬件库源 `config.full.json` → 编译进 `js/config.js` |
| `node tools/gen-config-bundle.js` | `config.json` → 生成 `config.bundle.js` |
| `node svd2js.js [xxx.svd] [xxx.sfd]` | Keil SVD + SFD → `窗口.MCU_REG_DB` 的 JS（默认 CIU32F003x5） |
| `node tools/check-config.js` | 校验配置合法性 |
| `node tools/migrate-config.js` | 配置版本迁移 |

---

## 📦 数据格式

### SVD 寄存器库（CIU32F003x5.js）

```js
window.MCU_REG_DB["CIU32F003x5"] = {
  meta:  { name, vendor, series, version, cpu, width },
  menu:  [ { label, base, registers: [ { name, address, reset, access,
            fields: [ { name, bits, rw, desc } ] } ] } ]
};
```

### 自定义器件（文本框）

```
器件名 [封装] [接口名1] [接口名2] …      // 封装可省略；第2个 token 为已知封装才识别
引脚名 [BUS SIGNAL] [特殊功能…]          // 每行一个引脚
```

示例：`W25Q16 SOP 通用SPI 通用SPI2` ；引脚 `SCK SPI SCK` / `PB0 GPIO_OUT` / `PC0/NRST` / `AIN3 ADC_IN3`。

### 面板导出 JSON（PanelWorkbench.exportProject 快照）

可作为自定义器件节点「右键菜单 JSON」直接弹出面板。判定条件：对象含 `layout` 且含 `cells`/`data`/`schema`/`_meta` 任一键（且非 `ops`/数组）。

```js
{
  _name: "温控面板",          // 面板名（运行时作窗口标题）
  _meta: { /* 元信息 */ },
  data:  { /* 表格数据 */ },
  schema:{ /* 控件定义 schema */ },
  layout:[ /* 布局：控件位置/尺寸/类型 */ ],
  cells: { /* 单元格值（可含 JS 公式） */ },
  preview:{ w, h }           // 成品窗口尺寸（用户拖拽后保留）
}
```

> 另一种右键菜单 JSON 为「ops 格式」：`{ "ops": [ {type:"slider", register:"TIMx.CCRn", ...} ] }` 或裸数组，
> 走原逻辑（滑块/按钮直写 SVD 寄存器），详见 `js/main.js` 的 `openCustomDeviceMenu`。

---

## 📝 约定与行为

- 「寄存器变动值」按地址升序输出所有与复位值不同的寄存器（GPIO + 手动 SVD 改动）。
- SVD 编辑器树形顺序：**外设 / 寄存器按地址**，**字段按 offset**（低位在前）。
- 不同接口命中同地址按 `|` 合并；同一接口内部同地址多行保留（先赋值再使能，SVD 取最后值）。
- 所有改动持久化在浏览器 localStorage；清空浏览器存储即恢复默认（硬件库不受影响）。

---

## ❓ 常见问题

- **打开是空白？** 需用 HTTP 服务访问（见「快速开始」），直接双击 `index.html`（`file://`）部分浏览器会限制脚本加载。
- **想换 MCU？** 用 `svd2js.js` 转换对应 SVD/SFD，把生成的 JS 加入 `index.html` 的 `<script>` 并在 SVD 库切换即可。
- **配置改乱了？** 「配置菜单 → 重置」清除本地存储恢复默认。
- **串口助手看不到？** 串口助手面板仅在 comm 模块「串口助手」Tab 激活时浮出；切到 SWD/CAN 时自动隐藏。
