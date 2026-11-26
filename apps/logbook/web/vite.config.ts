import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  build: { assetsDir: 'static' },
  plugins: [tailwindcss()],
  optimizeDeps: { rolldownOptions: { output: { strictExecutionOrder: true } } },
})
