9:/* global document, getComputedStyle, KeyboardEvent, MutationObserver */
28:    const el = document.activeElement
50:    const overlays = Array.from(document.querySelectorAll(".el-overlay"))
51:    const visible = overlays.filter(o => getComputedStyle(o).display !== "none")
55:      zIndex: visible[0] ? getComputedStyle(visible[0]).zIndex : null,
56:      maskColor: visible[0] ? getComputedStyle(visible[0]).backgroundColor : null,
58:      bodyOverflow: document.body.style.overflow,
64:    const target = document.activeElement
1:import js from "@eslint/js"
2:import tseslint from "typescript-eslint"
3:import pluginVue from "eslint-plugin-vue"
4:import prettier from "eslint-plugin-prettier/recommended"
98:  ...tseslint.configs.recommended,
eslint.config.js
