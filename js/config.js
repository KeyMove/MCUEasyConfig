(function () {
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
    var BASE = {
  "mcu": {
    "CIU32F003": {
      "gpio": {
        "base": {
          "A": "0x50000000",
          "B": "0x50000400",
          "C": "0x50000800"
        },
        "regs": {
          "MODE": "0x00",
          "OTYPE": "0x04",
          "PUPD": "0x0C",
          "AFL": "0x20"
        },
        "reset": {
          "MODE": {
            "A": "0x0000FFEF",
            "B": "0x0000EFFF",
            "C": "0x0000000F"
          },
          "PUPD": {
            "A": "0x00000020",
            "B": "0x00001000",
            "C": "0x00000000"
          },
          "OTYPE": {
            "A": "0x00000000",
            "B": "0x00000000",
            "C": "0x00000000"
          },
          "AFL": {
            "A": "0x00000000",
            "B": "0x00000000",
            "C": "0x00000000"
          }
        }
      },
      "af": {
        "PA0": [
          "SPI1_MOSI",
          "-",
          "TIM1_CH1",
          "TIM3_CH1",
          "TIM1_CH2N",
          "TIM1_CH3N",
          "-",
          "-"
        ],
        "PA1": [
          "SPI1_MISO",
          "-",
          "TIM1_CH2",
          "-",
          "TIM1_CH3",
          "-",
          "-",
          "-"
        ],
        "PA2": [
          "SWCLK",
          "UART1_RX",
          "-",
          "-",
          "COMP1_OUT",
          "-",
          "I2C1_SCL",
          "COMP2_OUT"
        ],
        "PA3": [
          "-",
          "UART1_TX",
          "TIM1_CH3N",
          "TIM3_CH3",
          "-",
          "UART2_RX",
          "-",
          "-"
        ],
        "PA4": [
          "-",
          "UART1_RX",
          "TIM1_CH2N",
          "TIM3_CH2",
          "-",
          "UART2_TX",
          "-",
          "-"
        ],
        "PA5": [
          "-",
          "-",
          "TIM1_CH2",
          "TIM3_CH1",
          "-",
          "UART2_TX",
          "-",
          "-"
        ],
        "PA6": [
          "SPI1_NSS",
          "UART1_TX",
          "-",
          "TIM3_CH3",
          "SPI1_SCK",
          "UART2_RX",
          "-",
          "-"
        ],
        "PA7": [
          "SPI1_MOSI",
          "UART1_TX",
          "-",
          "TIM3_CH2",
          "-",
          "UART1_RX",
          "MCO",
          "IR_OUT"
        ],
        "PB0": [
          "SPI1_SCK",
          "UART1_TX",
          "TIM1_CH2",
          "TIM3_CH1",
          "-",
          "-",
          "-",
          "-"
        ],
        "PB1": [
          "SPI1_NSS",
          "-",
          "TIM1_CH1N",
          "TIM1_CH2N",
          "TIM1_CH4",
          "-",
          "MCO",
          "-"
        ],
        "PB2": [
          "SPI1_SCK",
          "-",
          "TIM1_CH1",
          "TIM1_CH1N",
          "TIM1_CH3",
          "UART2_RX",
          "-",
          "-"
        ],
        "PB3": [
          "-",
          "-",
          "TIM1_CH1N",
          "-",
          "COMP1_OUT",
          "-",
          "I2C1_SCL",
          "-"
        ],
        "PB4": [
          "-",
          "UART1_TX",
          "TIM1_BKIN",
          "TIM3_CH4",
          "-",
          "-",
          "I2C1_SDA",
          "IR_OUT"
        ],
        "PB5": [
          "SPI1_NSS",
          "UART1_RX",
          "TIM1_CH3N",
          "TIM3_CH3",
          "-",
          "-",
          "-",
          "-"
        ],
        "PB6": [
          "SWDIO",
          "UART1_TX",
          "-",
          "-",
          "SPI1_MISO",
          "UART2_TX",
          "I2C1_SDA",
          "MCO"
        ],
        "PB7": [
          "SPI1_MOSI",
          "UART1_RX",
          "TIM1_CH1N",
          "TIM1_CH2N",
          "TIM1_CH4",
          "-",
          "-",
          "-"
        ],
        "PC0": [
          "SWDIO",
          "UART1_TX",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-"
        ],
        "PC1": [
          "SPI1_MISO",
          "-",
          "TIM1_CH2",
          "TIM3_CH1",
          "-",
          "-",
          "-",
          "-"
        ]
      },
      "special": {
        "PA0": [
          "GPIO_OUT"
        ],
        "PA1": [
          "GPIO_OUT"
        ],
        "PA2": [
          "GPIO_OUT"
        ],
        "PA3": [
          "GPIO_OUT",
          "ADC_IN1"
        ],
        "PA4": [
          "GPIO_OUT",
          "ADC_IN2"
        ],
        "PA5": [
          "GPIO_OUT"
        ],
        "PA6": [
          "GPIO_OUT",
          "ADC_IN3"
        ],
        "PA7": [
          "GPIO_OUT",
          "ADC_IN4",
          "NRST"
        ],
        "PB0": [
          "GPIO_OUT",
          "ADC_IN7"
        ],
        "PB1": [
          "GPIO_OUT",
          "ADC_IN0"
        ],
        "PB2": [
          "GPIO_OUT"
        ],
        "PB3": [
          "GPIO_OUT",
          "ADC_IN5"
        ],
        "PB4": [
          "GPIO_OUT"
        ],
        "PB5": [
          "GPIO_OUT"
        ],
        "PB6": [
          "GPIO_OUT",
          "ADC_IN6"
        ],
        "PB7": [
          "GPIO_OUT"
        ],
        "PC0": [
          "GPIO_OUT",
          "NRST"
        ],
        "PC1": [
          "GPIO_OUT",
          "EXTCLK"
        ]
      },
      "packages": [
        {
          "id": "CIU32F003",
          "name": "CIU32F003 (SOP16)",
          "packageType": "SOP",
          "pins": [
            {
              "label": "VDD",
              "port": null
            },
            {
              "label": "PB4",
              "port": "PB4"
            },
            {
              "label": "PB3",
              "port": "PB3"
            },
            {
              "label": "PB2",
              "port": "PB2"
            },
            {
              "label": "PB1",
              "port": "PB1"
            },
            {
              "label": "PB0",
              "port": "PB0"
            },
            {
              "label": "PA0",
              "port": "PA0"
            },
            {
              "label": "PA1",
              "port": "PA1"
            },
            {
              "label": "PA4",
              "port": "PA4"
            },
            {
              "label": "PB6",
              "port": "PB6"
            },
            {
              "label": "PA2",
              "port": "PA2"
            },
            {
              "label": "PA6",
              "port": "PA6"
            },
            {
              "label": "PA7/NRST",
              "port": "PA7"
            },
            {
              "label": "PC1",
              "port": "PC1"
            },
            {
              "label": "PB7",
              "port": "PB7"
            },
            {
              "label": "VSS",
              "port": null
            }
          ]
        },
        {
          "id": "CIU32F003_SOP20",
          "name": "CIU32F003 (SOP20)",
          "packageType": "SOP",
          "pins": [
            {
              "label": "PA5",
              "port": "PA5"
            },
            {
              "label": "PA6",
              "port": "PA6"
            },
            {
              "label": "PA7",
              "port": "PA7"
            },
            {
              "label": "PC0/NRST",
              "port": "PC0"
            },
            {
              "label": "PC1",
              "port": "PC1"
            },
            {
              "label": "PB7",
              "port": "PB7"
            },
            {
              "label": "VSS",
              "port": null
            },
            {
              "label": "PB6",
              "port": "PB6"
            },
            {
              "label": "VDD",
              "port": null
            },
            {
              "label": "PB5",
              "port": "PB5"
            },
            {
              "label": "PB4",
              "port": "PB4"
            },
            {
              "label": "PB3",
              "port": "PB3"
            },
            {
              "label": "PB2",
              "port": "PB2"
            },
            {
              "label": "PB1",
              "port": "PB1"
            },
            {
              "label": "PB0",
              "port": "PB0"
            },
            {
              "label": "PA0",
              "port": "PA0"
            },
            {
              "label": "PA1",
              "port": "PA1"
            },
            {
              "label": "PA2",
              "port": "PA2"
            },
            {
              "label": "PA3",
              "port": "PA3"
            },
            {
              "label": "PA4",
              "port": "PA4"
            }
          ]
        }
      ]
    }
  },
  "peripherals": {
    "SerialFlash": {
      "name": "Serial Flash (SOP8)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "CS",
          "bus": "SPI",
          "signal": "CS"
        },
        {
          "label": "MISO",
          "bus": "SPI",
          "signal": "MISO"
        },
        {
          "label": "WP",
          "bus": "SPI",
          "signal": "WP"
        },
        {
          "label": "GND",
          "power": true
        },
        {
          "label": "MOSI",
          "bus": "SPI",
          "signal": "MOSI"
        },
        {
          "label": "CLK",
          "bus": "SPI",
          "signal": "CLK"
        },
        {
          "label": "HOLD",
          "bus": "SPI",
          "signal": "HOLD"
        },
        {
          "label": "VCC",
          "power": true
        }
      ]
    },
    "I2C_TempSensor": {
      "name": "I2C 传感器 (SOP8)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "VDD",
          "power": true
        },
        {
          "label": "SCL",
          "bus": "I2C",
          "signal": "SCL"
        },
        {
          "label": "SDA",
          "bus": "I2C",
          "signal": "SDA"
        },
        {
          "label": "GND",
          "power": true
        },
        {
          "label": "ADDR"
        },
        {
          "label": "INT"
        },
        {
          "label": "RES"
        },
        {
          "label": "VCC",
          "power": true
        }
      ]
    },
    "UART_Debug": {
      "name": "UART 调试模块 (SOP8)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "VCC",
          "power": true
        },
        {
          "label": "TX",
          "bus": "UART",
          "signal": "TX"
        },
        {
          "label": "RX",
          "bus": "UART",
          "signal": "RX"
        },
        {
          "label": "GND",
          "power": true
        },
        {
          "label": "EN"
        },
        {
          "label": "BOOT"
        },
        {
          "label": "NC"
        },
        {
          "label": "VDD",
          "power": true
        }
      ]
    },
    "SPI_Display": {
      "name": "SPI 显示屏 (SOP8)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "CS",
          "bus": "SPI",
          "signal": "CS"
        },
        {
          "label": "MOSI",
          "bus": "SPI",
          "signal": "MOSI"
        },
        {
          "label": "MISO",
          "bus": "SPI",
          "signal": "MISO"
        },
        {
          "label": "SCK",
          "bus": "SPI",
          "signal": "SCK"
        },
        {
          "label": "DC"
        },
        {
          "label": "RST"
        },
        {
          "label": "BL"
        },
        {
          "label": "VCC",
          "power": true
        }
      ]
    },
    "TIM_PWM_Device": {
      "name": "PWM 电机/LED 驱动 (SOP8)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "VCC",
          "power": true
        },
        {
          "label": "GND",
          "power": true
        },
        {
          "label": "PWMx",
          "bus": "TIM",
          "signal": "CHX"
        },
        {
          "label": "DIR"
        },
        {
          "label": "EN"
        },
        {
          "label": "FB"
        },
        {
          "label": "NC"
        },
        {
          "label": "VDD",
          "power": true
        }
      ]
    },
    "AnalogIn": {
      "name": "ADC 模拟输入 (8CH + AINX)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "VCC",
          "power": true
        },
        {
          "label": "AIN0",
          "bus": "ADC",
          "signal": "ADC_IN0"
        },
        {
          "label": "AIN1",
          "bus": "ADC",
          "signal": "ADC_IN1"
        },
        {
          "label": "AIN2",
          "bus": "ADC",
          "signal": "ADC_IN2"
        },
        {
          "label": "AIN3",
          "bus": "ADC",
          "signal": "ADC_IN3"
        },
        {
          "label": "GND",
          "power": true
        },
        {
          "label": "AIN4",
          "bus": "ADC",
          "signal": "ADC_IN4"
        },
        {
          "label": "AIN5",
          "bus": "ADC",
          "signal": "ADC_IN5"
        },
        {
          "label": "AIN6",
          "bus": "ADC",
          "signal": "ADC_IN6"
        },
        {
          "label": "AIN7",
          "bus": "ADC",
          "signal": "ADC_IN7"
        },
        {
          "label": "AINX",
          "bus": "ADC",
          "signal": "AINX"
        }
      ]
    },
    "GpioOut": {
      "name": "GPIO 输出 (8CH)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "VCC",
          "power": true
        },
        {
          "label": "OUT0",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "OUT1",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "OUT2",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "OUT3",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "GND",
          "power": true
        },
        {
          "label": "OUT4",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "OUT5",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "OUT6",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "OUT7",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        }
      ]
    },
    "SignalConverter": {
      "name": "信号转接板 MCO/IR/PWM (SOP12)",
      "packageType": "SOP",
      "pins": [
        {
          "label": "MCO",
          "bus": "MCO",
          "signal": "MCO"
        },
        {
          "label": "IR",
          "bus": "IR_OUT",
          "signal": "IR_OUT"
        },
        {
          "label": "PWM1",
          "bus": "TIM",
          "signal": "CH1"
        },
        {
          "label": "PWM2",
          "bus": "TIM",
          "signal": "CH2"
        },
        {
          "label": "PWM3",
          "bus": "TIM",
          "signal": "CH3"
        },
        {
          "label": "PWM4",
          "bus": "TIM",
          "signal": "CH4"
        },
        {
          "label": "PWMx",
          "bus": "TIM",
          "signal": "CHX"
        },
        {
          "label": "IO1"
        },
        {
          "label": "IO2"
        },
        {
          "label": "IO3"
        },
        {
          "label": "IO4"
        },
        {
          "label": "IO5"
        },
        {
          "label": "IO6"
        }
      ]
    },
    "Conv_MCO": {
      "name": "转接 MCO (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "MCO",
          "bus": "MCO",
          "signal": "MCO"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_IR": {
      "name": "转接 IR (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "IR",
          "bus": "IR_OUT",
          "signal": "IR_OUT"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_PWM1": {
      "name": "转接 PWM1 (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "PWM1",
          "bus": "TIM",
          "signal": "CH1"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_PWM2": {
      "name": "转接 PWM2 (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "PWM2",
          "bus": "TIM",
          "signal": "CH2"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_PWM3": {
      "name": "转接 PWM3 (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "PWM3",
          "bus": "TIM",
          "signal": "CH3"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_PWM4": {
      "name": "转接 PWM4 (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "PWM4",
          "bus": "TIM",
          "signal": "CH4"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_PWMx": {
      "name": "转接 PWMx (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "PWMx",
          "bus": "TIM",
          "signal": "CHX"
        },
        {
          "label": "IO"
        }
      ]
    },
    "Conv_GPIO_OUT": {
      "name": "转接 GPIO_OUT (SOP2)",
      "packageType": "SOP",
      "passThrough": true,
      "pins": [
        {
          "label": "OUT",
          "bus": "GPIO",
          "signal": "GPIO_OUT"
        },
        {
          "label": "IO"
        }
      ]
    }
  },
  "signal": {
    "synonyms": {
      "SPI1_CLK": [
        "SPI1_SCK",
        "CLK",
        "SCK"
      ],
      "SPI1_SCK": [
        "SPI1_CLK",
        "CLK",
        "SCK"
      ],
      "CLK": [
        "SPI1_CLK",
        "SPI1_SCK",
        "SCK"
      ],
      "SCK": [
        "SPI1_CLK",
        "SPI1_SCK",
        "CLK"
      ],
      "SPI1_MOSI": [
        "MOSI"
      ],
      "MOSI": [
        "SPI1_MOSI"
      ],
      "SPI1_MISO": [
        "MISO"
      ],
      "MISO": [
        "SPI1_MISO"
      ],
      "SPI1_CS": [
        "SPI1_NSS",
        "CS",
        "NSS"
      ],
      "SPI1_NSS": [
        "SPI1_CS",
        "CS",
        "NSS"
      ],
      "CS": [
        "SPI1_NSS",
        "SPI1_CS",
        "NSS"
      ],
      "NSS": [
        "SPI1_NSS",
        "SPI1_CS",
        "CS"
      ],
      "I2C1_SCL": [
        "SCL"
      ],
      "SCL": [
        "I2C1_SCL"
      ],
      "I2C1_SDA": [
        "SDA"
      ],
      "SDA": [
        "I2C1_SDA"
      ],
      "UART1_TX": [
        "TX"
      ],
      "TX": [
        "UART1_TX"
      ],
      "UART1_RX": [
        "RX"
      ],
      "RX": [
        "UART1_RX"
      ],
      "UART2_TX": [
        "TX2"
      ],
      "TX2": [
        "UART2_TX"
      ],
      "UART2_RX": [
        "RX2"
      ],
      "RX2": [
        "UART2_RX"
      ],
      "GPIO_OUT": [
        "GPIO",
        "GPO"
      ],
      "GPIO_IN": [
        "GPIO",
        "GPI",
        "GPIO_INPU",
        "GPIO_INPD"
      ],
      "GPIO_INPU": [
        "GPIO",
        "GPI",
        "GPIO_IN"
      ],
      "GPIO_INPD": [
        "GPIO",
        "GPI",
        "GPIO_IN"
      ],
      "GPIO": [],
      "GPO": [
        "GPIO_OUT",
        "GPIO",
        "GPO"
      ],
      "GPI": [
        "GPIO_IN",
        "GPIO",
        "GPI"
      ]
    },
    "map": {
      "GPIO_IN": [
        "GPIO",
        "GPI",
        "GPIO_INPU",
        "GPIO_INPD"
      ],
      "GPIO_INPU": [
        "GPIO",
        "GPI",
        "GPIO_IN"
      ],
      "GPIO_INPD": [
        "GPIO",
        "GPI",
        "GPIO_IN"
      ],
      "CS": [
        "NSS",
        "CS"
      ],
      "CLK": [
        "SCK",
        "CLK"
      ],
      "MOSI": [
        "MOSI"
      ],
      "MISO": [
        "MISO"
      ],
      "SCK": [
        "SCK",
        "CLK"
      ],
      "NSS": [
        "NSS",
        "CS"
      ],
      "WP": [],
      "HOLD": [],
      "CHX": [
        "CH1",
        "CH2",
        "CH3",
        "CH4"
      ]
    },
    "knownBus": "SPI|I2C|UART|USART|TIM|CAN|SDIO|QUADSPI"
  }
};
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
        // 同步收藏夹到独立键，供收藏夹 UI 直接读取（MCU 设备收藏夹 / 外设收藏夹 分开）
        if (obj.favorites) { try { localStorage.setItem('pinDeviceFavorites', JSON.stringify(obj.favorites)); } catch (e) {} }
        if (obj.peripheralFavorites) { try { localStorage.setItem('pinPeripheralFavorites', JSON.stringify(obj.peripheralFavorites)); } catch (e) {} }
        if (typeof window.migrateFavorites === 'function') window.migrateFavorites();
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
