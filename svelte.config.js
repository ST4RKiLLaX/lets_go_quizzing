import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        // img-src https: allows quiz images from arbitrary external URLs; tighten if image sources become controlled or proxied
        'img-src': ['self', 'data:', 'https:'],
        // connect-src ws:/wss: needed for WebSocket; prefer explicit origin (e.g. wss://letsgoquizzing.com) in production when feasible
        'connect-src': ['self', 'ws:', 'wss:'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};

export default config;
