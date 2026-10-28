import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.CS_SERVER || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: server, changeOrigin: true },
      '/files': { target: server, changeOrigin: true },
      '/extensions': { target: server, changeOrigin: true },
    },
  },
});
