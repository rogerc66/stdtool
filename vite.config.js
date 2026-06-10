import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    // pdfjs-dist ships its own ESM build with non-standard patterns; exclude from
    // Vite's pre-bundler so the ?url worker import and dynamic import work correctly.
    exclude: ['pdfjs-dist'],
  },
})
