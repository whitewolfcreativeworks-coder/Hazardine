import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts, whose root is the web/ folder.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
