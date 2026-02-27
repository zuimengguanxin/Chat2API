import Router from '@koa/router'
import { ConfigManager } from '../storage/config'

export function createConfigRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    ctx.body = ConfigManager.get()
  })

  router.put('/', async (ctx) => {
    ConfigManager.update(ctx.request.body as any)
    ctx.body = { success: true }
  })

  router.post('/reset', async (ctx) => {
    ctx.body = ConfigManager.reset()
  })

  return router
}
