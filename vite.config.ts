import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function hasPublicAsset(path: string) {
  return existsSync(fileURLToPath(new URL('./public/' + path, import.meta.url)))
}

const media = {
  film: hasPublicAsset('film/legalx.mp4') && hasPublicAsset('film/legalx.en.vtt'),
  loop: hasPublicAsset('film/living-contract.mp4'),
  poster: hasPublicAsset('film/poster.jpg'),
  day: hasPublicAsset('noir/living-contract-day.webp'),
  night: hasPublicAsset('noir/living-contract.webp'),
}

export default defineConfig({
  define: { __LEGALX_MEDIA__: JSON.stringify(media) },
  plugins: [react(), {
    name: 'legalx-social-url',
    transformIndexHtml(html) {
      const host = process.env.VERCEL_URL
      return host ? html.replace('content="/legalx-social.png"', 'content="https://' + host + '/legalx-social.png"') : html
    },
  }],
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
