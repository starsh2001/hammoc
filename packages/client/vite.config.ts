/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = env.VITE_SERVER_PORT || '3001';
  const serverTarget = `http://localhost:${serverPort}`;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo-header.png', 'logo-splash.png'],
        manifest: {
          name: 'Hammoc',
          short_name: 'Hammoc',
          description: 'Hammoc - AI Development Studio',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            {
              src: '/logo-splash.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/logo-splash.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/logo-splash.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/.*\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 5,
                },
              },
            },
          ],
        },
      }),
    ],
    appType: 'spa',
    server: {
      watch: {
        ignored: ['**/.qlaude/**', '**/.gemini/**', '**/.plan/**', '**/cookies.txt'],
      },
      host: true,
      port: parseInt(env.VITE_CLIENT_PORT || '5173'),
      proxy: {
        '/api': {
          target: serverTarget,
          changeOrigin: true,
        },
        '/health': {
          target: serverTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test-utils/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      env: {
        NODE_ENV: 'test',
      },
    },
  };
});
