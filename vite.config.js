import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["framory_logo_180x180.png", "framory_logo_512x512.png"],
      manifest: {
        name: "Framory - Anime Tracker",
        short_name: "Framory",
        description: "Gestione e tracciamento anime, offline-first",
        lang: "it",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b0b0f",
        theme_color: "#0b0b0f",
        icons: [
          {
            src: "/framory_logo_180x180.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/framory_logo_512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/framory_logo_512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === "api.jikan.moe" && url.pathname.startsWith("/v4/"),
            method: "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-jikan",
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === "cdn.myanimelist.net" ||
              url.hostname.endsWith("anilist.co") ||
              url.hostname.endsWith("crunchyroll.com"),
            method: "GET",
            handler: "CacheFirst",
            options: {
              cacheName: "api-images",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
