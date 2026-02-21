/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = env.VITE_SERVER_PORT || '3001';
  const serverTarget = `http://localhost:${serverPort}`;

  return {
    plugins: [react()],
    appType: 'spa',
    server: {
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
    },
  };
});
