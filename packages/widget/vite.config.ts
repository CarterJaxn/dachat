import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/main.tsx",
      name: "DaChatWidget",
      fileName: "dachat-widget",
      formats: ["iife"],
    },
    rollupOptions: {
      // Bundle React inline — widget must be fully self-contained
      external: [],
    },
  },
});
