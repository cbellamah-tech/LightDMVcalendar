import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/nav.ts"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: { DEFAULT: "#112E5B", dark: "#0B1F3D", light: "#1D4380", gold: "#F5A524", red: "#F10800" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,27,51,.04), 0 2px 6px rgba(15,27,51,.05)",
        lift: "0 6px 20px rgba(15,27,51,.10), 0 2px 6px rgba(15,27,51,.06)",
      },
    },
  },
  plugins: [],
};
export default config;
