import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The React panel, served to Tauri's WebView2 (see src-tauri/tauri.conf.json).
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false
  }
})
