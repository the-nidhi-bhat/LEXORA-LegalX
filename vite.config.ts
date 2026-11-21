import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    // Same-origin API calls in dev: /api/v1/* -> FastAPI LEGALX on 8010.
    // Port 8000 is occupied by an unrelated service; 8010 is the LEGALX backend.
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },
})
