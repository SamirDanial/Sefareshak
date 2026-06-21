import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Configure cache directory to avoid permission issues
  cacheDir: 'node_modules/.vite',
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // Ensure environment variables are available in production build
  define: {
    // Vite automatically replaces import.meta.env.VITE_* variables,
    // but we need to ensure they're available during build
  },
});

