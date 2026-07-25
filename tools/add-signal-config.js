const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '..', 'config.full.json');
const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));

// 收编进 config 的信号匹配知识（原散落于 system.js / packages.js / main.js 的本地 const）
cfg.signal = {
  // 信号名同义词：键与值双向等价，用于连接名 ↔ 接口定义别名的等价匹配
  synonyms: {
    'SPI1_CLK': ['SPI1_SCK', 'CLK', 'SCK'],
    'SPI1_SCK': ['SPI1_CLK', 'CLK', 'SCK'],
    'CLK': ['SPI1_CLK', 'SPI1_SCK', 'SCK'],
    'SCK': ['SPI1_CLK', 'SPI1_SCK', 'CLK'],
    'SPI1_MOSI': ['MOSI'],
    'MOSI': ['SPI1_MOSI'],
    'SPI1_MISO': ['MISO'],
    'MISO': ['SPI1_MISO'],
    'SPI1_CS': ['SPI1_NSS', 'CS', 'NSS'],
    'SPI1_NSS': ['SPI1_CS', 'CS', 'NSS'],
    'CS': ['SPI1_NSS', 'SPI1_CS', 'NSS'],
    'NSS': ['SPI1_NSS', 'SPI1_CS', 'CS'],
    'I2C1_SCL': ['SCL'],
    'SCL': ['I2C1_SCL'],
    'I2C1_SDA': ['SDA'],
    'SDA': ['I2C1_SDA'],
    'UART1_TX': ['TX'],
    'TX': ['UART1_TX'],
    'UART1_RX': ['RX'],
    'RX': ['UART1_RX'],
    'UART2_TX': ['TX2'],
    'TX2': ['UART2_TX'],
    'UART2_RX': ['RX2'],
    'RX2': ['UART2_RX'],
    'GPIO_OUT': ['GPIO', 'GPO'],
    'GPIO_IN': ['GPIO', 'GPI'],
    'GPIO': [],
    'GPO': ['GPIO_OUT', 'GPIO', 'GPO'],
    'GPI': ['GPIO_IN', 'GPIO', 'GPI']
  },
  // 外设引脚信号 → MCU 复用功能信号的归一层（空数组表示无对应复用功能）
  map: {
    'CS': ['NSS', 'CS'],
    'CLK': ['SCK', 'CLK'],
    'MOSI': ['MOSI'],
    'MISO': ['MISO'],
    'SCK': ['SCK', 'CLK'],
    'NSS': ['NSS', 'CS'],
    'WP': [],
    'HOLD': [],
    'CHX': ['CH1', 'CH2', 'CH3', 'CH4']
  },
  // 已知总线前缀（正则源串，加载时编译为 ^(..)$/i）
  knownBus: 'SPI|I2C|UART|USART|TIM|CAN|SDIO|QUADSPI'
};

fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('已写入 config.full.json.signal（synonyms=%d, map=%d, knownBus 已设）',
  Object.keys(cfg.signal.synonyms).length, Object.keys(cfg.signal.map).length);
