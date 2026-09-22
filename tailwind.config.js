/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 语雀品牌色系
        primary: {
          DEFAULT: "#53B672",
          50: "#E8F7ED",
          100: "#D1EFDA",
          200: "#A3DFB5",
          300: "#75CF90",
          400: "#47BF6B",
          500: "#53B672",
          600: "#3DA35D",
          700: "#308A4C",
          800: "#24703B",
          900: "#18572A",
        },
        // 功能色 - 成功
        success: {
          DEFAULT: "#52C41A",
          50: "#F6FFED",
          100: "#D9F7BE",
          200: "#B7EB8F",
          300: "#95DE64",
          400: "#73D13D",
          500: "#52C41A",
          600: "#389E0D",
          700: "#237804",
          800: "#135200",
          900: "#092B00",
        },
        // 功能色 - 警告
        warning: {
          DEFAULT: "#FAAD14",
          50: "#FFFBE6",
          100: "#FFF1B8",
          200: "#FFE58F",
          300: "#FFD666",
          400: "#FFC53D",
          500: "#FAAD14",
          600: "#D48806",
          700: "#AD6800",
          800: "#874D00",
          900: "#613400",
        },
        // 功能色 - 错误
        error: {
          DEFAULT: "#F5222D",
          50: "#FFF1F0",
          100: "#FFCCC7",
          200: "#FFA39E",
          300: "#FF7875",
          400: "#FF4D4F",
          500: "#F5222D",
          600: "#CF1322",
          700: "#A8071A",
          800: "#820014",
          900: "#5C0011",
        },
        // 功能色 - 信息
        info: {
          DEFAULT: "#1677FF",
          50: "#E6F4FF",
          100: "#BAE0FF",
          200: "#91CAFF",
          300: "#69B1FF",
          400: "#4096FF",
          500: "#1677FF",
          600: "#0958D9",
          700: "#003EB8",
          800: "#002C8C",
          900: "#001D66",
        },
        // 中性色 - 文字
        text: {
          primary: "rgba(0, 0, 0, 0.88)",
          secondary: "rgba(0, 0, 0, 0.65)",
          tertiary: "rgba(0, 0, 0, 0.45)",
          quaternary: "rgba(0, 0, 0, 0.25)",
        },
        // 中性色 - 边框
        border: {
          DEFAULT: "#D9D9D9",
          secondary: "#E8E8E8",
          tertiary: "#F0F0F0",
        },
        // 中性色 - 背景
        bg: {
          DEFAULT: "#FFFFFF",
          secondary: "#FAFAFA",
          tertiary: "#F5F5F5",
          quaternary: "#F0F0F0",
        },
        // 中性色 - 填充
        fill: {
          primary: "rgba(0, 0, 0, 0.15)",
          secondary: "rgba(0, 0, 0, 0.06)",
          tertiary: "rgba(0, 0, 0, 0.04)",
        },
      },
    },
  },
  plugins: [],
}
