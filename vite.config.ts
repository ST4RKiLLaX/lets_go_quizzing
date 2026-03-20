import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { socketPlugin } from './vite-plugin-socket.js';

export default defineConfig({
  plugins: [sveltekit(), socketPlugin()],
  build: {
    // Default 500 kB warns on apps with CodeMirror + large route bundles; gzip ~268 kB is acceptable.
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('socket.io-client')) return 'vendor-socket';
          if (
            id.includes('codemirror') ||
            id.includes('@codemirror') ||
            id.includes('@lezer') ||
            id.includes('codemirror-json-schema')
          ) {
            return 'vendor-codemirror';
          }
          if (id.includes('node_modules/yaml/')) return 'vendor-yaml';
          if (id.includes('/node_modules/zod/')) return 'vendor-zod';
        },
      },
    },
  },
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
