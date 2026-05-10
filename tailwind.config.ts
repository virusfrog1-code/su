import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050607",
        graphite: "#11151a",
        signal: "#56f39a",
        plasma: "#39d5ff",
        silver: "#d7dde5"
      },
      boxShadow: {
        glow: "0 0 32px rgba(86, 243, 154, 0.24)",
        blueglow: "0 0 42px rgba(57, 213, 255, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;

