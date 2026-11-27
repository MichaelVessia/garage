import tailwindcss from '@tailwindcss/vite'
import * as SecureRandom from 'effect/crypto/SecureRandom'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => {
  const version = command === 'build' ? SecureRandom.uuidV4Unsafe() : 'dev'
  const source = `{"version":"${version}"}`
  return {
    define: { __BELTWORKS_BUILD_ID__: `"${version}"` },
    build: { assetsDir: 'static' },
    plugins: [
      tailwindcss(),
      {
        name: 'beltworks-version',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source })
        },
        configureServer(server) {
          server.middlewares.use('/version.json', (_request, response) => {
            response.setHeader('Content-Type', 'application/json')
            response.setHeader('Cache-Control', 'no-store')
            response.end(source)
          })
        },
      },
    ],
    optimizeDeps: { rolldownOptions: { output: { strictExecutionOrder: true } } },
  }
})
