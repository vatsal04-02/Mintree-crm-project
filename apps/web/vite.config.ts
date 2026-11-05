/// <reference types="vitest/config" />
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The built app is served by Frappe itself (same origin as ERPNext, so the session cookie and
// CSRF token apply): assets from the factory_ops app's public folder, the page at /factory.
const APP = resolve(__dirname, "../factory_ops/factory_ops");
const BACKEND = process.env.FACTORY_BACKEND ?? "http://127.0.0.1:8000";
const SITE = process.env.FACTORY_SITE ?? "factory.localhost";

function frappePage(): Plugin {
  return {
    name: "factory-os-frappe-page",
    apply: "build",
    closeBundle() {
      mkdirSync(resolve(APP, "www"), { recursive: true });
      copyFileSync(resolve(APP, "public/factory/index.html"), resolve(APP, "www/factory.html"));
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/assets/factory_ops/factory/" : "/factory/",
  plugins: [react(), tailwindcss(), frappePage()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: { outDir: resolve(APP, "public/factory"), emptyOutDir: true },
  server: {
    port: 5173,
    // development only: the browser talks to Vite, Vite forwards API calls to the Frappe site
    proxy: Object.fromEntries(
      ["/api", "/files", "/private", "/desk", "/assets", "/printview"].map((p) => [
        p,
        { target: BACKEND, changeOrigin: false, headers: { Host: SITE } },
      ]),
    ),
  },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], css: false, globals: true },
}));
