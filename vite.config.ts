import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works under a subpath
  // (github.io/descent/) or any static file server.
  base: './',
});
