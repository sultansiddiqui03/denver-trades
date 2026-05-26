import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests for the pure "moat" logic (scoring, signals, opportunity
// detection). These modules import nothing server-side, so a plain Node
// environment + the `@/` path alias is all the setup they need.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
