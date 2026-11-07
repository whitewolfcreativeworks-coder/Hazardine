import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The tutorial builds to its own single file: dist/tutorial/index.html
export default defineConfig({
  root: 'web/tutorial',
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: '../../dist/tutorial', emptyOutDir: true },
});
