import Router from '@koa/router'
import { broadcast } from '../websocket'

let proxyServerInstance: any = null
let proxyStartTime: number | null = null
let currentPort: number = 8310

export function setProxyServer(server: any) {
  proxyServerInstance = server
}

export function createProxyRouter() {
  const router = new Router()

  router.post('/start', async (ctx) => {
    const { port } = (ctx.request.body as any) || {}
    const targetPort = port || 8310
    
    if (proxyServerInstance) {
      ctx.body = { success: true, message: 'Already running', port: currentPort }
      return
    }

    try {
      const { ProxyServer } = await import('../../core/proxy/server')
      const server = new ProxyServer()
      const success = await server.start(targetPort)
      
      if (success) {
        proxyServerInstance = server
        currentPort = targetPort
        proxyStartTime = Date.now()
        broadcast('proxy:status', { isRunning: true, port: targetPort })
        ctx.body = { success: true, port: targetPort }
      } else {
        ctx.body = { success: false, error: 'Failed to start' }
      }
    } catch (error: any) {
      ctx.body = { success: false, error: error.message }
    }
  })

  router.post('/stop', async (ctx) => {
    if (!proxyServerInstance) {
      ctx.body = { success: true }
      return
    }

    try {
      await proxyServerInstance.stop()
      proxyServerInstance = null
      proxyStartTime = null
      broadcast('proxy:status', { isRunning: false })
      ctx.body = { success: true }
    } catch (error: any) {
      ctx.body = { success: false, error: error.message }
    }
  })

  router.get('/status', async (ctx) => {
    ctx.body = {
      isRunning: proxyServerInstance !== null,
      port: currentPort,
      uptime: proxyStartTime ? Date.now() - proxyStartTime : 0,
    }
  })

  router.get('/statistics', async (ctx) => {
    if (proxyServerInstance) {
      ctx.body = proxyServerInstance.getStatistics()
    } else {
      ctx.body = {
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        avgLatency: 0,
        requestsPerMinute: 0,
        activeConnections: 0,
        modelUsage: {},
        providerUsage: {},
        accountUsage: {},
      }
    }
  })

  router.post('/reset-statistics', async (ctx) => {
    if (proxyServerInstance) {
      proxyServerInstance.resetStatistics()
    }
    ctx.body = { success: true }
  })

  return router
}

export function getProxyServer() {
  return proxyServerInstance
}
