import Koa from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import serve from 'koa-static'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { join } from 'path'
import { existsSync } from 'fs'
import { initStorage, closeStorage } from './storage/sqlite'
import { authMiddleware } from './middleware/auth'
import { registerRoutes } from './api'
import { createAuthRouter } from './api/auth'
import { setProxyServer } from './api/proxy'
import { addClient, removeClient } from './websocket'

const app = new Koa()
const router = new Router()
const server = createServer(app.callback())
const wss = new WebSocketServer({ server })

app.use(bodyParser())
app.use(authMiddleware)

router.use('/api/auth', createAuthRouter().routes())
registerRoutes(router)
app.use(router.routes())
app.use(router.allowedMethods())

const staticPath = join(process.cwd(), 'dist', 'web')
if (existsSync(staticPath)) {
  app.use(serve(staticPath))
}

// Wildcard route for SPA fallback - must be last after all other routes
app.use(async (ctx, next) => {
  // Skip if it's an API route or static file
  if (ctx.path.startsWith('/api') || ctx.path.includes('.')) {
    return next()
  }

  ctx.type = 'html'
  const devMode = process.env.NODE_ENV !== 'production'

  if (devMode) {
    // Development: Use Vite dev server script
    ctx.body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat2API</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="http://localhost:5173/src/main.tsx"></script>
</body>
</html>`
  } else {
    // Production: Serve the built HTML file
    const staticPath = join(process.cwd(), 'dist', 'web')
    if (existsSync(staticPath)) {
      const fs = await import('fs')
      const indexPath = join(staticPath, 'index.html')
      if (existsSync(indexPath)) {
        ctx.body = fs.readFileSync(indexPath, 'utf-8')
        return
      }
    }
    // Fallback HTML for when build files don't exist
    ctx.body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat2API</title>
</head>
<body>
  <div id="root"></div>
  <p>Frontend not built. Please run <code>npm run build</code> first.</p>
</body>
</html>`
  }
})

wss.on('connection', (ws) => {
  addClient(ws)
  ws.on('close', () => removeClient(ws))
})

const PORT = process.env.PORT || 3000
const PROXY_PORT = process.env.PROXY_PORT || 8310

// Initialize storage first, then start the server
async function startServer() {
  await initStorage()

  server.listen(PORT, async () => {
    console.log(`Chat2API Server running at http://localhost:${PORT}`)
    console.log(`WebSocket: ws://localhost:${PORT}/ws`)

    try {
      const { ProxyServer } = await import('../core/proxy/server')
      const proxyServer = new ProxyServer()
      await proxyServer.start(Number(PROXY_PORT))
      setProxyServer(proxyServer)
      console.log(`Proxy server: http://localhost:${PROXY_PORT}`)
    } catch (error) {
      console.error('Failed to start proxy server:', error)
    }
  })
}

startServer().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
})

process.on('SIGINT', () => {
  closeStorage()
  process.exit(0)
})

export { server, wss }
