import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import type { Plugin } from 'vite'

/** Serve repo-root api/ directory during development */
function serveApiPlugin(): Plugin {
  const apiDir = resolve(__dirname, '../../api')
  return {
    name: 'serve-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = '/daily-logger/api/'
        if (!req.url?.startsWith(prefix)) return next()

        const filePath = resolve(apiDir, req.url.slice(prefix.length))
        if (!filePath.startsWith(apiDir)) return next()
        if (!existsSync(filePath)) {
          // Try as directory index
          const indexPath = resolve(filePath, 'index.json')
          if (!existsSync(indexPath)) { res.statusCode = 404; res.end('Not found'); return }
        }

        try {
          const content = readFileSync(filePath, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(content)
        } catch {
          res.statusCode = 404
          res.end('Not found')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    serveApiPlugin(),
    viteStaticCopy({
      targets: [{ src: resolve(__dirname, '../../api'), dest: '.' }],
    }),
  ],
  base: '/daily-logger/',
  server: {
    port: 4040,
  },
  build: {
    outDir: 'dist',
  },
})
