import Router from '@koa/router'
import { ProviderManager } from '../storage/providers'
import { getBuiltinProviders } from '../storage/builtin'

export function createProvidersRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    ctx.body = ProviderManager.getAll()
  })

  router.get('/builtin', async (ctx) => {
    ctx.body = getBuiltinProviders()
  })

  router.get('/:id', async (ctx) => {
    const provider = ProviderManager.getById(ctx.params.id)
    if (!provider) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = provider
  })

  router.post('/', async (ctx) => {
    ctx.body = ProviderManager.create(ctx.request.body as any)
  })

  router.put('/:id', async (ctx) => {
    const provider = ProviderManager.update(ctx.params.id, ctx.request.body as any)
    if (!provider) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = provider
  })

  router.delete('/:id', async (ctx) => {
    const result = ProviderManager.delete(ctx.params.id)
    ctx.body = { success: result }
  })

  router.get('/:id/status', async (ctx) => {
    const provider = ProviderManager.getById(ctx.params.id)
    if (!provider) {
      ctx.body = { providerId: ctx.params.id, status: 'unknown', error: 'Not found' }
      return
    }
    
    try {
      const { ProviderChecker } = await import('../../core/providers/checker')
      const result = await ProviderChecker.checkProviderStatus(provider)
      ProviderManager.update(ctx.params.id, {
        status: result.status,
        lastStatusCheck: Date.now(),
      })
      ctx.body = result
    } catch (error: any) {
      ctx.body = { providerId: ctx.params.id, status: 'unknown', error: error.message }
    }
  })

  router.post('/check-all', async (ctx) => {
    const providers = ProviderManager.getAll()
    const results: Record<string, any> = {}
    
    const { ProviderChecker } = await import('../../main/providers/checker')
    
    await Promise.all(providers.map(async (provider) => {
      const result = await ProviderChecker.checkProviderStatus(provider)
      results[provider.id] = result
      ProviderManager.update(provider.id, {
        status: result.status,
        lastStatusCheck: Date.now(),
      })
    }))
    
    ctx.body = results
  })

  router.post('/:id/duplicate', async (ctx) => {
    const provider = ProviderManager.duplicate(ctx.params.id)
    if (!provider) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = provider
  })

  router.get('/:id/export', async (ctx) => {
    const data = ProviderManager.exportProvider(ctx.params.id)
    if (!data) {
      ctx.status = 404
      ctx.body = { error: 'Provider not found' }
      return
    }
    ctx.body = { data }
  })

  router.post('/import', async (ctx) => {
    const { data } = ctx.request.body as any
    const provider = ProviderManager.importProvider(data)
    if (!provider) {
      ctx.status = 400
      ctx.body = { error: 'Invalid provider data' }
      return
    }
    ctx.body = provider
  })

  return router
}
