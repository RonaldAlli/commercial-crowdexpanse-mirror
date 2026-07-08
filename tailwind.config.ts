import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef3ff",
          100: "#dce6ff",
          200: "#bcceff",
          300: "#8fa8ff",
          400: "#5f7cf8",
          500: "#3a57ea",
          600: "#2540c8",
          700: "#1f34a1",
          800: "#1e2f82",
          900: "#1d2c6b",
          950: "#141d45",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
        sm: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.05)",
        md: "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.05)",
        lg: "0 12px 28px -8px rgb(15 23 42 / 0.12), 0 4px 10px -4px rgb(15 23 42 / 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
