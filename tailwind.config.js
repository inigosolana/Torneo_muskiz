import forms from "@tailwindcss/forms";
import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./views/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0df2f2",
          dark: "#0bcaca",
          light: "#80fbfb",
        },
        secondary: "#f4d06f",
        background: {
          light: "#f8fcfc",
          dark: "#102222",
        },
        surface: {
          light: "#ffffff",
          dark: "#1a2c2c",
        },
      },
      fontFamily: {
        display: ["Lexend", "sans-serif"],
        body: ["Noto Sans", "sans-serif"],
      },
    },
  },
  plugins: [forms, containerQueries],
};
