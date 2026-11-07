import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the game into one self-contained HTML file (easy to share or host anywhere).
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../dist', emptyOutDir: true },
});
