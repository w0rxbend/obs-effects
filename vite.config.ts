import { resolve } from "path";

import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    port: 8080,
    open: "/webcam-border-1.html",
  },
  build: {
    rollupOptions: {
      input: {
        webcamBorder1: resolve(__dirname, "webcam-border-1.html"),
        titlePowerline: resolve(__dirname, "title-powerline.html"),
        logo: resolve(__dirname, "logo.html"),
        background: resolve(__dirname, "background.html"),
      },
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
