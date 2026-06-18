import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["dev-launcher", "devlauncher"],
    proxy: {
      "/api": "http://127.0.0.1:3059",
    },
  },
});
