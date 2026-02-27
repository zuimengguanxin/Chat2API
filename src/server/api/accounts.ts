import Router from '@koa/router'
import { AccountManager } from '../storage/accounts'
import { ProviderManager } from '../storage/providers'

export function createAccountsRouter() {
  const router = new Router()

  router.get('/', async (ctx) => {
    const { includeCredentials } = ctx.query
    ctx.body = AccountManager.getAll(includeCredentials === 'true')
  })

  router.get('/:id', async (ctx) => {
    const { includeCredentials } = ctx.query
    const account = AccountManager.getById(ctx.params.id, includeCredentials === 'true')
    if (!account) {
      ctx.status = 404
      ctx.body = { error: 'Account not found' }
      return
    }
    ctx.body = account
  })

  router.get('/provider/:providerId', async (ctx) => {
    const { includeCredentials } = ctx.query
    ctx.body = AccountManager.getByProviderId(ctx.params.providerId, includeCredentials === 'true')
  })

  router.post('/', async (ctx) => {
    ctx.body = AccountManager.create(ctx.request.body as any)
  })

  router.put('/:id', async (ctx) => {
    const account = AccountManager.update(ctx.params.id, ctx.request.body as any)
    if (!account) {
      ctx.status = 404
      ctx.body = { error: 'Account not found' }
      return
    }
    ctx.body = account
  })

  router.delete('/:id', async (ctx) => {
    const result = AccountManager.delete(ctx.params.id)
    ctx.body = { success: result }
  })

  router.post('/:id/validate', async (ctx) => {
    const account = AccountManager.getById(ctx.params.id, true)
    if (!account) {
      ctx.body = { valid: false, error: 'Account not found' }
      return
    }
    const provider = ProviderManager.getById(account.providerId)
    if (!provider) {
      ctx.body = { valid: false, error: 'Provider not found' }
      return
    }
    
    try {
      const { ProviderChecker } = await import('../../core/providers/checker')
      const result = await ProviderChecker.checkAccountToken(provider, account)
      ctx.body = result
    } catch (error: any) {
      ctx.body = { valid: false, error: error.message }
    }
  })

  router.post('/validate-token', async (ctx) => {
    const { providerId, credentials } = ctx.request.body as any
    const provider = ProviderManager.getById(providerId)
    if (!provider) {
      ctx.body = { valid: false, error: 'Provider not found' }
      return
    }
    const tempAccount = {
      id: 'temp',
      providerId,
      name: 'temp',
      credentials,
      status: 'active' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    
    try {
      const { ProviderChecker } = await import('../../main/providers/checker')
      ctx.body = await ProviderChecker.checkAccountToken(provider, tempAccount)
    } catch (error: any) {
      ctx.body = { valid: false, error: error.message }
    }
  })

  router.get('/:id/credits', async (ctx) => {
    const account = AccountManager.getById(ctx.params.id, true)
    if (!account) {
      ctx.status = 404
      ctx.body = { error: 'Account not found' }
      return
    }
    
    const provider = ProviderManager.getById(account.providerId)
    if (!provider || provider.id !== 'minimax') {
      ctx.body = null
      return
    }

    try {
      const { MiniMaxAdapter } = await import('../../core/proxy/adapters/minimax')
      const adapter = new MiniMaxAdapter(provider, account)
      ctx.body = await adapter.getCredits()
    } catch (error) {
      console.error('Failed to get credits:', error)
      ctx.body = null
    }
  })

  return router
}
