import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Invest+",
        short_name: "Invest+",
        description: "Controle financeiro do dia a dia: lançamentos, pessoas, fechamento e relatórios.",
        lang: "pt-BR",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        background_color: "#f4f5fa",
        theme_color: "#5b5bd6",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//], importScripts: ["push-sw.js"] },
    }),
  ],
});
