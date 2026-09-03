import { defineConfig } from 'vite';

export default defineConfig({
  base: '/retro-ball/',
  server: { port: 5173, open: false },
  build: { target: 'es2022', sourcemap: false },
});
