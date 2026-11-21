// UNTRACKED verification harness config — isolated Phase 6 parity E2E.
// Copy of vite.config.ts pointed at the isolated backend on :8011 and served
// on :3005. The frontend api client uses same-origin relative /api/v1 paths,
// so this proxy is the only bridge the browser needs to reach the backend.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3005,
    host: '0.0.0.0',
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://127.0.0.1:8011',
        changeOrigin: true,
      },
    },
  },
})
