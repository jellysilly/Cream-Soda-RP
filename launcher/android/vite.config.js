import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',
  build: {
    outDir: '../www',
    emptyOutDir: true,
    target: 'es2020',
  },
});
