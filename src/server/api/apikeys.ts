import Router from '@koa/router'
import { ConfigManager } from '../storage/config'
import crypto from 'crypto'

export function createApiKeysRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    ctx.body = ConfigManager.getApiKeys()
  })

  router.post('/', async (ctx) => {
    const { name, description } = ctx.request.body as any
    const key = `sk-${crypto.randomBytes(24).toString('base64url')}`
    const apiKey = ConfigManager.addApiKey({ name, key, description })
    ctx.body = apiKey
  })

  router.put('/:id', async (ctx) => {
    const apiKey = ConfigManager.updateApiKey(ctx.params.id, ctx.request.body as any)
    if (!apiKey) {
      ctx.status = 404
      ctx.body = { error: 'API key not found' }
      return
    }
    ctx.body = apiKey
  })

  router.delete('/:id', async (ctx) => {
    const result = ConfigManager.deleteApiKey(ctx.params.id)
    ctx.body = { success: result }
  })

  return router
}
