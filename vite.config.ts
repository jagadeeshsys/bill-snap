import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/bill-snap/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Bill Snap',
        short_name: 'Bill Snap',
        description: 'Capture, extract and manage bill information locally.',
        start_url: '/bill-snap/',
        scope: '/bill-snap/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#124d3a',
        background_color: '#f7f9f7',
        icons: [
          {
            src: '/bill-snap/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/bill-snap/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,wasm,gz}'],
        // The local English OCR model is intentionally precached for offline scans.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/bill-snap/index.html',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (asset) => {
          const name = asset.name ?? ''
          if (name.includes('traineddata') || name.includes('tesseract-core')) {
            return 'ocr-assets/[name][extname]'
          }
          if (name === 'worker.min.js') return 'ocr-assets/[name][extname]'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
