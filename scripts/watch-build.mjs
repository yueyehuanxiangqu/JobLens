import { build } from 'vite';

// Watch both build graphs; neither watcher may clear the other's output.
await Promise.all([
  build({ build: { watch: {}, emptyOutDir: false } }),
  build({ mode: 'content-script', build: { watch: {}, emptyOutDir: false } }),
]);
