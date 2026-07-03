import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/rpc': { changeOrigin: true, target: 'https://subq-subq-dev-michaelvessia-6iyr53i2ie23hh44.vessia.workers.dev' },
      '/api': { changeOrigin: true, target: 'https://subq-subq-dev-michaelvessia-6iyr53i2ie23hh44.vessia.workers.dev' },
    },
  },
})
