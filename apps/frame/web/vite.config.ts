import { defineConfig } from 'vite'

// The frame runs Android System WebView 106. JS stays within Chromium 106. CSS targets chrome61 on
// purpose: that WebView rejects 4- and 8-digit hex colours, which newer targets let the minifier emit.
export default defineConfig({
  build: {
    target: 'chrome106',
    cssTarget: 'chrome61',
  },
  server: {
    port: 5173,
    proxy: {
      '/rpc': { target: 'http://127.0.0.1:8080' },
    },
  },
})
