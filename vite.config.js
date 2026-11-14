import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.ICE_API_TARGET || 'http://127.0.0.1:8787';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/v1': { target: API_TARGET, changeOrigin: true }
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
