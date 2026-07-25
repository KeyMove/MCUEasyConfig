// ============================================================
// 自动生成文件，请勿手动编辑
// 生成工具 : svd2js.js (Keil SVD + SFD -> JS)
// 源文件   : CIU32F003x5.svd + CIU32F003x5.sfd
// MCU 型号 : CIU32F003 (22 个外设)
// ============================================================
(function () {
  const DATA = {
  "meta": {
    "name": "CIU32F003",
    "vendor": "HED",
    "series": "CIU32F003",
    "version": "1.0.0",
    "schemaVersion": "1.0.3",
    "cpu": "CM0PLUS",
    "width": 32
  },
  "menu": [
    {
      "label": "ADC",
      "base": "0x40012400",
      "registers": [
        {
          "name": "AWDGCR",
          "offset": "0x20",
          "address": "0x40012420",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CHN0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CHN0",
              "options": []
            },
            {
              "name": "CHN1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CHN1",
              "options": []
            },
            {
              "name": "CHN2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CHN2",
              "options": []
            },
            {
              "name": "CHN3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CHN3",
              "options": []
            },
            {
              "name": "CHN4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CHN4",
              "options": []
            },
            {
              "name": "CHN5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field CHN5",
              "options": []
            },
            {
              "name": "CHN6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field CHN6",
              "options": []
            },
            {
              "name": "CHN7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field CHN7",
              "options": []
            },
            {
              "name": "CHN8",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field CHN8",
              "options": []
            }
          ]
        },
        {
          "name": "AWDGTR",
          "offset": "0x28",
          "address": "0x40012428",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AWDG_HT",
              "bits": "[16..27]",
              "rw": "RW",
              "desc": "Field AWDG_HT",
              "options": []
            },
            {
              "name": "AWDG_LT",
              "bits": "[0..11]",
              "rw": "RW",
              "desc": "Field AWDG_LT",
              "options": []
            }
          ]
        },
        {
          "name": "CALFACT",
          "offset": "0x30",
          "address": "0x40012430",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CALFACT",
              "bits": "[0..5]",
              "rw": "RW",
              "desc": "Field CALFACT",
              "options": []
            }
          ]
        },
        {
          "name": "CFG1",
          "offset": "0x4",
          "address": "0x40012404",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CONV_MOD",
              "bits": "[12..13]",
              "rw": "RW",
              "desc": "Field CONV_MOD",
              "options": []
            },
            {
              "name": "OVRN_MOD",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OVRN_MOD",
              "options": []
            },
            {
              "name": "SDIR",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field SDIR",
              "options": []
            },
            {
              "name": "TRIGEN",
              "bits": "[9..10]",
              "rw": "RW",
              "desc": "Field TRIGEN",
              "options": []
            },
            {
              "name": "TRIG_SEL",
              "bits": "[16..17]",
              "rw": "RW",
              "desc": "Field TRIG_SEL",
              "options": []
            },
            {
              "name": "WAIT_MOD",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field WAIT_MOD",
              "options": []
            }
          ]
        },
        {
          "name": "CFG2",
          "offset": "0x8",
          "address": "0x40012408",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRESC",
              "bits": "[24..26]",
              "rw": "RW",
              "desc": "Field PRESC",
              "options": []
            },
            {
              "name": "VBGREN",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field VBGREN",
              "options": []
            }
          ]
        },
        {
          "name": "CFG3",
          "offset": "0x200",
          "address": "0x40012600",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MODE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field MODE",
              "options": []
            }
          ]
        },
        {
          "name": "CHCFG",
          "offset": "0x1C",
          "address": "0x4001241C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CHN0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CHN0",
              "options": []
            },
            {
              "name": "CHN1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CHN1",
              "options": []
            },
            {
              "name": "CHN2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CHN2",
              "options": []
            },
            {
              "name": "CHN3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CHN3",
              "options": []
            },
            {
              "name": "CHN4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CHN4",
              "options": []
            },
            {
              "name": "CHN5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field CHN5",
              "options": []
            },
            {
              "name": "CHN6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field CHN6",
              "options": []
            },
            {
              "name": "CHN7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field CHN7",
              "options": []
            },
            {
              "name": "CHN8",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field CHN8",
              "options": []
            }
          ]
        },
        {
          "name": "CR",
          "offset": "0x0",
          "address": "0x40012400",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ADDIS",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ADDIS",
              "options": []
            },
            {
              "name": "ADEN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field ADEN",
              "options": []
            },
            {
              "name": "CALEN",
              "bits": "[31]",
              "rw": "RW",
              "desc": "Field CALEN",
              "options": []
            },
            {
              "name": "START",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field START",
              "options": []
            },
            {
              "name": "STOP",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field STOP",
              "options": []
            }
          ]
        },
        {
          "name": "DR",
          "offset": "0x40",
          "address": "0x40012440",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "DATA",
              "bits": "[0..11]",
              "rw": "RW",
              "desc": "Field DATA",
              "options": []
            }
          ]
        },
        {
          "name": "IER",
          "offset": "0x14",
          "address": "0x40012414",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AWDGIE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field AWDGIE",
              "options": []
            },
            {
              "name": "EOCALIE",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field EOCALIE",
              "options": []
            },
            {
              "name": "EOCIE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field EOCIE",
              "options": []
            },
            {
              "name": "EOSAMPIE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field EOSAMPIE",
              "options": []
            },
            {
              "name": "EOSIE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field EOSIE",
              "options": []
            },
            {
              "name": "OVRNIE",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field OVRNIE",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0x10",
          "address": "0x40012410",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AWDG",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field AWDG",
              "options": []
            },
            {
              "name": "EOC",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field EOC",
              "options": []
            },
            {
              "name": "EOCAL",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field EOCAL",
              "options": []
            },
            {
              "name": "EOS",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field EOS",
              "options": []
            },
            {
              "name": "EOSAMP",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field EOSAMP",
              "options": []
            },
            {
              "name": "OVRN",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field OVRN",
              "options": []
            }
          ]
        },
        {
          "name": "SAMPT",
          "offset": "0x18",
          "address": "0x40012418",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "SAMPT",
              "bits": "[0..3]",
              "rw": "RW",
              "desc": "Field SAMPT",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "COMP",
      "base": "0x40010200",
      "registers": [
        {
          "name": "COMP1_CSR",
          "offset": "0x10",
          "address": "0x40010210",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field EN",
              "options": []
            },
            {
              "name": "FLTEN",
              "bits": "[28]",
              "rw": "RW",
              "desc": "Field FLTEN",
              "options": []
            },
            {
              "name": "FLTIME",
              "bits": "[25..27]",
              "rw": "RW",
              "desc": "Field FLTIME",
              "options": []
            },
            {
              "name": "INM",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field INM",
              "options": []
            },
            {
              "name": "INP",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field INP",
              "options": []
            },
            {
              "name": "INPMOD",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field INPMOD",
              "options": []
            },
            {
              "name": "OUTMOD",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field OUTMOD",
              "options": []
            },
            {
              "name": "POL",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field POL",
              "options": []
            },
            {
              "name": "VAL",
              "bits": "[30]",
              "rw": "RW",
              "desc": "Field VAL",
              "options": []
            }
          ]
        },
        {
          "name": "COMP2_CSR",
          "offset": "0x14",
          "address": "0x40010214",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field EN",
              "options": []
            },
            {
              "name": "FLTEN",
              "bits": "[28]",
              "rw": "RW",
              "desc": "Field FLTEN",
              "options": []
            },
            {
              "name": "FLTIME",
              "bits": "[25..27]",
              "rw": "RW",
              "desc": "Field FLTIME",
              "options": []
            },
            {
              "name": "INM",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field INM",
              "options": []
            },
            {
              "name": "INP",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field INP",
              "options": []
            },
            {
              "name": "INPMOD",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field INPMOD",
              "options": []
            },
            {
              "name": "OUTMOD",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field OUTMOD",
              "options": []
            },
            {
              "name": "POL",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field POL",
              "options": []
            },
            {
              "name": "VAL",
              "bits": "[30]",
              "rw": "RW",
              "desc": "Field VAL",
              "options": []
            }
          ]
        },
        {
          "name": "CR",
          "offset": "0x0",
          "address": "0x40010200",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "HYST",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field HYST",
              "options": []
            },
            {
              "name": "VCDIV",
              "bits": "[0..3]",
              "rw": "RW",
              "desc": "Field VCDIV",
              "options": []
            },
            {
              "name": "VCSEL",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field VCSEL",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "CRC",
      "base": "0x40023000",
      "registers": [
        {
          "name": "CSR",
          "offset": "0x0",
          "address": "0x40023000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "POLY_SIZE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field POLY_SIZE",
              "options": []
            }
          ]
        },
        {
          "name": "DR",
          "offset": "0x80",
          "address": "0x40023080",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "DATA",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field DATA",
              "options": []
            }
          ]
        },
        {
          "name": "RDR",
          "offset": "0x4",
          "address": "0x40023004",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RESULT",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "Field RESULT",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "DBG",
      "base": "0x40015800",
      "registers": [
        {
          "name": "APB_FZ1",
          "offset": "0x4",
          "address": "0x40015804",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "IWDG_HOLD",
              "bits": "[18]",
              "rw": "RW",
              "desc": "Field IWDG_HOLD",
              "options": []
            },
            {
              "name": "LPTIM1_HOLD",
              "bits": "[29]",
              "rw": "RW",
              "desc": "Field LPTIM1_HOLD",
              "options": []
            },
            {
              "name": "TIM3_HOLD",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field TIM3_HOLD",
              "options": []
            }
          ]
        },
        {
          "name": "APB_FZ2",
          "offset": "0x8",
          "address": "0x40015808",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "TIM1_HOLD",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field TIM1_HOLD",
              "options": []
            }
          ]
        },
        {
          "name": "CR",
          "offset": "0x0",
          "address": "0x40015800",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "DBG_STOP",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field DBG_STOP",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "EXTI",
      "base": "0x40021800",
      "registers": [
        {
          "name": "EMR",
          "offset": "0x74",
          "address": "0x40021874",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EM0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field EM0",
              "options": []
            },
            {
              "name": "EM1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field EM1",
              "options": []
            },
            {
              "name": "EM16",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field EM16",
              "options": []
            },
            {
              "name": "EM17",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field EM17",
              "options": []
            },
            {
              "name": "EM2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field EM2",
              "options": []
            },
            {
              "name": "EM3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field EM3",
              "options": []
            },
            {
              "name": "EM30",
              "bits": "[30]",
              "rw": "RW",
              "desc": "Field EM30",
              "options": []
            },
            {
              "name": "EM4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field EM4",
              "options": []
            },
            {
              "name": "EM5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field EM5",
              "options": []
            },
            {
              "name": "EM6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field EM6",
              "options": []
            },
            {
              "name": "EM7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field EM7",
              "options": []
            }
          ]
        },
        {
          "name": "EXTICR1",
          "offset": "0x50",
          "address": "0x40021850",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EXTI_0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field EXTI_0",
              "options": []
            },
            {
              "name": "EXTI_1",
              "bits": "[4..5]",
              "rw": "RW",
              "desc": "Field EXTI_1",
              "options": []
            },
            {
              "name": "EXTI_2",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field EXTI_2",
              "options": []
            },
            {
              "name": "EXTI_3",
              "bits": "[12..13]",
              "rw": "RW",
              "desc": "Field EXTI_3",
              "options": []
            },
            {
              "name": "EXTI_4",
              "bits": "[16..17]",
              "rw": "RW",
              "desc": "Field EXTI_4",
              "options": []
            },
            {
              "name": "EXTI_5",
              "bits": "[20..21]",
              "rw": "RW",
              "desc": "Field EXTI_5",
              "options": []
            },
            {
              "name": "EXTI_6",
              "bits": "[24..25]",
              "rw": "RW",
              "desc": "Field EXTI_6",
              "options": []
            },
            {
              "name": "EXTI_7",
              "bits": "[28..29]",
              "rw": "RW",
              "desc": "Field EXTI_7",
              "options": []
            }
          ]
        },
        {
          "name": "FTSR",
          "offset": "0x4",
          "address": "0x40021804",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "FT0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field FT0",
              "options": []
            },
            {
              "name": "FT1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field FT1",
              "options": []
            },
            {
              "name": "FT16",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field FT16",
              "options": []
            },
            {
              "name": "FT17",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field FT17",
              "options": []
            },
            {
              "name": "FT2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field FT2",
              "options": []
            },
            {
              "name": "FT3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field FT3",
              "options": []
            },
            {
              "name": "FT4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field FT4",
              "options": []
            },
            {
              "name": "FT5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field FT5",
              "options": []
            },
            {
              "name": "FT6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field FT6",
              "options": []
            },
            {
              "name": "FT7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field FT7",
              "options": []
            }
          ]
        },
        {
          "name": "IMR",
          "offset": "0x70",
          "address": "0x40021870",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "IM0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field IM0",
              "options": []
            },
            {
              "name": "IM1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field IM1",
              "options": []
            },
            {
              "name": "IM16",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field IM16",
              "options": []
            },
            {
              "name": "IM17",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field IM17",
              "options": []
            },
            {
              "name": "IM2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field IM2",
              "options": []
            },
            {
              "name": "IM3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field IM3",
              "options": []
            },
            {
              "name": "IM30",
              "bits": "[30]",
              "rw": "RW",
              "desc": "Field IM30",
              "options": []
            },
            {
              "name": "IM4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field IM4",
              "options": []
            },
            {
              "name": "IM5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field IM5",
              "options": []
            },
            {
              "name": "IM6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field IM6",
              "options": []
            },
            {
              "name": "IM7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field IM7",
              "options": []
            }
          ]
        },
        {
          "name": "PIR",
          "offset": "0x8",
          "address": "0x40021808",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PIF0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field PIF0",
              "options": []
            },
            {
              "name": "PIF1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field PIF1",
              "options": []
            },
            {
              "name": "PIF16",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field PIF16",
              "options": []
            },
            {
              "name": "PIF17",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field PIF17",
              "options": []
            },
            {
              "name": "PIF2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field PIF2",
              "options": []
            },
            {
              "name": "PIF3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field PIF3",
              "options": []
            },
            {
              "name": "PIF4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field PIF4",
              "options": []
            },
            {
              "name": "PIF5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field PIF5",
              "options": []
            },
            {
              "name": "PIF6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field PIF6",
              "options": []
            },
            {
              "name": "PIF7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field PIF7",
              "options": []
            }
          ]
        },
        {
          "name": "RTSR",
          "offset": "0x0",
          "address": "0x40021800",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RT0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RT0",
              "options": []
            },
            {
              "name": "RT1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field RT1",
              "options": []
            },
            {
              "name": "RT16",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field RT16",
              "options": []
            },
            {
              "name": "RT17",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field RT17",
              "options": []
            },
            {
              "name": "RT2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field RT2",
              "options": []
            },
            {
              "name": "RT3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field RT3",
              "options": []
            },
            {
              "name": "RT4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field RT4",
              "options": []
            },
            {
              "name": "RT5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field RT5",
              "options": []
            },
            {
              "name": "RT6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field RT6",
              "options": []
            },
            {
              "name": "RT7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field RT7",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "Flash",
      "base": "0x40022000",
      "registers": [
        {
          "name": "ACR",
          "offset": "0x0",
          "address": "0x40022000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "LATENCY",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field LATENCY",
              "options": []
            }
          ]
        },
        {
          "name": "CR",
          "offset": "0x14",
          "address": "0x40022014",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EOPIE",
              "bits": "[24]",
              "rw": "RW",
              "desc": "Field EOPIE",
              "options": []
            },
            {
              "name": "LOCK",
              "bits": "[31]",
              "rw": "RW",
              "desc": "Field LOCK",
              "options": []
            },
            {
              "name": "OPERRIE",
              "bits": "[25]",
              "rw": "RW",
              "desc": "Field OPERRIE",
              "options": []
            },
            {
              "name": "OPTLOCK",
              "bits": "[30]",
              "rw": "RW",
              "desc": "Field OPTLOCK",
              "options": []
            },
            {
              "name": "OP_MODE",
              "bits": "[1..2]",
              "rw": "RW",
              "desc": "Field OP_MODE",
              "options": []
            }
          ]
        },
        {
          "name": "CRKEY",
          "offset": "0x8",
          "address": "0x40022008",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CRKEY",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "Field CRKEY",
              "options": []
            }
          ]
        },
        {
          "name": "OPTKEY",
          "offset": "0xC",
          "address": "0x4002200C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OPTKEY",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "Field OPTKEY",
              "options": []
            }
          ]
        },
        {
          "name": "OPTR1",
          "offset": "0x20",
          "address": "0x40022020",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BOR_EN",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field BOR_EN",
              "options": []
            },
            {
              "name": "BOR_LEVEL",
              "bits": "[9..10]",
              "rw": "RW",
              "desc": "Field BOR_LEVEL",
              "options": []
            },
            {
              "name": "NRST_SWD_MODE",
              "bits": "[13..14]",
              "rw": "RW",
              "desc": "Field NRST_SWD_MODE",
              "options": []
            },
            {
              "name": "RDPRP",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RDPRP",
              "options": []
            }
          ]
        },
        {
          "name": "OPTR2",
          "offset": "0x24",
          "address": "0x40022024",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "IWDG_STOP",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field IWDG_STOP",
              "options": []
            },
            {
              "name": "RST_STOP",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RST_STOP",
              "options": []
            }
          ]
        },
        {
          "name": "SR",
          "offset": "0x10",
          "address": "0x40022010",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BSY",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field BSY",
              "options": []
            },
            {
              "name": "EOP",
              "bits": "[24]",
              "rw": "RW",
              "desc": "Field EOP",
              "options": []
            },
            {
              "name": "OPTVERR",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field OPTVERR",
              "options": []
            },
            {
              "name": "WRPERR",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field WRPERR",
              "options": []
            }
          ]
        },
        {
          "name": "WRP",
          "offset": "0x38",
          "address": "0x40022038",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "WRP",
              "bits": "[0..5]",
              "rw": "RW",
              "desc": "Field WRP",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "GPIOA",
      "base": "0x50000000",
      "registers": [
        {
          "name": "AFL",
          "offset": "0x20",
          "address": "0x50000020",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AFSEL0",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field AFSEL0",
              "options": []
            },
            {
              "name": "AFSEL1",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field AFSEL1",
              "options": []
            },
            {
              "name": "AFSEL2",
              "bits": "[8..10]",
              "rw": "RW",
              "desc": "Field AFSEL2",
              "options": []
            },
            {
              "name": "AFSEL3",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field AFSEL3",
              "options": []
            },
            {
              "name": "AFSEL4",
              "bits": "[16..18]",
              "rw": "RW",
              "desc": "Field AFSEL4",
              "options": []
            },
            {
              "name": "AFSEL5",
              "bits": "[20..22]",
              "rw": "RW",
              "desc": "Field AFSEL5",
              "options": []
            },
            {
              "name": "AFSEL6",
              "bits": "[24..26]",
              "rw": "RW",
              "desc": "Field AFSEL6",
              "options": []
            },
            {
              "name": "AFSEL7",
              "bits": "[28..30]",
              "rw": "RW",
              "desc": "Field AFSEL7",
              "options": []
            }
          ]
        },
        {
          "name": "BR",
          "offset": "0x28",
          "address": "0x50000028",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BR0",
              "options": []
            },
            {
              "name": "BR1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BR1",
              "options": []
            },
            {
              "name": "BR2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field BR2",
              "options": []
            },
            {
              "name": "BR3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field BR3",
              "options": []
            },
            {
              "name": "BR4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field BR4",
              "options": []
            },
            {
              "name": "BR5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field BR5",
              "options": []
            },
            {
              "name": "BR6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field BR6",
              "options": []
            },
            {
              "name": "BR7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BR7",
              "options": []
            }
          ]
        },
        {
          "name": "BSR",
          "offset": "0x18",
          "address": "0x50000018",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR0",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field BR0",
              "options": []
            },
            {
              "name": "BR1",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field BR1",
              "options": []
            },
            {
              "name": "BR2",
              "bits": "[18]",
              "rw": "RW",
              "desc": "Field BR2",
              "options": []
            },
            {
              "name": "BR3",
              "bits": "[19]",
              "rw": "RW",
              "desc": "Field BR3",
              "options": []
            },
            {
              "name": "BR4",
              "bits": "[20]",
              "rw": "RW",
              "desc": "Field BR4",
              "options": []
            },
            {
              "name": "BR5",
              "bits": "[21]",
              "rw": "RW",
              "desc": "Field BR5",
              "options": []
            },
            {
              "name": "BR6",
              "bits": "[22]",
              "rw": "RW",
              "desc": "Field BR6",
              "options": []
            },
            {
              "name": "BR7",
              "bits": "[23]",
              "rw": "RW",
              "desc": "Field BR7",
              "options": []
            },
            {
              "name": "BS0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BS0",
              "options": []
            },
            {
              "name": "BS1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BS1",
              "options": []
            },
            {
              "name": "BS2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field BS2",
              "options": []
            },
            {
              "name": "BS3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field BS3",
              "options": []
            },
            {
              "name": "BS4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field BS4",
              "options": []
            },
            {
              "name": "BS5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field BS5",
              "options": []
            },
            {
              "name": "BS6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field BS6",
              "options": []
            },
            {
              "name": "BS7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BS7",
              "options": []
            }
          ]
        },
        {
          "name": "IDR",
          "offset": "0x10",
          "address": "0x50000010",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ID0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field ID0",
              "options": []
            },
            {
              "name": "ID1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ID1",
              "options": []
            },
            {
              "name": "ID2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field ID2",
              "options": []
            },
            {
              "name": "ID3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ID3",
              "options": []
            },
            {
              "name": "ID4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field ID4",
              "options": []
            },
            {
              "name": "ID5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field ID5",
              "options": []
            },
            {
              "name": "ID6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field ID6",
              "options": []
            },
            {
              "name": "ID7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field ID7",
              "options": []
            }
          ]
        },
        {
          "name": "MODE",
          "offset": "0x0",
          "address": "0x50000000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MODE0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field MODE0",
              "options": []
            },
            {
              "name": "MODE1",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field MODE1",
              "options": []
            },
            {
              "name": "MODE2",
              "bits": "[4..5]",
              "rw": "RW",
              "desc": "Field MODE2",
              "options": []
            },
            {
              "name": "MODE3",
              "bits": "[6..7]",
              "rw": "RW",
              "desc": "Field MODE3",
              "options": []
            },
            {
              "name": "MODE4",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field MODE4",
              "options": []
            },
            {
              "name": "MODE5",
              "bits": "[10..11]",
              "rw": "RW",
              "desc": "Field MODE5",
              "options": []
            },
            {
              "name": "MODE6",
              "bits": "[12..13]",
              "rw": "RW",
              "desc": "Field MODE6",
              "options": []
            },
            {
              "name": "MODE7",
              "bits": "[14..15]",
              "rw": "RW",
              "desc": "Field MODE7",
              "options": []
            }
          ]
        },
        {
          "name": "ODR",
          "offset": "0x14",
          "address": "0x50000014",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OD0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OD0",
              "options": []
            },
            {
              "name": "OD1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field OD1",
              "options": []
            },
            {
              "name": "OD2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OD2",
              "options": []
            },
            {
              "name": "OD3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OD3",
              "options": []
            },
            {
              "name": "OD4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field OD4",
              "options": []
            },
            {
              "name": "OD5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field OD5",
              "options": []
            },
            {
              "name": "OD6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field OD6",
              "options": []
            },
            {
              "name": "OD7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field OD7",
              "options": []
            }
          ]
        },
        {
          "name": "OTYPE",
          "offset": "0x4",
          "address": "0x50000004",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OT0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OT0",
              "options": []
            },
            {
              "name": "OT1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field OT1",
              "options": []
            },
            {
              "name": "OT2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OT2",
              "options": []
            },
            {
              "name": "OT3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OT3",
              "options": []
            },
            {
              "name": "OT4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field OT4",
              "options": []
            },
            {
              "name": "OT5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field OT5",
              "options": []
            },
            {
              "name": "OT6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field OT6",
              "options": []
            },
            {
              "name": "OT7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field OT7",
              "options": []
            }
          ]
        },
        {
          "name": "PUPD",
          "offset": "0xC",
          "address": "0x5000000C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PUPD0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field PUPD0",
              "options": []
            },
            {
              "name": "PUPD1",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field PUPD1",
              "options": []
            },
            {
              "name": "PUPD2",
              "bits": "[4..5]",
              "rw": "RW",
              "desc": "Field PUPD2",
              "options": []
            },
            {
              "name": "PUPD3",
              "bits": "[6..7]",
              "rw": "RW",
              "desc": "Field PUPD3",
              "options": []
            },
            {
              "name": "PUPD4",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field PUPD4",
              "options": []
            },
            {
              "name": "PUPD5",
              "bits": "[10..11]",
              "rw": "RW",
              "desc": "Field PUPD5",
              "options": []
            },
            {
              "name": "PUPD6",
              "bits": "[12..13]",
              "rw": "RW",
              "desc": "Field PUPD6",
              "options": []
            },
            {
              "name": "PUPD7",
              "bits": "[14..15]",
              "rw": "RW",
              "desc": "Field PUPD7",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "GPIOB",
      "base": "0x50000400",
      "registers": [
        {
          "name": "AFL",
          "offset": "0x20",
          "address": "0x50000420",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AFSEL0",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field AFSEL0",
              "options": []
            },
            {
              "name": "AFSEL1",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field AFSEL1",
              "options": []
            },
            {
              "name": "AFSEL2",
              "bits": "[8..10]",
              "rw": "RW",
              "desc": "Field AFSEL2",
              "options": []
            },
            {
              "name": "AFSEL3",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field AFSEL3",
              "options": []
            },
            {
              "name": "AFSEL4",
              "bits": "[16..18]",
              "rw": "RW",
              "desc": "Field AFSEL4",
              "options": []
            },
            {
              "name": "AFSEL5",
              "bits": "[20..22]",
              "rw": "RW",
              "desc": "Field AFSEL5",
              "options": []
            },
            {
              "name": "AFSEL6",
              "bits": "[24..26]",
              "rw": "RW",
              "desc": "Field AFSEL6",
              "options": []
            },
            {
              "name": "AFSEL7",
              "bits": "[28..30]",
              "rw": "RW",
              "desc": "Field AFSEL7",
              "options": []
            }
          ]
        },
        {
          "name": "BR",
          "offset": "0x28",
          "address": "0x50000428",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BR0",
              "options": []
            },
            {
              "name": "BR1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BR1",
              "options": []
            },
            {
              "name": "BR2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field BR2",
              "options": []
            },
            {
              "name": "BR3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field BR3",
              "options": []
            },
            {
              "name": "BR4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field BR4",
              "options": []
            },
            {
              "name": "BR5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field BR5",
              "options": []
            },
            {
              "name": "BR6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field BR6",
              "options": []
            },
            {
              "name": "BR7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BR7",
              "options": []
            }
          ]
        },
        {
          "name": "BSR",
          "offset": "0x18",
          "address": "0x50000418",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR0",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field BR0",
              "options": []
            },
            {
              "name": "BR1",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field BR1",
              "options": []
            },
            {
              "name": "BR2",
              "bits": "[18]",
              "rw": "RW",
              "desc": "Field BR2",
              "options": []
            },
            {
              "name": "BR3",
              "bits": "[19]",
              "rw": "RW",
              "desc": "Field BR3",
              "options": []
            },
            {
              "name": "BR4",
              "bits": "[20]",
              "rw": "RW",
              "desc": "Field BR4",
              "options": []
            },
            {
              "name": "BR5",
              "bits": "[21]",
              "rw": "RW",
              "desc": "Field BR5",
              "options": []
            },
            {
              "name": "BR6",
              "bits": "[22]",
              "rw": "RW",
              "desc": "Field BR6",
              "options": []
            },
            {
              "name": "BR7",
              "bits": "[23]",
              "rw": "RW",
              "desc": "Field BR7",
              "options": []
            },
            {
              "name": "BS0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BS0",
              "options": []
            },
            {
              "name": "BS1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BS1",
              "options": []
            },
            {
              "name": "BS2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field BS2",
              "options": []
            },
            {
              "name": "BS3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field BS3",
              "options": []
            },
            {
              "name": "BS4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field BS4",
              "options": []
            },
            {
              "name": "BS5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field BS5",
              "options": []
            },
            {
              "name": "BS6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field BS6",
              "options": []
            },
            {
              "name": "BS7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BS7",
              "options": []
            }
          ]
        },
        {
          "name": "IDR",
          "offset": "0x10",
          "address": "0x50000410",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ID0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field ID0",
              "options": []
            },
            {
              "name": "ID1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ID1",
              "options": []
            },
            {
              "name": "ID2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field ID2",
              "options": []
            },
            {
              "name": "ID3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ID3",
              "options": []
            },
            {
              "name": "ID4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field ID4",
              "options": []
            },
            {
              "name": "ID5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field ID5",
              "options": []
            },
            {
              "name": "ID6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field ID6",
              "options": []
            },
            {
              "name": "ID7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field ID7",
              "options": []
            }
          ]
        },
        {
          "name": "MODE",
          "offset": "0x0",
          "address": "0x50000400",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MODE0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field MODE0",
              "options": []
            },
            {
              "name": "MODE1",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field MODE1",
              "options": []
            },
            {
              "name": "MODE2",
              "bits": "[4..5]",
              "rw": "RW",
              "desc": "Field MODE2",
              "options": []
            },
            {
              "name": "MODE3",
              "bits": "[6..7]",
              "rw": "RW",
              "desc": "Field MODE3",
              "options": []
            },
            {
              "name": "MODE4",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field MODE4",
              "options": []
            },
            {
              "name": "MODE5",
              "bits": "[10..11]",
              "rw": "RW",
              "desc": "Field MODE5",
              "options": []
            },
            {
              "name": "MODE6",
              "bits": "[12..13]",
              "rw": "RW",
              "desc": "Field MODE6",
              "options": []
            },
            {
              "name": "MODE7",
              "bits": "[14..15]",
              "rw": "RW",
              "desc": "Field MODE7",
              "options": []
            }
          ]
        },
        {
          "name": "ODR",
          "offset": "0x14",
          "address": "0x50000414",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OD0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OD0",
              "options": []
            },
            {
              "name": "OD1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field OD1",
              "options": []
            },
            {
              "name": "OD2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OD2",
              "options": []
            },
            {
              "name": "OD3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OD3",
              "options": []
            },
            {
              "name": "OD4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field OD4",
              "options": []
            },
            {
              "name": "OD5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field OD5",
              "options": []
            },
            {
              "name": "OD6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field OD6",
              "options": []
            },
            {
              "name": "OD7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field OD7",
              "options": []
            }
          ]
        },
        {
          "name": "OTYPE",
          "offset": "0x4",
          "address": "0x50000404",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OT0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OT0",
              "options": []
            },
            {
              "name": "OT1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field OT1",
              "options": []
            },
            {
              "name": "OT2",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OT2",
              "options": []
            },
            {
              "name": "OT3",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OT3",
              "options": []
            },
            {
              "name": "OT4",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field OT4",
              "options": []
            },
            {
              "name": "OT5",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field OT5",
              "options": []
            },
            {
              "name": "OT6",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field OT6",
              "options": []
            },
            {
              "name": "OT7",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field OT7",
              "options": []
            }
          ]
        },
        {
          "name": "PUPD",
          "offset": "0xC",
          "address": "0x5000040C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PUPD0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field PUPD0",
              "options": []
            },
            {
              "name": "PUPD1",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field PUPD1",
              "options": []
            },
            {
              "name": "PUPD2",
              "bits": "[4..5]",
              "rw": "RW",
              "desc": "Field PUPD2",
              "options": []
            },
            {
              "name": "PUPD3",
              "bits": "[6..7]",
              "rw": "RW",
              "desc": "Field PUPD3",
              "options": []
            },
            {
              "name": "PUPD4",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field PUPD4",
              "options": []
            },
            {
              "name": "PUPD5",
              "bits": "[10..11]",
              "rw": "RW",
              "desc": "Field PUPD5",
              "options": []
            },
            {
              "name": "PUPD6",
              "bits": "[12..13]",
              "rw": "RW",
              "desc": "Field PUPD6",
              "options": []
            },
            {
              "name": "PUPD7",
              "bits": "[14..15]",
              "rw": "RW",
              "desc": "Field PUPD7",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "GPIOC",
      "base": "0x50000800",
      "registers": [
        {
          "name": "AFL",
          "offset": "0x20",
          "address": "0x50000820",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AFSEL0",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field AFSEL0",
              "options": []
            },
            {
              "name": "AFSEL1",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field AFSEL1",
              "options": []
            }
          ]
        },
        {
          "name": "BR",
          "offset": "0x28",
          "address": "0x50000828",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BR0",
              "options": []
            },
            {
              "name": "BR1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BR1",
              "options": []
            }
          ]
        },
        {
          "name": "BSR",
          "offset": "0x18",
          "address": "0x50000818",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR0",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field BR0",
              "options": []
            },
            {
              "name": "BR1",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field BR1",
              "options": []
            },
            {
              "name": "BS0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BS0",
              "options": []
            },
            {
              "name": "BS1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BS1",
              "options": []
            }
          ]
        },
        {
          "name": "IDR",
          "offset": "0x10",
          "address": "0x50000810",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ID0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field ID0",
              "options": []
            },
            {
              "name": "ID1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ID1",
              "options": []
            }
          ]
        },
        {
          "name": "MODE",
          "offset": "0x0",
          "address": "0x50000800",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MODE0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field MODE0",
              "options": []
            },
            {
              "name": "MODE1",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field MODE1",
              "options": []
            }
          ]
        },
        {
          "name": "ODR",
          "offset": "0x14",
          "address": "0x50000814",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OD0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OD0",
              "options": []
            },
            {
              "name": "OD1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field OD1",
              "options": []
            }
          ]
        },
        {
          "name": "OTYPE",
          "offset": "0x4",
          "address": "0x50000804",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OT0",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OT0",
              "options": []
            },
            {
              "name": "OT1",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field OT1",
              "options": []
            }
          ]
        },
        {
          "name": "PUPD",
          "offset": "0xC",
          "address": "0x5000080C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PUPD0",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field PUPD0",
              "options": []
            },
            {
              "name": "PUPD1",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field PUPD1",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "I2C1",
      "base": "0x40005400",
      "registers": [
        {
          "name": "ADDR1",
          "offset": "0x8",
          "address": "0x40005408",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ADDR1",
              "bits": "[1..7]",
              "rw": "RW",
              "desc": "Field ADDR1",
              "options": []
            }
          ]
        },
        {
          "name": "CR1",
          "offset": "0x0",
          "address": "0x40005400",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BUFIE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BUFIE",
              "options": []
            },
            {
              "name": "DNF",
              "bits": "[8..11]",
              "rw": "RW",
              "desc": "Field DNF",
              "options": []
            },
            {
              "name": "ERRIE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field ERRIE",
              "options": []
            },
            {
              "name": "EVTIE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field EVTIE",
              "options": []
            },
            {
              "name": "GCEN",
              "bits": "[19]",
              "rw": "RW",
              "desc": "Field GCEN",
              "options": []
            },
            {
              "name": "NOSTRETCH",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field NOSTRETCH",
              "options": []
            },
            {
              "name": "PE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field PE",
              "options": []
            }
          ]
        },
        {
          "name": "CR2",
          "offset": "0x4",
          "address": "0x40005404",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "NACK",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field NACK",
              "options": []
            }
          ]
        },
        {
          "name": "ICR",
          "offset": "0x1C",
          "address": "0x4000541C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ADDRCF",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ADDRCF",
              "options": []
            },
            {
              "name": "BERRCF",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field BERRCF",
              "options": []
            },
            {
              "name": "NACKCF",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field NACKCF",
              "options": []
            },
            {
              "name": "OVRCF",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OVRCF",
              "options": []
            },
            {
              "name": "STOPCF",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field STOPCF",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0x18",
          "address": "0x40005418",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ADDR",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ADDR",
              "options": []
            },
            {
              "name": "BERR",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field BERR",
              "options": []
            },
            {
              "name": "BUSY",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field BUSY",
              "options": []
            },
            {
              "name": "DIR",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field DIR",
              "options": []
            },
            {
              "name": "NACKF",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field NACKF",
              "options": []
            },
            {
              "name": "OVR",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OVR",
              "options": []
            },
            {
              "name": "RXNE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field RXNE",
              "options": []
            },
            {
              "name": "STOPF",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field STOPF",
              "options": []
            },
            {
              "name": "TXE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field TXE",
              "options": []
            },
            {
              "name": "TXIS",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field TXIS",
              "options": []
            }
          ]
        },
        {
          "name": "RDR",
          "offset": "0x24",
          "address": "0x40005424",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RXDATA",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field RXDATA",
              "options": []
            }
          ]
        },
        {
          "name": "TDR",
          "offset": "0x28",
          "address": "0x40005428",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "TXDATA",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field TXDATA",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "IRTIM",
      "base": "0x40010000",
      "registers": [
        {
          "name": "CR",
          "offset": "0x0",
          "address": "0x40010000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "IR_MODE",
              "bits": "[3..4]",
              "rw": "RW",
              "desc": "Field IR_MODE",
              "options": []
            },
            {
              "name": "IR_POL",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field IR_POL",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "IWDG",
      "base": "0x40003000",
      "registers": [
        {
          "name": "CFG",
          "offset": "0x4",
          "address": "0x40003004",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OVP",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field OVP",
              "options": []
            }
          ]
        },
        {
          "name": "CNT",
          "offset": "0x14",
          "address": "0x40003014",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CNT",
              "bits": "[0..11]",
              "rw": "RW",
              "desc": "Field CNT",
              "options": []
            }
          ]
        },
        {
          "name": "CR",
          "offset": "0x0",
          "address": "0x40003000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "KEY",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field KEY",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "LPTIM1",
      "base": "0x40007C00",
      "registers": [
        {
          "name": "ARR",
          "offset": "0x18",
          "address": "0x40007C18",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARR",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field ARR",
              "options": []
            }
          ]
        },
        {
          "name": "CFG",
          "offset": "0xC",
          "address": "0x40007C0C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ITREN",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field ITREN",
              "options": []
            },
            {
              "name": "PRESC",
              "bits": "[9..11]",
              "rw": "RW",
              "desc": "Field PRESC",
              "options": []
            }
          ]
        },
        {
          "name": "CNT",
          "offset": "0x1C",
          "address": "0x40007C1C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CNT",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CNT",
              "options": []
            }
          ]
        },
        {
          "name": "CR",
          "offset": "0x10",
          "address": "0x40007C10",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CNTSTRT",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CNTSTRT",
              "options": []
            },
            {
              "name": "ENABLE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field ENABLE",
              "options": []
            },
            {
              "name": "SNGSTRT",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field SNGSTRT",
              "options": []
            }
          ]
        },
        {
          "name": "ICR",
          "offset": "0x4",
          "address": "0x40007C04",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARRM_CF",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ARRM_CF",
              "options": []
            },
            {
              "name": "ITRF_CF",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field ITRF_CF",
              "options": []
            }
          ]
        },
        {
          "name": "IER",
          "offset": "0x8",
          "address": "0x40007C08",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARRM_IE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ARRM_IE",
              "options": []
            },
            {
              "name": "ITRF_IE",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field ITRF_IE",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0x0",
          "address": "0x40007C00",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARRM",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field ARRM",
              "options": []
            },
            {
              "name": "ITRF",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field ITRF",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "NVIC",
      "base": "0xE000E100",
      "registers": [
        {
          "name": "ICER",
          "offset": "0x80",
          "address": "0xE000E180",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CLRENA",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "ICPR",
          "offset": "0x180",
          "address": "0xE000E280",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CLRPEND",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR0",
          "offset": "0x300",
          "address": "0xE000E400",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_0",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_1",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_2",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_3",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR1",
          "offset": "0x304",
          "address": "0xE000E404",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_4",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_5",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_6",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_7",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR2",
          "offset": "0x308",
          "address": "0xE000E408",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_10",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_11",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_8",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_9",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR3",
          "offset": "0x30C",
          "address": "0xE000E40C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_12",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_13",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_14",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_15",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR4",
          "offset": "0x310",
          "address": "0xE000E410",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_16",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_17",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_18",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_19",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR5",
          "offset": "0x314",
          "address": "0xE000E414",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_20",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_21",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_22",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_23",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR6",
          "offset": "0x318",
          "address": "0xE000E418",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_24",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_25",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_26",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_27",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "IPR7",
          "offset": "0x31C",
          "address": "0xE000E41C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_28",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_29",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_30",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "",
              "options": []
            },
            {
              "name": "PRI_31",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "ISER",
          "offset": "0x0",
          "address": "0xE000E100",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "SETENA",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        },
        {
          "name": "ISPR",
          "offset": "0x100",
          "address": "0xE000E200",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "SETPEND",
              "bits": "[0..31]",
              "rw": "RW",
              "desc": "",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "PMU",
      "base": "0x40007000",
      "registers": [
        {
          "name": "CR",
          "offset": "0x0",
          "address": "0x40007000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "LP_MODE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field LP_MODE",
              "options": []
            }
          ]
        },
        {
          "name": "FLASH_WAKEUP",
          "offset": "0x30",
          "address": "0x40007030",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "FLASH_WAKEUP",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field FLASH_WAKEUP",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "RCC",
      "base": "0x40021000",
      "registers": [
        {
          "name": "AHBEN",
          "offset": "0x30",
          "address": "0x40021030",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CRCEN",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field CRCEN",
              "options": []
            }
          ]
        },
        {
          "name": "AHBRST",
          "offset": "0x20",
          "address": "0x40021020",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CRC_RST",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field CRC_RST",
              "options": []
            }
          ]
        },
        {
          "name": "APBEN1",
          "offset": "0x34",
          "address": "0x40021034",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "I2C1EN",
              "bits": "[21]",
              "rw": "RW",
              "desc": "Field I2C1EN",
              "options": []
            },
            {
              "name": "LPTIM1EN",
              "bits": "[31]",
              "rw": "RW",
              "desc": "Field LPTIM1EN",
              "options": []
            },
            {
              "name": "PMUEN",
              "bits": "[28]",
              "rw": "RW",
              "desc": "Field PMUEN",
              "options": []
            },
            {
              "name": "TIM3EN",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field TIM3EN",
              "options": []
            },
            {
              "name": "UART2EN",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field UART2EN",
              "options": []
            }
          ]
        },
        {
          "name": "APBEN2",
          "offset": "0x38",
          "address": "0x40021038",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ADCEN",
              "bits": "[20]",
              "rw": "RW",
              "desc": "Field ADCEN",
              "options": []
            },
            {
              "name": "COMPEN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field COMPEN",
              "options": []
            },
            {
              "name": "DBGEN",
              "bits": "[27]",
              "rw": "RW",
              "desc": "Field DBGEN",
              "options": []
            },
            {
              "name": "SPI1EN",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field SPI1EN",
              "options": []
            },
            {
              "name": "TIM1EN",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field TIM1EN",
              "options": []
            },
            {
              "name": "UART1EN",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field UART1EN",
              "options": []
            }
          ]
        },
        {
          "name": "APBRST1",
          "offset": "0x24",
          "address": "0x40021024",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "I2C1_RST",
              "bits": "[21]",
              "rw": "RW",
              "desc": "Field I2C1_RST",
              "options": []
            },
            {
              "name": "LPTIM1_RST",
              "bits": "[31]",
              "rw": "RW",
              "desc": "Field LPTIM1_RST",
              "options": []
            },
            {
              "name": "TIM3_RST",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field TIM3_RST",
              "options": []
            },
            {
              "name": "UART2_RST",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field UART2_RST",
              "options": []
            }
          ]
        },
        {
          "name": "APBRST2",
          "offset": "0x28",
          "address": "0x40021028",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ADC_RST",
              "bits": "[20]",
              "rw": "RW",
              "desc": "Field ADC_RST",
              "options": []
            },
            {
              "name": "COMP_RST",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field COMP_RST",
              "options": []
            },
            {
              "name": "DBG_RST",
              "bits": "[27]",
              "rw": "RW",
              "desc": "Field DBG_RST",
              "options": []
            },
            {
              "name": "SPI1_RST",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field SPI1_RST",
              "options": []
            },
            {
              "name": "TIM1_RST",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field TIM1_RST",
              "options": []
            },
            {
              "name": "UART1_RST",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field UART1_RST",
              "options": []
            }
          ]
        },
        {
          "name": "CFG",
          "offset": "0x8",
          "address": "0x40021008",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "HPRE",
              "bits": "[8..10]",
              "rw": "RW",
              "desc": "Field HPRE",
              "options": []
            },
            {
              "name": "MCOPRE",
              "bits": "[28..30]",
              "rw": "RW",
              "desc": "Field MCOPRE",
              "options": []
            },
            {
              "name": "MCOSEL",
              "bits": "[24..26]",
              "rw": "RW",
              "desc": "Field MCOSEL",
              "options": []
            },
            {
              "name": "PPRE",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field PPRE",
              "options": []
            },
            {
              "name": "SYSW",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field SYSW",
              "options": []
            },
            {
              "name": "SYSWS",
              "bits": "[3..5]",
              "rw": "RW",
              "desc": "Field SYSWS",
              "options": []
            }
          ]
        },
        {
          "name": "CLKSEL",
          "offset": "0x3C",
          "address": "0x4002103C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "COMP1_SEL",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field COMP1_SEL",
              "options": []
            },
            {
              "name": "COMP2_SEL",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field COMP2_SEL",
              "options": []
            },
            {
              "name": "LPTIM1_SEL",
              "bits": "[18..19]",
              "rw": "RW",
              "desc": "Field LPTIM1_SEL",
              "options": []
            }
          ]
        },
        {
          "name": "CSR1",
          "offset": "0x0",
          "address": "0x40021000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EXTCLKON",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field EXTCLKON",
              "options": []
            },
            {
              "name": "RCHON",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field RCHON",
              "options": []
            },
            {
              "name": "RCHRDY",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field RCHRDY",
              "options": []
            }
          ]
        },
        {
          "name": "CSR2",
          "offset": "0x44",
          "address": "0x40021044",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "IWDG_RSTF",
              "bits": "[29]",
              "rw": "RW",
              "desc": "Field IWDG_RSTF",
              "options": []
            },
            {
              "name": "LOCKUP_RSTEN",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field LOCKUP_RSTEN",
              "options": []
            },
            {
              "name": "LOCKUP_RSTF",
              "bits": "[24]",
              "rw": "RW",
              "desc": "Field LOCKUP_RSTF",
              "options": []
            },
            {
              "name": "LPM_RSTF",
              "bits": "[31]",
              "rw": "RW",
              "desc": "Field LPM_RSTF",
              "options": []
            },
            {
              "name": "NRST_RSTF",
              "bits": "[26]",
              "rw": "RW",
              "desc": "Field NRST_RSTF",
              "options": []
            },
            {
              "name": "PMU_RSTF",
              "bits": "[27]",
              "rw": "RW",
              "desc": "Field PMU_RSTF",
              "options": []
            },
            {
              "name": "RCLON",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RCLON",
              "options": []
            },
            {
              "name": "RCLRDY",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field RCLRDY",
              "options": []
            },
            {
              "name": "RMVF",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field RMVF",
              "options": []
            },
            {
              "name": "SW_RSTF",
              "bits": "[28]",
              "rw": "RW",
              "desc": "Field SW_RSTF",
              "options": []
            }
          ]
        },
        {
          "name": "ICR",
          "offset": "0x18",
          "address": "0x40021018",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RCH_RDYC",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field RCH_RDYC",
              "options": []
            },
            {
              "name": "RCL_RDYC",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RCL_RDYC",
              "options": []
            }
          ]
        },
        {
          "name": "IER",
          "offset": "0x10",
          "address": "0x40021010",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RCH_RDYIE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field RCH_RDYIE",
              "options": []
            },
            {
              "name": "RCL_RDYIE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RCL_RDYIE",
              "options": []
            }
          ]
        },
        {
          "name": "IOPEN",
          "offset": "0x2C",
          "address": "0x4002102C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "GPIOAEN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field GPIOAEN",
              "options": []
            },
            {
              "name": "GPIOBEN",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field GPIOBEN",
              "options": []
            },
            {
              "name": "GPIOCEN",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field GPIOCEN",
              "options": []
            }
          ]
        },
        {
          "name": "IOPRST",
          "offset": "0x1C",
          "address": "0x4002101C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "GPIOA_RST",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field GPIOA_RST",
              "options": []
            },
            {
              "name": "GPIOB_RST",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field GPIOB_RST",
              "options": []
            },
            {
              "name": "GPIOC_RST",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field GPIOC_RST",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0x14",
          "address": "0x40021014",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RCH_RDYF",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field RCH_RDYF",
              "options": []
            },
            {
              "name": "RCL_RDYF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field RCL_RDYF",
              "options": []
            }
          ]
        },
        {
          "name": "RCHCAL",
          "offset": "0x54",
          "address": "0x40021054",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RCH_CAL_COARSE",
              "bits": "[8..10]",
              "rw": "RW",
              "desc": "Field RCH_CAL_COARSE",
              "options": []
            },
            {
              "name": "RCH_CAL_FINE",
              "bits": "[0..5]",
              "rw": "RW",
              "desc": "Field RCH_CAL_FINE",
              "options": []
            }
          ]
        },
        {
          "name": "RCLCAL",
          "offset": "0x50",
          "address": "0x40021050",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RCL_CAL",
              "bits": "[0..3]",
              "rw": "RW",
              "desc": "Field RCL_CAL",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "SCB",
      "base": "0xE000ED00",
      "registers": [
        {
          "name": "AIRCR",
          "offset": "0xC",
          "address": "0xE000ED0C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ENDIANNESS",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field ENDIANNESS",
              "options": []
            },
            {
              "name": "SYSRESETREQ",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field SYSRESETREQ",
              "options": []
            },
            {
              "name": "VECTCLRACTIVE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field VECTCLRACTIVE",
              "options": []
            },
            {
              "name": "VECTKEY",
              "bits": "[16..31]",
              "rw": "RW",
              "desc": "Field VECTKEY",
              "options": []
            }
          ]
        },
        {
          "name": "CCR",
          "offset": "0x14",
          "address": "0xE000ED14",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "STKALIGN",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field STKALIGN",
              "options": []
            },
            {
              "name": "UNALIGN_TRP",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field UNALIGN_TRP",
              "options": []
            }
          ]
        },
        {
          "name": "CPUID",
          "offset": "0x0",
          "address": "0xE000ED00",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARCHITECTURE",
              "bits": "[16..19]",
              "rw": "RW",
              "desc": "Field ARCHITECTURE",
              "options": []
            },
            {
              "name": "IMPLEMENTER",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "Field IMPLEMENTER",
              "options": []
            },
            {
              "name": "PARTNo",
              "bits": "[4..15]",
              "rw": "RW",
              "desc": "Field PARTNo",
              "options": []
            },
            {
              "name": "REVISION",
              "bits": "[0..3]",
              "rw": "RW",
              "desc": "Field REVISION",
              "options": []
            },
            {
              "name": "VARIANT",
              "bits": "[20..23]",
              "rw": "RW",
              "desc": "Field VARIANT",
              "options": []
            }
          ]
        },
        {
          "name": "ICSR",
          "offset": "0x4",
          "address": "0xE000ED04",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "NMIPENDSET",
              "bits": "[31]",
              "rw": "RW",
              "desc": "Field NMIPENDSET",
              "options": []
            },
            {
              "name": "PENDSTCLR",
              "bits": "[25]",
              "rw": "RW",
              "desc": "Field PENDSTCLR",
              "options": []
            },
            {
              "name": "PENDSTSET",
              "bits": "[26]",
              "rw": "RW",
              "desc": "Field PENDSTSET",
              "options": []
            },
            {
              "name": "PENDSVCLR",
              "bits": "[27]",
              "rw": "RW",
              "desc": "Field PENDSVCLR",
              "options": []
            },
            {
              "name": "PENDSVSET",
              "bits": "[28]",
              "rw": "RW",
              "desc": "Field PENDSVSET",
              "options": []
            },
            {
              "name": "VECTPENDING",
              "bits": "[12..17]",
              "rw": "RW",
              "desc": "Field VECTPENDING",
              "options": []
            }
          ]
        },
        {
          "name": "SCR",
          "offset": "0x10",
          "address": "0xE000ED10",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "SEVONPEND",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field SEVONPEND",
              "options": []
            },
            {
              "name": "SLEEPDEEP",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field SLEEPDEEP",
              "options": []
            },
            {
              "name": "SLEEPONEXIT",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field SLEEPONEXIT",
              "options": []
            }
          ]
        },
        {
          "name": "SHCSR",
          "offset": "0x24",
          "address": "0xE000ED24",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "SECALLPENDED",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field SECALLPENDED",
              "options": []
            }
          ]
        },
        {
          "name": "SHPR2",
          "offset": "0x1C",
          "address": "0xE000ED1C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_SVCall",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "Field PRI_SVCall",
              "options": []
            }
          ]
        },
        {
          "name": "SHPR3",
          "offset": "0x20",
          "address": "0xE000ED20",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PRI_PendSV",
              "bits": "[16..23]",
              "rw": "RW",
              "desc": "Field PRI_PendSV",
              "options": []
            },
            {
              "name": "PRI_SysTick",
              "bits": "[24..31]",
              "rw": "RW",
              "desc": "Field PRI_SysTick",
              "options": []
            }
          ]
        },
        {
          "name": "VTOR",
          "offset": "0x8",
          "address": "0xE000ED08",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "TBLOFF",
              "bits": "[7..31]",
              "rw": "RW",
              "desc": "Field TBLOFF",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "SPI1",
      "base": "0x40013000",
      "registers": [
        {
          "name": "CR1",
          "offset": "0x0",
          "address": "0x40013000",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BR",
              "bits": "[1..3]",
              "rw": "RW",
              "desc": "Field BR",
              "options": []
            },
            {
              "name": "CPHA",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CPHA",
              "options": []
            },
            {
              "name": "CPOL",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field CPOL",
              "options": []
            },
            {
              "name": "ERRIE",
              "bits": "[18]",
              "rw": "RW",
              "desc": "Field ERRIE",
              "options": []
            },
            {
              "name": "LSBFIRST",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field LSBFIRST",
              "options": []
            },
            {
              "name": "MSTR",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field MSTR",
              "options": []
            },
            {
              "name": "NSSOE",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field NSSOE",
              "options": []
            },
            {
              "name": "RXFNEIE",
              "bits": "[20]",
              "rw": "RW",
              "desc": "Field RXFNEIE",
              "options": []
            },
            {
              "name": "SPE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field SPE",
              "options": []
            },
            {
              "name": "SSM",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field SSM",
              "options": []
            },
            {
              "name": "TXFEIE",
              "bits": "[25]",
              "rw": "RW",
              "desc": "Field TXFEIE",
              "options": []
            }
          ]
        },
        {
          "name": "CR2",
          "offset": "0x4",
          "address": "0x40013004",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "NSSO",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field NSSO",
              "options": []
            }
          ]
        },
        {
          "name": "DR",
          "offset": "0x14",
          "address": "0x40013014",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "DR",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field DR",
              "options": []
            }
          ]
        },
        {
          "name": "ICR",
          "offset": "0x10",
          "address": "0x40013010",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MMFCF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field MMFCF",
              "options": []
            },
            {
              "name": "OVRCF",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OVRCF",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0xC",
          "address": "0x4001300C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BUSY",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field BUSY",
              "options": []
            },
            {
              "name": "MMF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field MMF",
              "options": []
            },
            {
              "name": "OVR",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OVR",
              "options": []
            },
            {
              "name": "RXFNE",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field RXFNE",
              "options": []
            },
            {
              "name": "TXFE",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field TXFE",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "TIM1",
      "base": "0x40012C00",
      "registers": [
        {
          "name": "AF1",
          "offset": "0x60",
          "address": "0x40012C60",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BKCMP1E",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field BKCMP1E",
              "options": []
            },
            {
              "name": "BKCMP1P",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field BKCMP1P",
              "options": []
            },
            {
              "name": "BKCMP2E",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field BKCMP2E",
              "options": []
            },
            {
              "name": "BKCMP2P",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field BKCMP2P",
              "options": []
            },
            {
              "name": "BKINE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field BKINE",
              "options": []
            },
            {
              "name": "BKINP",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field BKINP",
              "options": []
            },
            {
              "name": "LOCKUP_LOCK",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field LOCKUP_LOCK",
              "options": []
            }
          ]
        },
        {
          "name": "ARR",
          "offset": "0x2C",
          "address": "0x40012C2C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARR",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field ARR",
              "options": []
            }
          ]
        },
        {
          "name": "BDT",
          "offset": "0x44",
          "address": "0x40012C44",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "AOEN",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field AOEN",
              "options": []
            },
            {
              "name": "BKEN",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field BKEN",
              "options": []
            },
            {
              "name": "DTG",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field DTG",
              "options": []
            },
            {
              "name": "LOCK",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field LOCK",
              "options": []
            },
            {
              "name": "MOEN",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field MOEN",
              "options": []
            },
            {
              "name": "OSSI",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OSSI",
              "options": []
            },
            {
              "name": "OSSR",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OSSR",
              "options": []
            }
          ]
        },
        {
          "name": "CC1",
          "offset": "0x34",
          "address": "0x40012C34",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CC1",
              "options": []
            }
          ]
        },
        {
          "name": "CC2",
          "offset": "0x38",
          "address": "0x40012C38",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC2",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CC2",
              "options": []
            }
          ]
        },
        {
          "name": "CC3",
          "offset": "0x3C",
          "address": "0x40012C3C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC3",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CC3",
              "options": []
            }
          ]
        },
        {
          "name": "CC4",
          "offset": "0x40",
          "address": "0x40012C40",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC4",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CC4",
              "options": []
            }
          ]
        },
        {
          "name": "CCEN",
          "offset": "0x20",
          "address": "0x40012C20",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1E",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CC1E",
              "options": []
            },
            {
              "name": "CC1NE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC1NE",
              "options": []
            },
            {
              "name": "CC1NP",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC1NP",
              "options": []
            },
            {
              "name": "CC1P",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1P",
              "options": []
            },
            {
              "name": "CC2E",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC2E",
              "options": []
            },
            {
              "name": "CC2NE",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field CC2NE",
              "options": []
            },
            {
              "name": "CC2NP",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field CC2NP",
              "options": []
            },
            {
              "name": "CC2P",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field CC2P",
              "options": []
            },
            {
              "name": "CC3E",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field CC3E",
              "options": []
            },
            {
              "name": "CC3NE",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field CC3NE",
              "options": []
            },
            {
              "name": "CC3NP",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field CC3NP",
              "options": []
            },
            {
              "name": "CC3P",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field CC3P",
              "options": []
            },
            {
              "name": "CC4E",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field CC4E",
              "options": []
            },
            {
              "name": "CC4P",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field CC4P",
              "options": []
            }
          ]
        },
        {
          "name": "CCM1",
          "offset": "0x18",
          "address": "0x40012C18",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OC1CE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field OC1CE",
              "options": []
            },
            {
              "name": "OC1FE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OC1FE",
              "options": []
            },
            {
              "name": "OC1M",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field OC1M",
              "options": []
            },
            {
              "name": "OC1PE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OC1PE",
              "options": []
            },
            {
              "name": "OC2CE",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field OC2CE",
              "options": []
            },
            {
              "name": "OC2FE",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OC2FE",
              "options": []
            },
            {
              "name": "OC2M",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field OC2M",
              "options": []
            },
            {
              "name": "OC2PE",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OC2PE",
              "options": []
            }
          ]
        },
        {
          "name": "CCM2",
          "offset": "0x1C",
          "address": "0x40012C1C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OC3CE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field OC3CE",
              "options": []
            },
            {
              "name": "OC3FE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OC3FE",
              "options": []
            },
            {
              "name": "OC3M",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field OC3M",
              "options": []
            },
            {
              "name": "OC3PE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OC3PE",
              "options": []
            },
            {
              "name": "OC4CE",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field OC4CE",
              "options": []
            },
            {
              "name": "OC4FE",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OC4FE",
              "options": []
            },
            {
              "name": "OC4M",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field OC4M",
              "options": []
            },
            {
              "name": "OC4PE",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OC4PE",
              "options": []
            }
          ]
        },
        {
          "name": "CFG",
          "offset": "0x50",
          "address": "0x40012C50",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OCREF_CLR",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field OCREF_CLR",
              "options": []
            }
          ]
        },
        {
          "name": "CNT",
          "offset": "0x24",
          "address": "0x40012C24",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CNT",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CNT",
              "options": []
            }
          ]
        },
        {
          "name": "CR1",
          "offset": "0x0",
          "address": "0x40012C00",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARPE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field ARPE",
              "options": []
            },
            {
              "name": "CEN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CEN",
              "options": []
            },
            {
              "name": "CLK_DIV",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field CLK_DIV",
              "options": []
            },
            {
              "name": "CMS",
              "bits": "[5..6]",
              "rw": "RW",
              "desc": "Field CMS",
              "options": []
            },
            {
              "name": "DIR",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field DIR",
              "options": []
            },
            {
              "name": "OPM",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OPM",
              "options": []
            },
            {
              "name": "UDIS",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field UDIS",
              "options": []
            },
            {
              "name": "URS",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field URS",
              "options": []
            }
          ]
        },
        {
          "name": "CR2",
          "offset": "0x4",
          "address": "0x40012C04",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CCU_SEL",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CCU_SEL",
              "options": []
            },
            {
              "name": "CC_PRECR",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CC_PRECR",
              "options": []
            },
            {
              "name": "MM_SEL",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field MM_SEL",
              "options": []
            },
            {
              "name": "OIS1",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field OIS1",
              "options": []
            },
            {
              "name": "OIS1N",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field OIS1N",
              "options": []
            },
            {
              "name": "OIS2",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OIS2",
              "options": []
            },
            {
              "name": "OIS2N",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OIS2N",
              "options": []
            },
            {
              "name": "OIS3",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field OIS3",
              "options": []
            },
            {
              "name": "OIS3N",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field OIS3N",
              "options": []
            },
            {
              "name": "OIS4",
              "bits": "[14]",
              "rw": "RW",
              "desc": "Field OIS4",
              "options": []
            }
          ]
        },
        {
          "name": "DIER",
          "offset": "0xC",
          "address": "0x40012C0C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BIE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BIE",
              "options": []
            },
            {
              "name": "CC1IE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1IE",
              "options": []
            },
            {
              "name": "CC2IE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC2IE",
              "options": []
            },
            {
              "name": "CC3IE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC3IE",
              "options": []
            },
            {
              "name": "CC4IE",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC4IE",
              "options": []
            },
            {
              "name": "COMIE",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field COMIE",
              "options": []
            },
            {
              "name": "TIE",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TIE",
              "options": []
            },
            {
              "name": "UIE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UIE",
              "options": []
            }
          ]
        },
        {
          "name": "EVTG",
          "offset": "0x14",
          "address": "0x40012C14",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BG",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BG",
              "options": []
            },
            {
              "name": "CC1G",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1G",
              "options": []
            },
            {
              "name": "CC2G",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC2G",
              "options": []
            },
            {
              "name": "CC3G",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC3G",
              "options": []
            },
            {
              "name": "CC4G",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC4G",
              "options": []
            },
            {
              "name": "COMG",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field COMG",
              "options": []
            },
            {
              "name": "TG",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TG",
              "options": []
            },
            {
              "name": "UG",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UG",
              "options": []
            }
          ]
        },
        {
          "name": "PSC",
          "offset": "0x28",
          "address": "0x40012C28",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PSC",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field PSC",
              "options": []
            }
          ]
        },
        {
          "name": "RCR",
          "offset": "0x30",
          "address": "0x40012C30",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "REP",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field REP",
              "options": []
            }
          ]
        },
        {
          "name": "SMC",
          "offset": "0x8",
          "address": "0x40012C08",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MS_MOD",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field MS_MOD",
              "options": []
            },
            {
              "name": "SM_SEL",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field SM_SEL",
              "options": []
            }
          ]
        },
        {
          "name": "SR",
          "offset": "0x10",
          "address": "0x40012C10",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BIF",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field BIF",
              "options": []
            },
            {
              "name": "CC1IF",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1IF",
              "options": []
            },
            {
              "name": "CC2IF",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC2IF",
              "options": []
            },
            {
              "name": "CC3IF",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC3IF",
              "options": []
            },
            {
              "name": "CC4IF",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC4IF",
              "options": []
            },
            {
              "name": "COMIF",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field COMIF",
              "options": []
            },
            {
              "name": "TIF",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TIF",
              "options": []
            },
            {
              "name": "UIF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UIF",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "TIM3",
      "base": "0x40000400",
      "registers": [
        {
          "name": "ARR",
          "offset": "0x2C",
          "address": "0x4000042C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARR",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field ARR",
              "options": []
            }
          ]
        },
        {
          "name": "CC1_Mode0",
          "offset": "0x34",
          "address": "0x40000434",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1_MODE0",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CC1_MODE0",
              "options": []
            }
          ]
        },
        {
          "name": "CC1_Mode1",
          "offset": "0x34",
          "address": "0x40000434",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1_MODE1",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field CC1_MODE1",
              "options": []
            },
            {
              "name": "CC3_MODE1",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "Field CC3_MODE1",
              "options": []
            }
          ]
        },
        {
          "name": "CC2_Mode0",
          "offset": "0x38",
          "address": "0x40000438",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC2_MODE0",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CC2_MODE0",
              "options": []
            }
          ]
        },
        {
          "name": "CC2_Mode1",
          "offset": "0x38",
          "address": "0x40000438",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC2_MODE1",
              "bits": "[0..7]",
              "rw": "RW",
              "desc": "Field CC2_MODE1",
              "options": []
            },
            {
              "name": "CC4_MODE1",
              "bits": "[8..15]",
              "rw": "RW",
              "desc": "Field CC4_MODE1",
              "options": []
            }
          ]
        },
        {
          "name": "CCEN",
          "offset": "0x20",
          "address": "0x40000420",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1E",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CC1E",
              "options": []
            },
            {
              "name": "CC1NP",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC1NP",
              "options": []
            },
            {
              "name": "CC1P",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1P",
              "options": []
            },
            {
              "name": "CC2E",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC2E",
              "options": []
            },
            {
              "name": "CC2NP",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field CC2NP",
              "options": []
            },
            {
              "name": "CC2P",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field CC2P",
              "options": []
            },
            {
              "name": "CC3E",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field CC3E",
              "options": []
            },
            {
              "name": "CC3P",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field CC3P",
              "options": []
            },
            {
              "name": "CC4E",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field CC4E",
              "options": []
            },
            {
              "name": "CC4P",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field CC4P",
              "options": []
            }
          ]
        },
        {
          "name": "CCM1_Input",
          "offset": "0x18",
          "address": "0x40000418",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1S",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field CC1S",
              "options": []
            },
            {
              "name": "CC2S",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field CC2S",
              "options": []
            },
            {
              "name": "IC1F",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field IC1F",
              "options": []
            },
            {
              "name": "IC1PSC",
              "bits": "[2..3]",
              "rw": "RW",
              "desc": "Field IC1PSC",
              "options": []
            },
            {
              "name": "IC2F",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field IC2F",
              "options": []
            },
            {
              "name": "IC2PSC",
              "bits": "[10..11]",
              "rw": "RW",
              "desc": "Field IC2PSC",
              "options": []
            }
          ]
        },
        {
          "name": "CCM1_Output",
          "offset": "0x18",
          "address": "0x40000418",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1S",
              "bits": "[0..1]",
              "rw": "RW",
              "desc": "Field CC1S",
              "options": []
            },
            {
              "name": "CC2S",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field CC2S",
              "options": []
            },
            {
              "name": "OC1FE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OC1FE",
              "options": []
            },
            {
              "name": "OC1M",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field OC1M",
              "options": []
            },
            {
              "name": "OC1PE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OC1PE",
              "options": []
            },
            {
              "name": "OC2FE",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OC2FE",
              "options": []
            },
            {
              "name": "OC2M",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field OC2M",
              "options": []
            },
            {
              "name": "OC2PE",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OC2PE",
              "options": []
            }
          ]
        },
        {
          "name": "CCM2",
          "offset": "0x1C",
          "address": "0x4000041C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "OC3FE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field OC3FE",
              "options": []
            },
            {
              "name": "OC3M",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field OC3M",
              "options": []
            },
            {
              "name": "OC3PE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OC3PE",
              "options": []
            },
            {
              "name": "OC4FE",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field OC4FE",
              "options": []
            },
            {
              "name": "OC4M",
              "bits": "[12..14]",
              "rw": "RW",
              "desc": "Field OC4M",
              "options": []
            },
            {
              "name": "OC4PE",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OC4PE",
              "options": []
            }
          ]
        },
        {
          "name": "CNT",
          "offset": "0x24",
          "address": "0x40000424",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CNT",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field CNT",
              "options": []
            }
          ]
        },
        {
          "name": "CR1",
          "offset": "0x0",
          "address": "0x40000400",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "ARPE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field ARPE",
              "options": []
            },
            {
              "name": "CEN",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field CEN",
              "options": []
            },
            {
              "name": "CLK_DIV",
              "bits": "[8..9]",
              "rw": "RW",
              "desc": "Field CLK_DIV",
              "options": []
            },
            {
              "name": "MODE",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field MODE",
              "options": []
            },
            {
              "name": "OPM",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field OPM",
              "options": []
            },
            {
              "name": "UDIS",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field UDIS",
              "options": []
            },
            {
              "name": "URS",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field URS",
              "options": []
            }
          ]
        },
        {
          "name": "CR2",
          "offset": "0x4",
          "address": "0x40000404",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MM_SEL",
              "bits": "[4..6]",
              "rw": "RW",
              "desc": "Field MM_SEL",
              "options": []
            },
            {
              "name": "TI1_XOR_SEL",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field TI1_XOR_SEL",
              "options": []
            }
          ]
        },
        {
          "name": "DIER",
          "offset": "0xC",
          "address": "0x4000040C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1IE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1IE",
              "options": []
            },
            {
              "name": "CC2IE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC2IE",
              "options": []
            },
            {
              "name": "CC3IE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC3IE",
              "options": []
            },
            {
              "name": "CC4IE",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC4IE",
              "options": []
            },
            {
              "name": "TIE",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TIE",
              "options": []
            },
            {
              "name": "UIE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UIE",
              "options": []
            }
          ]
        },
        {
          "name": "EVTG",
          "offset": "0x14",
          "address": "0x40000414",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1G",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1G",
              "options": []
            },
            {
              "name": "CC2G",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC2G",
              "options": []
            },
            {
              "name": "CC3G",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC3G",
              "options": []
            },
            {
              "name": "CC4G",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC4G",
              "options": []
            },
            {
              "name": "TG",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TG",
              "options": []
            },
            {
              "name": "UG",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UG",
              "options": []
            }
          ]
        },
        {
          "name": "PSC",
          "offset": "0x28",
          "address": "0x40000428",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PSC",
              "bits": "[0..3]",
              "rw": "RW",
              "desc": "Field PSC",
              "options": []
            }
          ]
        },
        {
          "name": "SMC",
          "offset": "0x8",
          "address": "0x40000408",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "MS_MOD",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field MS_MOD",
              "options": []
            },
            {
              "name": "SM_SEL",
              "bits": "[0..2]",
              "rw": "RW",
              "desc": "Field SM_SEL",
              "options": []
            },
            {
              "name": "TS",
              "bits": "[4..5]",
              "rw": "RW",
              "desc": "Field TS",
              "options": []
            }
          ]
        },
        {
          "name": "SR",
          "offset": "0x10",
          "address": "0x40000410",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "CC1IF",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field CC1IF",
              "options": []
            },
            {
              "name": "CC1OF",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field CC1OF",
              "options": []
            },
            {
              "name": "CC2IF",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field CC2IF",
              "options": []
            },
            {
              "name": "CC2OF",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field CC2OF",
              "options": []
            },
            {
              "name": "CC3IF",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field CC3IF",
              "options": []
            },
            {
              "name": "CC4IF",
              "bits": "[4]",
              "rw": "RW",
              "desc": "Field CC4IF",
              "options": []
            },
            {
              "name": "TIF",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TIF",
              "options": []
            },
            {
              "name": "UIF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UIF",
              "options": []
            }
          ]
        },
        {
          "name": "TISEL",
          "offset": "0x68",
          "address": "0x40000468",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "TI1_SEL",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field TI1_SEL",
              "options": []
            },
            {
              "name": "TI2_SEL",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field TI2_SEL",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "UART1",
      "base": "0x40013800",
      "registers": [
        {
          "name": "BRR",
          "offset": "0xC",
          "address": "0x4001380C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BRR",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field BRR",
              "options": []
            }
          ]
        },
        {
          "name": "CR1",
          "offset": "0x0",
          "address": "0x40013800",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PEIE",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field PEIE",
              "options": []
            },
            {
              "name": "PEN",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field PEN",
              "options": []
            },
            {
              "name": "PTS",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field PTS",
              "options": []
            },
            {
              "name": "RE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field RE",
              "options": []
            },
            {
              "name": "RXNEIE",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field RXNEIE",
              "options": []
            },
            {
              "name": "TCIE",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TCIE",
              "options": []
            },
            {
              "name": "TE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field TE",
              "options": []
            },
            {
              "name": "TXEIE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field TXEIE",
              "options": []
            },
            {
              "name": "UE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UE",
              "options": []
            },
            {
              "name": "WL",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field WL",
              "options": []
            }
          ]
        },
        {
          "name": "CR2",
          "offset": "0x4",
          "address": "0x40013804",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "DATAIVC",
              "bits": "[18]",
              "rw": "RW",
              "desc": "Field DATAIVC",
              "options": []
            },
            {
              "name": "MSBFIRST",
              "bits": "[19]",
              "rw": "RW",
              "desc": "Field MSBFIRST",
              "options": []
            },
            {
              "name": "RXIVC",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field RXIVC",
              "options": []
            },
            {
              "name": "STOPBIT",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field STOPBIT",
              "options": []
            },
            {
              "name": "SWAP",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field SWAP",
              "options": []
            },
            {
              "name": "TXIVC",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field TXIVC",
              "options": []
            }
          ]
        },
        {
          "name": "CR3",
          "offset": "0x8",
          "address": "0x40013808",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EIE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field EIE",
              "options": []
            },
            {
              "name": "HDEN",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field HDEN",
              "options": []
            },
            {
              "name": "OBS",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OBS",
              "options": []
            },
            {
              "name": "ORED",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field ORED",
              "options": []
            }
          ]
        },
        {
          "name": "ICR",
          "offset": "0x20",
          "address": "0x40013820",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "FECF",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field FECF",
              "options": []
            },
            {
              "name": "NOISECF",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field NOISECF",
              "options": []
            },
            {
              "name": "ORECF",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ORECF",
              "options": []
            },
            {
              "name": "PECF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field PECF",
              "options": []
            },
            {
              "name": "TCCF",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TCCF",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0x1C",
          "address": "0x4001381C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BUSY",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field BUSY",
              "options": []
            },
            {
              "name": "FE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field FE",
              "options": []
            },
            {
              "name": "NOISE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field NOISE",
              "options": []
            },
            {
              "name": "ORE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ORE",
              "options": []
            },
            {
              "name": "PE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field PE",
              "options": []
            },
            {
              "name": "RXNE",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field RXNE",
              "options": []
            },
            {
              "name": "TC",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TC",
              "options": []
            },
            {
              "name": "TXE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field TXE",
              "options": []
            }
          ]
        },
        {
          "name": "RDR",
          "offset": "0x24",
          "address": "0x40013824",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RDR",
              "bits": "[0..8]",
              "rw": "RW",
              "desc": "Field RDR",
              "options": []
            }
          ]
        },
        {
          "name": "TDR",
          "offset": "0x28",
          "address": "0x40013828",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "TDR",
              "bits": "[0..8]",
              "rw": "RW",
              "desc": "Field TDR",
              "options": []
            }
          ]
        }
      ]
    },
    {
      "label": "UART2",
      "base": "0x40004400",
      "registers": [
        {
          "name": "BRR",
          "offset": "0xC",
          "address": "0x4000440C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BRR",
              "bits": "[0..15]",
              "rw": "RW",
              "desc": "Field BRR",
              "options": []
            }
          ]
        },
        {
          "name": "CR1",
          "offset": "0x0",
          "address": "0x40004400",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "PEIE",
              "bits": "[8]",
              "rw": "RW",
              "desc": "Field PEIE",
              "options": []
            },
            {
              "name": "PEN",
              "bits": "[10]",
              "rw": "RW",
              "desc": "Field PEN",
              "options": []
            },
            {
              "name": "PTS",
              "bits": "[9]",
              "rw": "RW",
              "desc": "Field PTS",
              "options": []
            },
            {
              "name": "RE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field RE",
              "options": []
            },
            {
              "name": "RXNEIE",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field RXNEIE",
              "options": []
            },
            {
              "name": "TCIE",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TCIE",
              "options": []
            },
            {
              "name": "TE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field TE",
              "options": []
            },
            {
              "name": "TXEIE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field TXEIE",
              "options": []
            },
            {
              "name": "UE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field UE",
              "options": []
            },
            {
              "name": "WL",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field WL",
              "options": []
            }
          ]
        },
        {
          "name": "CR2",
          "offset": "0x4",
          "address": "0x40004404",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "DATAIVC",
              "bits": "[18]",
              "rw": "RW",
              "desc": "Field DATAIVC",
              "options": []
            },
            {
              "name": "MSBFIRST",
              "bits": "[19]",
              "rw": "RW",
              "desc": "Field MSBFIRST",
              "options": []
            },
            {
              "name": "RXIVC",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field RXIVC",
              "options": []
            },
            {
              "name": "STOPBIT",
              "bits": "[13]",
              "rw": "RW",
              "desc": "Field STOPBIT",
              "options": []
            },
            {
              "name": "SWAP",
              "bits": "[15]",
              "rw": "RW",
              "desc": "Field SWAP",
              "options": []
            },
            {
              "name": "TXIVC",
              "bits": "[17]",
              "rw": "RW",
              "desc": "Field TXIVC",
              "options": []
            }
          ]
        },
        {
          "name": "CR3",
          "offset": "0x8",
          "address": "0x40004408",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "EIE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field EIE",
              "options": []
            },
            {
              "name": "HDEN",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field HDEN",
              "options": []
            },
            {
              "name": "OBS",
              "bits": "[11]",
              "rw": "RW",
              "desc": "Field OBS",
              "options": []
            },
            {
              "name": "ORED",
              "bits": "[12]",
              "rw": "RW",
              "desc": "Field ORED",
              "options": []
            }
          ]
        },
        {
          "name": "ICR",
          "offset": "0x20",
          "address": "0x40004420",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "FECF",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field FECF",
              "options": []
            },
            {
              "name": "NOISECF",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field NOISECF",
              "options": []
            },
            {
              "name": "ORECF",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ORECF",
              "options": []
            },
            {
              "name": "PECF",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field PECF",
              "options": []
            },
            {
              "name": "TCCF",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TCCF",
              "options": []
            }
          ]
        },
        {
          "name": "ISR",
          "offset": "0x1C",
          "address": "0x4000441C",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "BUSY",
              "bits": "[16]",
              "rw": "RW",
              "desc": "Field BUSY",
              "options": []
            },
            {
              "name": "FE",
              "bits": "[1]",
              "rw": "RW",
              "desc": "Field FE",
              "options": []
            },
            {
              "name": "NOISE",
              "bits": "[2]",
              "rw": "RW",
              "desc": "Field NOISE",
              "options": []
            },
            {
              "name": "ORE",
              "bits": "[3]",
              "rw": "RW",
              "desc": "Field ORE",
              "options": []
            },
            {
              "name": "PE",
              "bits": "[0]",
              "rw": "RW",
              "desc": "Field PE",
              "options": []
            },
            {
              "name": "RXNE",
              "bits": "[5]",
              "rw": "RW",
              "desc": "Field RXNE",
              "options": []
            },
            {
              "name": "TC",
              "bits": "[6]",
              "rw": "RW",
              "desc": "Field TC",
              "options": []
            },
            {
              "name": "TXE",
              "bits": "[7]",
              "rw": "RW",
              "desc": "Field TXE",
              "options": []
            }
          ]
        },
        {
          "name": "RDR",
          "offset": "0x24",
          "address": "0x40004424",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "RDR",
              "bits": "[0..8]",
              "rw": "RW",
              "desc": "Field RDR",
              "options": []
            }
          ]
        },
        {
          "name": "TDR",
          "offset": "0x28",
          "address": "0x40004428",
          "reset": "0x00000000",
          "access": "RW",
          "fields": [
            {
              "name": "TDR",
              "bits": "[0..8]",
              "rw": "RW",
              "desc": "Field TDR",
              "options": []
            }
          ]
        }
      ]
    }
  ]
};
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  if (typeof window !== "undefined") {
    window.MCU_REG_DB = window.MCU_REG_DB || {};
    window.MCU_REG_DB["CIU32F003x5"] = DATA;
  }
})();
