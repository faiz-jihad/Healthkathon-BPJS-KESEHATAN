/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#098a58",
          dark: "#076641",
          muted: "#838781",
          line: "#edf0e9",
          surface: "#f5f6f2",
        },
      },
      fontFamily: {
        sans: ["Manrope", "'Plus Jakarta Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
