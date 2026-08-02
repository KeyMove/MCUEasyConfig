/**
 * 演示：定义控件 -> 关联 Excel -> 拖拽布局，打通整条链路
 * 打开 index.html 后控制台执行： runControlPanelDemo()
 * 或直接在页面里：浏览器控制台调用 window.runControlPanelDemo
 */
function runControlPanelDemo() {
    if (window.__cpDemoStarted) {
        console.log('演示已运行，请勿重复启动');
        return;
    }
    window.__cpDemoStarted = true;

    // 1) 创建 Excel 表格（数据总线 + 公式引擎）
    const excelHost = document.createElement('div');
    excelHost.style.cssText = 'position:fixed;left:20px;bottom:20px;width:420px;height:260px;z-index:9000;';
    document.body.appendChild(excelHost);
    const excel = new ExcelTable(excelHost, 8, 8);

    // 预置一个公式单元格 B2 = A1*2 + B1，用于展示“滑块 -> 公式 -> 控件”联动
    excel.setCell('B2', '=A1*2+B1');

    // 2) 创建自定义操作面板（可拖拽的 MacWindow），定义若干绑定控件的实例
    const panel = new ControlPanel({
        excel,
        title: '自定义操作面板（演示）',
        width: 320,
        height: 300,
        x: window.innerWidth - 360,
        y: 20,
        layout: 'grid',
        onChange: (def, v) => {
            console.log(`[控件变化] ${def.id}(${def.cell}) =`, v);
        }
    });

    panel.setDefs([
        { id: 'kA', type: 'range', label: '参数 A', cell: 'A1', min: 0, max: 100, step: 1, value: 10, unit: '' },
        { id: 'kB', type: 'number', label: '参数 B', cell: 'B1', min: 0, max: 50, step: 1, value: 5 },
        { id: 'kMode', type: 'select', label: '模式', cell: 'C1',
          options: [{ value: 'x', label: '模式X' }, { value: 'y', label: '模式Y' }], value: 'x' },
        { id: 'kEn', type: 'checkbox', label: '使能', cell: 'D1', value: true },
        // 结果控件：绑定 B2（公式结果），随 A/B 滑块实时刷新，证明公式->控件回推
        { id: 'kOut', type: 'number', label: '结果 B2=A1*2+B1', cell: 'B2', min: 0, max: 999 },
    ]);

    console.log('演示已启动：拖动“参数 A / B”滑块，观察“结果”框与表格 B2 同步变化。');
    console.log('可调用 panel.exportDefs() 导出定义，或 new ControlPanel({excel, layout:"absolute"}) 体验自由拖拽布局。');
    window.__cpDemo = panel;
}

if (typeof window !== 'undefined') window.runControlPanelDemo = runControlPanelDemo;
