import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { socketPlugin } from './vite-plugin-socket.js';

export default defineConfig({
  plugins: [sveltekit(), socketPlugin()],
});
