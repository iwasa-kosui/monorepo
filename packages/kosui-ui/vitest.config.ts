import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup-animation-event.ts', './src/test-setup.ts'],
  },
});
