import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Source lives in app/. `vite build` writes to dist/, then scripts/publish.mjs
// copies the result to the repository root (index.html + assets/) so GitHub
// Pages can keep serving `main` as-is.
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    target: 'es2020',
    chunkSizeWarningLimit: 900
  },
  test: {
    root: repoRoot,
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.js']
  }
});
