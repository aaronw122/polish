import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Emit CSS in JS so it can be injected into Shadow DOM
        css: 'injected',
      },
      emitCss: false,
      onwarn(warning, handler) {
        // Suppress a11y warnings — this is a developer tool overlay, not a web app
        if (warning.code.startsWith('a11y-')) return;
        handler(warning);
      },
    }),
  ],
  build: {
    lib: {
      entry: 'src/overlay/main.js',
      formats: ['iife'],
      name: 'PolishOverlay',
      fileName: () => 'overlay.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // No code splitting — single bundle
        inlineDynamicImports: true,
      },
    },
  },
});
