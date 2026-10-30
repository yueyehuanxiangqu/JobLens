import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  build: {
    outDir: 'dist',
    emptyOutDir: mode !== 'content-script',
    sourcemap: true,
    minify: false,
    target: 'es2022',
    rollupOptions: mode === 'content-script' ? {
      input: resolve(__dirname, 'src/content/index.js'),
      output: {
        format: 'iife',
        name: 'LinkedInJobMatchContent',
        inlineDynamicImports: true,
        entryFileNames: 'src/content/index.js',
        assetFileNames: 'assets/[name].[ext]'
      }
    } : {
      input: {
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.js'),
        'sidepanel/index': resolve(__dirname, 'src/sidepanel/index.html')
      },
      output: {
        entryFileNames: 'src/[name].js',
        chunkFileNames: 'src/shared/[name].[hash].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
}));
