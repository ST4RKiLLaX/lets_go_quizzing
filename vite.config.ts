import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { socketPlugin } from './vite-plugin-socket.js';

export default defineConfig({
  plugins: [sveltekit(), socketPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: ['node_modules/', '.svelte-kit/', 'tests/'],
    },
  },
});
