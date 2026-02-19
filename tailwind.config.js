/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        success: "#00C853",
        "background-light": "#ffffff",
        "background-dark": "#0a0a0a",
        "border-light": "#000000",
        "border-dark": "#333333",
      },
      fontFamily: {
        display: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0px",
      },
      borderWidth: {
        DEFAULT: "2px",
      },
    },
  },
  plugins: [],
}
